/**
 * M2 — password-reset code issuance (server only).
 *
 * Why this exists: Supabase's own recovery mail depends on the project's SMTP configuration, and an
 * unconfigured project answers `resetPasswordForEmail` with success while delivering nothing. That
 * is the failure this replaces. The recovery OTP is generated with the service-role admin API
 * (`generateLink({ type: "recovery" })` returns `email_otp`) and delivery is handed to the
 * project's own mail sender, so "we sent a code" is only claimed after a send was attempted.
 *
 * Rules, each pinned by scripts/test-recovery.cjs:
 *  1. The code never leaves the server — it is not returned to the browser, not logged, and not
 *     echoed inside an error message.
 *  2. An unknown address is indistinguishable from a known one: both answer `sent`, and nothing is
 *     delivered for the unknown one (no account enumeration).
 *  3. A missing mail sender answers `mail-not-configured`, never a fake success.
 *  4. A malformed or absent OTP from the admin API is an error, not a silent "sent".
 *  5. Requests are rate limited per address and per caller. The limiter is in-memory per process:
 *     a restart clears it. That limit is stated here rather than pretended away.
 *
 * Known trade-off: while the mail sender is broken, a known address gets `unavailable` and an
 * unknown one gets `sent`, which is an enumeration signal during that outage. Telling the truth
 * about a failed send was judged worth more than hiding it.
 */

export type RecoveryOutcome =
  | { kind: "sent" }
  | { kind: "mail-not-configured" }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "delivery-throttled"; retryAfterSeconds: number }
  | { kind: "unavailable" };

/**
 * Thrown by `sendCode` when the provider asked us to slow down (Resend answers 429). A boolean
 * return cannot express "this failed, but retrying in a minute will work", and flattening it into
 * `unavailable` tells the user to retry immediately, which the provider will reject again.
 */
export class DeliveryThrottled extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("delivery-throttled");
    this.name = "DeliveryThrottled";
  }
}

export interface RecoveryDeps {
  /** True only when both a mail sender and the service-role admin client are configured. */
  mailConfigured: boolean;
  /**
   * Returns the recovery code as the project issues it (6–10 digits), or null when there is no
   * such address. May throw.
   */
  generateCode(email: string): Promise<string | null>;
  /** Delivers the code. Returns false on a delivery failure; the code must not be logged. */
  sendCode(email: string, code: string): Promise<boolean>;
  now?(): number;
}

export interface RecoveryLimiter {
  /** Returns how long the caller must wait in ms, or 0 when the attempt is allowed and recorded. */
  take(key: string, now: number): number;
}

/** Sliding-window limiter. In memory, per process; a restart forgets it. */
export function createInMemoryLimiter(options: { windowMs: number; max: number }): RecoveryLimiter {
  const { windowMs, max } = options;
  const hits = new Map<string, number[]>();
  return {
    take(key: string, now: number): number {
      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return windowMs - (now - recent[0]);
      }
      recent.push(now);
      hits.set(key, recent);
      return 0;
    },
  };
}

/**
 * Two independent budgets behind one limiter interface.
 *
 * The per-address budget is the anti-abuse bound that matters (one mailbox cannot be flooded).
 * The per-caller budget is only a backstop: on a local server every request shares the same
 * caller identity, so a tight caller budget lets a single developer lock themselves out — which is
 * exactly what happened on 21 November 2026, when probes and browser clicks together produced a
 * 429 for everyone on the machine.
 */
export function createBudgetedLimiter(options: { windowMs: number; addressMax: number; callerMax: number }): RecoveryLimiter {
  const address = createInMemoryLimiter({ windowMs: options.windowMs, max: options.addressMax });
  const caller = createInMemoryLimiter({ windowMs: options.windowMs, max: options.callerMax });
  return {
    take(key: string, now: number): number {
      return key.startsWith("address:") ? address.take(key, now) : caller.take(key, now);
    },
  };
}

/**
 * Issue one recovery code. `keys.email` and `keys.caller` are the two rate-limit budgets; the
 * caller identity is derived server-side (never from the request body).
 */
export async function issueRecoveryCode(
  email: string,
  deps: RecoveryDeps,
  limiter: RecoveryLimiter,
  keys: { email: string; caller: string },
): Promise<RecoveryOutcome> {
  const now = (deps.now ?? Date.now)();
  const emailWait = limiter.take(`address:${keys.email}`, now);
  if (emailWait > 0) return { kind: "rate-limited", retryAfterSeconds: Math.ceil(emailWait / 1000) };
  const callerWait = limiter.take(`caller:${keys.caller}`, now);
  if (callerWait > 0) return { kind: "rate-limited", retryAfterSeconds: Math.ceil(callerWait / 1000) };

  // Checked before any admin call: no code is generated that cannot be delivered.
  if (!deps.mailConfigured) return { kind: "mail-not-configured" };

  let code: string | null;
  try {
    code = await deps.generateCode(email);
  } catch {
    return { kind: "unavailable" };
  }
  // No such address: answer exactly as a real send would, and send nothing.
  if (code === null) return { kind: "sent" };

  let delivered = false;
  try {
    delivered = await deps.sendCode(email, code);
  } catch (error) {
    if (error instanceof DeliveryThrottled) {
      return { kind: "delivery-throttled", retryAfterSeconds: error.retryAfterSeconds };
    }
    delivered = false;
  }
  return delivered ? { kind: "sent" } : { kind: "unavailable" };
}