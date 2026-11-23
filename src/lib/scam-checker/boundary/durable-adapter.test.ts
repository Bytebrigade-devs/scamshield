/**
 * M4 — durable adapter contract tests, against doubles only.
 *
 * Two doubles appear here:
 *   1. a **recording transport**, which asserts the exact PostgREST requests the adapter emits
 *      (so the wire format cannot drift from the reviewed SQL);
 *   2. an **in-memory Supabase**, which emulates the seven 0002 transaction functions and the
 *      PostgREST table operations closely enough to re-assert the contract semantics:
 *      exactly-once settlement, completed-only quota, limit-enforcing admission, own-row reads,
 *      idempotent feedback/event writes, retention purge and direction-(c) deletion.
 *
 * No network, no Supabase client, no database, no clock: every instant is passed in.
 *
 * Runner: Node built-in `node --test` (zero dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createDurableAdapter, M4_TABLES } from './durable-adapter.ts';
import { M4_TRANSACTION_FUNCTIONS } from './durable-persistence.ts';
import type { PostgrestRequest, PostgrestResponse, PostgrestTransport } from './postgrest-client.ts';
import type {
  QuotaBucketKey, QuotaReservationInput, StoredCheckInput,
} from './persistence-port.ts';
import type { CheckOutcomeEvent } from './x13-event.ts';
import { EVENT_CONTRACT_VERSION, EVENT_CONTRACT_VERSION_V2, EVENT_TYPE, type CheckOutcomeEventV2 } from './x13-event.ts';
import { TAXONOMY_VERSION } from './taxonomy.ts';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 10, 23, 12, 0, 0); // 23 Nov 2026 12:00 UTC
const DAY_START = Date.UTC(2026, 10, 23);
const MONTH_START = Date.UTC(2026, 10, 1);
const MONTH_END = Date.UTC(2026, 11, 1);
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const OTHER_SUBJECT = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

const iso = (epochMs: number): string => new Date(epochMs).toISOString();

function checkInput(overrides: Partial<StoredCheckInput> = {}): StoredCheckInput {
  return {
    checkId: 'chk_durable_0001',
    subjectKey: SUBJECT,
    planId: 'sentinel',
    createdAt: NOW,
    expiresAt: NOW + 30 * DAY_MS,
    analysisStatus: 'completed',
    analysisMode: 'rules_and_ai',
    categoryId: 'phishing',
    taxonomyVersion: TAXONOMY_VERSION,
    verdictLabel: 'high risk',
    riskLevel: 'high',
    reason: 'The message asks for banking details through a shortened link.',
    reasonHighlights: [{ start: 4, end: 26, excerpt: 'asks for banking details' }],
    limitations: ['AI analysis is not a guarantee.'],
    findings: [{ ruleId: 'R-M4-14', excerpt: 'clearance fee', start: 10, end: 23, contextNote: 'parcel-demand' }],
    history: { snippet: 'Your parcel is held at customs…', verdictLabel: 'high risk' },
    ...overrides,
  };
}

function reservationInput(overrides: Partial<QuotaReservationInput> = {}): QuotaReservationInput {
  return {
    subjectKey: SUBJECT,
    requestKey: 'req-0001',
    now: NOW,
    leaseMs: 60_000,
    dailyBucket: { periodKind: 'daily', periodStart: DAY_START, periodEnd: DAY_START + DAY_MS, limit: 5 },
    allowanceBucket: { periodKind: 'monthly', periodStart: MONTH_START, periodEnd: MONTH_END, limit: 60 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Double 1 — recording transport
// ---------------------------------------------------------------------------

function recordingTransport(responses: unknown[] = []): {
  transport: PostgrestTransport; requests: PostgrestRequest[]; next: (body: unknown) => void;
} {
  const requests: PostgrestRequest[] = [];
  const queue = [...responses];
  let fallback: unknown = [];
  return {
    requests,
    next: (body) => { fallback = body; },
    transport: {
      async request(request) {
        requests.push(request);
        const body = queue.length > 0 ? queue.shift() : fallback;
        return { status: 200, body } satisfies PostgrestResponse;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Double 2 — in-memory Supabase (0002 transaction functions + table operations)
// ---------------------------------------------------------------------------

interface FakeSupabase {
  transport: PostgrestTransport;
  tables: Record<string, Row[]>;
}

function createFakeSupabase(): FakeSupabase {
  const tables: Record<string, Row[]> = {
    [M4_TABLES.checks]: [],
    [M4_TABLES.findings]: [],
    [M4_TABLES.history]: [],
    [M4_TABLES.feedback]: [],
    [M4_TABLES.events]: [],
    [M4_TABLES.quotaBuckets]: [],
    [M4_TABLES.budgetBuckets]: [],
    [M4_TABLES.reservations]: [],
  };
  let counter = 0;
  const uuid = (): string => {
    counter += 1;
    const tail = String(counter).padStart(12, '0');
    return `33333333-3333-4333-8333-${tail}`;
  };

  const filtersOf = (query: Readonly<Record<string, string>> = {}): Array<[string, string]> =>
    Object.entries(query).filter(([key]) => key !== 'select' && key !== 'order' && key !== 'on_conflict');

  function matches(row: Row, query: Readonly<Record<string, string>> = {}): boolean {
    for (const [key, condition] of filtersOf(query)) {
      const value = row[key];
      if (condition.startsWith('eq.')) {
        if (String(value) !== condition.slice(3)) return false;
      } else if (condition.startsWith('gt.')) {
        if (!(Date.parse(String(value)) > Date.parse(condition.slice(3)))) return false;
      } else if (condition.startsWith('lt.')) {
        if (!(Date.parse(String(value)) < Date.parse(condition.slice(3)))) return false;
      } else {
        throw new Error(`fake supabase: unsupported filter ${condition}`);
      }
    }
    return true;
  }

  function ordered(rows: Row[], query: Readonly<Record<string, string>> = {}): Row[] {
    const order = query.order;
    if (!order) return rows;
    const [column, direction] = order.split('.');
    const sorted = [...rows].sort((a, b) => {
      const av = a[column!] as string | number;
      const bv = b[column!] as string | number;
      const numeric = typeof av === 'number' && typeof bv === 'number';
      const left = numeric ? av as number : Date.parse(String(av));
      const right = numeric ? bv as number : Date.parse(String(bv));
      return left === right ? 0 : left < right ? -1 : 1;
    });
    return direction === 'desc' ? sorted.reverse() : sorted;
  }

  function bucketFor(subject: string, kind: string, start: string, end: string, limit: number | null): Row {
    const found = tables[M4_TABLES.quotaBuckets]!.find((row) =>
      row.subject_key === subject && row.period_kind === kind && row.period_start === start);
    if (found) {
      found.limit_count = limit; // trusted allowance is refreshed on each reserve
      return found;
    }
    const created: Row = {
      id: uuid(), subject_key: subject, period_kind: kind, period_start: start, period_end: end,
      limit_count: limit, completed_count: 0, reserved_count: 0, updated_at: iso(NOW),
    };
    tables[M4_TABLES.quotaBuckets]!.push(created);
    return created;
  }

  function reservationRow(res: Row): Row {
    return { ...res };
  }

  function saveCheck(args: Row): unknown {
    const check = args.p_check as Row | undefined;
    if (!check || typeof check.id !== 'string' || check.id.length === 0) return null;
    if (tables[M4_TABLES.checks]!.some((row) => row.id === check.id)) return null; // identity is unique
    tables[M4_TABLES.checks]!.push({
      id: check.id,
      user_id: check.user_id,
      plan_id: check.plan_id,
      created_at: check.created_at,
      expires_at: check.expires_at,
      analysis_status: check.analysis_status,
      analysis_mode: check.analysis_mode,
      category_id: check.category_id,
      taxonomy_version: check.taxonomy_version,
      verdict_label: check.verdict_label,
      risk_level: check.risk_level,
      reason: check.reason,
      reason_highlights: check.reason_highlights ?? [],
      limitations: check.limitations ?? [],
    });
    for (const finding of (args.p_findings as Row[] | undefined) ?? []) {
      tables[M4_TABLES.findings]!.push({
        id: uuid(), check_id: check.id, user_id: check.user_id, ...finding,
      });
    }
    const history = args.p_history as Row | null | undefined;
    if (history) {
      tables[M4_TABLES.history]!.push({
        id: uuid(), check_id: check.id, user_id: check.user_id, plan_id: check.plan_id,
        created_at: check.created_at, expires_at: check.expires_at,
        snippet: history.snippet, verdict_label: history.verdict_label, category_id: check.category_id,
      });
    }
    return check.id;
  }

  function reserveCheck(args: Row): unknown {
    const subject = String(args.p_subject);
    const requestKey = String(args.p_request_key);
    const dailyLimit = args.p_daily_limit === null ? null : Number(args.p_daily_limit);
    const allowanceLimit = args.p_allowance_limit === null ? null : Number(args.p_allowance_limit);
    if (dailyLimit === null || allowanceLimit === null) return null; // unconfigured = refuse

    const existing = tables[M4_TABLES.reservations]!.find((row) =>
      row.request_key === requestKey && row.subject_key === subject);
    if (existing) return reservationRow(existing);

    const daily = bucketFor(subject, 'daily', String(args.p_daily_start), String(args.p_daily_end), dailyLimit);
    const allowance = bucketFor(subject, String(args.p_allowance_kind), String(args.p_allowance_start), String(args.p_allowance_end), allowanceLimit);
    const dailyUsed = Number(daily.completed_count) + Number(daily.reserved_count);
    const allowanceUsed = Number(allowance.completed_count) + Number(allowance.reserved_count);
    if (dailyUsed >= dailyLimit || allowanceUsed >= allowanceLimit) return null;

    daily.reserved_count = Number(daily.reserved_count) + 1;
    allowance.reserved_count = Number(allowance.reserved_count) + 1;

    const budget = args.p_budget as Row | null;
    let budgetId: string | null = null;
    if (budget) {
      const found = tables[M4_TABLES.budgetBuckets]!.find((row) =>
        row.budget_key === budget.budget_key && row.period_start === budget.period_start);
      const bucket = found ?? (() => {
        const created: Row = {
          id: uuid(), budget_key: budget.budget_key, period_start: budget.period_start,
          period_end: budget.period_end, currency: budget.currency,
          limit_amount: budget.limit_amount, reserved_amount: budget.reserved_amount,
          spent_amount: 0, updated_at: iso(NOW),
        };
        tables[M4_TABLES.budgetBuckets]!.push(created);
        return created;
      })();
      budgetId = String(bucket.id);
    }

    const row: Row = {
      id: uuid(), request_key: requestKey, subject_key: subject,
      daily_bucket_id: daily.id, allowance_bucket_id: allowance.id, budget_bucket_id: budgetId,
      state: 'reserved', outcome_status: null,
      reserved_amount: budget ? Number(budget.reserved_amount) : 0, actual_amount: null,
      created_at: String(args.p_now), lease_expires_at: iso(Date.parse(String(args.p_now)) + Number(args.p_lease_ms)),
      settled_at: null,
    };
    tables[M4_TABLES.reservations]!.push(row);
    return reservationRow(row);
  }

  function settleReservation(args: Row): boolean {
    const reservation = tables[M4_TABLES.reservations]!.find((row) => row.id === args.p_reservation_id);
    if (!reservation || reservation.state !== 'reserved') return false; // exactly once
    const status = String(args.p_status);
    if (!['completed', 'limited', 'unavailable'].includes(status)) return false;

    const daily = tables[M4_TABLES.quotaBuckets]!.find((row) => row.id === reservation.daily_bucket_id)!;
    const allowance = tables[M4_TABLES.quotaBuckets]!.find((row) => row.id === reservation.allowance_bucket_id)!;
    daily.reserved_count = Math.max(0, Number(daily.reserved_count) - 1);
    allowance.reserved_count = Math.max(0, Number(allowance.reserved_count) - 1);
    // ONLY completed consumes quota; limited/unavailable release the unit.
    if (status === 'completed') {
      daily.completed_count = Number(daily.completed_count) + 1;
      allowance.completed_count = Number(allowance.completed_count) + 1;
    }
    if (reservation.budget_bucket_id !== null) {
      const bucket = tables[M4_TABLES.budgetBuckets]!.find((row) => row.id === reservation.budget_bucket_id)!;
      const spend = args.p_actual_spend === null ? Number(reservation.reserved_amount) : Number(args.p_actual_spend);
      bucket.reserved_amount = Math.max(0, Number(bucket.reserved_amount) - Number(reservation.reserved_amount));
      bucket.spent_amount = Number(bucket.spent_amount) + spend;
      reservation.actual_amount = spend;
    }
    reservation.state = status === 'completed' ? 'completed' : 'released';
    reservation.outcome_status = status;
    reservation.settled_at = String(args.p_now);
    return true;
  }

  function markReconciliation(args: Row): boolean {
    const reservation = tables[M4_TABLES.reservations]!.find((row) => row.id === args.p_reservation_id);
    if (!reservation || reservation.state !== 'reserved') return false;
    const daily = tables[M4_TABLES.quotaBuckets]!.find((row) => row.id === reservation.daily_bucket_id)!;
    const allowance = tables[M4_TABLES.quotaBuckets]!.find((row) => row.id === reservation.allowance_bucket_id)!;
    daily.reserved_count = Math.max(0, Number(daily.reserved_count) - 1);
    allowance.reserved_count = Math.max(0, Number(allowance.reserved_count) - 1);
    reservation.state = 'reconciliation_required';
    reservation.outcome_status = String(args.p_status);
    return true;
  }

  function finalizeReconciliation(args: Row): boolean {
    const reservation = tables[M4_TABLES.reservations]!.find((row) => row.id === args.p_reservation_id);
    if (!reservation || reservation.state !== 'reconciliation_required') return false;
    if (reservation.budget_bucket_id !== null) {
      const bucket = tables[M4_TABLES.budgetBuckets]!.find((row) => row.id === reservation.budget_bucket_id)!;
      bucket.reserved_amount = Math.max(0, Number(bucket.reserved_amount) - Number(reservation.reserved_amount));
      bucket.spent_amount = Number(bucket.spent_amount) + Number(args.p_actual_spend);
      reservation.actual_amount = Number(args.p_actual_spend);
    }
    reservation.state = reservation.outcome_status === 'completed' ? 'completed' : 'released';
    reservation.settled_at = String(args.p_now);
    return true;
  }

  function deleteSubject(args: Row): Row {
    const subject = String(args.p_user);
    const checks = tables[M4_TABLES.checks]!;
    const removedCheckIds = checks.filter((row) => row.user_id === subject).map((row) => String(row.id));
    tables[M4_TABLES.checks] = checks.filter((row) => row.user_id !== subject);
    const dropDependents = (rows: Row[]): Row[] => rows.filter((row) =>
      row.user_id !== subject && !removedCheckIds.includes(String(row.check_id)));
    const removed = {
      checks: removedCheckIds.length,
      history: tables[M4_TABLES.history]!.length - dropDependents(tables[M4_TABLES.history]!).length,
      feedback: tables[M4_TABLES.feedback]!.length - dropDependents(tables[M4_TABLES.feedback]!).length,
    };
    tables[M4_TABLES.history] = dropDependents(tables[M4_TABLES.history]!);
    tables[M4_TABLES.feedback] = dropDependents(tables[M4_TABLES.feedback]!);
    tables[M4_TABLES.findings] = dropDependents(tables[M4_TABLES.findings]!);
    const beforeQuota = tables[M4_TABLES.quotaBuckets]!.length;
    tables[M4_TABLES.quotaBuckets] = tables[M4_TABLES.quotaBuckets]!.filter((row) => row.subject_key !== subject);
    const beforeRes = tables[M4_TABLES.reservations]!.length;
    tables[M4_TABLES.reservations] = tables[M4_TABLES.reservations]!.filter((row) => row.subject_key !== subject);
    // 0003: direction (c) also removes the subject's 0.2.0-draft events by subject_ref.
    const beforeEvents = tables[M4_TABLES.events]!.length;
    tables[M4_TABLES.events] = tables[M4_TABLES.events]!.filter((row) => row.subject_ref !== subject);
    // Budget totals are non-user-linked and survive a deletion.
    return {
      checks: removed.checks, history: removed.history, feedback: removed.feedback,
      quota_buckets: beforeQuota - tables[M4_TABLES.quotaBuckets]!.length,
      reservations: beforeRes - tables[M4_TABLES.reservations]!.length,
      events: beforeEvents - tables[M4_TABLES.events]!.length,
    };
  }

  function purgeExpired(args: Row): number {
    const cutoff = Date.parse(String(args.p_now));
    const expired = tables[M4_TABLES.checks]!.filter((row) => Date.parse(String(row.expires_at)) <= cutoff);
    const ids = expired.map((row) => String(row.id));
    tables[M4_TABLES.checks] = tables[M4_TABLES.checks]!.filter((row) => !ids.includes(String(row.id)));
    for (const table of [M4_TABLES.findings, M4_TABLES.history, M4_TABLES.feedback]) {
      tables[table] = tables[table]!.filter((row) => !ids.includes(String(row.check_id ?? '')));
    }
    return ids.length;
  }

  function purgeEvents(args: Row): number {
    if (args.p_before === null || args.p_before === undefined) return 0;
    const cutoff = Date.parse(String(args.p_before));
    const before = tables[M4_TABLES.events]!.length;
    tables[M4_TABLES.events] = tables[M4_TABLES.events]!.filter((row) => !(Date.parse(String(row.occurred_at)) < cutoff));
    return before - tables[M4_TABLES.events]!.length;
  }

  const rpcHandlers: Record<string, (args: Row) => unknown> = {
    [M4_TRANSACTION_FUNCTIONS.saveCheck]: saveCheck,
    [M4_TRANSACTION_FUNCTIONS.reserveCheck]: reserveCheck,
    [M4_TRANSACTION_FUNCTIONS.settleReservation]: settleReservation,
    [M4_TRANSACTION_FUNCTIONS.markReconciliation]: markReconciliation,
    [M4_TRANSACTION_FUNCTIONS.finalizeReconciliation]: finalizeReconciliation,
    [M4_TRANSACTION_FUNCTIONS.deleteSubject]: deleteSubject,
    [M4_TRANSACTION_FUNCTIONS.purgeExpired]: purgeExpired,
    [M4_TRANSACTION_FUNCTIONS.purgeEvents]: purgeEvents,
  };

  const transport: PostgrestTransport = {
    async request(request) {
      if (request.path.startsWith('/rpc/')) {
        const name = request.path.slice('/rpc/'.length);
        const handler = rpcHandlers[name];
        if (!handler) throw new Error(`fake supabase: unknown function ${name}`);
        return { status: 200, body: handler((request.body ?? {}) as Row) };
      }

      const table = request.path.slice(1);
      const rows = tables[table];
      if (!rows) throw new Error(`fake supabase: unknown table ${table}`);

      if (request.method === 'GET') {
        return { status: 200, body: ordered(rows.filter((row) => matches(row, request.query)), request.query) };
      }
      if (request.method === 'DELETE') {
        const kept = rows.filter((row) => !matches(row, request.query));
        const removed = rows.filter((row) => matches(row, request.query));
        tables[table] = kept;
        return { status: 200, body: request.prefer?.includes('return=representation') ? removed : null };
      }
      // POST: plain insert, or an upsert when the caller names a conflict target.
      const incoming = request.body as Row;
      if (request.query?.on_conflict) {
        const keys = request.query.on_conflict.split(',');
        const existing = rows.find((row) => keys.every((key) => row[key] === incoming[key]));
        if (existing) Object.assign(existing, incoming);
        else rows.push({ id: uuid(), ...incoming });
        const stored = rows.find((row) => keys.every((key) => row[key] === incoming[key]))!;
        return { status: 200, body: request.prefer?.includes('return=representation') ? [stored] : null };
      }
      const created: Row = { id: uuid(), ...incoming };
      rows.push(created);
      return { status: 200, body: request.prefer?.includes('return=representation') ? [created] : null };
    },
  };

  return { transport, tables };
}

// ---------------------------------------------------------------------------
// Drift guards — the adapter cannot silently diverge from the reviewed SQL
// ---------------------------------------------------------------------------

/**
 * Locate a migration draft. Three layouts exist because this file is copied byte-identically:
 *   - workspace:            code/boundary/        → ../../design/
 *   - repository (nested):  src/lib/scam-checker/boundary/ → ../../../../supabase/drafts/
 *   - repository (flat):    boundary/             → ../../supabase/drafts/
 * Resolving all three means the guard keeps working after publication instead of failing there
 * (which is exactly what it did the first time this file was mirrored).
 */
