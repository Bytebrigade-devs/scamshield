"use client";

/**
 * M4 checker — persistent chrome.
 *
 * The header, navigation, busy indicator and the print payload live outside the view switch,
 * exactly as the vanilla shell did, so switching between Check and History never remounts them.
 *
 * `#print-summary` is deliberately a sibling of the app wrapper rather than a descendant: the
 * stylesheet prints only `body > :not(#print-summary)`'s inverse, so the payload has to sit
 * directly under `<body>` (which it does, because the root layout renders children inline).
 */

import Link from "next/link";

import { useChecker } from "./provider";

const DEMO_NOTICE_STYLE: React.CSSProperties = {
  margin: 0,
  padding: "8px 16px",
  background: "#fff4e5",
  borderBottom: "1px solid #f0d9b5",
  font: "14px/1.4 system-ui, sans-serif",
  color: "#5c3d00",
};

export function CheckerShell({ children }: { children: React.ReactNode }) {
  const { busy, view, printSummary, showInput, showHistory, config, signedIn } = useChecker();
  const historyCurrent = view === "history";

  return (
    <>
      <div className="checker">
        <p role="note" style={DEMO_NOTICE_STYLE}>
          {config?.liveConfigured
            ? signedIn
              ? "AI analysis is on and your checks are saved to your account."
              : "AI analysis is on. Sign in to save your checks to your account."
            : "Local pattern checks only — no AI analysis is configured."}
        </p>

        <header className="site-header">
          <span className="wordmark">
            <svg
              className="wordmark__mark"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            ScamShield
          </span>
          <nav className="site-nav" aria-label="Scam checker">
            <button
              id="nav-check"
              className="nav-link"
              type="button"
              aria-current={historyCurrent ? undefined : "page"}
              disabled={busy}
              onClick={() => {
                if (!busy) showInput({ focus: "heading" });
              }}
            >
              Check message
            </button>
            <button
              id="nav-history"
              className="nav-link"
              type="button"
              aria-current={historyCurrent ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                if (!busy) showHistory();
              }}
            >
              History
            </button>
            {signedIn ? (
              <Link href="/account/subscription" className="nav-link">
                Account
              </Link>
            ) : (
              <Link href="/login" className="nav-link">
                Sign in
              </Link>
            )}
          </nav>
          <div id="check-progress" className="progress-track" hidden={!busy} aria-hidden="true">
            <span className="progress-track__bar" />
          </div>
        </header>

        <main id="main" className="page">
          <div id="view" className="page__inner">
            {children}
          </div>
        </main>
      </div>

      <pre id="print-summary" className="print-summary" aria-hidden="true">{printSummary}</pre>
    </>
  );
}
