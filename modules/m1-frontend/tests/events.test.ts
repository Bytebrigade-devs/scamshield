import test from "node:test";
import assert from "node:assert/strict";
import { emitEvent } from "../src/lib/events.ts";
test("analytics disabled by default and allowlisted when enabled; failures stay non-blocking", () => {
  const old = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;
  const calls: unknown[] = [];
  Object.defineProperty(globalThis, "window", {
    value: { dispatchEvent: (event: CustomEvent) => calls.push(event.detail) },
    configurable: true,
  });
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = "false";
  emitEvent("landing_view");
  assert.equal(calls.length, 0);
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = "true";
  emitEvent("cta_click", {
    variant: "B",
    placement: "hero",
    step: 9,
    ...{ answers: "secret" },
  });
  assert.deepEqual((calls[0] as { context: unknown }).context, {
    variant: "B",
    placement: "hero",
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      dispatchEvent: () => {
        throw new Error("offline");
      },
    },
    configurable: true,
  });
  assert.doesNotThrow(() => emitEvent("onboarding_completed"));
  delete (globalThis as { window?: unknown }).window;
  if (old === undefined) delete process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;
  else process.env.NEXT_PUBLIC_ANALYTICS_ENABLED = old;
});