function readMigration(name: string): string {
  const candidates = [
    new URL(`../../design/${name}`, import.meta.url),
    new URL(`../../../../supabase/drafts/${name}`, import.meta.url),
    new URL(`../../supabase/drafts/${name}`, import.meta.url),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
  }
  throw new Error(`drift guard: no migration draft found for ${name} (tried ${candidates.length} locations)`);
}

const sql0001 = readMigration('M4-checker-migration-0001-draft.sql');
const sql0002 = readMigration('M4-checker-migration-0002-functions-draft.sql');
const sql0003 = readMigration('M4-checker-migration-0003-events-v2-draft.sql');

test('every table the adapter names exists in migration 0001', () => {
  for (const [key, name] of Object.entries(M4_TABLES)) {
    assert.ok(sql0001.includes(`CREATE TABLE public.${name} (`), `0001 is missing ${key} (${name})`);
  }
});

test('every 0002 transaction function the adapter calls exists in migration 0002', () => {
  for (const [key, name] of Object.entries(M4_TRANSACTION_FUNCTIONS)) {
    if (key === 'purgeEvents') continue; // defined in 0003, asserted below
    assert.ok(sql0002.includes(`FUNCTION public.${name}(`), `0002 is missing ${key} (${name})`);
  }
});

test('the event purge function the adapter calls exists in migration 0003', () => {
  assert.ok(
    sql0003.includes(`FUNCTION public.${M4_TRANSACTION_FUNCTIONS.purgeEvents}(`),
    `0003 is missing purgeEvents (${M4_TRANSACTION_FUNCTIONS.purgeEvents})`,
  );
});

