"use client";

/**
 * View switch. The three screens are replaced wholesale — the same behaviour the vanilla renderer
 * had — so each one owns its own focus, scroll and measurement lifecycle.
 */

import { HistoryScreen } from "./history-screen";
import { InputScreen } from "./input-screen";
import { useChecker } from "./provider";
import { ResultScreen } from "./result-screen";
import { SignInGate } from "./sign-in-gate";

export function CheckerScreen() {
  const { view, check, session, formError } = useChecker();

  // Checks require an account (28 Nov 2026). The gate is shown only on a SERVER 401; while the
  // probe is in flight the editor stays, because the route refuses an anonymous submit anyway.
  if (session === "out") return <SignInGate message={formError} />;
  if (view === "result" && check) {
    return <ResultScreen payload={check.payload} text={check.text} summary={check.summary} />;
  }
  if (view === "history") return <HistoryScreen />;
  return <InputScreen />;
}
