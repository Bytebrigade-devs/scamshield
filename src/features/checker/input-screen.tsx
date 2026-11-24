"use client";

/**
 * M4 checker — the message input screen.
 *
 * Text is only sent on submit, never while typing. The editor keeps its draft across every
 * failure, and every message that could reach the screen from outside is sanitised before it is
 * rendered: React escapes markup but does *not* neutralise the bidi and control characters that
 * `sanitizeText` replaces, and a scam checker is exactly where those matter.
 */

import { useRef } from "react";

import { sanitizeText } from "@/lib/scam-checker/ui/public/render-safe.js";

import { CONFIG_UNAVAILABLE_MESSAGE, useChecker } from "./provider";
import { PageHeading, useRequestedFocus } from "./ui";

export function InputScreen() {
  const {
    config,
    configLoading,
    text,
    sender,
    busy,
    fieldError,
    senderError,
    formError,
    cap,
    setText,
    setSender,
    submit,
    retryConfig,
  } = useChecker();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const senderRef = useRef<HTMLInputElement>(null);

  useRequestedFocus({
    textarea: () => textareaRef.current,
    sender: () => senderRef.current,
  });

  const over = text.length > cap;
  const senderOver = sender.length > 254;
  // A failed config load is shown as an alert with a retry, exactly like a transport failure.
  const alert = formError ?? (!configLoading && config === null ? CONFIG_UNAVAILABLE_MESSAGE : null);
  const countHint = over && !fieldError ? "Shorten the message to continue." : "";

  const describedBy = [
    "message-help",
    "character-count",
    "safety-notice",
    "transfer-notice",
    fieldError ? "message-error" : null,
    over ? "count-hint" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const progress = busy ? "Checking your message…" : configLoading ? "Connecting to the checking service…" : "";

  const canSubmit = !busy && config !== null && !over && !senderOver && text.trim().length > 0;

  return (
    <>
      <PageHeading
        eyebrow="Scam checker"
        title="Check a suspicious message"
        subtitle="Review suspicious email, SMS or agreement text before deciding what to do next."
      />

      <form
        className="card"
        noValidate
        aria-busy={busy ? "true" : "false"}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 className="card__title">Message to check</h2>
        <p className="card__helper" id="message-help">
          Paste the message as text. Do not include passwords, banking credentials, OTPs, full card or
          bank account numbers, or private keys. Sensitive details are not automatically removed.
        </p>

        {alert ? (
          <div className="form-alert" role="alert" id="form-error" tabIndex={-1}>
            {sanitizeText(alert)}
            {config === null ? (
              <button type="button" className="btn btn--ghost" onClick={retryConfig}>
                Try connecting again
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="field">
          <label className="visually-hidden" htmlFor="message">
            Message to check
          </label>
          <textarea
            ref={textareaRef}
            id="message"
            className="message-input"
            placeholder="Paste the suspicious message here."
            aria-describedby={describedBy}
            aria-invalid={fieldError || over ? "true" : "false"}
            disabled={busy}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="field-meta">
            <span id="count-hint" className="field-error" aria-live="polite">
              {countHint}
            </span>
            <span className="character-count" id="character-count">
              {`${text.length.toLocaleString("en-US")} / ${cap.toLocaleString("en-US")} characters`}
            </span>
          </div>
          {fieldError ? (
            <p className="field-error" id="message-error" role="alert">
              {sanitizeText(fieldError)}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="sender">
            Sender information — optional
          </label>
          <p className="field-help" id="sender-help">
            Enter the displayed SMS sender name, phone number or email address. This does not authenticate
            the sender.
          </p>
          <input
            ref={senderRef}
            id="sender"
            className="sender-input"
            type="text"
            maxLength={254}
            autoComplete="off"
            placeholder="For example: displayed SMS name or email address"
            aria-describedby={senderError ? "sender-help sender-error" : "sender-help"}
            aria-invalid={senderError || senderOver ? "true" : "false"}
            disabled={busy}
            value={sender}
            onChange={(event) => setSender(event.target.value)}
          />
          {senderError ? (
            <p className="field-error" id="sender-error" role="alert">
              {sanitizeText(senderError)}
            </p>
          ) : null}
        </div>

        <NoticeBlock liveConfigured={config?.liveConfigured ?? null} configLoading={configLoading} />

        <div className="card__actions card__actions--input">
          <p className="actions-note" role="status">
            {progress}
          </p>
          <button type="submit" className="btn" disabled={!canSubmit}>
            {busy ? (
              <>
                <span className="btn__spinner" aria-hidden="true" />
                <span>Checking…</span>
              </>
            ) : (
              "Check message"
            )}
          </button>
        </div>
      </form>
    </>
  );
}

/**
 * What happens to a message before it is sent, with the approved M4-21 wording. The transfer
 * sentence must keep naming the gateway and must not promise automatic redaction.
 */
function NoticeBlock({ liveConfigured, configLoading }: { liveConfigured: boolean | null; configLoading: boolean }) {
  const transfer =
    liveConfigured === null
      ? configLoading
        ? "Checking how your message will be processed…"
        : "Processing information is unavailable. Connect to the service before submitting."
      : liveConfigured
        ? "When you check, your message, optional sender information and local findings go to ScamShield’s server and the OpenCode Go gateway, which provides access to the GPT model, for analysis."
        : "When you check, your text goes to ScamShield’s server for local pattern checks. AI analysis is not available.";

  return (
    <section className="notice" aria-labelledby="notice-title">
      <h3 className="notice__title" id="notice-title">
        Before you check
      </h3>
      <p id="transfer-notice">{transfer}</p>
      <p id="safety-notice">
        Remove personal details. Do not paste passwords, banking credentials, one-time codes (OTPs), full
        card or bank account numbers, private keys or private vault notes. These are not automatically
        removed.
      </p>
      <p>Results are guidance, not a guarantee of safety. A short excerpt and result are kept in this tab’s history.</p>
      <details className="privacy-details">
        <summary>How your message is used</summary>
        <p>The dedicated privacy page is not available in this demo yet; this panel describes what happens today.</p>
        <p>
          Message and sender information are sent only when you select Check message, not while you type.
          Organization names, phone numbers and website hostnames are compared offline with a reviewed
          directory; selected Unicode hostname patterns may be flagged as possible lookalikes. This is
          incomplete, heuristic evidence, not ownership or safety verification. Submitted links are not
          opened, fetched, resolved or checked for reputation; the AI provider cannot open them either.
        </p>
        <p>
          Sender information is user-provided evidence and can be spoofed. It is not added to tab-session
          history.
        </p>
        <p>
          History holds up to 20 checks in this browser tab’s session and is not synced with an account.
          Clear history removes this list; it does not delete any provider records. If browser storage is
          unavailable, the list lasts only until this page is reloaded.
        </p>
        <p>
          Reporting a wrong result stores only the check id, your chosen reason and a timestamp — never
          your message text. Demo storage is in-memory and resets on restart.
        </p>
        <p>
          {liveConfigured
            ? "The OpenCode Go gateway’s retention depends on its service and account settings. A failed check does not prove that the provider received or kept nothing."
            : liveConfigured === null
              ? "Processing information must be available before you can submit a message."
              : "This check uses local rules only and does not send your text to an AI provider."}
        </p>
      </details>
    </section>
  );
}
