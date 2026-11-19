/** Warning banner above the result when link-shape flags exist (M4-12, owner decision 17 Nov 2026).
 *
 * The banner model mirrors `code/ui/link-warning.ts` — the published, tested view model — and a
 * drift test pins the two together, so this browser copy cannot silently diverge. Submitted
 * hostnames are rendered as inert text only; the checker never opens, fetches or links them.
 * No banner appears without a possible-lookalike finding, and the absence of a banner never
 * implies safety.
 */
export const LINK_WARNING_TITLE = 'Check this link before you tap';
export const LINK_WARNING_MESSAGE =
  'This message contains a link that looks similar to an official site. The checker never opens links. '
  + 'Verify through the official app or by typing the official address yourself — do not use the link in the message.';

const MAX_HOSTS = 3;
const MAX_HOST_CHARS = 80;

function cleanHostname(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/[\s<>"'`]/.test(trimmed)) return null;
  return trimmed.length > MAX_HOST_CHARS ? `${trimmed.slice(0, MAX_HOST_CHARS)}…` : trimmed;
}

/** Banner model — identical behaviour to `buildLinkWarningBanner` in link-warning.ts. */
export function linkWarningModel(input) {
  const findings = Array.isArray(input?.findings) ? input.findings : [];
  const uniqueHostnames = [];
  const seen = new Set();

  for (const finding of findings.slice(0, 64)) {
    if (!finding || finding.status !== 'possible-lookalike') continue;
    const hostname = cleanHostname(finding.hostname);
    if (hostname === null) continue;
    const key = hostname.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueHostnames.push(hostname);
  }

  if (uniqueHostnames.length === 0) return { show: false, title: '', message: '', hostnames: [] };

  const hostnames = uniqueHostnames.slice(0, MAX_HOSTS);
  let message = LINK_WARNING_MESSAGE;
  const hidden = uniqueHostnames.length - hostnames.length;
  if (hidden > 0) message += ` ${hidden} more flagged link${hidden === 1 ? '' : 's'} not shown.`;
  if (input?.truncated === true) message += ' The inspection was truncated, so there may be other links it did not cover.';

  return { show: true, title: LINK_WARNING_TITLE, message, hostnames };
}

/** Render the banner; returns null when no possible-lookalike finding exists. */
export function linkWarningBanner(input, el) {
  const model = linkWarningModel(input);
  if (!model.show) return null;
  const section = el('section', { class: 'notice notice--warning', 'aria-labelledby': 'link-warning-title', 'data-testid': 'link-warning' }, [
    el('h3', { class: 'notice__title', id: 'link-warning-title' }, model.title),
    el('p', {}, model.message),
  ]);
  if (model.hostnames.length > 0) {
    section.append(el('p', { class: 'notice__emphasis' },
      `Flagged hostname${model.hostnames.length === 1 ? '' : 's'} (inert text, never made clickable): ${model.hostnames.join(', ')}`));
  }
  return section;
}
