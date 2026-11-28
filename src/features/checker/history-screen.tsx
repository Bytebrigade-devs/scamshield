"use client";

/**
 * Tab-session history.
 *
 * This is not account history and not server persistence: it lives in `sessionStorage`, holds at
 * most 20 entries, and stores only a short excerpt plus the outcome summary. Clearing it removes
 * this list and nothing else — provider records and usage are untouched, and the button says so.
 */

import { categoryLabel, MODE_LABELS } from "@/lib/scam-checker/ui/public/assessment.js";
import { formatCheckTime } from "@/lib/scam-checker/ui/public/evidence.js";
import { sanitizeText } from "@/lib/scam-checker/ui/public/render-safe.js";

import { useChecker } from "./provider";
import { PageHeading, useHeadingFocus } from "./ui";

export function HistoryScreen() {
  useHeadingFocus();
  const { history, clearHistory, showInput, signedIn } = useChecker();

  return (
    <>
      <PageHeading
        eyebrow="Recent checks"
        title="Your check history"
        subtitle={
          signedIn
            ? "Checks saved to your account, retained per your plan. Read-only — retention removes them automatically, not from here."
            : "Up to 20 checks from this tab’s session. This history is not synced with an account."
        }
      />

      <section className="card">
        <h2 className="card__title">
          {history.length ? (signedIn ? "Checks saved to your account" : "Checks in this tab") : "No checks yet"}
        </h2>
        {history.length === 0 ? (
          <p className="card__body card__body--muted">
            Check a message to see its result and a short excerpt here.
          </p>
        ) : (
          <>
            <div className="history-list">
              {history.map((entry, index) => (
                <article className="history-item" key={`${entry.at}-${index}`}>
                  <p className="history-item__meta">
                    <time dateTime={new Date(entry.at).toISOString()}>
                      {(formatCheckTime(entry.at) as string | null) ?? ""}
                    </time>
                  </p>
                  <p className="history-item__excerpt">{sanitizeText(entry.excerpt)}</p>
                  <p className="history-item__detail">{sanitizeText(entry.assessment)}</p>
                  <p className="history-item__detail">
                    {`${(MODE_LABELS as Record<string, string>)[entry.mode]} · Category: ${categoryLabel(entry.category)}`}
                  </p>
                </article>
              ))}
            </div>
            {!signedIn && (
              <div className="card__actions">
                <p className="actions-note">Clears this list only. It does not delete provider records.</p>
                <button className="btn btn--ghost" type="button" id="clear-history" onClick={clearHistory}>
                  Clear history
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <div className="card__actions card__actions--footer">
        <button className="btn" type="button" onClick={() => showInput({ focus: "textarea" })}>
          Check a message
        </button>
      </div>
    </>
  );
}
