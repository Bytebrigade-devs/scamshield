"use client";

/**
 * Organization and contact checks — reviewed-directory evidence, not a verdict.
 *
 * Directory findings are server-generated and separate from the AI assessment. Everything here is
 * inert text except a source URL that passed the `reviewedSource` allowlist. A missing or
 * unconfirmed record is reported as unverified, never as proof of fraud.
 */

import { reviewedSource } from "@/lib/scam-checker/ui/public/organization-card.js";
import { sanitizeText } from "@/lib/scam-checker/ui/public/render-safe.js";

import { SourceDetails } from "./source-details";

const STATUS_LABELS: Record<string, string> = {
  matched: "Matches verified record",
  "not-confirmed": "Not confirmed",
  "another-organization": "Matches another organization’s record",
  outdated: "Outdated record",
  "not-provided": "Not provided",
};

const WARNING = "Matching official contact details does not authenticate the sender or prove the message is safe.";
const safe = (value: unknown): string => (typeof value === "string" ? sanitizeText(value) : "");

interface ContactMatch {
  organizationName: string;
  scope?: string;
  source: unknown;
}

interface Contact {
  kind: "phone" | "website";
  value?: string;
  status?: string;
  scope?: string;
  matches?: ContactMatch[];
  source?: unknown;
}

interface Organization {
  name: string;
  identifiedBy: string;
  identity?: { status?: string; source?: unknown; description?: string };
  contacts?: Contact[];
  officialContacts?: Contact[];
}

interface OrganizationData {
  organizations: Organization[];
  unmatchedContacts: Contact[];
}

/** Reviewed sources seen while rendering one record, deduplicated by URL and review date. */
interface SourceCollector {
  sources: Map<string, unknown>;
  unconfirmed: boolean;
}

const newCollector = (): SourceCollector => ({ sources: new Map(), unconfirmed: false });

function basisFor(identifiedBy: string): string {
  if (identifiedBy === "phone") {
    return "Related organization identified from a listed phone number in the message; the sender is unconfirmed.";
  }
  if (identifiedBy === "domain") {
    return "Organization identified from a website domain in the message; the sender is unconfirmed.";
  }
  if (identifiedBy === "name-and-domain") {
    return "Organization named in the message and identified by a website domain; the sender is unconfirmed.";
  }
  return "Organization named in the message; the sender is unconfirmed.";
}

function contactRow(contact: Contact, collector: SourceCollector, key: string) {
  if (!contact || typeof contact !== "object" || !["phone", "website"].includes(contact.kind)) return null;
  const matches = Array.isArray(contact.matches)
    ? contact.matches
        .filter((match) => match && typeof match.organizationName === "string" && reviewedSource(match.source))
        .slice(0, 12)
    : [];
  let status = Object.prototype.hasOwnProperty.call(STATUS_LABELS, contact.status ?? "")
    ? (contact.status as string)
    : "not-confirmed";
  if (typeof contact.value !== "string" || !contact.value.trim()) status = "not-provided";
  if (["matched", "another-organization", "outdated"].includes(status) && matches.length === 0) status = "not-confirmed";
  const kind = contact.kind === "phone" ? "Phone number" : "Website";

  for (const match of matches) {
    const approved = reviewedSource(match.source) as { url: string; reviewedAt: string } | null;
    if (approved) collector.sources.set(`${approved.url}|${approved.reviewedAt}`, match.source);
  }
  if (status === "not-confirmed") collector.unconfirmed = true;

  return (
    <li className="organization-contact" data-contact-status={status} key={key}>
      <p className="organization-contact__value">
        <span className="organization-contact__label">{`${kind}: `}</span>
        {typeof contact.value === "string" && contact.value ? safe(contact.value) : "not supplied"}
      </p>
      <p className={`organization-status organization-status--${status}`}>{STATUS_LABELS[status]}</p>
      {matches.map((match, index) => (
        <p className="organization-contact__owner" key={index}>
          {`Listed for ${safe(match.organizationName)}${match.scope ? ` · ${safe(match.scope)}` : ""}`}
        </p>
      ))}
    </li>
  );
}

