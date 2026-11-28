"use client";

/**
 * Guidance, official resources and link inspection.
 *
 * The exposure answers are view-local: they are never stored, sent or added to history, and they
 * reset for a new check. They only choose which of the reviewed actions and resources are shown,
 * and they feed the summary export through `onAnswers`.
 */

import { useEffect, useRef, useState } from "react";

import {
  checkedAtLabel,
  guidanceEvidence,
  linkEvidence,
  LINK_LABELS,
  PURPOSE_LABELS,
  TRUSTED_CHANNEL_FALLBACK,
} from "@/lib/scam-checker/ui/public/evidence.js";
import { EXPOSURE_LABELS, relevantResources, selectedActions, toggleExposure } from "@/lib/scam-checker/ui/public/guidance.js";
import { sanitizeText } from "@/lib/scam-checker/ui/public/render-safe.js";

import { SourceDetails } from "./source-details";

const safe = (value: unknown): string => (typeof value === "string" ? sanitizeText(value) : "");

interface GuidanceResource {
  id: string;
  title: string;
  status?: string;
  purpose: string;
  organizationName?: string;
  region: string;
  scope?: string;
  url?: string;
  phone?: string;
  source?: unknown;
}

interface GuidanceAction {
  id: string;
  priority: number;
  short?: string;
  text: string;
  resourceIds: string[];
}

/**
 * "What to do next" — the actions card. Selecting an answer recomputes which reviewed steps apply.
 */
export function GuidanceCard({ data, onAnswers }: { data: unknown; onAnswers: (answers: string[]) => void }) {
  const [exposures, setExposures] = useState<string[]>([]);
  // Keep the latest callback in a ref so publishing answers never loops on a new function identity.
  const notify = useRef(onAnswers);
  useEffect(() => {
    notify.current = onAnswers;
  }, [onAnswers]);

  useEffect(() => {
    notify.current(exposures);
  }, [exposures]);

  const evidence = guidanceEvidence(data) as {
    available: boolean;
    resources: GuidanceResource[];
    actions: GuidanceAction[];
    fallback: string;
    limited: boolean;
  };
  const resources = relevantResources(evidence.resources, exposures) as GuidanceResource[];
  // The shared selectors are plain JS; wrap the calls so the parameter types are explicit here.
  const select = selectedActions as (
    values: string[],
    resources: GuidanceResource[],
    reviewed: GuidanceAction[] | null,
  ) => GuidanceAction[];
  const actions = select(exposures, resources, evidence.actions);

  const statusText = exposures.length
    ? `Selected: ${exposures.map((value) => (EXPOSURE_LABELS as Record<string, string>)[value]).join("; ")}`
    : "Not answered — showing general guidance.";

  return (
    <section className="card guidance-card" id="next-steps">
      <h2 className="card__title">What to do next</h2>

      <div className="guidance-actions" aria-live="polite">
        {actions.length === 0 ? (
          <>
            <p className="card__helper">
              No current, validated action guidance is available. Use the trusted-channel fallback below.
            </p>
            <p className="organization-warning">{TRUSTED_CHANNEL_FALLBACK}</p>
          </>
        ) : null}

        {actions.map((action) => {
          const short = typeof action.short === "string" && action.short.trim() ? action.short : action.text;
          const urgent = action.priority === 0;
          return (
            <div className="guidance-action" data-priority={action.priority} data-action-id={action.id} key={action.id}>
              <p className="guidance-action__text">{short}</p>
              {/* The urgent money action keeps its complete sentence visible. */}
              {urgent ? <p className="guidance-action__fulltext">{action.text}</p> : null}
            </div>
          );
        })}

        {actions.length ? (
          <details className="guidance-details" id="full-guidance">
            <summary>Full guidance for each step</summary>
            {actions.map((action) => {
              const short = typeof action.short === "string" && action.short.trim() ? action.short : action.text;
              return (
                <p className="guidance-details__entry" key={action.id}>
                  <strong>{short}</strong> {action.text}
                  {action.resourceIds.length ? (
                    <span className="guidance-details__links">
                      {action.resourceIds.map((id) => {
                        const resource = resources.find((item) => item.id === id);
                        if (!resource) return null;
                        return (
                          <a className="organization-source__link" href={`#official-resource-${id}`} key={id}>
                            {`${safe(resource.title)}${resource.status === "outdated" ? " (outdated)" : ""}`}
                          </a>
                        );
                      })}
                    </span>
                  ) : null}
                </p>
              );
            })}
          </details>
        ) : null}
      </div>

      <fieldset className="exposure-options" aria-describedby="exposure-help">
        <legend className="field-label">What happened? — optional</legend>
        <p className="field-help" id="exposure-help">
          Optional — kept in this page only.
        </p>
        <div className="exposure-chips">
          {Object.entries(EXPOSURE_LABELS as Record<string, string>).map(([value, name]) => (
            <label
              className={`check-option check-option--chip${exposures.includes(value) ? " is-selected" : ""}`}
              htmlFor={`exposure-${value}`}
              key={value}
            >
              <input
                type="checkbox"
                id={`exposure-${value}`}
                data-exposure={value}
                checked={exposures.includes(value)}
                onChange={(event) => setExposures((current) => toggleExposure(current, value, event.target.checked) as string[])}
              />
              <span>{name}</span>
            </label>
          ))}
        </div>
        <details className="guidance-details" id="exposure-details">
          <summary>How answers are used</summary>
          <p>
            Select all that apply, or only received it. Leave blank if you prefer. Answers stay in this page’s
            memory only, are not sent or saved, and reset for a new check.
          </p>
        </details>
      </fieldset>

      <p className="card__helper" role="status" id="exposure-status">
        {statusText}
      </p>
      <button
        className="btn btn--ghost btn--small"
        type="button"
        id="exposure-clear"
        hidden={exposures.length === 0}
        onClick={() => setExposures([])}
      >
        Clear answers
      </button>
    </section>
  );
}

