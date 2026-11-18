/** Canonical, pure assessment labels and approved local-rule explanations. */
export const CATEGORY_LABELS = Object.freeze({
  phishing: 'Phishing', romance_scam: 'Romance scam', fake_invoice: 'Fake invoice',
  prize_lottery_scam: 'Prize / lottery scam', unknown_other: 'Not classified',
});
export const MODE_LABELS = Object.freeze({ rules_and_ai: 'Rules + AI', rules_only: 'Rules-only analysis', none: 'Local scan only (AI failed)' });
export const RISK_BANDS = deepFreeze({
  low: { label: 'Low concern', heading: 'Low concern — no obvious scam indicators' },
  suspicious: { label: 'Suspicious', heading: 'Suspicious — verify before acting' },
  high: { label: 'High risk', heading: 'High risk — likely scam' },
  undetermined: { label: 'Undetermined', heading: 'Undetermined — unable to assess risk' },
});
export function riskAssessment(outcome) {
  const level = outcome?.analysisStatus === 'completed' && Object.hasOwn(RISK_BANDS, outcome.reply?.riskLevel)
    ? outcome.reply.riskLevel : 'undetermined';
  return { level, ...RISK_BANDS[level] };
}
export function categoryLabel(id) {
  return Object.hasOwn(CATEGORY_LABELS, id) ? CATEGORY_LABELS[id] : 'Not classified';
}
export const RULE_EXPLANATIONS = Object.freeze({
  'R-M4-01': 'A threat and time pressure are combined with a request to act.',
  'R-M4-02': 'The message asks you to disclose a password, code or other sensitive details.',
  'R-M4-03': 'A request for sensitive details is paired with a link or contact destination.',
  'R-M4-04': 'An online relationship is used to pressure you into sending money.',
  'R-M4-05': 'An invoice or bill demands payment without clear order or reconciliation details.',
  'R-M4-06': 'The message asks you to bypass normal checks before a transaction.',
  'R-M4-07': 'A claimed prize requires a fee or payment.',
  'R-M4-08': 'A claimed prize is used to request sensitive details.',
  'R-M4-09': 'A job offer asks for an upfront fee.',
  'R-M4-10': 'An overpayment or cheque is paired with a request to send money onward.',
  'R-M4-11': 'The displayed link and its actual destination do not match.',
  'R-M4-13': 'A prize claim directs you to a link or contact destination.',
  'R-M4-14': 'A parcel or delivery message asks you to act through a link or contact destination.',
  'R-M4-15': 'A fine or penalty is used to pressure you into making a payment.',
  'R-M4-16': 'A claim about an unauthorised transaction directs you to a link or contact destination.',
  'R-M4-17': 'An investment pitch promises unusually high or doubled returns.',
  'R-M4-18': 'A shortened link hides the full destination. This alone does not prove it is harmful.',
  'R-M4-19': 'The link has an unusual hostname or attachment shape. Its destination has not been verified.',
  'R-M4-20': 'A loan offer pairs a money amount with a link or contact destination.',
  'R-M4-21': 'The link hostname has an unusually deep subdomain structure. Its destination has not been verified.',
  'R-M4-22': 'The link hostname is spelled very like an official domain. Confirm the address independently before using it.',
  'R-M4-23': 'The link does not use the reviewed domain of the organisation named in the same sentence. Confirm the address independently.',
});
export const UNKNOWN_RULE_REASON = 'This wording matched a known scam pattern and deserves a closer look.';
export function ruleExplanation(id) {
  return Object.hasOwn(RULE_EXPLANATIONS, id) ? RULE_EXPLANATIONS[id] : UNKNOWN_RULE_REASON;
}
export function validMatches(text, matches) {
  if (typeof text !== 'string') return [];
  return Array.isArray(matches) ? matches.filter((match) => match &&
    Number.isInteger(match.start) && Number.isInteger(match.end) && match.start >= 0 &&
    match.end > match.start && match.end <= text.length && typeof match.excerpt === 'string' &&
    text.slice(match.start, match.end) === match.excerpt,
  ).sort((a, b) => a.start - b.start || b.end - a.end) : [];
}
export function localPatterns(text, matches) {
  const ids = [...new Set(validMatches(text, matches).filter(match => typeof match.ruleId === 'string').map(match => match.ruleId))];
  return { count: ids.length, reasons: [...new Set(ids.map(ruleExplanation))] };
}
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
