"use client";

/**
 * Sender comparison — user-supplied evidence, never authentication.
 *
 * A displayed name can never be confirmed, and a matching contact only means the value appears in
 * the reviewed directory. The status line says so; this card never upgrades a sender to "verified".
 */

import { reviewedSource } from "@/lib/scam-checker/ui/public/organization-card.js";
import { sanitizeText } from "@/lib/scam-checker/ui/public/render-safe.js";

import { SourceDetails } from "./source-details";

const WARNING = "Matching official contact details does not authenticate the sender or prove the message is safe.";
const safe = (value: unknown): string => (typeof value === "string" ? sanitizeText(value) : "");

interface SenderMatch {
  organizationName: string;
  scope?: string;
  source: unknown;
}

interface SenderData {
  kind: "name" | "phone" | "email";
  value: string;
  status?: string;
  matches?: SenderMatch[];
}

export function SenderCard({ data }: { data: unknown }) {
  const sender = data as SenderData | undefined;
  if (!sender || typeof sender.value !== "string" || !sender.value.trim()) return null;
  if (!["name", "phone", "email"].includes(sender.kind)) return null;

  const matches = Array.isArray(sender.matches)
    ? sender.matches
        .filter((match) => match && typeof match.organizationName === "string" && reviewedSource(match.source))
        .slice(0, 12)
    : [];
  const status =
    sender.kind !== "name" && matches.length && ["matched", "outdated"].includes(sender.status ?? "")
      ? (sender.status as string)
      : "not-confirmed";

  const kindLabel =
    sender.kind === "name" ? "Displayed sender name" : sender.kind === "phone" ? "Supplied sender phone" : "Supplied sender email";
  const statusText =
    status === "matched"
      ? "Matches a reviewed contact record; sender remains unverified"
      : status === "outdated"
        ? "Contact record is outdated; sender remains unverified"
        : sender.kind === "name"
          ? "A displayed sender name alone cannot authenticate an organization"
          : "Sender contact not confirmed against reviewed records";

  return (
    <section
      className="card sender-verification"
      aria-labelledby="sender-verification-title"
      data-sender-status={status}
    >
      <h2 className="card__title" id="sender-verification-title">
        Sender comparison
      </h2>
      <p className="card__helper">
        Sender information was supplied by the user. Displayed names, phone numbers and email addresses can be
        spoofed.
      </p>
      <p className="organization-contact__label">{kindLabel}</p>
      <p className="organization-contact__value">{safe(sender.value)}</p>
      <p className={`organization-status organization-status--${status}`}>{statusText}</p>
      {matches.map((match, index) => (
        <div key={`${match.organizationName}-${index}`}>
          <p className="organization-contact__owner">
            {`Listed for ${safe(match.organizationName)}${match.scope ? ` · ${safe(match.scope)}` : ""}`}
          </p>
          <SourceDetails source={match.source} />
        </div>
      ))}
      <p className="organization-warning">{WARNING}</p>
    </section>
  );
}
