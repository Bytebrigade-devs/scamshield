"use client";

/**
 * The result screen.
 *
 * Order is deliberate and load-bearing: warning banner, then the verdict (the page's only `h1`),
 * then the message that was checked, then what to do next, then the local evidence, then the
 * reference disclosures. The local-pattern count sits beside the evidence it counts — never inside
 * the AI risk meter — because the two are different kinds of claim.
 *
 * Every string that came from the message, the server or the AI provider passes through
 * `sanitizeText` before it reaches the DOM. React escapes markup but leaves bidi and control
 * characters alone, and this is a scam checker.
 */

import { useLayoutEffect, useRef, useState } from "react";

import {
  categoryLabel,
  localPatterns,
  MODE_LABELS,
  RISK_BANDS,
  riskAssessment,
  ruleExplanation,
  validMatches,
} from "@/lib/scam-checker/ui/public/assessment.js";
import { aiFailureMessage } from "@/lib/scam-checker/ui/public/provenance-cards.js";
import { sanitizeText } from "@/lib/scam-checker/ui/public/render-safe.js";

import { FeedbackCard } from "./feedback-card";
import { GuidanceCard, LinkInspectionCard, OfficialResourcesCard } from "./guidance-card";
import { LinkWarningBanner } from "./link-banner";
import type { AnalysedOutcome, CheckPayload, ReasonHighlight, RuleMatch } from "./model";
import { OrganizationCard } from "./organization-card";
import { useChecker } from "./provider";
import { SenderCard } from "./sender-card";
import { SummaryCard } from "./summary-card";
import { Disclosure, useHeadingFocus } from "./ui";

const CLAMP_OVERFLOW_MIN = 48;
const NARROW_QUERY = "(max-width: 720px)";

const ICON_PATHS: Record<"alert" | "shield" | "info", string[]> = {
  alert: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  shield: [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "m9 12 2 2 4-4",
  ],
  info: ["M12 16v-4", "M12 8h.01"],
};

export function ResultScreen({ payload, text, summary }: { payload: CheckPayload; text: string; summary: unknown }) {
  useHeadingFocus();
  const { showInput } = useChecker();
  const [answers, setAnswers] = useState<string[]>([]);

  const outcome = payload.outcome as AnalysedOutcome;
  const status = outcome.analysisStatus;
  const risk = riskAssessment(outcome) as { level: string; label: string; heading: string };
  const matches = outcome.rules?.matches ?? [];

  const heading = status === "completed" ? risk.heading : status === "limited" ? "Rules-only analysis" : "AI analysis failed";
  const reason =
    status === "completed"
      ? outcome.reply?.reason || "Review the message and any local patterns below."
      : status === "limited"
        ? "Local patterns can miss scams and can also flag legitimate messages."
        : "Your message was still scanned with local scam patterns — they are listed below. This is not a safety verdict.";
  const failure = status === "unavailable" ? (aiFailureMessage(payload.aiFailure) as string | null) : null;
  const resourceCount = (payload.guidanceResources as { resources?: unknown[] } | undefined)?.resources?.length ?? 0;

  return (
    <>
      <LinkWarningBanner inspection={payload.linkInspection} />

      <section
        className={`assessment${status === "limited" ? " assessment--limited" : status === "unavailable" ? " assessment--failed" : ""}`}
        data-risk={risk.level}
      >
        <div className="assessment__head">
          <VerdictIcon status={status} level={risk.level} />
          <h1 className="assessment__title">{heading}</h1>
        </div>

        <Explanation
          text={reason}
          highlights={status === "completed" ? (outcome.reply?.reasonHighlights ?? []) : []}
        />

        {failure ? (
          <p className="assessment__diagnostic" role="status">
            {failure}
          </p>
        ) : null}

        <RiskMeter risk={risk} />
        <p className="result-meta">{resultMetaItems(payload, outcome)}</p>
        <p className="assessment__footnote">
          {status === "unavailable"
            ? "A service failure does not prove that your text was not transferred to or retained by the AI provider."
            : "This is a qualitative assessment, not a scam probability, and guidance rather than a guarantee of safety. The sender has not been authenticated and links have not been checked for reputation."}
        </p>
      </section>

      <MessageCard text={text} matches={matches} />
      <GuidanceCard data={payload.guidanceResources} onAnswers={setAnswers} />
      <EvidenceCard text={text} matches={matches} />

      <div className="result-secondary">
        <Disclosure title="Sender, organization and link checks">
          <OrganizationCard data={payload.organizationVerification} />
          <SenderCard data={payload.senderVerification} />
          <LinkInspectionCard data={payload.linkInspection} />
        </Disclosure>

        <Disclosure
          title="Official support and reporting"
          meta={resourceCount ? `${resourceCount} reviewed` : null}
        >
          <OfficialResourcesCard data={payload.guidanceResources} exposures={answers} />
        </Disclosure>

        <Disclosure title="Export this check">
          <SummaryCard model={summary} answers={answers} />
        </Disclosure>

        {payload.feedback ? (
          <Disclosure title="Something wrong with this result?">
            <FeedbackCard feedback={payload.feedback} />
          </Disclosure>
        ) : null}
      </div>

      <div className="card__actions card__actions--footer">
        <button
          className="btn"
          type="button"
          onClick={() => showInput({ focus: "textarea" })}
        >
          {status === "unavailable" ? "Return to message" : "Check another message"}
        </button>
      </div>
    </>
  );
}

