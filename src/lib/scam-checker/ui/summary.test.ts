import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSummaryModel, summaryFilename, summaryText } from './public/summary.js';
import { RULE_EXPLANATIONS, UNKNOWN_RULE_REASON, localPatterns, riskAssessment, validMatches } from './public/assessment.js';
import { analyzeRules } from '../rules/rule-engine.ts';
import { getGuidanceResources } from './guidance-directory.ts';
import { verifyOrganizationContacts } from './organization-verification.ts';
import { ORGANIZATION_DIRECTORY } from './organization-directory.ts';

const NOW = '2026-10-31T10:30:00.000Z';
const SOURCE = { url: 'https://www.cert.gov.lk/report_incident', title: 'Official reporting', reviewedAt: '2026-10-31', context: 'Sri Lanka' };
const original = 'SECRET message https://submitted.example/path?token=PRIVATE +94771234567';
function payload(): any {
  const guidance = getGuidanceResources(verifyOrganizationContacts('', ORGANIZATION_DIRECTORY, Date.parse(NOW)), undefined, Date.parse(NOW));
  return structuredClone({
    outcome: { kind: 'analysed', analysisStatus: 'completed', analysisMode: 'rules_and_ai', category: 'phishing',
      reply: { riskLevel: 'high', verdict: 'SECRET_VERDICT', reason: 'SECRET_AI_PROSE', reasonHighlights: [{ excerpt: 'SECRET_HIGHLIGHT' }] },
      rules: { matches: [{ start: 0, end: 6, excerpt: 'SECRET', ruleId: 'R-M4-02' }] } },
    providerMode: 'SECRET_PROVIDER', model: 'SECRET_MODEL', aiFailure: { message: 'SECRET_DIAGNOSTIC' },
    senderVerification: { value: 'SECRET_SENDER' },
    organizationVerification: { organizations: [{ name: 'Sri Lanka CERT', identity: { status: 'matched', source: SOURCE },
      contacts: [{ kind: 'phone', value: '+94771234567', status: 'not-confirmed', matches: [] }, { kind: 'website', value: 'submitted.example', status: 'not-confirmed', matches: [] }] }], unmatchedContacts: [] },
    linkInspection: { checkedAt: NOW, unicodeVersion: '18.0.0', limitations: ['SECRET_RAW_LIMITATION'], truncated: false,
      findings: [{ hostname: 'submitted.example', unicodeHostname: 'submitted.example', status: 'possible-lookalike', scripts: ['Latin'],
        matches: [{ organizationName: 'Sri Lanka CERT', organizationId: 'cert', officialDomain: 'cert.gov.lk', outdated: false, source: SOURCE }] }] },
    guidanceResources: { ...guidance, actions: [...guidance.actions, { text: 'SECRET_UNREVIEWED_ACTION' }], fallback: 'SECRET_UNREVIEWED_FALLBACK',
      resources: [...guidance.resources, { id: 'cert-report', organizationName: 'Sri Lanka CERT', purpose: 'reporting', title: 'Official reporting', region: 'Sri Lanka', scope: 'Incident reporting', status: 'current', source: SOURCE, url: SOURCE.url, phone: '101' }] },
  });
}
test('summary is an immutable allowlist model and excludes every raw/private field', () => {
  const model = createSummaryModel(payload(), original, NOW);
  const output = summaryText(model, ['clicked', 'shared'], ['pause', 'unknown-check']);
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.links.findings));
  for (const sensitive of ['SECRET', 'submitted.example', 'PRIVATE', '+94771234567', 'SECRET_AI_PROSE', 'SECRET_VERDICT', 'SECRET_HIGHLIGHT', 'SECRET_PROVIDER', 'SECRET_MODEL', 'SECRET_DIAGNOSTIC', 'SECRET_SENDER', 'SECRET_RAW_LIMITATION', 'SECRET_UNREVIEWED_ACTION', 'SECRET_UNREVIEWED_FALLBACK']) {
    assert.equal(output.includes(sensitive), false, sensitive);
    assert.equal(JSON.stringify(model).includes(sensitive), false, sensitive);
  }
  assert.match(output, /Risk: High risk/);
  assert.match(output, /Category: Phishing/);
  assert.match(output, /Local patterns found: 1/);
  assert.ok(output.includes(RULE_EXPLANATIONS['R-M4-02']));
  assert.match(output, /Sri Lanka CERT/);
  assert.match(output, /Phone 1: Not confirmed/);
  assert.match(output, /Website 1: Not confirmed/);
  assert.equal(output.includes('Website: Not confirmed'), false);
  assert.match(output, /Clicked a link; Shared information/);
  assert.match(output, /^- Pause\./m);
  assert.match(output, /Official phone: 101/);
  assert.ok(output.includes(`Official website: ${SOURCE.url}`));
  assert.match(output, /Review before sharing/);
  assert.equal(summaryFilename(model), 'scamshield-summary-20261031T103000Z.txt');
});
test('fixed submitted check is isolated from editor and response mutation; answers are current, not persisted in model', () => {
  const data = payload();
  let editor = original;
  const model = createSummaryModel(data, editor, NOW);
  const before = summaryText(model);
  editor = 'Changed editor text and new secret';
  data.outcome.reply.riskLevel = 'low';
  data.outcome.rules.matches = [];
  data.organizationVerification.organizations[0].name = 'Mutated name';
  data.guidanceResources.resources[0].source.url = 'https://evil.example/';
  assert.equal(summaryText(model), before);
  assert.equal(summaryText(model).includes(editor), false);
  assert.match(summaryText(model, ['received']), /Your selected answers\nOnly received it/);
  assert.match(summaryText(model), /Your selected answers\nNot answered/);
});
test('all assessment states and unknown enum values are honest and do not infer safety', () => {
  for (const status of ['completed', 'limited', 'unavailable', 'unknown']) {
    const data = payload();
    data.outcome.analysisStatus = status;
    data.outcome.category = 'SECRET_UNKNOWN_CATEGORY';
    data.outcome.reply.riskLevel = 'SECRET_UNKNOWN_RISK';
    const output = summaryText(createSummaryModel(data, original, NOW));
    assert.match(output, /Risk: Undetermined/);
    assert.match(output, /Category: Not classified/);
    assert.equal(output.includes('SECRET'), false);
    assert.match(output, status === 'completed' ? /Analysis: Completed/ : status === 'limited' ? /Analysis: Limited/ : /Analysis: Unavailable/);
  }
  assert.equal(riskAssessment({ analysisStatus: 'limited', reply: { riskLevel: 'low' } }).level, 'undetermined');
});
test('unique valid local rule count is separate from merged highlights; unknown rules use only approved generic reason', () => {
  const matches = [{ start: 0, end: 6, excerpt: 'SECRET', ruleId: 'R-M4-02' }, { start: 0, end: 6, excerpt: 'SECRET', ruleId: 'R-M4-02' },
    { start: 0, end: 6, excerpt: 'SECRET', ruleId: 'PRIVATE_UNKNOWN_RULE' }, { start: -1, end: 6, excerpt: 'SECRET', ruleId: 'R-M4-01' },
    { start: 0, end: 6, excerpt: 'WRONG!', ruleId: 'R-M4-03' }];
  assert.deepEqual(localPatterns(original, matches), { count: 2, reasons: [RULE_EXPLANATIONS['R-M4-02'], UNKNOWN_RULE_REASON] });
});
test('canonical span validator preserves existing AI-reason highlights without rule IDs', () => {
  const highlights = [{ start: 0, end: 6, excerpt: 'SECRET' }];
  assert.deepEqual(validMatches(original, highlights), highlights);
  assert.deepEqual(localPatterns(original, highlights), { count: 0, reasons: [] });
});
test('missing metadata and unknown data yield deterministic safe empty summary', () => {
  const model = createSummaryModel({ outcome: { analysisStatus: 'limited' }, unexpected: original }, original, NOW);
  const output = summaryText(model, ['bogus']);
  assert.equal(output, summaryText(model));
  assert.match(output, /^ScamShield check summary\nCheck time \(UTC\): 2026-10-31T10:30:00.000Z\nAnalysis: Limited — local patterns only\nRisk: Undetermined\nCategory: Not classified\nLocal patterns found: 0/);
  assert.match(output, /No source-backed organization evidence available/);
  assert.match(output, /Link-inspection metadata was not available/);
  assert.match(output, /Official-resource metadata was not available/);
  assert.match(output, /Not answered — general guidance only/);
  assert.equal(output.includes(original), false);
  assert.throws(() => createSummaryModel({}, '', 'not-a-time'), TypeError);
});
test('exports list every visible step once and never carry tick marks', () => {
  const model = createSummaryModel(payload(), original, NOW);
  const output = summaryText(model, ['paid']);
  assert.match(output, /Suggested actions\n- If you shared banking or payment details/);
  const fresh = createSummaryModel({ outcome: { analysisStatus: 'unavailable' } }, '', '2026-10-31T10:31:00.000Z');
  assert.match(summaryText(fresh), /Not answered/);
  assert.equal(output.includes('[x]'), false);
  assert.equal(summaryText(model, []).includes('[x]'), false);
});
test('M4-15: local evidence spans stay exact UTF-16 offsets with emoji/surrogate text', () => {
  const text = `🙂🙂 ${'Your bank account will be suspended in 30 minutes. Verify your password.'}`;
  const matches = analyzeRules(text).matches;
  assert.ok(matches.length > 0);
  const valid = validMatches(text, matches);
  assert.equal(valid.length, matches.length, 'astral characters must not shift or drop local evidence');
  for (const match of valid) assert.equal(text.slice(match.start, match.end), match.excerpt);
  assert.equal(localPatterns(text, matches).count, new Set(matches.map(match => match.ruleId)).size);
  // A one-unit slice inside a surrogate pair is not the quoted emoji and is rejected, not mis-highlighted.
  assert.equal(validMatches(text, [{ start: 0, end: 1, excerpt: '🙂' }]).length, 0);
});
test('exact canonical string for an unanswered, limited check with missing metadata', () => {
  assert.equal(summaryText(createSummaryModel({ outcome: { analysisStatus: 'limited' } }, '', NOW)), `ScamShield check summary
Check time (UTC): 2026-10-31T10:30:00.000Z
Analysis: Limited — local patterns only
Risk: Undetermined
Category: Not classified
Local patterns found: 0

Organization / contact evidence
No source-backed organization evidence available.

Link evidence (submitted addresses omitted)
Not available for this response.

Your selected answers
Not answered — general guidance only.

Suggested actions
No current, validated action guidance is available. Use the trusted-channel fallback below.

Official resources
No validated resource available for these selections.
Fallback: Use an independently trusted official website, app or contact details you already know. Do not use contact details from the suspicious message. If money or banking details are involved, contact your own bank or payment provider first.

Other official evidence sources
No validated official evidence sources available.

Limitations
- Offline hostname comparison only. No submitted link was opened, fetched, resolved or checked for reputation. Lookalike detection is heuristic and incomplete, limited to Latin, Greek, Cyrillic, Common and Inherited scripts; a match does not establish safety or sender authenticity.
- Guidance is not a guarantee of safety. Directory and regional coverage are incomplete. Confirm purpose, region and freshness independently.
- No AI risk assessment is available for this check. Local patterns can miss scams and can flag legitimate messages.
- Link-inspection metadata was not available in this response.
- Official-resource metadata was not available in this response.

Review before sharing: this summary includes organization names and your selected answers. The original message, sender details and AI explanation are not included.
Selections stay in this page’s browser memory only and reset for a new check. Copying, downloading or printing creates a separate copy you control. This is not an automatic redaction service.`);
});
