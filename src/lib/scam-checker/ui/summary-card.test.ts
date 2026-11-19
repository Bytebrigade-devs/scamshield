import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summaryCard } from './public/summary-card.js';
import { createSummaryModel, summaryFilename, summaryText } from './public/summary.js';

const model = createSummaryModel({ outcome: { analysisStatus: 'limited' } }, 'PRIVATE_ORIGINAL_MESSAGE', '2026-10-31T10:30:00.000Z');
function setup(t: any, writeText?: (value: string) => Promise<void>) {
  const nodes = new Map<string, any>();
  const created: any[] = [];
  class Node {
    tag: string; attrs: any; children: any[]; listeners: any = {}; textContent = ''; value = ''; hidden = false; focused = false; selected = false; removed = false;
    constructor(tag: string, attrs: any = {}, children: any = []) {
      this.tag = tag; this.attrs = attrs; this.hidden = attrs.hidden === true;
      this.children = [].concat(children).filter(value => value !== null && value !== undefined);
      if (attrs.id) nodes.set(attrs.id, this);
      created.push(this);
    }
    append(...values: any[]) { this.children.push(...values); }
    addEventListener(event: string, listener: any) { this.listeners[event] = listener; }
    click() { return this.listeners.click?.(); }
    remove() { this.removed = true; }
    focus() { this.focused = true; }
    select() { this.selected = true; }
  }
  const el = (tag: string, attrs: any = {}, children: any = []) => new Node(tag, attrs, children);
  const originalDescriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    navigator: { clipboard: writeText ? { writeText } : undefined },
    document: { getElementById: (id: string) => nodes.get(id), body: el('body') },
    window: { print: () => {} },
  })) {
    originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  t.after(() => originalDescriptors.forEach((descriptor, name) => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }));
  el('pre', { id: 'print-summary' });
  return { el, nodes, created };
}
test('preview, successful clipboard, UTF-8 download and print use exactly the same current canonical string', async t => {
  let copied = '';
  const { el, nodes, created } = setup(t, async value => { copied = value; });
  const card = summaryCard(model, el);
  card.update(['clicked', 'shared'], ['pause']);
  const expected = summaryText(model, ['clicked', 'shared'], ['pause']);
  assert.equal(nodes.get('summary-preview').textContent, expected);
  await nodes.get('summary-copy').click();
  assert.equal(copied, expected);
  assert.match(nodes.get('summary-status').textContent, /^Summary copied/);
  let blob: Blob | null = null;
  const revoked: string[] = [];
  t.mock.method(URL, 'createObjectURL', (value: Blob) => { blob = value; return 'blob:test-summary'; });
  t.mock.method(URL, 'revokeObjectURL', value => { revoked.push(value); });
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => { callback(); return 0; });
  nodes.get('summary-download').click();
  assert.equal(blob!.type, 'text/plain;charset=utf-8');
  assert.equal(await blob!.text(), expected);
  const anchor = created.find(value => value.tag === 'a');
  assert.equal(anchor.attrs.download, summaryFilename(model));
  assert.equal(anchor.removed, true);
  assert.deepEqual(revoked, ['blob:test-summary']);
  let printed = '';
  (globalThis as any).window.print = () => { printed = nodes.get('print-summary').textContent; };
  nodes.get('summary-print').click();
  assert.equal(printed, expected);
  assert.equal(printed.includes('PRIVATE_ORIGINAL_MESSAGE'), false);
});
test('denied clipboard exposes a readonly, focused, selectable fallback with truthful status', async t => {
  const { el, nodes } = setup(t, async () => { throw new Error('denied'); });
  const card = summaryCard(model, el);
  card.update(['paid'], ['contact-bank']);
  await nodes.get('summary-copy').click();
  const fallback = nodes.get('summary-copy-fallback');
  assert.equal(fallback.hidden, false);
  assert.equal(fallback.attrs.readonly, true);
  assert.equal(fallback.focused, true);
  assert.equal(fallback.selected, true);
  assert.equal(fallback.scrollTop, 0);
  assert.equal(nodes.get('summary-copy-fallback-label').hidden, false);
  assert.equal(fallback.value, summaryText(model, ['paid'], ['contact-bank']));
  assert.match(nodes.get('summary-status').textContent, /Nothing was copied automatically/);
  card.update([], []);
  assert.equal(fallback.hidden, true);
  assert.equal(nodes.get('summary-copy-fallback-label').hidden, true);
  assert.equal(fallback.value, '');
});
test('missing clipboard also uses manual fallback, never a false success', async t => {
  const { el, nodes } = setup(t);
  summaryCard(model, el);
  await nodes.get('summary-copy').click();
  assert.equal(nodes.get('summary-copy-fallback').value, summaryText(model));
  assert.match(nodes.get('summary-status').textContent, /copy.*manually/);
});
test('native print has the canonical summary even before controls or the print button are used', t => {
  const { el, nodes } = setup(t);
  summaryCard(model, el);
  assert.equal(nodes.get('print-summary').textContent, summaryText(model));
});
test('print CSS excludes every body child except the canonical summary and wraps across paper widths', () => {
  const css = readFileSync(new URL('./public/styles.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  assert.match(css, /@media print/);
  assert.match(css, /body > :not\(#print-summary\)\s*\{ display: none !important; \}/);
  assert.match(css, /@page \{[\s\S]*size: auto;[\s\S]*margin: 15mm;[\s\S]*@top-center[\s\S]*@bottom-center[\s\S]*counter\(page\)/);
  assert.match(css, /#print-summary \{[\s\S]*white-space: pre-wrap;[\s\S]*overflow-wrap: anywhere;/);
  assert.match(html, /<\/main>[\s\S]*<pre id="print-summary"/);
});
