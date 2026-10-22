/**
 * M4-04 — Pipeline stage 2: draft rule-based static analysis.
 *
 * Requirement: FR-M4-03 — "Local static analysis shall apply documented scam-pattern rules and
 * record which rules matched. Check scam fixtures and paired legitimate near-matches; a keyword
 * match alone is not confirmation of an incident."
 *
 * HONESTY BOUNDARY (load-bearing): the 12 rules below implement the HYPOTHESES of the proposed
 * rule catalogue (testing/M4-rule-catalogue.md), which is owner-accepted as an interim PLANNING
 * artifact only — NOT approved executable detector logic or final matching criteria. This module
 * reports which documented rules matched and quotes evidence spans; it produces NO verdict, score,
 * category or incident finding, and a matched keyword alone never confirms an incident.
 *
 * Design rules (each pinned by rule-engine.test.ts):
 * 1. Pure string processing — no network I/O, no fetching of URLs or any destination.
 * 2. Clause-local negation guard (the R-M4-12 context/negation role): a demand/action cue is
 *    suppressed when its own clause negates it ("never", "do not", "no", "without", "cannot",
 *    "is not needed", ...). This is a review guard — it does not prove a message is legitimate.
 * 3. Evidence excerpts are exact substrings of the submitted text (FR-M4-07 spirit); the
 *    PRIMARY cue span is reported so callers can highlight only text the user actually sent.
 * 4. Never throws; Unicode-safe; no truncation (input capping is FR-M4-01 server validation).
 *
 * R-M4-11 is a separate metadata check (`checkDisplayTarget`) — plain text never triggers it.
 * R-M4-12's category fallback (unknown_other) is M4-10/X-13 scope and is NOT implemented here.
 *
 * Runner: Node built-in `node --test` (zero dependencies) — M4-19/X-06 PROPOSED convention.
 */

/** One matched rule with quoted evidence. NO verdict/score/category field exists, by design. */
export interface RuleMatch {
  ruleId: string;
  excerpt: string;
  contextNote?: string;
}

export interface RuleAnalysis {
  matches: RuleMatch[];
}

interface Cue {
  name: string;
  re: RegExp;
  /** Demand/action/fee/credential cues are negation-guarded; context cues are not. */
  guarded?: boolean;
  /** The cue whose span becomes the reported evidence excerpt. */
  primary?: boolean;
}

interface Rule {
  id: string;
  cues: Cue[];
  /** Optional same-clause proximity between two named cues. */
  proximity?: { a: string; b: string; maxChars: number };
  /** Suppressor cues: if any survives the negation guard, the rule does not fire. */
  noneOf?: Cue[];
}

// ---- shared cue vocabularies (documented design decisions; catalogue-derived) ----

