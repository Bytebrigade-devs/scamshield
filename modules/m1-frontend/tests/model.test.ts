import test from "node:test";
import assert from "node:assert/strict";
import {
  newProgress,
  decodeProgress,
  isComplete,
  makeHandoff,
  safeReferral,
  safeSignupPath,
  preferredTool,
  TTL,
} from "../src/lib/model.ts";
const now = 1792972800000;
const answers = { interest: "messages", tool: "checker", experience: "new" };
test("new progress is valid and restores current step and answers", () => {
  const p = { ...newProgress(now), step: 1, answers: { interest: "messages" } };
  assert.deepEqual(decodeProgress(JSON.stringify(p), now), {
    kind: "valid",
    progress: p,
  });
});
test("missing, malformed and incompatible storage are handled", () => {
  assert.equal(decodeProgress(null, now).kind, "empty");
  for (const raw of [
    "bad",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...newProgress(now), version: 2 }),
  ])
    assert.equal(decodeProgress(raw, now).kind, "invalid");
});
test("expired preferences are rejected at the exact expiry boundary", () => {
  const p = newProgress(now);
  assert.equal(decodeProgress(JSON.stringify(p), now + TTL - 1).kind, "valid");
  assert.equal(decodeProgress(JSON.stringify(p), now + TTL).kind, "expired");
});
test("invalid answers, impossible steps and false completion cannot restore", () => {
  for (const change of [
    { step: 9 },
    { step: 1 },
    { answers: { interest: "secret" } },
    { answers: { unexpected: "messages" } },
    { answers: [] },
    { completed: true },
    { updatedAt: now + 120000 },
    { expiresAt: now + TTL + 1 },
  ])
    assert.equal(
      decodeProgress(JSON.stringify({ ...newProgress(now), ...change }), now)
        .kind,
      "invalid",
    );
});
test("editing one answer preserves other answers", () => {
  const p = { ...newProgress(now), step: 2, answers };
  const changed = { ...p, answers: { ...p.answers, interest: "passwords" } };
  assert.equal(changed.answers.tool, "checker");
  assert.equal(decodeProgress(JSON.stringify(changed), now).kind, "valid");
});
test("completion requires three valid answers", () => {
  assert.equal(isComplete(answers), true);
  assert.equal(isComplete({ interest: "messages" }), false);
  assert.equal(isComplete({ ...answers, experience: "invalid" }), false);
});
test("signup context is minimal, expires and does not include raw questionnaire", () => {
  const p = { ...newProgress(now), answers, completed: true };
  const h = makeHandoff(p, "demo7", now);
  assert.equal(h.expiresAt, now + 1800000);
  assert.equal(h.interest, "messages");
  assert.equal(h.referral, "demo7");
  assert.equal("answers" in h, false);
  assert.equal("experience" in h, false);
  assert.throws(() => makeHandoff(newProgress(now), null, now));
});
test("referrals accept bounded codes and reject unsafe values", () => {
  assert.equal(safeReferral("demo7"), "demo7");
  for (const v of [
    "",
    null,
    "ab",
    "x".repeat(33),
    "https://other.example",
    "<script>",
    "a b",
  ])
    assert.equal(safeReferral(v), null);
});
test("signup target stays on a configured internal path", () => {
  assert.equal(safeSignupPath("/account/signup/"), "/account/signup/");
  for (const v of [
    undefined,
    "https://other.example",
    "//other.example",
    "/",
    "/signup/?answers=x",
    "/../x",
  ])
    assert.equal(safeSignupPath(v), "/signup/");
});
test("benefits use preferred tool and fallback interest without a safety score", () => {
  assert.equal(preferredTool({ tool: "vault" }), "vault");
  assert.equal(
    preferredTool({ tool: "unsure", interest: "passwords" }),
    "vault",
  );
  assert.equal(
    preferredTool({ tool: "checker", interest: "passwords" }),
    "checker",
  );
});
