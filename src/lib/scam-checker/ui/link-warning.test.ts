/**
 * M4-12 — link-warning banner view-model tests (17 November 2026).
 *
 * Pins the owner decision: a banner appears only when a possible-lookalike link flag exists;
 * it lists at most three hostnames, never claims safety and never claims a link was opened.
 * Rendering is not tested here — the UI waits on the shared app branch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkWarningBanner, LINK_WARNING_MESSAGE, LINK_WARNING_TITLE } from './link-warning.ts';
import type { LinkFlagInput } from './link-warning.ts';

function finding(hostname: string, status: LinkFlagInput['status'] = 'possible-lookalike'): LinkFlagInput {
  return { hostname, status };
}

test('a possible-lookalike finding shows the warning banner with the hostname', () => {
  const warning = buildLinkWarningBanner({ findings: [finding('sampath-bank.top')] });
  assert.equal(warning.show, true);
  assert.equal(warning.title, LINK_WARNING_TITLE);
  assert.equal(warning.message, LINK_WARNING_MESSAGE);
  assert.deepEqual(warning.hostnames, ['sampath-bank.top']);
});

test('the banner never claims the message or sender is safe', () => {
  const warning = buildLinkWarningBanner({ findings: [finding('example-bank.top')] });
  assert.doesNotMatch(warning.title, /safe|verified|legitimate/i);
  assert.doesNotMatch(warning.message, /is safe|verified sender|legitimate/i);
  assert.match(warning.message, /never opens links|do not use the link/i);
});

test('official-match, unconfirmed and not-inspectable findings alone do not trigger a banner', () => {
  for (const status of ['official-match', 'unconfirmed', 'not-inspectable'] as const) {
    const warning = buildLinkWarningBanner({ findings: [finding('example.com', status)] });
    assert.deepEqual(warning, { show: false, title: '', message: '', hostnames: [] }, status);
  }
});

test('no findings, an empty object or undefined never produce a banner (and never imply safety)', () => {
  assert.equal(buildLinkWarningBanner(undefined).show, false);
  assert.equal(buildLinkWarningBanner(null).show, false);
  assert.equal(buildLinkWarningBanner({}).show, false);
  assert.equal(buildLinkWarningBanner({ findings: [] }).show, false);
  assert.equal(buildLinkWarningBanner({ findings: 'nope' as unknown as LinkFlagInput[] }).show, false);
});

test('at most three hostnames are shown; extras are reported, not silently dropped', () => {
  const warning = buildLinkWarningBanner({
    findings: [finding('a-bank.top'), finding('b-bank.top'), finding('c-bank.top'), finding('d-bank.top')],
  });
  assert.deepEqual(warning.hostnames, ['a-bank.top', 'b-bank.top', 'c-bank.top']);
  assert.match(warning.message, /1 more flagged link not shown/);
});

test('duplicate hostnames are deduplicated case-insensitively', () => {
  const warning = buildLinkWarningBanner({
    findings: [finding('Sampath-Bank.top'), finding('sampath-bank.top'), finding('other.top')],
  });
  assert.deepEqual(warning.hostnames, ['Sampath-Bank.top', 'other.top']);
  assert.doesNotMatch(warning.message, /more flagged/);
});

test('a truncated inspection adds a “may be more” limitation', () => {
  const warning = buildLinkWarningBanner({ findings: [finding('x-bank.top')], truncated: true });
  assert.match(warning.message, /truncated/i);
});

test('hostnames are trimmed and capped; unusable values are ignored', () => {
  const long = 'a'.repeat(120) + '.top';
  const warning = buildLinkWarningBanner({
    findings: [finding('  spaced-bank.top  '), finding(long), finding(''), finding('bad host'), finding(42 as unknown as string)],
  });
  assert.equal(warning.hostnames[0], 'spaced-bank.top');
  assert.ok(warning.hostnames[1].endsWith('…'));
  assert.ok(warning.hostnames[1].length <= 81);
  assert.equal(warning.hostnames.length, 2);
});

test('the view model performs no network I/O and reads no environment', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./link-warning.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /process\.env\./);
  assert.doesNotMatch(source, /^import /m, 'the view model must stay dependency-free');
});
