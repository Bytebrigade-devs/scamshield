import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchSummary,
  SummaryError,
} from "../src/features/safety-score/service.ts";
import { makeSummary } from "../src/features/safety-score/fixtures.ts";
test("summary adapter handles authorization, connection and response format boundaries", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("", { status: 401 });
    await assert.rejects(
      fetchSummary("/api/safety-summary/"),
      (e: unknown) => e instanceof SummaryError && e.kind === "auth",
    );
    globalThis.fetch = async () => new Response("", { status: 403 });
    await assert.rejects(
      fetchSummary("/api/safety-summary/"),
      (e: unknown) => e instanceof SummaryError && e.kind === "forbidden",
    );
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    await assert.rejects(
      fetchSummary("/api/safety-summary/"),
      (e: unknown) => e instanceof SummaryError && e.kind === "network",
    );
    globalThis.fetch = async () => Response.json({ invalid: true });
    await assert.rejects(
      fetchSummary("/api/safety-summary/"),
      (e: unknown) => e instanceof SummaryError && e.kind === "format",
    );
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/safety-summary/");
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.cache, "no-store");
      return Response.json(makeSummary("missing"));
    };
    assert.equal((await fetchSummary("/api/safety-summary/")).version, 1);
    globalThis.fetch = async () =>
      assert.fail("unsafe destination must never be requested");
    await assert.rejects(
      fetchSummary("https://other.test"),
      (e: unknown) => e instanceof SummaryError && e.kind === "config",
    );
  } finally {
    globalThis.fetch = original;
  }
});
