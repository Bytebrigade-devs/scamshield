import type { SafetySummary, SourceSummary } from "./model.ts";
export type Scenario =
  "missing" | "stale" | "ready" | "error" | "signed-out" | "forbidden";
export const sourceLabels = {
  account: "Account security",
  passwords: "Password health",
  scams: "Scam evidence",
};
export function makeSummary(
  scenario: Scenario = "missing",
  now = Date.now(),
): SafetySummary {
  const current = new Date(now - 5 * 60000).toISOString();
  const expiry = new Date(now + 10 * 60000).toISOString();
  const sources: SourceSummary[] = [
    {
      id: "account",
      state: "current",
      observedAt: current,
      freshUntil: expiry,
      version: "m2-view-draft-v1",
      scoringEligible: false,
      metrics: { emailConfirmed: true },
      limitations: [
        "Synthetic email-confirmation fact. The M2 exporter is not connected.",
      ],
    },
    {
      id: "passwords",
      state: "current",
      observedAt: current,
      freshUntil: expiry,
      version: "m3-view-draft-v1",
      scoringEligible: false,
      metrics: {
        totalLoginCount: 12,
        assessedLoginCount: 12,
        weakPasswordCount: 3,
        reusedPasswordEntryCount: 4,
        commonPasswordMatchCount: 2,
      },
      limitations: [
        "Counts may overlap. No password, username, note or vault entry is exposed. Normalisation remains unapproved.",
      ],
    },
    {
      id: "scams",
      state: "current",
      observedAt: current,
      freshUntil: expiry,
      version: "m4-view-draft-v1",
      scoringEligible: false,
      metrics: {},
      evidence: {
        contract_version: "0.1.0-draft",
        summary_type: "m4.scam_activity_evidence",
        subject_ref: "synthetic-subject-01",
        as_of: current,
        availability: "available",
        latest_attempt: {
          occurred_at: current,
          analysis_status: "limited",
          analysis_mode: "rules_only",
        },
        limitations: [
          "self_selected_checks",
          "classification_not_verified_incident",
          "no_protective_action_verified",
        ],
      },
      limitations: [
        "Processing evidence is not proof of protective behaviour. Repeated checks do not raise a score. Raw messages are excluded.",
      ],
    },
  ];
  if (scenario === "missing")
    sources[2] = {
      ...sources[2],
      state: "missing",
      observedAt: null,
      freshUntil: null,
      metrics: {},
      evidence: null,
      limitations: [
        "No current M4 evidence summary is available. This does not mean the user is safe.",
      ],
    };
  if (scenario === "stale")
    sources[1] = {
      ...sources[1],
      state: "current",
      observedAt: new Date(now - 3600000).toISOString(),
      freshUntil: new Date(now - 60000).toISOString(),
      limitations: [
        "This example has passed its source-supplied freshness deadline. Request a refreshed summary.",
      ],
    };
  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    policy: { status: "pending", version: null },
    aggregate: { value: null, band: null },
    sources,
  };
}
