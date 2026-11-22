import { summaryFilename, summaryText } from './summary.js';

/** The only export payload is the current canonical string; never serialize the app state. */
export function summaryCard(model, el) {
  let canonical = summaryText(model);
  // Also supports native Ctrl+P before any exposure control has been touched.
  document.getElementById('print-summary').textContent = canonical;
  const preview = el('pre', { class: 'summary-preview', id: 'summary-preview', tabindex: '0', 'aria-label': 'Summary preview' }, canonical);
  const status = el('p', { class: 'card__helper', id: 'summary-status', role: 'status' });
  const fallbackLabel = el('label', { class: 'field-label', id: 'summary-copy-fallback-label', for: 'summary-copy-fallback', hidden: true }, 'Summary text — select and copy');
  const fallback = el('textarea', { class: 'message-input summary-copy-fallback', id: 'summary-copy-fallback', readonly: true, hidden: true, 'aria-describedby': 'summary-status' });
  const card = el('section', { class: 'card summary-card', id: 'check-summary' }, [
    el('h2', { class: 'card__title' }, 'Share a check summary'),
    el('p', { class: 'card__helper', id: 'summary-sharing-note' }, 'Review before sharing. The summary covers this check and your selected answers, but not the original message, sender details, submitted contact values or AI explanation. This is not automatic redaction. Answers stay only in this page’s browser memory until a new check or reload; exported copies are yours to manage.'),
    el('details', { class: 'summary-review', id: 'summary-review' }, [el('summary', {}, 'Review summary text'), preview]),
  ]);
  const copy = el('button', { class: 'btn', type: 'button', id: 'summary-copy' }, 'Copy summary');
  copy.addEventListener('click', async () => {
    const value = canonical;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(value);
      status.textContent = 'Summary copied. Review it before sharing.';
      fallback.hidden = true;
      fallbackLabel.hidden = true;
    } catch {
      fallback.value = value;
      fallback.hidden = false;
      fallbackLabel.hidden = false;
      status.textContent = 'Clipboard access was unavailable. Nothing was copied automatically. Select and copy the summary below manually.';
      fallback.focus();
      fallback.select();
      fallback.scrollTop = 0;
    }
  });
  const download = el('button', { class: 'btn btn--ghost', type: 'button', id: 'summary-download' }, 'Download TXT');
  download.addEventListener('click', () => {
    let url;
    try {
      url = URL.createObjectURL(new Blob([canonical], { type: 'text/plain;charset=utf-8' }));
      const anchor = el('a', { href: url, download: summaryFilename(model), hidden: true });
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      status.textContent = 'TXT download requested. Review the file before sharing.';
    } catch { status.textContent = 'The download could not be started. Use the summary preview or copy it manually.'; }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  const print = el('button', { class: 'btn btn--ghost', type: 'button', id: 'summary-print' }, 'Print summary');
  print.addEventListener('click', () => {
    document.getElementById('print-summary').textContent = canonical;
    try { window.print(); }
    catch { status.textContent = 'The print dialog could not be opened. You can copy or download the summary instead.'; }
  });
  card.append(el('div', { class: 'card__actions summary-actions' }, [copy, download, print]), status, fallbackLabel, fallback);
  return { card, update(answers) {
    canonical = summaryText(model, answers);
    preview.textContent = canonical;
    document.getElementById('print-summary').textContent = canonical;
    fallback.hidden = true;
    fallbackLabel.hidden = true;
    fallback.value = '';
    status.textContent = '';
  } };
}
