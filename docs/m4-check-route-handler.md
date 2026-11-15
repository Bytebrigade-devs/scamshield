# M4 — entitlement adapter + check route handler (15 November 2026)

**Status:** M4-local library slice. **Not wired into Next.js or the shared app**; no network, no DB, no deployment, no live entitlement test.

## What this adds

| File | Purpose |
|---|---|
| `src/lib/scam-checker/m2-entitlement-adapter.ts` | Maps M2's `getSubscriptionContext(request)` result (`kind` + nested `entitlement`, ISO `expiresAt`, `user.id`) to M4's entitlement port; no I/O |
| `src/lib/scam-checker/m2-entitlement-adapter.test.ts` | 12 tests using M2's sample fixtures/fixed clock |
| `src/lib/scam-checker/route-handler.ts` | `parseCheckBody()` + `createCheckRoute(deps)` mapping M2 + boundary outcomes to HTTP responses |
| `src/lib/scam-checker/route-handler.test.ts` | 11 tests covering every status and the no-echo guarantee |
| `src/lib/scam-checker/history-store.ts` + docs | already merged in #33; not repeated here |

## Route mapping

| Condition | Status |
|---|---|
| Not POST | 405 + `Allow: POST` |
| Body not exactly `{ text: non-empty string }` | 400 |
| M2 `unauthenticated` | 401 |
| M2 `unavailable` / resolver throws | 503 |
| M2 `denied` (`canRunCheck: false`) | 403 |
| Boundary `invalid-input` | 400 |
| Boundary `access-blocked` | 403 |
| Boundary `quota-denied` / `rate-denied` | 429 |
| Boundary `analysed` | 200 `{ outcome }` |

Denied/unauthenticated/unavailable paths never call the boundary or provider. Error bodies never echo submitted text, decision payloads or diagnostics; `cache-control: no-store` on every response.

## Verification

- `node src/lib/scam-checker/m2-entitlement-adapter.test.ts` → **12/12 pass**
- `node src/lib/scam-checker/route-handler.test.ts` → **11/11 pass**
- full repository library suite → **209/209 pass** (12 files)
- CI: ubuntu + windows

## Boundaries

- M2 contract confirmed by M2's second handoff (15 Nov): `kind`, nested `entitlement`, ISO expiry, `user.id`, `canRunCheck` gate, 401/503 mapping.
- The Next.js `route.ts` wrapper, shared branch/CI, M2 helper landing and `public.subscriptions` are still required before a live check.
- No message text is stored or echoed; the browser supplies only the text and its session.
