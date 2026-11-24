/** @type {import('next').NextConfig} */

/**
 * Security headers for the shared Vercel app (M4 Phase 4 hardening, 24 Nov 2026).
 *
 * These are the universally-safe headers that close the recorded Vercel gap
 * (evidence/M4-vercel-deployment-20261123.md §2: "No Content-Security-Policy or
 * X-Frame-Options observed") WITHOUT risking the Next.js App Router runtime:
 *   - X-Frame-Options: DENY        → clickjacking protection (the recorded gap)
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: no-referrer
 *
 * WHY NOT the Netlify demo's full CSP here: the Netlify demo (netlify.toml) serves a
 * static vanilla-JS bundle, so `script-src 'self'; connect-src 'self'` is safe there.
 * This shared app is Next.js App Router, which (a) renders inline RSC hydration
 * scripts (`self.__next_f.push(...)`) that a `script-src 'self'` policy without
 * 'unsafe-inline' or a nonce would BLOCK, breaking hydration, and (b) may make
 * browser-side Supabase calls that `connect-src 'self'` would block. A strict CSP is
 * therefore a separate, carefully-designed decision (nonce-based, or 'unsafe-inline'
 * plus the Supabase connect-src) that affects the whole shared app including M2's
 * pages — it is deliberately NOT imposed here. X-Frame-Options: DENY already provides
 * the framing protection a `frame-ancestors 'none'` CSP directive would.
 *
 * Cache-Control is left to each route (the API routes already set no-store); a global
 * no-store would defeat static-asset caching for the whole app.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
];

const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;