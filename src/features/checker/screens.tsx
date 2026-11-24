"use client";

/**
 * View switch. The three screens are replaced wholesale — the same behaviour the vanilla renderer
 * had — so each one owns its own focus, scroll and measurement lifecycle.
 */

import { HistoryScreen } from "./history-screen";
import { InputScreen } from "./input-screen";
import { useChecker } from "./provider";
import { ResultScreen } from "./result-screen";

export function CheckerScreen() {
  const { view, check } = useChecker();

  if (view === "result" && check) {
    return <ResultScreen payload={check.payload} text={check.text} summary={check.summary} />;
  }
  if (view === "history") return <HistoryScreen />;
  return <InputScreen />;
}