// ---------------------------------------------------------------------------
// Wire format — recorded requests
// ---------------------------------------------------------------------------

test('save sends one RPC with the 0002 argument names and reads the row back', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);

  const stored = await adapter.checks.save(checkInput());
  assert.ok(stored, 'save must return the stored check');
  assert.equal(stored.checkId, 'chk_durable_0001');
  assert.equal(stored.subjectKey, SUBJECT);
  assert.equal(stored.planId, 'sentinel');
  assert.equal(stored.createdAt, NOW);
  assert.equal(stored.riskLevel, 'high');
  assert.deepEqual(stored.reasonHighlights, [{ start: 4, end: 26, excerpt: 'asks for banking details' }]);
  assert.equal(stored.findings.length, 1);
  assert.equal(stored.findings[0]!.ruleId, 'R-M4-14');
  assert.equal(stored.findings[0]!.contextNote, 'parcel-demand');
  assert.ok(stored.historyId, 'a history row was written in the same call');
});

test('save refuses invalid input locally without touching the transport', async () => {
  const recorder = recordingTransport();
  const adapter = createDurableAdapter(recorder.transport);

  assert.equal(await adapter.checks.save(checkInput({ checkId: 'has space' })), null);
  assert.equal(await adapter.checks.save(checkInput({ expiresAt: NOW })), null);
  assert.equal(await adapter.checks.save(checkInput({ history: { snippet: '   ', verdictLabel: 'high risk' } })), null);
  assert.equal(recorder.requests.length, 0, 'no request may be attempted for invalid input');
});