/** Decorative verdict icon: the heading already carries the wording, so it is hidden from AT. */
function VerdictIcon({ status, level }: { status: string; level: string }) {
  const shape: "alert" | "shield" | "info" =
    status !== "completed" || level === "high" || level === "suspicious"
      ? "alert"
      : level === "low"
        ? "shield"
        : "info";
  return (
    <svg
      className="assessment__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shape === "info" ? <circle cx={12} cy={12} r={10} /> : null}
      {ICON_PATHS[shape].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}

/**
 * The AI reason, clamped to 4 lines on a phone and 6 on desktop — but only visually, and only when
 * the saving is worth a control. The full text stays in the DOM for copy, export and screen
 * readers; nothing is truncated without an explicit, keyboard-operable way to read it all.
 */
function Explanation({ text, highlights }: { text: string; highlights: ReasonHighlight[] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const measure = () => {
      const node = ref.current;
      if (!node) return;
      setNarrow(query.matches);
      setClipped(node.scrollHeight - node.clientHeight > CLAMP_OVERFLOW_MIN);
    };
    measure();
    void document.fonts?.ready.then(measure).catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [text, highlights]);

  const clampLines = narrow ? 4 : 6;
  // Clamping is applied unless expanded; when the text fits, the clamp has no visible effect.
  const className = expanded ? "assessment__explanation" : "assessment__explanation is-clamped";
  const style = { "--clamp-lines": String(clampLines) } as React.CSSProperties;
  const spans = mergeSpans(text, highlights);

  return (
    <>
      <p ref={ref} className={className} style={style} id="assessment-explanation">
        <Highlighted text={text} spans={spans} variant="explanation" />
      </p>
      <div className="assessment__more-row" hidden={!clipped}>
        <button
          type="button"
          className="assessment__more"
          aria-expanded={expanded}
          aria-controls="assessment-explanation"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Read full explanation"}
        </button>
      </div>
    </>
  );
}

/** Merge overlapping spans so a match never splits a highlight in two. */
function mergeSpans(
  text: string,
  matches: ReadonlyArray<{ start: number; end: number; excerpt?: string }>,
): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  for (const match of validMatches(text, matches as never) as RuleMatch[]) {
    const previous = spans.at(-1);
    if (previous && match.start < previous.end) previous.end = Math.max(previous.end, match.end);
    else spans.push({ start: match.start, end: match.end });
  }
  return spans;
}

/**
 * Render text with already-merged highlight spans. Offsets are UTF-16 positions into the
 * *original* text and `sanitizeText` is length-preserving, so they remain valid after
 * neutralisation.
 */
function Highlighted({
  text,
  spans,
  variant,
}: {
  text: string;
  spans: Array<{ start: number; end: number }>;
  variant: "message" | "explanation";
}) {
  const safe = sanitizeText(text);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  spans.forEach((span, index) => {
    if (span.start > cursor) parts.push(safe.slice(cursor, span.start));
    const excerpt = safe.slice(span.start, span.end);
    parts.push(
      variant === "explanation" ? (
        <mark className="assessment__highlight" key={index}>
          <strong>{excerpt}</strong>
        </mark>
      ) : (
        <mark className="evidence" key={index}>
          {excerpt}
        </mark>
      ),
    );
    cursor = span.end;
  });
  parts.push(safe.slice(cursor));

  return <>{parts}</>;
}

function MessageCard({ text, matches }: { text: string; matches: RuleMatch[] }) {
  const spans = mergeSpans(text, matches);
  return (
    <section className="card">
      <h2 className="card__title">Your message</h2>
      <p className="message-text">
        <Highlighted text={text} spans={spans} variant="message" />
      </p>
      <p className="card__footnote">
        {spans.length
          ? "Highlighted wording relates to the patterns below. Message links have not been opened or verified."
          : "Message links have not been opened or verified."}
      </p>
    </section>
  );
}

/**
 * Local rule evidence. Shown in every analysed state, including AI failure: stages 1–2 always ran,
 * so hiding real evidence would leave the user with less than the server knows.
 */
function EvidenceCard({ text, matches }: { text: string; matches: RuleMatch[] }) {
  const count = (localPatterns(text, matches) as { count: number }).count;
  const groups: Array<{ start: number; end: number; reasons: string[] }> = [];

  for (const match of validMatches(text, matches) as RuleMatch[]) {
    const reason = ruleExplanation(match.ruleId) as string;
    const previous = groups.at(-1);
    if (previous && match.start < previous.end) {
      previous.end = Math.max(previous.end, match.end);
      if (!previous.reasons.includes(reason)) previous.reasons.push(reason);
    } else {
      groups.push({ start: match.start, end: match.end, reasons: [reason] });
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">{count ? `Patterns in your message · ${count}` : "Patterns in your message"}</h2>
      {groups.length === 0 ? (
        <p className="card__body">
          No local patterns were found. Scams can still be missed, so this does not establish that the message is
          safe.
        </p>
      ) : (
        <>
          <p className="card__helper">These clues need review; they do not prove that a message is a scam.</p>
          <div className="evidence-list">
            {groups.map((group, index) => (
              <div className="evidence-item" key={index}>
                <p className="evidence-item__quote">{sanitizeText(text.slice(group.start, group.end))}</p>
                <p className="evidence-item__reasons">{group.reasons.join(" · ")}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function RiskMeter({ risk }: { risk: { level: string; label: string } }) {
  return (
    <div className="risk-meter" data-risk={risk.level} role="group" aria-label={`AI risk assessment: ${risk.label}`}>
      <p className="risk-meter__title">AI risk assessment</p>
      <ol className="risk-meter__bands">
        {(["low", "suspicious", "high"] as const).map((level) => (
          <li
            className={`risk-meter__band${risk.level === level ? " risk-meter__band--current" : ""}`}
            key={level}
          >
            <span className="risk-meter__name">{(RISK_BANDS as Record<string, { label: string }>)[level].label}</span>
            {risk.level === level ? <span className="risk-meter__current">Selected</span> : null}
          </li>
        ))}
      </ol>
      {risk.level === "undetermined" ? (
        <p className="risk-meter__unknown">Undetermined — no risk band selected.</p>
      ) : null}
    </div>
  );
}

/** Plain statement of which scans ran, so a result never looks like nothing was checked. */
function resultMetaItems(payload: CheckPayload, outcome: AnalysedOutcome): React.ReactNode {
  const aiState =
    outcome.analysisStatus === "completed"
      ? "Completed"
      : outcome.analysisStatus === "unavailable"
        ? "Failed"
        : payload.providerMode === "live-unconfigured"
          ? "Not configured"
          : "Failed";

  const items: string[] = ["Local pattern scan: Completed", `AI analysis: ${aiState}`];
  if (outcome.analysisStatus !== "unavailable") {
    // "AI analysis: Completed" already names the mode; the explicit Mode label only earns its
    // place in the limited (rules-only) state.
    if (outcome.analysisStatus !== "completed") items.push(`Mode: ${(MODE_LABELS as Record<string, string>)[outcome.analysisMode]}`);
    items.push(`Category: ${categoryLabel(outcome.category)}`);
  }

  // The separating space is not rendered by the flex row but keeps the text readable to AT.
  return items.map((item, index) => (
    <span key={index}>
      {" "}
      <span>{item}</span>
    </span>
  ));
}
