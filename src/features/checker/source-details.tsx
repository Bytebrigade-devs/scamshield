"use client";

/**
 * One reviewed source citation.
 *
 * The allowlist gate is not reimplemented here: `reviewedSource` from the shared module decides
 * whether a URL may become a link at all, so an unreviewed or non-allowlisted source can never be
 * rendered as navigable — it degrades to inert text.
 */

import { reviewedSource } from "@/lib/scam-checker/ui/public/organization-card.js";
import { sanitizeText } from "@/lib/scam-checker/ui/public/render-safe.js";

export interface ReviewedSource {
  url: string;
  title: string;
  reviewedAt: string;
  context?: string;
}

const safe = (value: unknown): string => (typeof value === "string" ? sanitizeText(value) : "");

function reviewDate(reviewedAt: string): string {
  return new Date(`${reviewedAt}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SourceDetails({
  source,
  live = false,
  linkable = true,
  compact = false,
}: {
  source: unknown;
  live?: boolean;
  linkable?: boolean;
  compact?: boolean;
}) {
  const approved = reviewedSource(source) as ReviewedSource | null;
  if (!approved) return null;
  return (
    <div className="organization-source">
      {/* Compact mode drops the per-source context sentence: titles appear once per record. */}
      {!compact && approved.context ? (
        <p className="organization-source__context">{safe(approved.context)}</p>
      ) : null}
      {linkable ? (
        <a
          className="organization-source__link"
          href={approved.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${safe(approved.title)} (opens in a new tab)`}
        >
          {safe(approved.title)}
        </a>
      ) : (
        <p className="organization-source__title">{safe(approved.title)}</p>
      )}
      <p className="organization-source__date">
        {`${live ? "Source checked" : "Reviewed"} ${reviewDate(approved.reviewedAt)}`}
      </p>
    </div>
  );
}
