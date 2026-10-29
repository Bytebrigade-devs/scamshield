import test from "node:test";
import assert from "node:assert/strict";
import {
  allConfirmed,
  practices,
  decodeDemo,
  commitDemo,
  DEMO_KEY,
  demoScore,
  demoBand,
  demoBreakdown,
  parseSummary,
  aggregateView,
  effectiveState,
  safeApiPath,
  historyForDemo,
  type PracticeId,
} from "../src/features/safety-score/model.ts";
import { makeSummary } from "../src/features/safety-score/fixtures.ts";
const now = Date.parse("2026-10-26T06:00:00Z");
const checked = practices.map((p) => p.id);
test("the five required practices are required without duplicates", () => {
  assert.equal(allConfirmed(checked), true);
  assert.equal(allConfirmed(checked.slice(1)), false);
  assert.equal(allConfirmed([...checked, "unknown"]), false);
  assert.equal(
    allConfirmed(["unique", "unique", "long", "manager", "private"]),
    false,
  );
});
test("demo stays at the specified baseline and increases only once", () => {
  assert.equal(demoScore(false), 65);
  assert.equal(demoScore(true), 90);
  for (const saved of [false, true])
    assert.equal(
      demoBreakdown(saved).reduce((s, c) => s + c.points, 0),
      demoScore(saved),
    );
});
test("legacy bands have correct boundary values and reject invalid scores", () => {
  for (const [v, b] of [
    [0, "Needs attention"],
    [39, "Needs attention"],
    [40, "Fair"],
    [69, "Fair"],
    [70, "Good"],
    [89, "Good"],
    [90, "Strong"],
    [100, "Strong"],
  ] as const)
    assert.equal(demoBand(v), b);
  for (const v of [-1, 101, NaN, Infinity])
    assert.equal(demoBand(v), "Unavailable");
});
test("valid saved checklist restores only its allowlisted data", () => {
  const record = { version: 1, checked, savedAt: new Date(now).toISOString() };
  assert.deepEqual(
    decodeDemo(JSON.stringify({ ...record, unexpected: "ignored" }), now),
    { kind: "valid", record },
  );
  assert.equal(decodeDemo(null, now).kind, "empty");
});
test("malformed, incomplete and future-dated records do not restore", () => {
  for (const raw of [
    "bad",
    "null",
    "{}",
    JSON.stringify({
      version: 2,
      checked,
      savedAt: new Date(now).toISOString(),
    }),
    JSON.stringify({
      version: 1,
      checked: checked.slice(1),
      savedAt: new Date(now).toISOString(),
    }),
    JSON.stringify({ version: 1, checked, savedAt: "bad" }),
    JSON.stringify({
      version: 1,
      checked,
      savedAt: new Date(now + 120000).toISOString(),
    }),
  ])
    assert.equal(decodeDemo(raw, now).kind, "invalid");
});
test("a failed save never returns a successful record", () => {
  assert.throws(
    () =>
      commitDemo(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        checked,
        now,
      ),
    /quota/,
  );
  let written = "";
  const record = commitDemo(
    {
      setItem: (key, value) => {
        assert.equal(key, DEMO_KEY);
        written = value;
      },
    },
    checked,
    now,
  );
  assert.deepEqual(JSON.parse(written), record);
  assert.throws(() =>
    commitDemo(
      { setItem: () => assert.fail("must not write") },
      [] as PracticeId[],
      now,
    ),
  );
});
test("all synthetic summary scenarios pass the display schema", () => {
  for (const scenario of ["ready", "missing", "stale"] as const) {
    const s = makeSummary(scenario, now);
    assert.deepEqual(parseSummary(s), s);
  }
});
test("schema rejects duplicate sources, secret fields and invalid metrics", () => {
  const base = makeSummary("ready", now);
  const duplicate = structuredClone(base);
  duplicate.sources[2] = duplicate.sources[0];
  assert.throws(() => parseSummary(duplicate));
  assert.throws(() => parseSummary({ ...base, password: "secret" }));
  const metric = structuredClone(base);
  metric.sources[1].metrics.rawPassword = 12;
  assert.throws(() => parseSummary(metric));
  metric.sources[1].metrics = { totalEntries: -1 };
  assert.throws(() => parseSummary(metric));
  const score = structuredClone(base);
  score.aggregate.value = 101;
  assert.throws(() => parseSummary(score));
});
test("freshness uses source timestamps and never treats expiry as current", () => {
  const s = makeSummary("ready", now).sources[0];
  assert.equal(effectiveState(s, now), "current");
  assert.equal(effectiveState(s, Date.parse(s.freshUntil!)), "stale");
  assert.equal(effectiveState({ ...s, observedAt: null }, now), "missing");
  assert.equal(
    effectiveState(
      { ...s, observedAt: new Date(now + 120000).toISOString() },
      now,
    ),
    "error",
  );
  assert.equal(
    effectiveState(makeSummary("stale", now).sources[1], now),
    "stale",
  );
});
test("missing and stale components suppress aggregate and band even if sent by server", () => {
  for (const scenario of ["missing", "stale"] as const) {
    const s = makeSummary(scenario, now);
    s.policy = { status: "approved", version: "reviewed-test-fixture" };
    s.aggregate = { value: 99, band: "Example" };
    s.sources.forEach((x) => (x.scoringEligible = true));
    const result = aggregateView(s, now);
    assert.equal(result.value, null);
    assert.equal(result.band, null);
    assert.match(result.reason, /Insufficient/);
  }
});
test("unapproved policy and non-scoring evidence never become an aggregate", () => {
  const s = makeSummary("ready", now);
  s.aggregate = { value: 99, band: "Example" };
  assert.equal(aggregateView(s, now).value, null);
  s.policy = { status: "approved", version: "test-only" };
  assert.equal(aggregateView(s, now).value, null);
});
test("the frontend displays an eligible server total without recalculating it", () => {
  const s = makeSummary("ready", now);
  s.policy = { status: "approved", version: "test-only" };
  s.sources.forEach((x) => (x.scoringEligible = true));
  s.aggregate = { value: 81, band: "Server label" };
  assert.equal(aggregateView(s, now).value, 81);
  s.sources[2].metrics.checksCompleted = 9999;
  assert.equal(aggregateView(s, now).value, 81);
  s.aggregate.value = null;
  assert.equal(aggregateView(s, now).value, null);
});
test("future envelope time suppresses a score", () => {
  const s = makeSummary("ready", now);
  s.generatedAt = new Date(now + 120000).toISOString();
  assert.equal(aggregateView(s, now).value, null);
});
test("API target is restricted to a same-origin API path", () => {
  assert.equal(safeApiPath("/api/safety-summary/"), "/api/safety-summary/");
  for (const p of [
    "",
    undefined,
    "https://other.test",
    "//other.test",
    "/account/",
    "/api/a?user=someone",
    "/api/../secret",
  ])
    assert.equal(safeApiPath(p), null);
});
test("demo snapshots keep timestamps and rule versions in chronological order on refresh", () => {
  const saved = new Date(now - 3600000).toISOString();
  const points = historyForDemo(saved, now);
  assert.equal(points.length, 5);
  assert.equal(points.at(-1)?.value, 90);
  assert.ok(points.every((p) => p.rule === "checklist-demo-v1"));
  for (let i = 1; i < points.length; i++)
    assert.ok(Date.parse(points[i].at) > Date.parse(points[i - 1].at));
  assert.equal(historyForDemo(null, now).length, 4);
});