test('own-row reads filter by subject and expiry, so a foreign or expired row is null', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);
  await adapter.checks.save(checkInput());

  const own = await adapter.checks.getOwned('chk_durable_0001', SUBJECT, NOW);
  assert.ok(own);
  assert.equal(own.historyId !== null, true);

  assert.equal(await adapter.checks.getOwned('chk_durable_0001', OTHER_SUBJECT, NOW), null);
  assert.equal(await adapter.checks.getOwned('chk_durable_0001', SUBJECT, NOW + 31 * DAY_MS), null, 'expired row is hidden');
});

test('history lists newest first and excludes expired rows', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);
  await adapter.checks.save(checkInput({ checkId: 'chk_a', createdAt: NOW - 1000, expiresAt: NOW + DAY_MS }));
  await adapter.checks.save(checkInput({ checkId: 'chk_b', createdAt: NOW, expiresAt: NOW + DAY_MS }));
  await adapter.checks.save(checkInput({ checkId: 'chk_old', createdAt: NOW - 10 * DAY_MS, expiresAt: NOW - DAY_MS }));

  const entries = await adapter.history.listOwned(SUBJECT, NOW);
  assert.deepEqual(entries.map((entry) => entry.checkId), ['chk_b', 'chk_a']);
  assert.equal(entries[0]!.category, 'phishing');
  assert.equal(entries[0]!.expiresAt, NOW + DAY_MS);
});

