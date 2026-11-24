/**
 * M4 — privacy notice conditions approved by M1 (owner-relayed, 22 November 2026).
 *
 * Pins the conditions in that approval record: "banking credentials" in the warning and the input
 * helper, results described as guidance rather than a guarantee, the actual deployed path named
 * (OpenCode Go gateway providing access to the GPT model), the "How your message is used" label
 * with the privacy page still pending, no database-retention claim while the database rules are
 * unapproved, and the feedback-storage disclosure (check id, reason and timestamp only).
 *
 * The approval is owner-relayed; the dated record is in the M4 workspace
 * (`evidence/M4-suraji-notice-approval-20261122.md`). Source-level assertions, matching the existing
 * drift-test convention: no browser, no network.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../features/checker/input-screen.tsx', import.meta.url), 'utf8');
// The screen became a React page on 24 November 2026, so this guard reads the component that
// renders the notice instead of the retired vanilla `ui/public/app.js`. The assertions below are
// unchanged on purpose: the M1 approval is about the wording, not the renderer.
const start = source.indexOf('function NoticeBlock(');
// JSX wraps long sentences across lines; collapse whitespace so the approved wording is matched
// as prose rather than as source formatting.
const notice = start > 0 ? source.slice(start).replace(/\s+/g, ' ') : '';

/** The message helper paragraph, wherever the JSX line wrapping puts it. */
function messageHelper(): string {
  const at = source.indexOf('id="message-help"');
  return at > 0 ? source.slice(at, at + 400).replace(/\s+/g, ' ') : '';
}

test('notice: the warning names banking credentials and keeps the no-auto-removal statement', () => {
  assert.ok(start > 0, 'NoticeBlock must exist');
  assert.match(notice, /banking credentials/);
  assert.match(notice, /These are not automatically removed\./);
});

test('notice: results are guidance, not a guarantee', () => {
  assert.match(notice, /Results are guidance, not a guarantee of safety\./);
});

test('notice: the deployed path is named, and the rules-only branch sends nothing external', () => {
  assert.match(notice, /OpenCode Go gateway/);
  assert.match(notice, /GPT model/);
  assert.match(notice, /This check uses local rules only and does not send your text to an AI provider\./);
});

test('notice: the privacy label is present and the page is honestly pending', () => {
  assert.match(notice, /How your message is used/);
  assert.match(notice, /The dedicated privacy page is not available in this demo yet/);
  // No invented destination: the pending page must not be wired as a link.
  assert.equal(/href[^)]*\/privacy/.test(notice), false, 'no /privacy link until M1 ships the page');
});

test('notice: no database retention claim while the database rules are unapproved', () => {
  assert.equal(/retention (period|window)/i.test(notice), false);
  assert.equal(/deleted after/i.test(notice), false);
  assert.equal(/\b(30|90|180)[- ]day\b/i.test(notice), false);
  // The current tab-session behaviour is described instead.
  assert.match(notice, /History holds up to 20 checks/);
  assert.match(notice, /session/);
});

test('notice: the feedback storage behaviour is described', () => {
  assert.match(notice, /Reporting a wrong result stores only the check id, your chosen reason and a timestamp/);
  assert.match(notice, /never your message text/);
  assert.match(notice, /in-memory and resets on restart/);
});

test('input helper: banking credentials are named in the message guidance', () => {
  const helper = messageHelper();
  assert.ok(helper.length > 0, 'message-help helper must exist');
  assert.match(helper, /banking credentials/);
});
