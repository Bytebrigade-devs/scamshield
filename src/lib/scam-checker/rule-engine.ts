/**
 * M4-04 — Pipeline stage 2: draft rule-based static analysis.
 *
 * Requirement: FR-M4-03 — "Local static analysis shall apply documented scam-pattern rules and
 * record which rules matched. Check scam fixtures and paired legitimate near-matches; a keyword
 * match alone is not confirmation of an incident."
 *
 * HONESTY BOUNDARY (load-bearing): the patterns below implement HYPOTHESES of the proposed
 * rule catalogue (testing/M4-rule-catalogue.md) — the owner-accepted v0.1 planning rows
 * (R-M4-01…10, 20 Oct) plus the v0.2-draft Sri Lankan scam-landscape amendment (R-M4-13…19
 * and the Sinhala/Singlish cue extensions, 24 Oct) and same-day R-M4-20 (instant-loan
 * family, added on the owner's direction after two reported scam texts) — all PLANNING
 * artifacts, NOT approved executable detector logic or final matching criteria. This module reports which documented
 * rules matched and quotes evidence spans; it produces NO verdict, score, category or incident
 * finding, and a matched keyword alone never confirms an incident.
 *
 * ID namespace (review finding, 27 Oct 2026): the R-M4-xx IDs above are catalogue rule-hypothesis
 * IDs (R-M4-01…20), NOT the Final report's requirement IDs (R-M4-01…18). E.g. catalogue R-M4-13
 * is the prize/reward claim-link rule; report R-M4-13 is the own-history requirement.
 *
 * Language position (owner decision 24 Oct 2026, superseding the 18 Oct English-only
 * settlement): cues add Sinhala-script tokens and a conservative Singlish starter set, with
 * NO accuracy or coverage claim. Sinhala cues use script lookbehinds — JS `\b` is ASCII-only
 * and does not bound Sinhala — and treat the ZWJ (U+200D) in conjuncts (ත්‍යාග, ජයග්‍රාහක) as
 * optional. The negation guard remains English-only (asymmetric: Sinhala prohibitions do not
 * suppress Sinhala cues — documented catalogue limitation). Tamil stays unsupported.
 *
 * Design rules (each pinned by rule-engine.test.ts):
 * 1. Pure string processing — no network I/O, no fetching of URLs or any destination.
 * 2. Instruction-local negation guard (R-M4-12): prohibitions suppress their own requests,
 *    with noun-specific handling for fees/credentials. This heuristic does not prove legitimacy.
 * 3. Evidence excerpts are exact substrings of the submitted text (FR-M4-07 spirit); the
 *    qualifying PRIMARY cue is reported with its UTF-16 start/end offsets.
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
  /** UTF-16 offsets into analyzeRules' input (or checkDisplayTarget's target). */
  start: number;
  end: number;
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
  proximity?: { a: string; b: string; maxChars: number; sameClause?: boolean };
  /** Suppressor cues: if any survives the negation guard, the rule does not fire. */
  noneOf?: Cue[];
}

// ---- shared cue vocabularies (documented design decisions; catalogue-derived) ----

/** Negation/prohibition markers suppress guarded cues in the same clause (R-M4-12 role). */
const NEGATION_RE =
  /\b(?:never|do\s+not|don'?t|dont|cannot|can'?t|will\s+not|should\s+not|must\s+not|without|no\s+need\s+to|not\s+to|not\s+(?:a\s+(?:place|request|reason)|asking|requesting|needed|required))\b/i;
const NO_NOUN_RE = /\bno\s+(?:(?:registration|processing|reservation|delivery|customs|training|application|upfront|advance|card|bank|login|password|security|code|fee|payment|or|is|are|required|needed|requested|upgrade|number)\s+)*$/i;
const INSTRUCTION_BREAK_RE = /\b(?:but|however|instead|then|so|therefore|before\s+you)\b/i;