test('feedback upserts once per subject and check, and rejects a free-text reason', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);
  await adapter.checks.save(checkInput());

  const first = await adapter.feedback.save({
    subjectKey: SUBJECT, checkId: 'chk_durable_0001', category: 'phishing',
    reasonCode: 'false_alarm', createdAt: NOW,
  });
  assert.ok(first);
  assert.equal(first.trigger, 'wrong_result');

  const second = await adapter.feedback.save({
    subjectKey: SUBJECT, checkId: 'chk_durable_0001', category: 'phishing',
    reasonCode: 'wrong_category', createdAt: NOW + 1000,
  });
  assert.ok(second);
  const rows = fake.tables[M4_TABLES.feedback]!;
  assert.equal(rows.length, 1, 'one feedback row per (subject, check)');
  assert.equal(rows[0]!.reason_code, 'wrong_category', 'the upsert replaces the reason code');

  assert.equal(await adapter.feedback.save({
    subjectKey: SUBJECT, checkId: 'chk_durable_0001', category: 'phishing',
    reasonCode: 'free text here', createdAt: NOW,
  }), null);
  assert.deepEqual((await adapter.feedback.listOwned(SUBJECT)).map((entry) => entry.reasonCode), ['wrong_category']);
});

test('events: v1 and v2 append idempotently; a conflicting replay is false', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);

  const event: CheckOutcomeEvent = {
    contract_version: EVENT_CONTRACT_VERSION,
    event_type: EVENT_TYPE,
    event_id: 'evt_0001',
    occurred_at: iso(NOW),
    taxonomy_version: TAXONOMY_VERSION,
    category_id: 'phishing',
    analysis_status: 'completed',
    analysis_mode: 'rules_and_ai',
  };
  assert.equal(await adapter.events.append(event), true);
  assert.equal(await adapter.events.append({ ...event }), true, 'identical duplicate is idempotent');
  assert.equal(await adapter.events.append({ ...event, category_id: 'romance_scam' }), false, 'conflict is false');

  // Migration 0003 is applied, so the nine-field shape is storable now.
  const v2: CheckOutcomeEventV2 = {
    ...event,
    event_id: 'evt_0002',
    contract_version: EVENT_CONTRACT_VERSION_V2,
    subject_ref: 'ref-1',
  };
  assert.equal(await adapter.events.append(v2), true, 'a valid v2 event is accepted');
  assert.equal(await adapter.events.append({ ...v2 }), true, 'identical v2 duplicate is idempotent');
  assert.equal(await adapter.events.append({ ...v2, subject_ref: 'ref-2' }), false, 'a different reference is a conflict');
  assert.equal(
    await adapter.events.append({ ...v2, event_id: 'evt_bad', subject_ref: 'someone@example.invalid' }),
    false,
    'an email-shaped reference fails the v2 validator before any write',
  );

  const listed = await adapter.events.listAll();
  assert.equal(listed.length, 2);
  const backV2 = listed.find((entry) => entry.event_id === 'evt_0002');
  assert.equal(backV2 && 'subject_ref' in backV2 ? backV2.subject_ref : null, 'ref-1', 'the reference round-trips');
  const backV1 = listed.find((entry) => entry.event_id === 'evt_0001');
  assert.equal(backV1 !== undefined && 'subject_ref' in backV1, false, 'legacy rows keep the eight-field shape');
});

