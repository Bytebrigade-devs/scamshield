/**
 * M4-04 evidence sweep — expected-vs-actual over the 40 synthetic fixture pairs.
 *
 * READ-ONLY tool: it never modifies testing/M4-synthetic-pairs.json. It is an evidence recorder,
 * NOT the M4-20 pilot and NOT an accuracy measurement — no percentages are computed or claimed.
 *
 * ID namespace: R-M4-xx here are catalogue rule-hypothesis IDs (R-M4-01…20), NOT the Final
 * report's requirement IDs (R-M4-01…18).
 *
 * Expectations (from the fixture's own rule_refs):
 *   intended_suspicious_scenario       -> every referenced pattern rule must fire
 *   intended_legitimate_near_match     -> no executable pattern rule may fire
 *   intended_ambiguous_scenario        -> review required; excluded from pass/fail totals
 * R-M4-11 (metadata stub) and R-M4-12 (the guard mechanism) never "fire" and are excluded.
 *
 * Any mismatch is a documented limitation of the draft pattern rules, to be read alongside the
 * rule catalogue's stated limitations — it is not bent into a pass and not hidden.
 *
 * Usage: node code/rules/sweep.ts [--strict] (--strict exits 1 on mismatches).
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { analyzeRules } from './rule-engine.ts';

export interface FixtureMessage {
  id: string;
  role: string;
  text: string;
  rule_refs?: string[];
}
export interface FixturePair {
  id: string;
  messages: FixtureMessage[];
}

const EXCLUDED = new Set(['R-M4-11', 'R-M4-12']);

export interface MessageEvaluation {
  id: string;
  role: string;
  expectedRuleIds: string[];
  firedRuleIds: string[];
  missingRuleIds: string[];
  unexpectedRuleIds: string[];
  status: 'satisfied' | 'mismatch' | 'review_required';
}

export function evaluateMessage(msg: FixtureMessage): MessageEvaluation {
  const roles = ['intended_suspicious_scenario', 'intended_legitimate_near_match', 'intended_ambiguous_scenario'];
  if (!roles.includes(msg.role)) throw new Error(`Unknown fixture role for ${msg.id}: ${msg.role}`);
  const expectedRuleIds = [...new Set(msg.rule_refs ?? [])].filter((r) => !EXCLUDED.has(r));
  const firedRuleIds = analyzeRules(msg.text).matches.map((m) => m.ruleId);
  const suspicious = msg.role === 'intended_suspicious_scenario';
  const ambiguous = msg.role === 'intended_ambiguous_scenario';
  if (suspicious && expectedRuleIds.length === 0) throw new Error(`No executable expectation for ${msg.id}`);
  const missingRuleIds = suspicious ? expectedRuleIds.filter((id) => !firedRuleIds.includes(id)) : [];
  // Suspicious references are minimum expectations, not an exhaustive allowlist.
  // For legitimate controls, every fired rule is unexpected, even outside rule_refs.
  const unexpectedRuleIds = suspicious
    ? firedRuleIds.filter((id) => !expectedRuleIds.includes(id))
    : [...firedRuleIds];
  const mismatch = missingRuleIds.length > 0 || (!suspicious && unexpectedRuleIds.length > 0);
  return { id: msg.id, role: msg.role, expectedRuleIds, firedRuleIds, missingRuleIds, unexpectedRuleIds,
    status: ambiguous ? 'review_required' : mismatch ? 'mismatch' : 'satisfied' };
}

export function evaluateFixture(fixture: { pairs: FixturePair[] }) {
  const results = fixture.pairs.flatMap((pair) => pair.messages.map(evaluateMessage));
  const reviewRequired = results.filter((r) => r.status === 'review_required').length;
  return {
    total: results.length,
    evaluated: results.length - reviewRequired,
    satisfied: results.filter((r) => r.status === 'satisfied').length,
    mismatches: results.filter((r) => r.status === 'mismatch').length,
    reviewRequired,
    results,
  };
}

// Importing the evaluator for tests must not read fixtures or print a sweep.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixturePath = new URL('../../testing/M4-synthetic-pairs.json', import.meta.url);
  const summary = evaluateFixture(JSON.parse(readFileSync(fixturePath, 'utf8')));
  console.log('msg_id            role  expected(refs)          fired                      result');
  for (const row of summary.results) {
    const role = row.role === 'intended_suspicious_scenario' ? 'S' : row.role === 'intended_legitimate_near_match' ? 'L' : 'A';
    console.log(`${row.id.padEnd(17)} ${role}     ${row.expectedRuleIds.join(',').padEnd(23)} ${row.firedRuleIds.join(',').padEnd(26)} ${row.status}`);
  }
  console.log(`\nmessages: ${summary.total}; evaluated: ${summary.evaluated}; satisfied: ${summary.satisfied}; mismatches: ${summary.mismatches}; review required: ${summary.reviewRequired}`);
  for (const row of summary.results.filter((r) => r.status !== 'satisfied')) {
    console.log(`${row.id}: ${row.status}; missing [${row.missingRuleIds.join(',')}]; unexpected [${row.unexpectedRuleIds.join(',')}]`);
  }
  console.log('\nNote: synthetic draft-rule evidence, not the M4-20 pilot or an accuracy measurement. Ambiguous cases require separate review.');
  if (process.argv.includes('--strict') && summary.mismatches > 0) process.exitCode = 1;
}
