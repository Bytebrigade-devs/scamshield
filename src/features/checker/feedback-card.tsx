"use client";

/**
 * "Report a wrong result" — echoes back the server's opaque check id and one agreed reason code.
 *
 * Nothing else is sent: no message text, no free text, no rating, no identity. The control only
 * appears when the server supplied a reportable check, and it disappears once a report is accepted.
 */

import { useState } from "react";

import {
  feedbackFailedText,
  feedbackModel,
  feedbackSubmittedText,
  FEEDBACK_REASON_LABELS,
  FEEDBACK_HELPER,
  FEEDBACK_TITLE,
} from "@/lib/scam-checker/ui/public/feedback.js";

import { postFeedback } from "./http";

type Phase =
  | { state: "idle" }
  | { state: "needs-reason" }
  | { state: "sending" }
  | { state: "sent"; code: string }
  | { state: "failed" };

export function FeedbackCard({ feedback }: { feedback: unknown }) {
  const model = feedbackModel(feedback) as { checkId: string; reasonCodes: string[] } | null;
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ state: "idle" });

  if (!model) return null;

  const sending = phase.state === "sending";
  const done = phase.state === "sent";
  const status =
    phase.state === "sent"
      ? feedbackSubmittedText(phase.code)
      : phase.state === "failed"
        ? feedbackFailedText()
        : phase.state === "sending"
          ? "Sending…"
          : phase.state === "needs-reason"
            ? "Choose a reason first."
            : "";

  const report = () => {
    if (selected === null) {
      setPhase({ state: "needs-reason" });
      return;
    }
    setPhase({ state: "sending" });
    void postFeedback(model.checkId, selected).then((result) => {
      setPhase(result.ok ? { state: "sent", code: selected } : { state: "failed" });
    });
  };

  return (
    <section className="card feedback" data-testid="feedback" aria-labelledby="feedback-title">
      <h2 className="card__title" id="feedback-title">
        {FEEDBACK_TITLE}
      </h2>
      <p className="card__helper">{FEEDBACK_HELPER}</p>
      {!done ? (
        <>
          <fieldset className="feedback__options">
            {model.reasonCodes.map((code) => (
              <label className="feedback__option" key={code}>
                <input
                  type="radio"
                  name="feedback-reason"
                  id={`feedback-reason-${code}`}
                  value={code}
                  checked={selected === code}
                  disabled={sending}
                  onChange={() => {
                    setSelected(code);
                    if (phase.state === "failed") setPhase({ state: "idle" });
                  }}
                />
                {` ${(FEEDBACK_REASON_LABELS as Record<string, string>)[code]}`}
              </label>
            ))}
          </fieldset>
          <div className="card__actions">
            <button className="btn" type="button" id="feedback-submit" disabled={sending} onClick={report}>
              Report
            </button>
          </div>
        </>
      ) : null}
      <p className="card__footnote" id="feedback-status" role="status">
        {status}
      </p>
    </section>
  );
}
