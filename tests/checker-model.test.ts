/**
 * M4 checker — pure model tests.
 *
 * These cover the logic a port can silently lose: what counts as a trustworthy history row, which
 * outcomes may be trusted at all, and how the export timestamp is chosen. The DOM behaviour is
 * covered by `tests/browser/checker.spec.ts`.
 *
 * Runner: Node built-in `node --test --experimental-strip-types` (M4-19/X-06 convention).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HISTORY_LIMIT,
  FALLBACK_CAP,
  historyEntryFor,
  historyEntryFromServer,
  inputCap,
  isAnalysedOutcome,
  summaryInstantFor,
  validHistoryEntry,
  type CheckPayload,
} from "../src/features/checker/model.ts";

const analysed = (overrides: Record<string, unknown> = {}) =>
  ({
    kind: "analysed",
    analysisStatus: "completed",
    analysisMode: "rules_and_ai",
    category: "phishing",
    rules: { matches: [] },
    reply: {
      verdictLabel: "high risk",
      category: "phishing",
      reason: "It asks for your OTP.",
      riskLevel: "high",
      reasonHighlights: [],
    },
    limitations: [],
    ...overrides,
  }) as never;

const payloadWith = (outcome: unknown): CheckPayload => ({ outcome, providerMode: "live" }) as CheckPayload;

test("validHistoryEntry accepts a well-formed row", () => {
  assert.equal(
    validHistoryEntry({
      at: Date.now(),
      excerpt: "hello",
      category: "phishing",
      assessment: "High risk",
      mode: "rules_only",
    }),
    true,
  );
});

test("validHistoryEntry rejects tampered or out-of-vocabulary rows", () => {
  const base = { at: Date.now(), excerpt: "x", category: "phishing", assessment: "y", mode: "rules_only" };
  assert.equal(validHistoryEntry({ ...base, at: "now" }), false);
  assert.equal(validHistoryEntry({ ...base, at: Number.NaN }), false);
  assert.equal(validHistoryEntry({ ...base, category: "not-a-category" }), false);
  assert.equal(validHistoryEntry({ ...base, mode: "not-a-mode" }), false);
  assert.equal(validHistoryEntry({ ...base, excerpt: "x".repeat(122) }), false);
  assert.equal(validHistoryEntry(null), false);
  assert.equal(validHistoryEntry("row"), false);
});

test("inputCap prefers a usable configured cap and otherwise falls back", () => {
  assert.equal(inputCap({ liveConfigured: false, limits: { inputCharCap: 500 } }), 500);
  assert.equal(inputCap({ liveConfigured: false, limits: { inputCharCap: 0 } }), FALLBACK_CAP);
  assert.equal(inputCap({ liveConfigured: false, limits: { inputCharCap: 12.5 } }), FALLBACK_CAP);
  assert.equal(inputCap(null), FALLBACK_CAP);
});

test("isAnalysedOutcome only trusts known statuses and modes", () => {
  assert.equal(isAnalysedOutcome(analysed()), true);
  assert.equal(isAnalysedOutcome(analysed({ analysisStatus: "limited", analysisMode: "rules_only" })), true);
  assert.equal(isAnalysedOutcome(analysed({ analysisStatus: "invented" })), false);
  assert.equal(isAnalysedOutcome(analysed({ analysisMode: "invented" })), false);
  assert.equal(isAnalysedOutcome({ kind: "rejected", reason: "invalid-input", message: "no" }), false);
  assert.equal(isAnalysedOutcome(undefined), false);
});

test("historyEntryFor truncates the excerpt and never stores the full message", () => {
  const long = `  ${"word ".repeat(60)}  `;
  const entry = historyEntryFor(payloadWith(analysed()), long, 1_700_000_000_000);
  assert.equal(entry.at, 1_700_000_000_000);
  assert.equal(entry.excerpt.length, 121);
  assert.ok(entry.excerpt.endsWith("…"));
  assert.equal(entry.category, "phishing");
  assert.equal(entry.mode, "rules_and_ai");
});

test("historyEntryFor collapses whitespace and summarises each status honestly", () => {
  const entry = historyEntryFor(payloadWith(analysed()), "a\n\n  b\tc", 1);
  assert.equal(entry.excerpt, "a b c");

  const limited = historyEntryFor(
    payloadWith(analysed({ analysisStatus: "limited", analysisMode: "rules_only", reply: null })),
    "x",
    1,
  );
  assert.equal(limited.assessment, "Limited message assessment");

  const failed = historyEntryFor(
    payloadWith(analysed({ analysisStatus: "unavailable", analysisMode: "none", reply: null })),
    "x",
    1,
  );
  assert.equal(failed.assessment, "AI analysis failed");
});

test("historyEntryFor falls back to unknown_other for an unrecognised category", () => {
  const entry = historyEntryFor(payloadWith(analysed({ category: "made_up" })), "x", 1);
  assert.equal(entry.category, "unknown_other");
});

test("summaryInstantFor prefers the freshest review timestamp the server supplied", () => {
  const payload = {
    outcome: analysed(),
    providerMode: "live",
    guidanceResources: { checkedAt: "2026-11-20T10:00:00.000Z" },
    organizationVerification: { checkedAt: "2026-11-19T09:00:00.000Z" },
  } as CheckPayload;
  assert.equal(summaryInstantFor(payload), "2026-11-19T09:00:00.000Z");

  // Nothing usable: falls back to now, which must still be a parseable instant.
  const fallback = summaryInstantFor(payloadWith(analysed()));
  assert.ok(Number.isFinite(Date.parse(fallback)));

  // A non-ISO or unparseable value is ignored rather than trusted.
  const broken = {
    outcome: analysed(),
    providerMode: "live",
    linkInspection: { checkedAt: "not-a-date" },
  } as CheckPayload;
  assert.ok(Number.isFinite(Date.parse(summaryInstantFor(broken))));
});

test("the history limit is the documented 20", () => {
  assert.equal(HISTORY_LIMIT, 20);
});

test("a server history row maps to a valid UI entry (completed AI mode, capped excerpt)", () => {
  const row = {
    createdAt: Date.parse("2026-11-24T10:00:00.000Z"),
    snippet: "  Verify   your password  " + "x".repeat(200),
    verdictLabel: "high risk",
    category: "phishing",
  };
  const entry = historyEntryFromServer(row);
  assert.ok(validHistoryEntry(entry), "mapped server row must pass the UI history validation");
  assert.equal(entry.at, row.createdAt);
  assert.equal(entry.mode, "rules_and_ai");
  assert.equal(entry.category, "phishing");
  assert.equal(entry.assessment, "high risk");
  assert.ok(entry.excerpt.length <= 121, "excerpt is capped like the tab-session excerpt");
  assert.ok(!entry.excerpt.includes("  "), "whitespace is collapsed");
});

test("an unknown server category falls back to unknown_other", () => {
  const entry = historyEntryFromServer({
    createdAt: 1_700_000_000_000,
    snippet: "hello",
    verdictLabel: "suspicious",
    category: "not-a-category",
  });
  assert.equal(entry.category, "unknown_other");
  assert.ok(validHistoryEntry(entry));
});