function OfficialContacts({ contacts, collector }: { contacts: Contact[]; collector: SourceCollector }) {
  const reviewed = contacts
    .filter(
      (contact) =>
        contact &&
        ["phone", "website"].includes(contact.kind) &&
        typeof contact.value === "string" &&
        contact.value.trim() &&
        ["matched", "outdated"].includes(contact.status ?? "") &&
        reviewedSource(contact.source),
    )
    .slice(0, 64);

  const groups = (["website", "phone"] as const).map((kind) => {
    const entries = reviewed.filter((contact) => contact.kind === kind);
    // Sources are collected into the record's deduplicated list, not repeated per group.
    for (const contact of entries) collector.sources.set(JSON.stringify(contact.source), contact.source);
    return (
      <li className="organization-contact" key={kind}>
        <p className="organization-contact__label">
          {kind === "website" ? "Official websites" : "Official phone numbers"}
        </p>
        {entries.length ? (
          <ul className="organization-reference__entries">
            {entries.map((contact, index) => (
              <li className="organization-reference__entry" data-reference-status={contact.status} key={index}>
                <p className="organization-contact__value">{safe(contact.value)}</p>
                {kind === "phone" && contact.scope ? (
                  <p className="organization-contact__owner">{safe(contact.scope)}</p>
                ) : null}
                <p className={`organization-status organization-status--${contact.status}`}>
                  {contact.status === "outdated"
                    ? "Outdated record — recheck the source"
                    : "Listed in reviewed official source"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="organization-contact__help">
            {kind === "phone"
              ? "No phone number is available in the reviewed directory."
              : "No website is available in the reviewed directory."}
          </p>
        )}
      </li>
    );
  });

  return (
    <div className="organization-reference">
      <h4 className="organization-record__subheading">Official contact details</h4>
      <p className="organization-contact__help">
        Reference details for contacting this organization independently, even when someone else wrote the
        message. Coverage is incomplete; check the source and regional scope.
      </p>
      <ul className="organization-contacts">{groups}</ul>
    </div>
  );
}

/** One deduplicated reviewed-source list per record instead of a citation under every contact. */
function RecordSources({ collector }: { collector: SourceCollector }) {
  if (collector.sources.size === 0) return null;
  return (
    <div className="organization-sources">
      <p className="organization-contact__label">Reviewed sources</p>
      {[...collector.sources.values()].map((source, index) => (
        <SourceDetails key={index} source={source} compact />
      ))}
    </div>
  );
}

export function OrganizationCard({ data }: { data: unknown }) {
  const payload = data as OrganizationData | undefined;
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray(payload.organizations) ||
    !Array.isArray(payload.unmatchedContacts)
  ) {
    return null;
  }

  const organizations = payload.organizations
    .filter(
      (item) =>
        item &&
        typeof item.name === "string" &&
        item.name.trim() &&
        ["name", "domain", "name-and-domain", "phone"].includes(item.identifiedBy),
    )
    .slice(0, 12);

  const unmatchedCollector = newCollector();
  const unmatched = payload.unmatchedContacts
    .slice(0, 64)
    .map((contact, index) => contactRow(contact, unmatchedCollector, `unmatched-${index}`))
    .filter(Boolean);

  return (
    <section className="card organization-checks" aria-labelledby="organization-checks-title">
      <h2 className="card__title" id="organization-checks-title">
        Organization and contact checks
      </h2>
      <p className="card__helper">
        This section uses reviewed directory records. Sender authenticity and link destinations are not
        established.
      </p>

      {organizations.length === 0 ? (
        <>
          <p className="card__body">No organization could be verified against the current directory.</p>
          <p className="card__body card__body--muted">
            The directory covers selected organizations. An organization missing from it is unverified, not proven
            fake.
          </p>
        </>
      ) : null}

      {organizations.map((organization, index) => (
        <OrganizationRecord key={`${organization.name}-${index}`} organization={organization} />
      ))}

      {unmatched.length ? (
        <section className="organization-record">
          <h3 className="organization-record__name">Contact details in the message</h3>
          <ul className="organization-contacts">{unmatched}</ul>
          {unmatchedCollector.unconfirmed ? (
            <p className="organization-contact__help">
              The reviewed directory does not confirm these details. That does not establish that they are fake.
            </p>
          ) : null}
          <RecordSources collector={unmatchedCollector} />
        </section>
      ) : null}

      <p className="organization-warning">{WARNING}</p>
    </section>
  );
}

function OrganizationRecord({ organization }: { organization: Organization }) {
  const identity = organization.identity;
  const source = ["matched", "outdated"].includes(identity?.status ?? "")
    ? (reviewedSource(identity?.source) as { url: string; reviewedAt: string } | null)
    : null;
  const collector = newCollector();
  if (source) collector.sources.set(`${source.url}|${source.reviewedAt}`, identity?.source);

  const status = source && identity?.status === "matched" ? "matched" : source && identity?.status === "outdated" ? "outdated" : "not-confirmed";
  const statusText = source
    ? identity?.status === "outdated"
      ? "Organization record is outdated"
      : "Organization record supported by an official source"
    : "Organization record not confirmed";

  const contacts = Array.isArray(organization.contacts)
    ? organization.contacts
        .slice(0, 64)
        .map((contact, index) => contactRow(contact, collector, `contact-${index}`))
        .filter(Boolean)
    : [];

  return (
    <section className="organization-record">
      <h3 className="organization-record__name">{safe(organization.name)}</h3>
      <p className="organization-record__basis">{basisFor(organization.identifiedBy)}</p>
      <p className={`organization-status organization-status--${status}`}>{statusText}</p>
      {source && typeof identity?.description === "string" ? (
        <p className="organization-record__description">{safe(identity.description)}</p>
      ) : null}
      {contacts.length ? (
        <>
          <h4 className="organization-record__subheading">Contact details in the message</h4>
          <ul className="organization-contacts">{contacts}</ul>
        </>
      ) : null}
      {collector.unconfirmed ? (
        <p className="organization-contact__help">
          The reviewed directory does not confirm these details. That does not establish that they are fake.
        </p>
      ) : null}
      {Array.isArray(organization.officialContacts) ? (
        <OfficialContacts contacts={organization.officialContacts} collector={collector} />
      ) : null}
      <RecordSources collector={collector} />
    </section>
  );
}