/** Official resources for the current selections; sits in the "Official support and reporting" panel. */
export function OfficialResourcesCard({ data, exposures }: { data: unknown; exposures: string[] }) {
  const evidence = guidanceEvidence(data) as {
    available: boolean;
    resources: GuidanceResource[];
    limited: boolean;
    checkedAt: string;
  };
  const resources = relevantResources(evidence.resources, exposures) as GuidanceResource[];

  const sourceIndex = new Map<string, { source: unknown; linkable: boolean }>();
  for (const resource of resources) {
    const current = resource.status === "current";
    if (!resource.source) continue;
    const key = JSON.stringify(resource.source);
    const existing = sourceIndex.get(key);
    // Outdated provenance never becomes a live link, even in the consolidated list.
    if (!existing || (!existing.linkable && current)) sourceIndex.set(key, { source: resource.source, linkable: current });
  }

  return (
    <section className="card official-resources" id="official-resources" data-testid="official-resources">
      <h2 className="card__title">Official resources</h2>
      <p className="card__helper">
        Resources relate to organizations identified in the message, not necessarily services you use. Check
        purpose, region, scope and review date. A general contact number is not necessarily a fraud or recovery
        hotline.
      </p>
      {!evidence.available ? (
        <p className="card__body">Official-resource metadata is unavailable for this response.</p>
      ) : (
        <p className="card__helper">{`Resource snapshot taken ${checkedAtLabel(evidence.checkedAt) ?? evidence.checkedAt}`}</p>
      )}
      {resources.length === 0 ? (
        <p className="card__body">No validated official resource is available for these selections.</p>
      ) : null}

      {resources.map((resource) => {
        const current = resource.status === "current";
        return (
          <section
            className="organization-record"
            id={`official-resource-${resource.id}`}
            data-resource-id={resource.id}
            data-resource-status={resource.status}
            key={resource.id}
          >
            <h3 className="organization-record__name">{resource.title}</h3>
            <p className="card__helper">
              {[
                (PURPOSE_LABELS as Record<string, string>)[resource.purpose],
                resource.organizationName ? ` — ${resource.organizationName}` : "",
                ` · Region: ${resource.region}`,
                ` · Scope: ${resource.scope || "not supplied — verify with the official source"}`,
              ].join("")}
            </p>
            <p className={`organization-status${current ? "" : " organization-status--outdated"}`}>
              {current
                ? "Current at check time — confirm before use"
                : "Outdated reference — use an independently trusted official channel"}
            </p>
            {resource.url ? (
              current ? (
                <a className="organization-source__link" href={resource.url} target="_blank" rel="noopener noreferrer">
                  Official website (opens in a new tab)
                </a>
              ) : (
                <p className="card__helper">{`Official website (outdated reference): ${resource.url}`}</p>
              )
            ) : null}
            {resource.phone ? (
              <p className="organization-contact__value">
                {`Official phone${current ? "" : " (outdated reference)"}: ${resource.phone}`}
              </p>
            ) : null}
          </section>
        );
      })}

      {sourceIndex.size ? (
        <div className="organization-sources">
          <p className="organization-contact__label">Reviewed sources</p>
          {[...sourceIndex.values()].map((entry, index) => (
            <SourceDetails key={index} source={entry.source} linkable={entry.linkable} compact />
          ))}
        </div>
      ) : null}

      {evidence.limited ? (
        <p className="card__footnote">Resource coverage is limited or some metadata could not be validated.</p>
      ) : null}
      <p className="organization-warning">{TRUSTED_CHANNEL_FALLBACK}</p>
      <p className="card__footnote">
        Nothing is reported automatically. A matched organization is not assumed to be your bank or payment
        provider.
      </p>
    </section>
  );
}

