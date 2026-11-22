/**
 * M4 — privacy notice approval conditions (M1, 22 November 2026).
 *
 * Pins the wording Suraji approved: "banking credentials" in the warning, results described as
 * guidance rather than a guarantee, the actual deployed path named (OpenCode Go gateway providing
 * access to the GPT model), the "How your message is used" label with the privacy page still
 * pending, and no database-retention claim while the database rules are unapproved.
 *
 * Source-level assertions, matching the existing drift-test convention: no browser, no network.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./public/app.js', import.meta.url), 'utf8');
const start = source.indexOf('function noticeBlock()');
const end = source.indexOf('function renderInput(', start);
const notice = source.slice(start, end);

test('notice: the warning names banking credentials and keeps the no-auto-removal statement', () => {
  assert.ok(start > 0 && end > start, 'noticeBlock must exist');
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
  assert.match(notice, /History holds up to 20 checks in this browser tab’s session/);
});