const SECRET_RE = /\b(password|passcode|otp|one[-\s]?time\s+code|pin)\b|\bbank\s+login\b|\bbank\s+details\b|\bcard\s+details\b/i;
const DEMAND_RE = /\b(reply\s+with|send(?:ing)?|shar(?:e|ing)|provid(?:e|ing)|disclos(?:e|ing)|giv(?:e|ing)|enter(?:ing)?|typ(?:e|ing)|confirm(?:ing)?|verify(?:ing)?|updat(?:e|ing))\b|\bask(?:ing|ed)?\s+(?:me\s+|you\s+|us\s+)?for\b|(?<![\u0D80-\u0DFF])තහවුරු\s*කරන්න|(?<![\u0D80-\u0DFF])යවන්න|(?<![\u0D80-\u0DFF])එවන්න/i;
const THREAT_RE =
  /\b(suspend\w*|disabl\w*|clos(?:e|es|ed|ing)|shut\w*|terminat\w*|expir\w*|cancel\w*|delet\w*|block\w*|froze\w*|penalt\w*|locked|los(?:e|ing))\b/i;
const PRESSURE_RE =
  /\b(\d+\s*(?:minutes?|hours?|days?|[ap]\.?m\.?)|today|tonight|now|immediately|right\s+away|within\s+(?:\d+|the\s+hour)|within\s+a\s+(?:week|day|few\s+hours)|unless\s+you|deadline)\b/i;
const ACTION_RE =
  /\b(?:verify|confirm|update|restore|enter)\s+(?:\w+\s+){0,3}(?:password|pin|otp|login|account|bank\s+details)\b|\b(click|log\s?in|pay|send|reply(?:\s+with)?|buy|deposit|transfer)\b/i;
