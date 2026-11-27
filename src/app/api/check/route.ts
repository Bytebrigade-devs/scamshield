import { createCheckApiRoute } from '@/lib/scam-checker/ui/check-route';
import { createCheckService, liveConfigFromEnv } from '@/lib/scam-checker/ui/check-service';
import { createDurableUsageStore } from '@/lib/scam-checker/boundary/durable-usage-store';
import { getSubscriptionContext } from '@/lib/subscription-server';
import { feedback, selection } from '../feedback-support';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * `/api/check` — a thin Next.js wrapper over the framework-neutral handler in
 * `src/lib/scam-checker/ui/check-route.ts`.
 *
 * The transport rules (same-origin, content type, admission, honest failure bodies) live in the
 * library and are covered by `node --test`; this file supplies only the app's own wiring: the
 * service instance, the shared feedback support and the M2 entitlement resolver.
 *
 * The provider comes from server-side environment only (`liveConfigFromEnv`): with no
 * `OPENAI_API_KEY` the service is rules-only; with a key it runs the configured gateway. Credentials
 * never reach the browser; the request may carry only the message text and an optional sender string.
 *
 * Usage gate (27 Nov 2026): when the durable store is selected, the monthly/daily quota is counted in
 * the database instead of per function instance. If the counting layer cannot be reached the check is
 * refused, never run uncounted — see `durable-usage-store.ts`.
 */
const durableUsage = selection.mode === 'durable'
  ? createDurableUsageStore({ quota: selection.persistence.quota })
  : undefined;

const service = createCheckService({
  live: liveConfigFromEnv(),
  persistence: selection.persistence,
  ...(durableUsage === undefined ? {} : { usage: durableUsage }),
});

export const POST = createCheckApiRoute({
  service,
  feedback,
  resolveContext: (request) => getSubscriptionContext(request),
});
