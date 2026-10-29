export const DEMO_KEY = "scamshield.m6.checklist-demo.v1";
export const DEMO_RULE = "checklist-demo-v1";
export const practices = [
  {
    id: "unique",
    title: "Use a unique password for every important account.",
    detail:
      "Reusing one password can expose more accounts if it is compromised.",
  },
  {
    id: "long",
    title: "Choose long passwords or passphrases.",
    detail: "Review length and unpredictability when creating a new password.",
  },
  {
    id: "manager",
    title: "Store passwords in a trusted password manager.",
    detail:
      "Keep entries organised and review the manager’s security controls.",
  },
  {
    id: "replace",
    title: "Change passwords that are exposed or reused.",
    detail:
      "Prioritise affected accounts and follow their official recovery process.",
  },
  {
    id: "private",
    title: "Never share passwords or one-time verification codes.",
    detail:
      "Pause when anyone asks you to send a password or verification code.",
  },
] as const;
export type PracticeId = (typeof practices)[number]["id"];
export interface DemoRecord {
  version: 1;
  checked: PracticeId[];
  savedAt: string;
}
export function allConfirmed(checked: readonly string[]): boolean {
  return (
    practices.every((p) => checked.includes(p.id)) &&
    checked.length === practices.length
  );
}
export function decodeDemo(
  raw: string | null,
  now = Date.now(),
): { kind: "empty" | "invalid" | "valid"; record?: DemoRecord } {
  if (raw === null) return { kind: "empty" };
  try {
    const d = JSON.parse(raw);
    if (
      !d ||
      d.version !== 1 ||
      !Array.isArray(d.checked) ||
      !allConfirmed(d.checked) ||
      new Set(d.checked).size !== 5 ||
      typeof d.savedAt !== "string" ||
      !Number.isFinite(Date.parse(d.savedAt)) ||
      Date.parse(d.savedAt) > now + 60000
    )
      return { kind: "invalid" };
    return {
      kind: "valid",
      record: { version: 1, checked: d.checked, savedAt: d.savedAt },
    };
  } catch {
    return { kind: "invalid" };
  }
}

