# M2 interim frontend demo

Current presentation mode, requested by the user on 26 October 2026. All visible M2 flows use dummy browser data. No Supabase setup, database, email service or payment gateway is needed. Older backend handover documents describe a separate implementation, not the current UI data path.

Run `pnpm dev` and open `/pricing`, `/login`, or `/account/subscription`.

- First visit seeds a signed-in sample account (`demo@scamshield.test`) with a Guardian monthly subscription.
- Signup accepts any valid dummy email and a password of at least 8 characters, creates a fresh demo account, and opens pricing. Login accepts a dummy email/password or the Use demo account button. Passwords are never stored or verified.
- Trial activation creates a seven-day, 15-check dummy trial. The same demo account cannot allocate it twice. Demo controls > New account lets you repeat the flow.
- Checkout asks only for a plan and billing cycle. No card number, expiry or security code is requested; the button reads **Verify simulated payment**.
- The saved-card UI is removed with the form: no card details are collected, so nothing is stored or displayed.
- `DEMO10` previews 10% off. **Verify simulated payment** saves the plan. The demo model keeps internal dummy card balances (default 4242) so its decline test still works, but no card input exists in the UI.
- Subscription management shows the selected plan, expiry, sample usage counters, plan changes and cancellation. Cancellation retains the same expiry.
- Forgot password shows an Open demo reset link action. The reset screen validates matching passwords and displays success. No email is sent and no password is changed on a server.
- Demo controls on the subscription page load New account, Active plan, Trial account and Expired plan scenarios. These reset the sample data.

State persists in localStorage under `scamshield-interim-demo-v1` for this browser/origin. Demo identities share one presentation state; this is not an account database or authentication. Use dummy information only. `src/lib/demo-store.ts` is the frontend state adapter, and `subscription-client.ts` invokes it without fetch. Backend mode is the default (`NEXT_PUBLIC_M2_MODE=backend`), so the shipped UI calls `/api/subscription`; this adapter is used only in demo mode. Never use this client state to grant real access.

Validation: `pnpm test:subscription`, `pnpm typecheck`, `pnpm build`, plus browser checks of the complete demo flow and no external account/payment requests.