const DESTINATION_RE =
  /\b(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{7,}\d/i;

const ROMANCE_RE = /\b(my\s+(love|darling|dear|sweetheart|baby|heart)|darling|dearest|sweetheart|online\s+(?:romance|dating)|dated\s+online|our\s+love)\b/i;
const MONEY_DEMAND_RE =
  /\b(?:send|transfer|pay|wire|buy|purchase)\s+(?:\w+\s+){0,4}(?:lkr|rs|usd|\d+|money|funds|ticket|visa|gift[ -]?cards?|fee|wallet|broker)\b/i;
const PRESSURE_BLOCK_RE =
  /\b(never\s+met|only\s+chatted\s+online|cannot\s+(?:video|meet|talk|speak|call|let|show|join|discuss)|can'?t\s+(?:video|meet|talk|speak|call)|trust\s+(?:our|me|this)|video\s+call|first\s+time|forbids\s+calls|without\s+checking|do\s+not\s+(?:ask|question|speak)|prove\s+you\s+care|loyalty)\b/i;

const INVOICE_CTX_RE = /\b(invoice\w*|bill\w*|renewal|payment\w*|receipt\w*|fi-\d+)\b/i;
const PAYMENT_DEMAND_RE = /\b(pay|send|transfer|buy|purchase|settle|payable)\b|\bis\s+due\b/i;
const ORDER_CTX_RE =
  /\b(purchase\s+order|po-\d+|reconcile\w*|existing\s+supplier\s+record|existing\s+(?:order|record)|calls?\s+(?:the|your)\s+(?:usual\s+)?contact|usual\s+contact|normal\s+billing\s+portal|established\s+supplier\s+details|existing\s+supplier\s+contact|independently\s+(?:verify|check|confirm))\b/i;

const PRIZE_RE = /\b(prize|winnings?|award\w*|draw|lottery|jackpot|winner|voucher|winning\s+odds)\b|\blucky\s+draw\b|\breward\s+points?\b|\bloyalty\s+points?\b|(?<![\u0D80-\u0DFF])ලොතරැයි|(?<![\u0D80-\u0DFF])ජයග්\u200D?රාහක|(?<![\u0D80-\u0DFF])ත්\u200D?යාග|(?<![\u0D80-\u0DFF])සුබ\s*පැතුම්|\bjayagrahak(?:ayek|aya|ayan)?\b|\bjaya\s?grahak(?:ayek|aya|ayan)?\b|\blutharayi\b/i;
const MONEY_VERB_RE = /\b(pay(?:ing)?|send(?:ing)?|transfer(?:ring)?|buy(?:ing)?|purchas(?:e|ing))\b/i;
const FEE_NOUN_RE = /\b(fee|charge|cost|upgrade|release|processing|delivery|customs|registration|odds|entry|entries|retain|guarantee)\b|\bclearance\b|(?<![\u0D80-\u0DFF])ගාස්තු/i;

const CRED_RE = /\b(bank\s+login(?:\s+and\s+|\s+or\s+)?password|bank\s+(?:login|password)|account\s+(?:login|password)|bank\s+details|account\s+number|card\s+number|security\s+code|internet\s+banking)\b/i;

const BYPASS_RE =
  /\b(do\s+not\s+(?:call|ask|contact|tell|verify|check|mention|inform|involve)|don'?t\s+(?:call|ask|contact|tell|verify|check|mention|inform|involve)|do\s+not\s+use\s+(?:the\s+)?(?:normal|usual|official)\s+\w+|ignore\s+(?:the|your|our|any)\s+\w+|skip\s+approval|will\s+not\s+accept\s+questions|keep\s+(?:this|it)\s+(?:between|private|confidential|quiet|outside)|delete\s+(?:this|these|my\s+number)|avoid\s+\w+)\b/i;
const TRANSACT_CTX_RE =
  /\b(invoice|payee|beneficiary|payment\w*|bank\s+details|account\s+details|order|supplier|dispatch|billing|renewal|transfer|listing)\b/i;

const JOB_RE = /\b(job|role|position|hiring|employment|employer|assistant|recruit\w*|offer\s+you|interview|home[ -]work|guaranteed\s+tasks|placement)\b/i;
const JOB_FEE_NOUN_RE = /\b(registration|application|training|enrol?l?ment|membership|fee|starter[ -]kit|(?:upfront|advance|a|the)\s+deposit|certificate)\b/i;

const CHEQUE_RE = /\b(cheques?|paycheck)\b/i;
const OVERPAY_RE = /\b(extra|surplus|overpay\w*|additional|more\s+than|excess|keep\s+your\s+fee|the\s+rest)\b/i;
const ONWARD_RE = /\b(send|forward|transfer)\s+(?:the\s+|any\s+|back\s+|out\s+)?(?:surplus|extra|difference|rest|amount|funds)\b|\b(?:buy|purchase)\s+gift[ -]?cards?\s+for\s+(?:the\s+)?(?:rest|surplus|difference)\b/i;

// ---- Sri Lankan adaptation cues (catalogue v0.2-draft, 24 Oct 2026) ----
// Sinhala cues use script lookbehinds, never \b (JS \b is ASCII-only), and make the ZWJ
// (U+200D) inside conjuncts (ත්‍යාග, ජයග්‍රාහක) optional. Sources: evidence/
// M4-scam-landscape-sri-lanka-20261024.md; shape flags (R-M4-18/19) are engineering
// acceptance rules in the R-M4-11 tradition — never malicious-domain findings, no fetching.
const PARCEL_CTX_RE =
  /\b(?:parcel|package|consignment|courier|delivery|customs)\b|(?<![\u0D80-\u0DFF])පාර්සල්|(?<![\u0D80-\u0DFF])තෑගි/iu;
const PARCEL_DEMAND_RE =
  /\b(?:(?:customs|clearance|release|redelivery|delivery)\s+(?:fee|charge|cost|payment)s?|unpaid\s+(?:customs|delivery))\b|\b(?:update|confirm|verify)\s+(?:your\s+|the\s+)?(?:delivery\s+)?address\b|(?<![\u0D80-\u0DFF])රේගු\s*ගාස්තු/iu;
const FINE_CTX_RE =
  /\b(?:traffic|parking|unpaid|spot)\s+fines?\b|\bfine\s+of\b|\bcourt\s+action\b|\bprosecut\w+|(?<![\u0D80-\u0DFF])දඩ(?:\s*මුදල්)?(?!ය)/iu;
const CLAIM_DEMAND_RE =
  /\b(?:claim|collect|confirm|verify)\s+(?:your\s+|the\s+)?(?:[\w,.]+\s+){0,3}(?:prize|winnings?|reward(?:\s+points?)?|gift|voucher|cash)\b|(?<![\u0D80-\u0DFF])තහවුරු\s*කරන්න|\bkaranna\b/iu;
const TXN_CTX_RE = /\b(?:transfers?|transactions?|payments?|withdrawals?)\b/i;
const UNAUTHORIZED_RE =
  /\bif\s+this\s+is\s+not\s+you\b|\bdid\s+not\s+(?:make|authorize|authorise)\b|\b(?:un|not\s+)authorized?\b|\bsuspicious\s+activity\b/i;
// Review fix #6 (24 Oct 2026): the Sinhala investment token is spelled out with explicit
// code points — ආ(U+0D86) ය(U+0DBA) + vowel sign (ෝ U+0DDD | ො U+0DDC | decomposed ෙ U+0DD9 +
// ා U+0DCF | bare ෙ) + ජ(U+0DA2) න(U+0DB1). The earlier single-character class ආ[යොයෝ]ජන could
// never match the correctly spelled ආයෝජන (it needs TWO code points after ආය) while matching
// the nonsense string ආෝජන. Pinned by rule-engine.test.ts in both composed spellings and the
// decomposed form.
const INVEST_CTX_RE =
  /\b(?:invest\w*|crypto\w*|forex|usdt|bitcoin|trading\s+app)\b|(?<![\u0D80-\u0DFF])\u0D86\u0DBA(?:\u0DDD|\u0DDC|\u0DD9\u0DCF|\u0DD9)\u0DA2\u0DB1/iu;
const DOUBLING_RE =
  /\b(?:doubl\w*|guaranteed\s+(?:returns?|profits?)|risk[- ]free)\b|(?<![\u0D80-\u0DFF])දෙගුණ/iu;
const SHORTENER_RE =
  /(?<![\p{L}\p{N}_.@/?:=&#%+-])(?:(?:https?:\/\/|www\.)[^\s"'<>]+|(?:bit\.ly|tinyurl\.com|t\.me|wa\.me|cutt\.ly|is\.gd|goo\.gl|shorturl\.at|rb\.gy|rebrand\.ly|tiny\.cc)[^\s"'<>]*)/iu;
const SHORTENER_HOST_RE = /^(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.me|wa\.me|cutt\.ly|is\.gd|goo\.gl|shorturl\.at|rb\.gy|rebrand\.ly|tiny\.cc)$/i;
const HOSTILE_SHAPE_RE =
  /\b(?:https?:\/\/|www\.)[^\s"'<>]+|\b[\w-]+-(?:verify|secure|pay|claim|release|renewal|redelivery|delivery|login|support)-[\w-]+\.(?:com|net|org|top|xyz|online|info|men|help)\b|\b[\w.-]+\.apk\b/i;
const HOSTILE_TLD_RE = /\.(?:top|xyz|online|men|help|cfd|cam|one|icu|buzz)$/i;
const LOOKALIKE_HOST_RE = /(?:^|\.)[\w-]+-(?:verify|secure|pay|claim|release|renewal|redelivery|delivery|login|support)-[\w-]+\.(?:com|net|org|top|xyz|online|info|men|help)$/i;
// This generic shape is NOT a brand comparison: benign names such as my-pay-later.com
// also match. Keep this acceptance heuristic evidence-only, never an impersonation claim.
// Review fix #2: the former TRUSTED_DOMAIN_RE whole-message suppressor was removed — one
// official link must never hide a suspicious link elsewhere in the same message. Domain
// flags inspect parsed hostnames, never usernames, paths or queries. APK attachments are
// a separate shape cue, including on otherwise ordinary hosts.

// Instant-loan / easy-money family (R-M4-20, added same-day on the owner's direction after
// two reported scam texts): loan context OR instant-approval wording (including the Singlish
// tokens "ikmanin" (ඉක්මනින්), "dakwa", "danma") + a money amount + a message-supplied link.
// Licensed-bank promos WITHOUT a message link stay silent; a genuine lender promo that does
// include a link would fire — evidence for review, never a verdict (documented limitation).
const LOAN_CTX_RE =
  /\bloans?\b|\bcredit\b|\bno\s+collateral\b|instant\s+(?:approval|loan|cash)|approval\s+in\s+\d+|\b(?:ikmanin|dakwa|danma)\b|(?<![\u0D80-\u0DFF])ණය/iu;
// Currency and amount must be on one line; bound the numeric token rather than bridging
// paragraphs. Grouped amounts such as Rs. 250 000 remain valid; bare large amounts stay
// a documented heuristic, not proof that a number is money.
const LOAN_AMOUNT_RE = /\b(?:lkr|rs\.?|rupees?)[ \t]{0,3}\d(?:[\d,.]|[ \t](?=\d)){0,19}(?![\d,.])|(?<![\d,.])\b\d[\d, \t]{4,18}\d\b(?![\d,.])/i;

// ---- rule table: catalogue hypotheses R-M4-01…R-M4-10 (v0.1) + R-M4-13…20 (v0.2 draft) ----

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
    proximity: { a: 'money-verb', b: 'fee-noun', maxChars: 160, sameClause: false },
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
  // v0.2-draft rows — Sri Lankan scam-landscape adaptation (planning hypotheses).
  {
    id: 'R-M4-13',
    cues: [
      { name: 'prize', re: PRIZE_RE },
      { name: 'claim-demand', re: CLAIM_DEMAND_RE, guarded: true, primary: true },
      { name: 'message-destination', re: DESTINATION_RE },
    ],
  },
  {
    id: 'R-M4-14',
    cues: [
      { name: 'parcel-context', re: PARCEL_CTX_RE },
      { name: 'parcel-demand', re: PARCEL_DEMAND_RE, guarded: true, primary: true },
      { name: 'message-destination', re: DESTINATION_RE },
    ],
  },
  {
    id: 'R-M4-15',
    cues: [
      { name: 'fine-context', re: FINE_CTX_RE, primary: true },
      { name: 'payment-demand', re: PAYMENT_DEMAND_RE, guarded: true },
      { name: 'pressure', re: PRESSURE_RE },
    ],
  },
  {
    id: 'R-M4-16',
    cues: [
      { name: 'txn-context', re: TXN_CTX_RE },
      { name: 'unauthorized-claim', re: UNAUTHORIZED_RE, primary: true },
      { name: 'message-destination', re: DESTINATION_RE },
    ],
  },
  {
    id: 'R-M4-17',
    cues: [
      { name: 'investment-context', re: INVEST_CTX_RE },
      { name: 'doubling-claim', re: DOUBLING_RE, guarded: true, primary: true },
    ],
    // Disclaimers never suppress an affirmative promise. The cue guard excludes direct
    // negations and dated historical growth, rather than clearing an entire message.
  },
  {
    id: 'R-M4-18',
    cues: [{ name: 'shortened-url', re: SHORTENER_RE, primary: true }],
  },
  {
    id: 'R-M4-19',
    cues: [{ name: 'hostile-link-shape', re: HOSTILE_SHAPE_RE, primary: true }],
    // Review fix #2 (24 Oct 2026): the former whole-message trusted-domain suppressor let one
    // official link (e.g. payment.ceb.lk) launder a scam link elsewhere in the same message.
    // Each candidate is checked on its own hostname/attachment shape; no domain reference
    // clears a different candidate, and a shape flag never proves maliciousness.
  },
  {
    id: 'R-M4-20',
    cues: [
      { name: 'loan-context', re: LOAN_CTX_RE, primary: true },
      { name: 'money-amount', re: LOAN_AMOUNT_RE },
      { name: 'message-destination', re: DESTINATION_RE },
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

function negated(seg: Segment, cueStart: number, cue: Cue, value: string): boolean {
  const from = Math.max(0, cueStart - seg.start - 80);
  // A new affirmative instruction ends the scope of an earlier prohibition.
  const prefix = seg.text.slice(from, cueStart - seg.start)
    .split(INSTRUCTION_BREAK_RE).at(-1) ?? '';
  // Ignored or bypassed records are not affirmative verification context and must not suppress the invoice rule.
  if (cue.name === 'order-context' && /\b(?:ignore|skip|bypass|disregard)\b/i.test(prefix)) return true;
  // "If you are asked for your OTP …" style warnings describe the scammer's ask — they are
  // not a demand by this message. A bare conditional prefix suppresses disclosure demands.
  if (cue.name === 'disclosure-demand' && /\bif\b/i.test(prefix)) return true;
  if (/^(?:is\s+due|payable)$/i.test(value) && /\b(?:if|whether)\b/i.test(prefix)) return true;
  if (cue.name === 'doubling-claim') {
    if (/\b(?:not|never|no|without|cannot|can'?t)\s+(?:(?:a|any|necessarily|ever|be|been|being|to|promise|offer|expect|ensure)\s+)*$/i.test(prefix)) return true;
    if (/^doubled$/i.test(value) && !/\b(?:is|are|be|gets?)\s*$/i.test(prefix)) {
      const suffix = seg.text.slice(cueStart - seg.start + value.length);
      const dated = /^\s+(?:in\s+value\s+)?(?:(?:over|during|in)\s+)?(?:the\s+)?(?:last|past|previous)\s+(?:(?:\d+|one|two|three|five|ten|twenty)\s+)?(?:years?|months?|decades?|quarters?)\b/i;
      const elapsedYears = /^\s+(?:in\s+value\s+)?over\s+(?:\d+|one|two|three|five|ten|twenty)\s+(?:years?|decades?)\b/i;
      const perfectPast = /\b(?:has|have|had)\s+(?:already\s+)?$/i.test(prefix);
      const prospective = /\b(?:will|would|shall|should|could|can|may|might)\b|\bto\s+have\b/i.test(prefix);
      if (!prospective && (dated.test(suffix) || (perfectPast && elapsedYears.test(suffix)))) return true;
    }
    return false;
  }
  // Negating a different verb does not negate a fee/information noun: for example,
  // "cannot confirm your entry until the fee arrives" still requests that fee.
  if (['fee-noun', 'job-fee', 'credential'].includes(cue.name)) {
    return NO_NOUN_RE.test(prefix) || /\bwithout\s+(?:\w+\s+){0,3}$/i.test(prefix);
  }
  return NEGATION_RE.test(prefix) || NO_NOUN_RE.test(prefix);
}

/** Parse syntax locally only; URL construction never fetches or resolves a destination. */
function hasHostileShape(value: string): boolean {
  const candidate = value.replace(/[.,;:!?)}\]]+$/, '');
  if (!/^(?:https?:\/\/|www\.)/i.test(candidate) && /\.apk$/i.test(candidate)) return true;
  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    const host = url.hostname.replace(/\.+$/, '');
    return HOSTILE_TLD_RE.test(host) || LOOKALIKE_HOST_RE.test(host) || /\.apk(?:$|\/)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function hasShortenerHost(value: string): boolean {
  try {
    const candidate = value.replace(/[.,;:!?)}\]]+$/, '');
    const hasScheme = /^https?:\/\//i.test(candidate);
    const url = new URL(hasScheme ? candidate : `https://${candidate}`);
    // Bare email tokens are not URLs, even if their mail host is itself a shortener.
    // Consume the complete token (including Unicode/suffixes) before host validation.
    if (!hasScheme && url.username.length > 0) return false;
    return SHORTENER_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

function cueSpans(text: string, segs: Segment[], cue: Cue): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(new RegExp(cue.re.source, cue.re.flags.includes('g') ? cue.re.flags : cue.re.flags + 'g'))) {
    const start = m.index ?? 0;
    const value = m[0];
    if (cue.name === 'hostile-link-shape' && !hasHostileShape(value)) continue;
    if (cue.name === 'shortened-url' && !hasShortenerHost(value)) continue;
    if (cue.guarded) {
      const seg = segs.find((s) => start >= s.start && start < s.start + s.text.length);
      if (seg && negated(seg, start, cue, value)) continue;
    }
    out.push({ start, end: start + value.length, value });
  }
  return out;
}

function sameClauseWithin(segs: Segment[], a: Span, b: Span, maxChars: number): boolean {
  if (Math.abs(a.start - b.start) > maxChars) return false;
  return segs.some((s) => a.start >= s.start && a.start < s.start + s.text.length && b.start >= s.start && b.start < s.start + s.text.length &&
    !INSTRUCTION_BREAK_RE.test(s.text.slice(Math.min(a.start, b.start) - s.start, Math.max(a.start, b.start) - s.start)));
}

// Draft context bound, independent of the server's input cap. Cues may span nearby
// sentences, but an explicit change of topic cannot supply evidence for another request.
const CONTEXT_CHARS = 320;
function connected(text: string, spans: Span[]): boolean {
  const start = Math.min(...spans.map((s) => s.start));
  const end = Math.max(...spans.map((s) => s.end));
  return end - start <= CONTEXT_CHARS &&
    !/\b(?:separately|unrelated(?:ly)?|on\s+another\s+topic|independently(?=\s*[,;:]))\b/i.test(text.slice(start, end));
}

/** Bind evidence to a qualifying pair first, then attach only nearby context cues. */
function selectEvidence(text: string, segs: Segment[], rule: Rule, found: Map<string, Span[]>): Span | undefined {
  const primary = rule.cues.find((c) => c.primary) ?? rule.cues[0];
  const anchors: Map<string, Span>[] = [];
  if (rule.proximity) {
    const { a, b, maxChars, sameClause = true } = rule.proximity;
    for (const left of found.get(a) ?? []) {
      for (const right of found.get(b) ?? []) {
        if (Math.abs(left.start - right.start) > maxChars || !connected(text, [left, right])) continue;
        if (sameClause && !sameClauseWithin(segs, left, right, maxChars)) continue;
        anchors.push(new Map([[a, left], [b, right]]));
      }
    }
  } else {
    for (const span of found.get(primary.name) ?? []) anchors.push(new Map([[primary.name, span]]));
  }
  for (const selected of anchors) {
    const anchor = selected.get(primary.name);
    if (!anchor) continue;
    for (const cue of rule.cues) {
      if (selected.has(cue.name)) continue;
      const nearest = (found.get(cue.name) ?? [])
        .filter((span) => connected(text, [...selected.values(), span]))
        .sort((a, b) => Math.abs(a.start - anchor.start) - Math.abs(b.start - anchor.start))[0];
      if (!nearest) break;
      selected.set(cue.name, nearest);
    }
    if (selected.size !== rule.cues.length) continue;
    const suppressed = rule.noneOf?.some((cue) => cueSpans(text, segs, cue)
      .some((span) => connected(text, [...selected.values(), span])));
    if (!suppressed) return anchor;
  }
  return undefined;
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

    const primary = rule.cues.find((c) => c.primary) ?? rule.cues[0];
    const excerpt = selectEvidence(text, segs, rule, found);
    if (!excerpt) continue;
    matches.push({ ruleId: rule.id, excerpt: excerpt.value, start: excerpt.start, end: excerpt.end, contextNote: primary.name });
  }

  return { matches };
}

/**
 * R-M4-11 stub — explicit display/target metadata check ONLY.
 * Plain text never triggers this rule. Shortener and abuse-TLD/.apk shape flags for plain
 * text now live in R-M4-18/R-M4-19 (v0.2); misspelling detection and a subdomain-depth
 * threshold remain OPEN in the catalogue. Engineering acceptance rules; no fetching.
 */
export function checkDisplayTarget(display?: string, target?: string): RuleMatch[] {
  if (!display || !target) return [];
  if (display.trim() === target.trim()) return [];
  return [{ ruleId: 'R-M4-11', excerpt: target, start: 0, end: target.length, contextNote: 'display-target mismatch' }];
}