/** Negation/prohibition markers suppress guarded cues in the same clause (R-M4-12 role). */
const NEGATION_RE =
  /\b(never|do\s?n[o']?t|don'?t|dont|no|without|nothing|cannot|can'?t|is\s+not\s+needed|not\s+needed|refuse[sd]?|decline[sd]?|is\s+free|free\s+of\s+charge)\b/i;

const SECRET_RE = /\b(password|passcode|otp|one[-\s]?time\s+code|pin)\b|\bbank\s+login\b/i;
const DEMAND_RE = /\b(reply\s+with|send|share|provide|disclose|give|enter|type|confirm|verify|update)\b/i;
const THREAT_RE =
  /\b(suspend\w*|disabl\w*|clos(?:e|es|ed|ing)|shut\w*|terminat\w*|expir\w*|cancel\w*|delet\w*|block\w*|froze\w*|penalt\w*)\b/i;
const PRESSURE_RE =
  /\b(\d+\s*(?:minutes?|hours?|days?)|today|tonight|now|immediately|right\s+away|within\s+\d+|unless\s+you|deadline)\b/i;
const ACTION_RE =
  /\b(verify|confirm|update|restore|enter|click|log\s?in|pay|send|reply(?:\s+with)?|buy|collect|deposit|transfer)\b/i;
const DESTINATION_RE =
  /\b(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{7,}\d/i;

const ROMANCE_RE = /\b(my\s+(love|darling|dear|sweetheart|baby|heart)|darling|sweetheart)\b/i;
const MONEY_DEMAND_RE =
  /\b(send\s+(?:me\s+)?(?:lkr|rs\.?|usd|\d)|send\s+money|transfer\s+(?:money|funds|lkr)|pay\s+(?:me\s+)?(?:lkr|rs\.?|usd|\d)|wire\s+(?:money|funds))\b/i;
const PRESSURE_BLOCK_RE =
  /\b(never\s+met|cannot\s+(?:video|meet|talk|speak|call|let)|can'?t\s+(?:video|meet|talk|speak|call)|trust\s+(?:our|me|this)|video\s+call)\b/i;

const INVOICE_CTX_RE = /\b(invoice\w*|bill\w*|renewal|payment\w*|receipt\w*|fi-\d+)\b/i;
const PAYMENT_DEMAND_RE = /\b(pay|send|transfer|buy|purchase|settle|payable)\b|\bis\s+due\b/i;
const ORDER_CTX_RE =
  /\b(purchase\s+order|po-\d+|reconcile\w*|existing\s+supplier\s+record|existing\s+(?:order|record)|calls?\s+(?:the|your)\s+(?:usual\s+)?contact|usual\s+contact|independently)\b/i;

const PRIZE_RE = /\b(prize|winnings?|award\w*|draw|lottery|jackpot|winner|winning\s+odds)\b/i;
const MONEY_VERB_RE = /\b(pay|send|transfer|buy|purchase)\b/i;
const FEE_NOUN_RE = /\b(fee|charge|cost|upgrade|release|processing|delivery|customs|registration|odds|entry|entries|retain|guarantee)\b/i;

const CRED_RE = /\b(bank\s+login(?:\s+and\s+|\s+or\s+)?password|bank\s+(?:login|password)|account\s+(?:login|password)|bank\s+details|account\s+number|internet\s+banking)\b/i;

const BYPASS_RE =
  /\b(do\s?n[o']?t\s+(?:call|ask|contact|tell|verify|check|mention|inform|use|involve|pay\s+attention)|don'?t\s+(?:call|ask|contact|tell|verify|check|mention|inform|use|involve)|ignore\s+(?:the|your|our|any)\s+\w+|keep\s+(?:this|it)\s+(?:between|private|confidential|quiet)|delete\s+(?:this|these|my\s+number)|avoid\s+\w+)\b/i;
const TRANSACT_CTX_RE =
  /\b(invoice|payee|beneficiary|payment\w*|bank\s+details|account\s+details|order|supplier|dispatch|billing|renewal|transfer|listing)\b/i;

const JOB_RE = /\b(job|role|position|hiring|employment|employer|assistant|recruit\w*|offer\s+you|interview)\b/i;
const JOB_FEE_NOUN_RE = /\b(registration|application|training|enrol?l?ment|membership|fee)\b/i;

const CHEQUE_RE = /\b(cheques?|paycheck)\b/i;
const OVERPAY_RE = /\b(extra|surplus|overpay\w*|additional|more\s+than|excess)\b/i;
const ONWARD_RE = /\b(send|forward|transfer)\s+(?:the\s+|any\s+|back\s+|out\s+)?(?:surplus|extra|difference|rest|amount|funds)\b/i;

// ---- rule table: catalogue hypotheses R-M4-01…R-M4-10 (planning IDs, draft logic) ----

const RULES: Rule[] = [
  {
    id: 'R-M4-01',
    cues: [
      { name: 'threat', re: THREAT_RE, primary: true },
      { name: 'pressure', re: PRESSURE_RE },
      { name: 'risky-action', re: ACTION_RE, guarded: true },
    ],
  },
  {
    id: 'R-M4-02',
    cues: [
      { name: 'secret', re: SECRET_RE, primary: true },
      { name: 'disclosure-demand', re: DEMAND_RE, guarded: true },
    ],
    proximity: { a: 'secret', b: 'disclosure-demand', maxChars: 80 },
  },
  {
    id: 'R-M4-03',
    cues: [
      { name: 'secret', re: SECRET_RE, primary: true },
      { name: 'disclosure-demand', re: DEMAND_RE, guarded: true },
      { name: 'message-destination', re: DESTINATION_RE },
    ],
    proximity: { a: 'secret', b: 'disclosure-demand', maxChars: 80 },
  },
  {
    id: 'R-M4-04',
    cues: [
      { name: 'romance', re: ROMANCE_RE },
      { name: 'money-demand', re: MONEY_DEMAND_RE, guarded: true, primary: true },
      { name: 'pressure-block', re: PRESSURE_BLOCK_RE },
    ],
  },
  {
    id: 'R-M4-05',
    cues: [
      { name: 'invoice-context', re: INVOICE_CTX_RE },
      { name: 'payment-demand', re: PAYMENT_DEMAND_RE, guarded: true, primary: true },
    ],
    // An affirmative order/reconciliation context (itself negation-guarded) suppresses the rule:
    // an invoice mentioning real order context is not "payment demand without verifiable context".
    noneOf: [{ name: 'order-context', re: ORDER_CTX_RE, guarded: true }],
  },
  {
    id: 'R-M4-06',
    cues: [
      { name: 'bypass-instruction', re: BYPASS_RE, primary: true },
      { name: 'transaction-context', re: TRANSACT_CTX_RE },
    ],
  },
  {
    id: 'R-M4-07',
    cues: [
      { name: 'prize', re: PRIZE_RE },
      { name: 'money-verb', re: MONEY_VERB_RE, guarded: true },
      { name: 'fee-noun', re: FEE_NOUN_RE, guarded: true, primary: true },
    ],
    proximity: { a: 'money-verb', b: 'fee-noun', maxChars: 80 },
  },
  {
    id: 'R-M4-08',
    cues: [
      { name: 'prize', re: PRIZE_RE },
      { name: 'credential', re: CRED_RE, guarded: true, primary: true },
      { name: 'disclosure-demand', re: DEMAND_RE, guarded: true },
    ],
    proximity: { a: 'credential', b: 'disclosure-demand', maxChars: 80 },
  },
  {
    id: 'R-M4-09',
    cues: [
      { name: 'job', re: JOB_RE },
      { name: 'money-verb', re: MONEY_VERB_RE, guarded: true },
      { name: 'job-fee', re: JOB_FEE_NOUN_RE, guarded: true, primary: true },
    ],
    proximity: { a: 'money-verb', b: 'job-fee', maxChars: 80 },
  },
  {
    id: 'R-M4-10',
    cues: [
      { name: 'cheque', re: CHEQUE_RE },
      { name: 'overpay', re: OVERPAY_RE },
      { name: 'onward-transfer', re: ONWARD_RE, guarded: true, primary: true },
    ],
  },
];

// ---- matching engine ----

interface Span {
  start: number;
  end: number;
  value: string;
}

interface Segment {
  start: number;
  text: string;
}

/** Clause segments: the negation guard never looks across sentence/clause boundaries. */
function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || /[.!?,;:\n]/.test(text[i])) {
      const value = text.slice(start, i);
      if (value.trim().length > 0) out.push({ start, text: value });
      start = i + 1;
    }
  }
  return out;
}

function negated(seg: Segment, cueStart: number): boolean {
  const from = Math.max(0, cueStart - seg.start - 80);
  return NEGATION_RE.test(seg.text.slice(from, cueStart - seg.start));
}

function cueSpans(text: string, segs: Segment[], cue: Cue): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(new RegExp(cue.re.source, cue.re.flags.includes('g') ? cue.re.flags : cue.re.flags + 'g'))) {
    const start = m.index ?? 0;
    const value = m[0];
    if (cue.guarded) {
      const seg = segs.find((s) => start >= s.start && start < s.start + s.text.length);
      if (seg && negated(seg, start)) continue;
    }
    out.push({ start, end: start + value.length, value });
  }
  return out;
}