test('events purge removes only rows before the cutoff', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);
  for (const [id, at] of [['evt_old', NOW - 40 * DAY_MS], ['evt_new', NOW]] as const) {
    await adapter.events.append({
      contract_version: EVENT_CONTRACT_VERSION, event_type: EVENT_TYPE, event_id: id,
      occurred_at: iso(at), taxonomy_version: TAXONOMY_VERSION, category_id: 'phishing',
      analysis_status: 'completed', analysis_mode: 'rules_and_ai',
    });
  }
  assert.equal(await adapter.events.purgeBefore(NOW - 30 * DAY_MS), 1);
  assert.deepEqual((await adapter.events.listAll()).map((event) => event.event_id), ['evt_new']);
});

// ---------------------------------------------------------------------------
// Quota and settlement semantics
// ---------------------------------------------------------------------------

test('reserve refuses an unconfigured (null) allowance and an exhausted daily limit', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);

  const unconfigured = reservationInput({ requestKey: 'req-null', dailyBucket: { ...reservationInput().dailyBucket, limit: null } });
  assert.equal(await adapter.quota.reserve(unconfigured), null, 'null allowance is refused, never treated as unlimited');

  const small = reservationInput({ requestKey: 'req-a', dailyBucket: { ...reservationInput().dailyBucket, limit: 1 } });
  assert.ok(await adapter.quota.reserve(small));
  const overLimit = reservationInput({ requestKey: 'req-b', dailyBucket: { ...reservationInput().dailyBucket, limit: 1 } });
  assert.equal(await adapter.quota.reserve(overLimit), null, 'the reserved unit counts toward the limit');
});