export function commitDemo(
  storage: { setItem: (key: string, value: string) => void },
  checked: PracticeId[],
  now = Date.now(),
): DemoRecord {
  if (!allConfirmed(checked))
    throw new Error("Confirm all five practices before saving.");
  const record: DemoRecord = {
    version: 1,
    checked: [...checked],
    savedAt: new Date(now).toISOString(),
  };
  storage.setItem(DEMO_KEY, JSON.stringify(record));
  return record;
}
export function demoScore(saved: boolean) {
  return saved ? 90 : 65;
}
export function demoBand(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 100) return "Unavailable";
  return value < 40
    ? "Needs attention"
    : value < 70
      ? "Fair"
      : value < 90
        ? "Good"
        : "Strong";
}
export function demoBreakdown(saved: boolean) {
  return [
    { id: "email", label: "Email verified", points: 15, max: 15 },
    { id: "account", label: "Account protection", points: 25, max: 25 },
    {
      id: "passwords",
      label: "Password safety",
      points: saved ? 25 : 0,
      max: 25,
    },
    { id: "awareness", label: "Scam awareness", points: 10, max: 20 },
    { id: "browsing", label: "Safe browsing", points: 15, max: 15 },
  ];
}
export type SourceId = "account" | "passwords" | "scams";
export type SourceState = "current" | "missing" | "stale" | "error";
export interface SourceSummary {
  id: SourceId;
  state: SourceState;
  observedAt: string | null;
  freshUntil: string | null;
  version: string;
  scoringEligible: boolean;
  metrics: Record<string, number | boolean>;
  limitations: string[];
}
export interface SafetySummary {
  version: 1;
  generatedAt: string;
  policy: { status: "pending" | "approved"; version: string | null };
  aggregate: { value: number | null; band: string | null };
  sources: SourceSummary[];
}
const metricTypes: Record<SourceId, Record<string, "number" | "boolean">> = {
  account: { emailConfirmed: "boolean" },
  passwords: {
    totalEntries: "number",
    weakCount: "number",
    reusedCount: "number",
    commonCount: "number",
  },
  scams: { checksCompleted: "number", latestAttemptComplete: "boolean" },
};
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function exact(v: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(v).every((k) => keys.includes(k)) && keys.every((k) => k in v)
  );
}
function date(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v));
}
export function parseSummary(raw: unknown): SafetySummary {
  if (
    !record(raw) ||
    !exact(raw, ["version", "generatedAt", "policy", "aggregate", "sources"]) ||
    raw.version !== 1 ||
    !date(raw.generatedAt) ||
    !record(raw.policy) ||
    !exact(raw.policy, ["status", "version"]) ||
    !["pending", "approved"].includes(String(raw.policy.status)) ||
    !(
      raw.policy.version === null ||
      (typeof raw.policy.version === "string" &&
        raw.policy.version.length > 0 &&
        raw.policy.version.length <= 80)
    ) ||
    !record(raw.aggregate) ||
    !exact(raw.aggregate, ["value", "band"]) ||
    !(
      raw.aggregate.value === null ||
      (typeof raw.aggregate.value === "number" &&
        Number.isFinite(raw.aggregate.value) &&
        raw.aggregate.value >= 0 &&
        raw.aggregate.value <= 100)
    ) ||
    !(
      raw.aggregate.band === null ||
      (typeof raw.aggregate.band === "string" &&
        raw.aggregate.band.length <= 60)
    ) ||
    !Array.isArray(raw.sources) ||
    raw.sources.length !== 3
  )
    throw new Error("The safety summary has an unsupported format.");
  const seen = new Set<string>();
  for (const s of raw.sources) {
    if (
      !record(s) ||
      !exact(s, [
        "id",
        "state",
        "observedAt",
        "freshUntil",
        "version",
        "scoringEligible",
        "metrics",
        "limitations",
      ]) ||
      !["account", "passwords", "scams"].includes(String(s.id)) ||
      seen.has(String(s.id)) ||
      !["current", "missing", "stale", "error"].includes(String(s.state)) ||
      !(s.observedAt === null || date(s.observedAt)) ||
      !(s.freshUntil === null || date(s.freshUntil)) ||
      typeof s.version !== "string" ||
      !s.version.length ||
      s.version.length > 80 ||
      typeof s.scoringEligible !== "boolean" ||
      !record(s.metrics) ||
      !Array.isArray(s.limitations) ||
      s.limitations.length > 10 ||
      !s.limitations.every((x) => typeof x === "string" && x.length <= 500)
    )
      throw new Error("One of the source summaries is invalid.");
    seen.add(String(s.id));
    const allowed = metricTypes[s.id as SourceId];
    for (const [k, v] of Object.entries(s.metrics)) {
      if (
        !allowed[k] ||
        typeof v !== allowed[k] ||
        (typeof v === "number" && (!Number.isSafeInteger(v) || v < 0))
      )
        throw new Error("The summary contains unsupported metrics.");
    }
  }
  return raw as unknown as SafetySummary;
}
export function effectiveState(
  source: SourceSummary,
  now = Date.now(),
): SourceState {
  if (source.state !== "current") return source.state;
  if (!source.observedAt || !source.freshUntil) return "missing";
  const observed = Date.parse(source.observedAt),
    until = Date.parse(source.freshUntil);
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(until) ||
    observed > now + 60000 ||
    until <= observed
  )
    return "error";
  return until <= now ? "stale" : "current";
}
export function aggregateView(
  summary: SafetySummary,
  now = Date.now(),
): { value: number | null; band: string | null; reason: string } {
  if (
    !Number.isFinite(Date.parse(summary.generatedAt)) ||
    Date.parse(summary.generatedAt) > now + 60000
  )
    return {
      value: null,
      band: null,
      reason:
        "The summary timestamp cannot be validated. Request a fresh summary.",
    };
  if (
    summary.sources.length !== 3 ||
    new Set(summary.sources.map((s) => s.id)).size !== 3 ||
    summary.sources.some((s) => effectiveState(s, now) !== "current")
  )
    return {
      value: null,
      band: null,
      reason:
        "Insufficient current data. Missing, stale or unavailable sources are not counted as safe.",
    };
  if (summary.policy.status !== "approved" || !summary.policy.version)
    return {
      value: null,
      band: null,
      reason:
        "The shared scoring policy is awaiting team approval. No integrated score is calculated in this frontend.",
    };
  if (summary.sources.some((s) => !s.scoringEligible))
    return {
      value: null,
      band: null,
      reason:
        "Some evidence is not eligible for scoring. Check volume alone does not demonstrate safer behaviour.",
    };
  if (summary.aggregate.value === null)
    return {
      value: null,
      band: null,
      reason: "The scoring service has not supplied an aggregate.",
    };
  return {
    value: summary.aggregate.value,
    band: summary.aggregate.band,
    reason:
      "Server-supplied result. Review the source coverage, time and rule version.",
  };
}
export function safeApiPath(v: string | undefined): string | null {
  return v && /^\/api\/(?!\/)[A-Za-z0-9/_-]+$/.test(v) ? v : null;
}
export function historyForDemo(savedAt: string | null, now = Date.now()) {
  const anchor = savedAt ? Date.parse(savedAt) - 60000 : now;
  const base = [40, 45, 55, 65].map((value, i) => ({
    id: "baseline-" + i,
    value,
    at: new Date(anchor - (3 - i) * 7 * 86400000).toISOString(),
    rule: DEMO_RULE,
    label: i === 3 ? "Baseline" : "Week " + (i + 1),
  }));
  return savedAt
    ? [
        ...base,
        {
          id: "confirmed",
          value: 90,
          at: savedAt,
          rule: DEMO_RULE,
          label: "Checklist demo",
        },
      ]
    : base;
}
