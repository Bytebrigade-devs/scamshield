import { createCheckRoute } from '@/lib/scam-checker/ui/check-route';
import { createCheckService } from '@/lib/scam-checker/ui/check-service';
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
 * The service is constructed with **no provider**: local pattern checks only. Provider selection,
 * usage authority and credentials stay server-side; the request may carry only the message text and
 * an optional sender string.
 */
const service = createCheckService({ live: null, persistence: selection.persistence });

export const POST = createCheckRoute({
  service,
  feedback,
  resolveContext: (request) => getSubscriptionContext(request),
});