/** Offline hostname comparison — never a live lookup, never a navigable submitted link. */
export function LinkInspectionCard({ data }: { data: unknown }) {
  const evidence = linkEvidence(data) as {
    available: boolean;
    checkedAt: string;
    unicodeVersion?: string;
    limited: boolean;
    findings: Array<{
      status: string;
      hostname: string;
      unicodeHostname: string;
      scripts: string[];
      matches: Array<{ organizationName: string; officialDomain?: string; outdated?: boolean; source: unknown }>;
    }>;
  };

  return (
    <section className="card link-inspection" id="link-inspection" data-testid="link-inspection">
      <h2 className="card__title">Link inspection</h2>
      <p className="card__helper">
        Offline hostname comparison with reviewed records — not a live website or reputation check.
      </p>

      {!evidence.available ? (
        <p className="card__body">
          Link-inspection metadata is unavailable for this response. No hostname comparison can be shown.
        </p>
      ) : (
        <>
          <p className="card__helper">{`Compared at ${checkedAtLabel(evidence.checkedAt) ?? evidence.checkedAt}`}</p>
          <p className="card__helper">
            {`Lookalike scope: Latin, Greek, Cyrillic, Common and Inherited scripts${
              evidence.unicodeVersion ? `; Unicode ${evidence.unicodeVersion}` : "; version metadata unavailable"
            }. Other scripts and unsupported forms may not be inspectable.`}
          </p>
          {evidence.findings.length === 0 ? (
            <p className="card__body">No inspectable link findings supplied. That does not establish safety.</p>
          ) : null}
          {evidence.findings.map((finding, index) => (
            <div className="organization-record" data-link-status={finding.status} key={index}>
              <h3 className="organization-record__name">
                {(LINK_LABELS as Record<string, string>)[finding.status]}
              </h3>
              <p className="organization-contact__label">Submitted hostname (inert text)</p>
              <p className="organization-contact__value">{finding.hostname || "Not available"}</p>
              <p className="organization-contact__label">Unicode display (inert text)</p>
              <p className="organization-contact__value">{finding.unicodeHostname || "Not available"}</p>
              {finding.scripts.length ? (
                <p className="card__helper">{`Detected scripts: ${finding.scripts.join(", ")}`}</p>
              ) : null}
              {finding.matches.map((match, matchIndex) => (
                <div key={matchIndex}>
                  <p className="organization-contact__owner">
                    {`Related record: ${match.organizationName} · Official hostname: ${match.officialDomain || "not supplied"}`}
                  </p>
                  {match.outdated ? (
                    <p className="organization-status organization-status--outdated">
                      Outdated source — recheck independently
                    </p>
                  ) : null}
                  <SourceDetails source={match.source} linkable={!match.outdated} />
                </div>
              ))}
            </div>
          ))}
          {evidence.limited ? (
            <p className="card__footnote">
              Coverage is limited; some findings may be truncated or could not be validated.
            </p>
          ) : null}
        </>
      )}

      <p className="organization-warning">
        Submitted links are never opened, fetched or resolved. Lookalike detection is heuristic and incomplete. A
        hostname match does not authenticate the sender or establish that a message, page or path is safe.
      </p>
    </section>
  );
}
