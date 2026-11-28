"use client";

/**
 * M4 checker — sign-in gate.
 *
 * Checks require an account (owner instruction, 28 Nov 2026): the API refuses an anonymous
 * `POST /api/check` with `401 sign-in-required` before the provider is reached, so this screen is
 * the honest counterpart of that refusal rather than a decorative wall. It keeps the page's own
 * vocabulary — one heading, one sentence about why, one clear action — and it says what is *not*
 * happening: nothing has been sent, and no message text has left the browser.
 */

import { PageHeading, useHeadingFocus } from "./ui";

export function SignInGate({ message }: { message?: string | null }) {
  useHeadingFocus();

  return (
    <>
      <PageHeading
        eyebrow="Scam checker"
        title="Sign in to check a message"
        subtitle="Checks are tied to your account so your quota, history and feedback stay yours."
      />

      <div className="card" role="region" aria-label="Sign in required">
        <h2 className="card__title">An account is needed</h2>
        <p className="card__helper">
          The checker analyses messages under a signed-in plan, and keeps the result in your own history.
          Nothing you type here is sent anywhere until you sign in and submit it.
        </p>

        {message ? (
          <div className="form-alert" role="alert">
            {message}
          </div>
        ) : null}

        <p>
          <a className="button button--primary" href="/login">
            Sign in or create an account
          </a>
        </p>

        <p className="card__helper">
          After signing in, open the checker again — the “Scam checker” link in the app menu comes straight here.
        </p>
      </div>
    </>
  );
}
