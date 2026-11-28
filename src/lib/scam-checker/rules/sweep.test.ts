import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeRules } from './rule-engine.ts';
import { evaluateMessage, evaluateFixture } from './sweep.ts';

const fixture = JSON.parse(readFileSync(new URL('../../testing/M4-synthetic-pairs.json', import.meta.url), 'utf8'));

test('the frozen synthetic fixture has no missing expectations or legitimate-rule matches', () => {
  const summary = evaluateFixture(fixture);
  // 52 pairs / 104 messages since the v0.2 Sri Lankan adaptation (24 Oct 2026, incl. the
  // same-day R-M4-20 instant-loan addition): 103 evaluated + 1 review-required (M4-OT08-S).
  assert.equal(summary.total, 104);
  assert.equal(summary.evaluated, 103);
  assert.equal(summary.reviewRequired, 1);
  assert.deepEqual(summary.results.filter((r) => r.status === 'mismatch'), []);
});

test('every fixture evidence excerpt slices exactly from its original submitted occurrence', () => {
  for (const pair of fixture.pairs) {
    for (const message of pair.messages) {
      for (const match of analyzeRules(message.text).matches) {
        assert.ok(Number.isInteger(match.start) && match.start >= 0);
        assert.ok(Number.isInteger(match.end) && match.end > match.start && match.end <= message.text.length);
        assert.equal(message.text.slice(match.start, match.end), match.excerpt, message.id);
      }
    }
  }
});

test('legitimate fixtures expose unexpected rules outside their references', () => {
  const result = evaluateMessage({ id: 'control', role: 'intended_legitimate_near_match', text: 'Send your password now.', rule_refs: ['R-M4-07'] });
  assert.equal(result.status, 'mismatch');
  assert.deepEqual(result.unexpectedRuleIds, ['R-M4-02']);
});

test('ambiguous fixtures require review and are excluded from pass/fail totals', () => {
  const fixture = { pairs: [{ id: 'pair', messages: [
    { id: 'ambiguous', role: 'intended_ambiguous_scenario', text: 'Send your password now.', rule_refs: ['R-M4-11', 'R-M4-12'] },
    { id: 'legitimate', role: 'intended_legitimate_near_match', text: 'Hello team.', rule_refs: [] },
  ] }] };
  const result = evaluateFixture(fixture);
  assert.equal(result.reviewRequired, 1);
  assert.equal(result.evaluated, 1);
  assert.equal(result.satisfied, 1);
  assert.equal(result.mismatches, 0);
  assert.equal(result.results[0].status, 'review_required');
});

test('suspicious expectations report missing and additional rules separately', () => {
  const result = evaluateMessage({ id: 'suspicious', role: 'intended_suspicious_scenario', text: 'Send your password now.', rule_refs: ['R-M4-02', 'R-M4-03'] });
  assert.equal(result.status, 'mismatch');
  assert.deepEqual(result.missingRuleIds, ['R-M4-03']);
});

test('unknown roles and suspicious fixtures without executable expectations fail explicitly', () => {
  assert.throws(() => evaluateMessage({ id: 'bad', role: 'typo', text: '' }), /role/i);
  assert.throws(() => evaluateMessage({ id: 'empty', role: 'intended_suspicious_scenario', text: '', rule_refs: ['R-M4-12'] }), /expectation/i);
});
