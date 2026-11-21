import { DEFAULT_LIMITS } from '@/lib/scam-checker/boundary/check-boundary';
import { routeCheckService } from '@/lib/scam-checker/ui/route-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * `GET /api/usage` — read-only counter view for the mounted checker.
 *
 * It reports M4's REAL counters, not a per-account figure: every browser check currently runs
 * under the single server-side demo subject, and the store is in memory per process. The payload
 * says so (`scope`, `perAccount`, `resetsOnRestart`) so a UI cannot present it as personal usage.
 *
 * `used` counts only completed analyses — M4 counts nothing else (NFR-M4-10) — so `started` is
 * reported separately; with no AI provider configured every check is rules-only and `used` stays
 * 0 while `started` grows. A caller that shows "used / limit" must not hide that difference.
 *
 * No authentication is required: the payload is an aggregate demo counter, never message text,
 * account identifiers or credentials. `no-store` keeps it out of caches.
 */
export function GET(): Response {
  const service = routeCheckService();
  const reading = service.readUsage();
  const remaining = reading.monthlyLimit === null
    ? null
    : Math.max(0, reading.monthlyLimit - reading.monthlyUsed);
  return Response.json(
    {
      scope: 'shared-demo-session',
      perAccount: false,
      authoritative: false,
      resetsOnRestart: true,
      countsOnlyCompleted: true,
      providerConfigured: service.liveConfigured,
      used: reading.monthlyUsed,
      limit: reading.monthlyLimit,
      remaining,
      started: reading.monthlyAdmitted,
      dailyUsed: reading.dailyUsed,
      dailyLimit: reading.dailyLimit,
      inFlight: reading.inFlight,
      anchoredAtFirstUse: reading.anchored,
      windowStartsAt: reading.windowStart === null ? null : new Date(reading.windowStart).toISOString(),
      // Shared with /api/check so both surfaces enforce the same burst rule.
      burst: { max: DEFAULT_LIMITS.burstMax, windowMs: DEFAULT_LIMITS.burstWindowMs },
    },
    { status: 200, headers: NO_STORE },
  );
}