# M2 interim frontend demo

Current presentation mode, requested by the user on 26 October 2026. All visible M2 flows use dummy browser data. No Supabase setup, database, email service or payment gateway is needed. Older backend handover documents describe a separate implementation, not the current UI data path.

Run `pnpm dev` and open `/pricing`, `/login`, or `/account/subscription`.

- First visit seeds a signed-in sample account (`demo@scamshield.test`) with a Guardian monthly subscription.
- Signup accepts any valid dummy email and a password of at least 8 characters, creates a fresh demo account, and opens pricing. Login accepts a dummy email/password or the Use demo account button. Passwords are never stored or verified.
- Trial activation creates a seven-day, 15-check dummy trial. The same demo account cannot allocate it twice. Demo controls > New account lets you repeat the flow.
- Enter the test cardholder and number manually. Use any future expiry and security code `123`. **Verify card** clears the inputs and opens payment review.

  | Test cardholder | Test number | Starting balance |
  | --- | --- | ---: |
  | Lahiru | `4242 4242 4242 4242` | LKR 20,000,000 |
  | Sahan | `5555 5555 5555 4444` | LKR 20,000,000 |
  | Achintha | `4000 0000 0000 0002` | LKR 400 |
- Save my card remembers the selected card’s last four digits and expiry. A saved dummy card is available at later checkout and can be removed from the subscription screen. Full numbers and security codes are never saved.
- `DEMO10` previews 10% off. **Verify payment** approves the payment when the simulated balance covers the total. A successful checkout saves the plan and deducts the total from that card. An insufficient balance declines the payment.
- Subscription management shows the selected plan, expiry, sample usage counters, saved dummy card, plan changes and cancellation. Cancellation retains the same expiry.
- Forgot password shows an Open demo reset link action. The reset screen validates matching passwords and displays success. No email is sent and no password is changed on a server.
- Demo controls on the subscription page load New account, Active plan, Trial account and Expired plan scenarios. These reset the sample data and saved card.

State persists in localStorage under `scamshield-interim-demo-v1` for this browser/origin. Demo identities share one presentation state; this is not an account database or authentication. Use dummy information only. `src/lib/demo-store.ts` is the frontend state adapter, and `subscription-client.ts` invokes it without fetch. Backend mode is the default (`NEXT_PUBLIC_M2_MODE=backend`), so the shipped UI calls `/api/subscription`; this adapter is used only in demo mode. Never use this client state to grant real access.

Validation: `npm run test:subscription`, `npm run typecheck`, `npm run build`, plus browser checks of the complete demo flow and no external account/payment requests.