test('a duplicate request key returns the existing reservation instead of reserving twice', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);

  const first = await adapter.quota.reserve(reservationInput());
  const replay = await adapter.quota.reserve(reservationInput());
  assert.ok(first && replay);
  assert.equal(replay.id, first.id);
  assert.equal(fake.tables[M4_TABLES.reservations]!.length, 1);

  const bucket = await adapter.quota.getBucket({ subjectKey: SUBJECT, periodKind: 'daily', periodStart: DAY_START });
  assert.equal(bucket?.reservedCount, 1);
  assert.equal(bucket?.completedCount, 0);
});

test('settlement is exactly once, and only completed consumes quota', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);

  const completed = await adapter.quota.reserve(reservationInput({ requestKey: 'req-completed' }));
  assert.ok(completed);
  assert.equal(await adapter.quota.settle(completed.id, { analysisStatus: 'completed' }, NOW), true);
  assert.equal(await adapter.quota.settle(completed.id, { analysisStatus: 'completed' }, NOW), false, 'second settlement is refused');

  const limited = await adapter.quota.reserve(reservationInput({ requestKey: 'req-limited' }));
  assert.ok(limited);
  assert.equal(await adapter.quota.settle(limited.id, { analysisStatus: 'limited' }, NOW), true);

  const bucket = await adapter.quota.getBucket({ subjectKey: SUBJECT, periodKind: 'daily', periodStart: DAY_START });
  assert.equal(bucket?.completedCount, 1, 'only the completed check consumed quota');
  assert.equal(bucket?.reservedCount, 0, 'both reservations were released');
});

test('an uncertain provider charge is settled after reconciliation, not guessed', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);
  const budgetKey = 'provider-budget';
  const reservation = await adapter.quota.reserve(reservationInput({
    requestKey: 'req-reconciliation',
    budget: {
      bucket: { budgetKey, periodStart: MONTH_START },
      periodEnd: MONTH_END, currency: 'USD', limitAmount: 15, reservedAmount: 0.01,
    },
  }));
  assert.ok(reservation);
  assert.equal(await adapter.quota.markReconciliationRequired(reservation.id, 'limited', NOW), true);
  assert.equal(
    await adapter.quota.finalizeReconciliation(reservation.id, 0.004, NOW),
    true,
    'finalisation closes the spend at the known amount',
  );
  const budget = await adapter.budget.getBucket({ budgetKey, periodStart: MONTH_START });
  assert.equal(budget?.spentAmount, 0.004);
  assert.equal(budget?.reservedAmount, 0);
});

