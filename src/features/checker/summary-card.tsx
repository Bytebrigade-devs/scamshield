"use client";

/**
 * Export card — one canonical plain-text summary drives the preview, clipboard, TXT download and
 * print. The same string feeds the document's `#print-summary` node, so Ctrl+P works before the
 * user has touched anything.
 *
 * The summary is an allowlist projection: it never contains the original message, sender details,
 * submitted hostnames or the AI explanation. This is not automatic redaction, and the card says so.
 */

import { useEffect, useRef, useState } from "react";

import { summaryFilename, summaryText } from "@/lib/scam-checker/ui/public/summary.js";

import { useChecker } from "./provider";

export function SummaryCard({ model, answers }: { model: unknown; answers: string[] }) {
  const { setPrintSummary } = useChecker();
  const canonical = summaryText(model, answers) as string;
  const [status, setStatus] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  // Keep the print payload current, including on first render (native Ctrl+P before any answer).
  useEffect(() => {
    setPrintSummary(canonical);
  }, [canonical, setPrintSummary]);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(canonical);
      setStatus("Summary copied. Review it before sharing.");
      setShowFallback(false);
    } catch {
      setShowFallback(true);
      setStatus(
        "Clipboard access was unavailable. Nothing was copied automatically. Select and copy the summary below manually.",
      );
      queueMicrotask(() => {
        const field = fallbackRef.current;
        if (!field) return;
        field.focus();
        field.select();
        field.scrollTop = 0;
      });
    }
  };

  const download = () => {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([canonical], { type: "text/plain;charset=utf-8" }));
      const generated = url;
      const anchor = document.createElement("a");
      anchor.href = generated;
      anchor.download = summaryFilename(model) as string;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setStatus("TXT download requested. Review the file before sharing.");
      setTimeout(() => URL.revokeObjectURL(generated), 1000);
    } catch {
      setStatus("The download could not be started. Use the summary preview or copy it manually.");
    }
  };

  const print = () => {
    try {
      window.print();
    } catch {
      setStatus("The print dialog could not be opened. You can copy or download the summary instead.");
    }
  };

  return (
    <section className="card summary-card" id="check-summary">
      <h2 className="card__title">Share a check summary</h2>
      <p className="card__helper" id="summary-sharing-note">
        Review before sharing. The summary covers this check and your selected answers, but not the original
        message, sender details, submitted contact values or AI explanation. This is not automatic redaction.
        Answers stay only in this page’s browser memory until a new check or reload; exported copies are yours to
        manage.
      </p>
      <details className="summary-review" id="summary-review">
        <summary>Review summary text</summary>
        <pre className="summary-preview" id="summary-preview" tabIndex={0} aria-label="Summary preview">
          {canonical}
        </pre>
      </details>
      <div className="card__actions summary-actions">
        <button className="btn" type="button" id="summary-copy" onClick={copy}>
          Copy summary
        </button>
        <button className="btn btn--ghost" type="button" id="summary-download" onClick={download}>
          Download TXT
        </button>
        <button className="btn btn--ghost" type="button" id="summary-print" onClick={print}>
          Print summary
        </button>
      </div>
      <p className="card__helper" id="summary-status" role="status">
        {status}
      </p>
      <label
        className="field-label"
        id="summary-copy-fallback-label"
        htmlFor="summary-copy-fallback"
        hidden={!showFallback}
      >
        Summary text — select and copy
      </label>
      <textarea
        ref={fallbackRef}
        className="message-input summary-copy-fallback"
        id="summary-copy-fallback"
        readOnly
        hidden={!showFallback}
        aria-describedby="summary-status"
        defaultValue={canonical}
      />
    </section>
  );
}