function sameClauseWithin(segs: Segment[], a: Span, b: Span, maxChars: number): boolean {
  if (Math.abs(a.start - b.start) > maxChars) return false;
  return segs.some((s) => a.start >= s.start && a.start < s.start + s.text.length && b.start >= s.start && b.start < s.start + s.text.length);
}

/**
 * Analyse pasted message text against the draft rule catalogue.
 * Returns which documented rules matched, with exact quoted evidence spans.
 * NO verdict, score, category or incident claim — a keyword match alone confirms nothing.
 */
export function analyzeRules(text: string): RuleAnalysis {
  if (typeof text !== 'string' || text.length === 0) return { matches: [] };
  const segs = segments(text);
  const matches: RuleMatch[] = [];

  for (const rule of RULES) {
    const found = new Map<string, Span[]>();
    let allPresent = true;
    for (const cue of rule.cues) {
      const spans = cueSpans(text, segs, cue);
      if (spans.length === 0) {
        allPresent = false;
        break;
      }
      found.set(cue.name, spans);
    }
    if (!allPresent) continue;

    if (rule.proximity) {
      const as = found.get(rule.proximity.a) ?? [];
      const bs = found.get(rule.proximity.b) ?? [];
      const close = as.some((a) => bs.some((b) => sameClauseWithin(segs, a, b, rule.proximity!.maxChars)));
      if (!close) continue;
    }

    if (rule.noneOf) {
      const suppressed = rule.noneOf.some((cue) => cueSpans(text, segs, cue).length > 0);
      if (suppressed) continue;
    }

    const primary = rule.cues.find((c) => c.primary) ?? rule.cues[0];
    const excerpt = (found.get(primary.name) ?? [])[0];
    if (!excerpt) continue;
    matches.push({ ruleId: rule.id, excerpt: excerpt.value, contextNote: primary.name });
  }

  return { matches };
}

/**
 * R-M4-11 stub — explicit display/target metadata check ONLY.
 * Plain text never triggers this rule (no shortener list / subdomain threshold: OPEN in the
 * catalogue). Engineering acceptance rule, not malicious-domain evidence; no fetching.
 */
export function checkDisplayTarget(display?: string, target?: string): RuleMatch[] {
  if (!display || !target) return [];
  if (display.trim() === target.trim()) return [];
  return [{ ruleId: 'R-M4-11', excerpt: target, contextNote: 'display-target mismatch' }];
}
