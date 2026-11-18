/**
 * M4 — link-warning banner drift guard (M4-12, 18 November 2026).
 *
 * The browser banner in `public/link-banner.js` must behave exactly like the published view
 * model in `link-warning.ts` (PR #36). This test pins the constants, the model behaviour across
 * every state, and the rendered banner's inert-text rule. All data is synthetic.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkWarningBanner, LINK_WARNING_MESSAGE, LINK_WARNING_TITLE } from './link-warning.ts';
import {
  LINK_WARNING_MESSAGE as JS_MESSAGE,
  LINK_WARNING_TITLE as JS_TITLE,
  linkWarningBanner,
  linkWarningModel,
} from './public/link-banner.js';

function node(tag: string, attrs: any = {}, children: any = []) {
  return { tag, attrs, children: [].concat(children).filter(item => item !== null && item !== undefined), append(...values: any[]) { this.children.push(...values.filter(item => item !== null && item !== undefined)); } };
}
function flatten(value: any): any[] { return typeof value === 'object' && value ? [value, ...value.children.flatMap(flatten)] : []; }
function text(value: any): string { return typeof value === 'string' ? value : value?.children?.map(text).join(' ') ?? ''; }

const LOOKALIKE = { hostname: 'rnicrosoft.com', status: 'possible-lookalike' };
const CASES: unknown[] = [
  null,
  undefined,
  {},
  { findings: [] },
  { findings: [LOOKALIKE] },
  { findings: [LOOKALIKE, LOOKALIKE] },
  { findings: [{ hostname: 'RNicrosoft.com', status: 'possible-lookalike' }, LOOKALIKE] },
  { findings: [{ hostname: 'microsoft.com', status: 'official-match' }, { hostname: 'x.example', status: 'unconfirmed' }, { hostname: '1.2.3.4', status: 'not-inspectable' }] },
  { findings: [0, 1, 2, 3, 4].map(index => ({ hostname: `h${index}.example`, status: 'possible-lookalike' })) },
  { findings: [0, 1, 2, 3, 4].map(index => ({ hostname: `h${index}.example`, status: 'possible-lookalike' })), truncated: true },
  { findings: [{ hostname: 'not a hostname', status: 'possible-lookalike' }, { hostname: 'ok.example', status: 'possible-lookalike' }] },
  { findings: [{ hostname: 'x'.repeat(200) + '.example', status: 'possible-lookalike' }] },
  { findings: 'not-an-array' },
  { findings: Array.from({ length: 70 }, (_, index) => ({ hostname: `h${index}.example`, status: 'possible-lookalike' })) },
];

test('banner constants match the published view model byte-for-byte', () => {
  assert.equal(JS_TITLE, LINK_WARNING_TITLE);
  assert.equal(JS_MESSAGE, LINK_WARNING_MESSAGE);
});

test('the browser banner model matches buildLinkWarningBanner across every state', () => {
  for (const input of CASES) {
    assert.deepEqual(linkWarningModel(input), buildLinkWarningBanner(input), JSON.stringify(input));
  }
});

test('the banner renders only for possible-lookalike findings, as inert text with no anchors', () => {
  assert.equal(linkWarningBanner(null, node), null);
  assert.equal(linkWarningBanner({ findings: [] }, node), null);
  assert.equal(linkWarningBanner({ findings: [{ hostname: 'microsoft.com', status: 'official-match' }] }, node), null);

  const banner = linkWarningBanner({ findings: [LOOKALIKE] }, node)!;
  assert.equal(flatten(banner)[0].attrs['data-testid'], 'link-warning');
  assert.match(text(banner), /Check this link before you tap/);
  assert.match(text(banner), /rnicrosoft\.com/);
  assert.match(text(banner), /inert text, never made clickable/);
  assert.equal(flatten(banner).filter(item => item.tag === 'a').length, 0, 'the banner must never render an anchor');
});

test('a hygiene-failing hostname is skipped, not rendered raw', () => {
  const banner = linkWarningBanner({ findings: [{ hostname: 'rn <b>evil</b>', status: 'possible-lookalike' }, LOOKALIKE] }, node)!;
  assert.doesNotMatch(text(banner), /<b>/);
  assert.match(text(banner), /rnicrosoft\.com/);
});
