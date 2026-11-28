/**
 * M2 — the two authentication emails, as text plus HTML.
 *
 * Resend accepts `text` and `html` together, and a reset code rendered as plain text alone reads
 * like phishing — a real problem for a scam-detection product. This module therefore returns both,
 * with the plain-text part carrying the same facts and the same link/code so nothing is lost when a
 * client refuses HTML.
 *
 * The layout follows the branded templates kept outside this app (same palette: #f7f9fc page,
 * #dce4ed border, #0f766e action, #475569 body copy) with one deliberate change: the old templates
 * loaded a logo from a retired Vercel host, and a broken or remote image hurts deliverability and
 * leaks that the reader opened the mail. The wordmark below is text only.
 *
 * Pure module: no environment, no network, no imports, so the route tests can load it in a sandbox.
 * The expiry phrase is passed in already formatted; nothing here decides how long a token lives.
 */

export interface AuthEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** One card, one heading, one paragraph of context, and a variable centre block. */
function card(options: { heading: string; intro: string; centre: string; footnotes: string[] }): string {
  const notes = options.footnotes
    .map((note) => `<p style="margin:16px 0 0;font-size:14px;line-height:22px;color:#475569;">${note}</p>`)
    .join("\n                ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="margin:0;padding:0;background-color:#f7f9fc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f9fc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background-color:#ffffff;border:1px solid #dce4ed;border-radius:16px;">
            <tr>
              <td style="padding:32px 32px 24px;font-size:24px;line-height:32px;font-weight:bold;color:#0f766e;">ScamShield</td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <h1 style="margin:0 0 16px;font-size:26px;line-height:34px;">${options.heading}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:25px;color:#475569;">${options.intro}</p>
                ${options.centre}
                ${notes}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

/**
 * Signup verification. `expiresLabel` is the already-formatted window ("5 minutes"), so this email
 * and the login screen always state the same number.
 */
export function confirmationEmail(link: string, expiresLabel: string): AuthEmail {
  const href = escapeHtml(link);
  const centre = `<table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td bgcolor="#0f766e" style="border-radius:12px;">
                      <a href="${href}" style="display:inline-block;padding:15px 24px;border:1px solid #0f766e;border-radius:12px;font-size:16px;font-weight:bold;line-height:22px;color:#ffffff;text-decoration:none;">Confirm email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:14px;line-height:22px;color:#475569;">This link expires in ${escapeHtml(expiresLabel)} and works once.</p>
                <p style="margin:16px 0 0;font-size:14px;line-height:22px;color:#475569;">If the button does not work, open this link in your browser:</p>
                <p style="margin:8px 0 0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${href}" style="color:#0f766e;">${href}</a></p>`;
  return {
    subject: "Confirm your ScamShield account",
    text: `Welcome to ScamShield.

Confirm your email address to finish creating your account:
${link}

This link expires in ${expiresLabel} and works once. After that, request a new one from the login screen.

If you did not create this account, ignore this email and nothing is activated.`,
    html: card({
      heading: "Confirm your email",
      intro: "Welcome to ScamShield. Confirm this address to finish creating your account.",
      centre,
      footnotes: [
        "If you did not create a ScamShield account, ignore this email and nothing is activated.",
        "Did the link expire? Open the login screen and choose &ldquo;Resend confirmation email&rdquo;.",
      ],
    }),
  };
}

/**
 * Password reset code. The code is digits only, but it is escaped anyway so a future change of code
 * alphabet cannot inject markup into the mail.
 */
export function recoveryEmail(code: string, expiresLabel: string): AuthEmail {
  const shown = escapeHtml(code);
  const centre = `<p style="margin:0;font-size:32px;line-height:40px;font-weight:bold;letter-spacing:6px;padding:16px 0;text-align:center;background-color:#f7f9fc;border:1px solid #dce4ed;border-radius:12px;color:#0f172a;">${shown}</p>
                <p style="margin:24px 0 0;font-size:14px;line-height:22px;color:#475569;">This code expires in ${escapeHtml(expiresLabel)} and can be used once.</p>`;
  return {
    subject: "Your ScamShield password reset code",
    text: `Your ScamShield password reset code is ${code}.

Enter it on the reset page. It expires in ${expiresLabel} and can be used once. If you did not ask to reset your password, ignore this email - your password stays unchanged.`,
    html: card({
      heading: "Reset your password",
      intro: "We received a request to reset your ScamShield password. Enter this code on the reset page to choose a new one.",
      centre,
      footnotes: [
        "If you did not ask to reset your password, ignore this email &mdash; your password stays unchanged.",
      ],
    }),
  };
}