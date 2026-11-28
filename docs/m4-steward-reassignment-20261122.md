# M4 — schema steward reassigned (22 November 2026)

**Status:** role decision, recorded by the project manager. **This is a manager decision, not a team approval**, and it applies no migration. No table, policy, function or trigger exists.

## What changed

| Role | Before | After |
|---|---|---|
| Schema steward | Prashnidha Subramaniyam (M3) — team-approved 19 Nov 2026 | **Svishwa (M4 owner / project manager)** |
| Review of M4's migrations | Prashni | **Svishwa** |
| Apply of M4's migrations | Prashni | **Svishwa** (subject to Supabase access) |

**Unchanged:** Prashni remains the **designer** of the database design she supplied on 19 November, and her 21 November review findings and answers remain hers and remain the basis of the current drafts. Reassigning the role does not transfer authorship. The 19 November team approval remains the dated record of what the team approved at that time and is not rewritten.

## Scope — each owner still designs their own tables

The steward role is a **review** role. It does not transfer table design between modules:

| Table(s) | Designer | Steward review (now) |
|---|---|---|
| M4's eight checker tables and the `m4_*` functions | M4 | **Svishwa** |
| `public.subscriptions`, `subscription_payments` and the billing columns | **Lahiru (M2)** | **Svishwa** — consistency only |
| M5 admin tables | **Vishmi (M5)** | **Svishwa** — consistency only |
| M3 vault tables | **Prashni (M3)** | **Svishwa** — consistency only |
| M1 / M6 persistence (none proposed) | their owners | when submitted |

The steward reviews naming, types, RLS discipline and cross-module collisions, and may send a draft back — but does not author another module's schema.

## Consequences

- **Independent review is lost.** The author of M4's drafts and the schema approver are now the same person. The 21 November review caught substantive defects (settlement mutating before validation, the null-status guard, missing limit enforcement, the duplicate-request race, the reconciliation dead end); that independent check no longer exists unless a second reviewer is named.
- **Access must be re-routed.** The Supabase invitation was being arranged for Prashni's account; it now needs to be arranged for the manager's, via Lahiru.
- **Verification and apply become M4's own**, which weakens them as independent evidence.
- **Prashni and Lahiru have not yet been informed** and were working to the previous arrangement.

## What this does not do

- It does not approve the draft migrations: revision 3 has not been reviewed by anyone other than M4.
- It closes no database gate — review, publication, access, testing and apply all remain open.
- It changes no SQL, TypeScript, test or fixture.
- It does not change the team's 19 November approval of Prashni's design.

## Limits

Recorded on the manager's instruction; no team vote and no per-member sign-off. Prashni's in-flight pieces (the invitation request and the pending re-review) are superseded rather than reassigned by agreement.
