/**
 * M4-12 — link-warning banner view model (owner decision 17 Nov 2026).
 *
 * The owner chose a **warning banner above the result** when link-shape flags exist. This
 * module decides *whether* to show it and *what it says*; rendering (HTML/CSS placement) is
 * gated on the shared app branch and is not implemented here.
 *
 * Rules:
 * - only `possible-lookalike` findings trigger the banner (no false alarm for unconfirmed or
 *   un-inspectable links);
 * - at most 3 hostnames are listed, trimmed/capped, deduplicated case-insensitively;
 * - truncated inspections add "may be more" wording;
 * - the copy never claims the message or sender is safe and never claims the link was opened.
 *
 * Pure and offline: no imports, no fetch, no clock, no environment.
 */

export type LinkFlagStatus = 'official-match' | 'possible-lookalike' | 'unconfirmed' | 'not-inspectable';

export interface LinkFlagInput {
  hostname: string;
  status: LinkFlagStatus;
}

export interface LinkWarningInput {
  findings?: readonly LinkFlagInput[];
  truncated?: boolean;
}

export interface LinkWarning {
  show: boolean;
  title: string;
  message: string;
  /** At most 3 display-safe hostnames; empty when `show` is false. */
  hostnames: string[];
}

const MAX_HOSTS = 3;
const MAX_HOST_CHARS = 80;

export const LINK_WARNING_TITLE = 'Check this link before you tap';
export const LINK_WARNING_MESSAGE =
  'This message contains a link that looks similar to an official site. The checker never opens links. '
  + 'Verify through the official app or by typing the official address yourself — do not use the link in the message.';

function cleanHostname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/[\s<>"'`]/.test(trimmed)) return null;
  return trimmed.length > MAX_HOST_CHARS ? `${trimmed.slice(0, MAX_HOST_CHARS)}…` : trimmed;
}

/**
 * Build the banner model. Returns `show: false` when there is no possible-lookalike finding;
 * an empty/absent inspection never produces a banner and never implies safety.
 */
export function buildLinkWarningBanner(input: LinkWarningInput | null | undefined): LinkWarning {
  const findings = Array.isArray(input?.findings) ? input!.findings : [];
  const uniqueHostnames: string[] = [];
  const seen = new Set<string>();

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
