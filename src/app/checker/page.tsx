import { CheckerScreen } from "@/features/checker/screens";

/**
 * `/checker` — the M4 scam checker.
 *
 * The screen is a client component because it owns the editor, the submit cycle and tab-session
 * history; the route itself stays a server component so metadata and the layout stay static.
 */
export default function CheckerPage() {
  return <CheckerScreen />;
}
