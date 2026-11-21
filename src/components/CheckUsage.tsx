"use client";
import { useEffect, useState } from "react";

/**
 * Read-back of M4's checker counters (`GET /api/usage`), shown on the M2 account page.
 *
 * HONEST LIMIT: the endpoint reports M4's real in-memory counter for the single shared demo
 * subject. It is not per-account usage and it resets when the server restarts, so the card says
 * both things in words. `used` counts only completed analyses (M4 counts nothing else), which is
 * why the card also shows how many checks were started — with no AI provider every check is
 * rules-only and `used` stays 0.
 *
 * The card already understands `scope: "account"` for the day M4 keys counters by the verified
 * user; nothing here has to change then.
 */
type UsagePayload = {
  scope: "shared-demo-session" | "account";
  perAccount: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  started: number;
  dailyUsed: number;
  dailyLimit: number | null;
  providerConfigured: boolean;
};

/** Accept only well-formed counters; anything else is treated as unavailable, never as zero. */
function parsePayload(value: unknown): UsagePayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const count = (input: unknown): number | null =>
    typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : null;
  const used = count(record.used);
  const started = count(record.started);
  const dailyUsed = count(record.dailyUsed);
  if (used === null || started === null || dailyUsed === null) return null;
  return {
    scope: record.scope === "account" ? "account" : "shared-demo-session",
    perAccount: record.perAccount === true,
    used,
    limit: count(record.limit),
    remaining: count(record.remaining),
    started,
    dailyUsed,
    dailyLimit: count(record.dailyLimit),
    providerConfigured: record.providerConfigured === true,
  };
}

export function CheckUsage() {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/usage", { cache: "no-store" });
        if (!response.ok) throw new Error("usage-unavailable");
        const payload = parsePayload(await response.json());
        if (payload === null) throw new Error("usage-unavailable");
        if (active) setUsage(payload);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; };
  }, []);

  if (failed) return <p className="mt-5 text-sm text-muted">Checker usage is unavailable right now.</p>;
  if (usage === null) return <p role="status" className="mt-5 text-sm text-muted">Reading checker usage…</p>;

  const personal = usage.scope === "account";
  const limit = usage.limit;
  const counted = limit === null ? usage.used : Math.min(usage.used, limit);
  const percent = limit !== null && limit > 0 ? Math.min(100, (100 * counted) / limit) : 0;

  return (
    <section className="mt-5" aria-labelledby="check-usage-heading">
      <h3 id="check-usage-heading" className="font-semibold">Checker usage</h3>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
        <span>{personal ? "Completed checks in your current window" : "Shared demo counter"}</span>
        <span className="tabular">{usage.used}{limit === null ? "" : ` / ${limit}`} checks used</span>
      </div>
      {limit !== null && limit > 0 && (
        <div
          role="progressbar"
          aria-label="Completed checks counted against the allowance"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={counted}
          className="mt-2 h-2 overflow-hidden rounded-full bg-primary-subtle"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      )}
      {personal ? (
        <p className="mt-2 text-sm text-muted">
          Only completed analyses count against the allowance; denied, failed and rules-only checks do not.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          This is M4&apos;s real counter for the checker, reported as a shared session figure: it counts checks made
          through /checker by anyone using this server, is not per account, and resets when the server restarts.
          Per-account usage is not recorded yet.
        </p>
      )}
      {usage.dailyLimit !== null && (
        <p className="mt-1 text-sm text-muted">{usage.dailyUsed} of {usage.dailyLimit} daily checks used today.</p>
      )}
      <p className="mt-1 text-sm text-muted">
        {usage.started} checks started in this window; only completed analyses count, so started and used can differ.
      </p>
      {!usage.providerConfigured && (
        <p className="mt-1 text-sm text-muted">
          The checker is running without an AI provider, so every check is rules-only and none is counted against the
          allowance.
        </p>
      )}
    </section>
  );
}