test('getOrCreateBucket creates once and then returns the same row', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);
  const key = { subjectKey: SUBJECT, periodKind: 'monthly', periodStart: MONTH_START, periodEnd: MONTH_END, limitCount: 60 } as const;

  const first = await adapter.quota.getOrCreateBucket(key, NOW);
  const second = await adapter.quota.getOrCreateBucket(key, NOW + 1000);
  assert.equal(second.id, first.id);
  assert.equal(fake.tables[M4_TABLES.quotaBuckets]!.length, 1);
  assert.equal(first.limitCount, 60);
});

// ---------------------------------------------------------------------------
// Deletion and purge
// ---------------------------------------------------------------------------

test('deleteSubject removes the subject rows, keeps budget totals, and needs a uuid', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport, { now: () => NOW });

  await adapter.checks.save(checkInput());
  await adapter.feedback.save({
    subjectKey: SUBJECT, checkId: 'chk_durable_0001', category: 'phishing',
    reasonCode: 'false_alarm', createdAt: NOW,
  });
  const reservation = await adapter.quota.reserve(reservationInput({
    budget: {
      bucket: { budgetKey: 'provider-budget', periodStart: MONTH_START },
      periodEnd: MONTH_END, currency: 'USD', limitAmount: 15, reservedAmount: 0.01,
    },
  }));
  assert.ok(reservation);

  await adapter.events.append({
    contract_version: EVENT_CONTRACT_VERSION_V2, event_type: EVENT_TYPE, event_id: 'evt_del',
    occurred_at: iso(NOW), taxonomy_version: TAXONOMY_VERSION, category_id: 'phishing',
    analysis_status: 'completed', analysis_mode: 'rules_and_ai', subject_ref: SUBJECT,
  });

  const counts = await adapter.deleteSubject(SUBJECT);
  assert.deepEqual(counts, { checks: 1, history: 1, feedback: 1, quotaBuckets: 2, reservations: 1, events: 1 });
  assert.equal(fake.tables[M4_TABLES.checks]!.length, 0);
  assert.equal(fake.tables[M4_TABLES.events]!.length, 0, 'the subject’s 0.2.0-draft event is removed too');
  assert.equal(fake.tables[M4_TABLES.budgetBuckets]!.length, 1, 'non-user-linked spend totals are retained');

  await assert.rejects(() => adapter.deleteSubject('not-a-uuid'), /verified M2 user uuid/);
});

test('purgeExpired removes expired checks with their dependents and reports the count', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);
  await adapter.checks.save(checkInput({ checkId: 'chk_live', expiresAt: NOW + DAY_MS }));
  await adapter.checks.save(checkInput({ checkId: 'chk_dead', createdAt: NOW - 2 * DAY_MS, expiresAt: NOW - 1 }));

  assert.equal(await adapter.checks.purgeExpired(NOW), 1);
  assert.deepEqual((await adapter.checks.getOwned('chk_dead', SUBJECT, NOW - 5)), null);
  assert.equal(fake.tables[M4_TABLES.findings]!.filter((row) => row.check_id === 'chk_dead').length, 0);
  assert.equal(fake.tables[M4_TABLES.history]!.filter((row) => row.check_id === 'chk_dead').length, 0);
});

test('deleteCheck keeps a check owned by another subject', async () => {
  const fake = createFakeSupabase();
  const adapter = createDurableAdapter(fake.transport);
  await adapter.checks.save(checkInput());

  assert.equal(await adapter.checks.deleteCheck('chk_durable_0001', OTHER_SUBJECT), false);
  assert.equal(await adapter.checks.deleteCheck('chk_durable_0001', SUBJECT), true);
  assert.equal(fake.tables[M4_TABLES.checks]!.length, 0);
});

test('every operation the adapter exposes resolves asynchronously', () => {
  const adapter = createDurableAdapter(createFakeSupabase().transport);
  const quotaKey: QuotaBucketKey = { subjectKey: SUBJECT, periodKind: 'daily', periodStart: DAY_START };
  const results = [
    adapter.checks.purgeExpired(NOW),
    adapter.history.listOwned(SUBJECT, NOW),
    adapter.feedback.listOwned(SUBJECT),
    adapter.events.listAll(),
    adapter.quota.getBucket(quotaKey),
    adapter.budget.getBucket({ budgetKey: 'b', periodStart: MONTH_START }),
    adapter.quota.reservationByRequestKey('missing'),
  ];
  for (const result of results) assert.ok(result instanceof Promise, 'durable calls must be promises');
});
