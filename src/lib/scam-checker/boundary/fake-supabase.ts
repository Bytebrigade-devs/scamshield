/**
 * In-memory Supabase double for the M4 durable adapter: the 0002 transaction functions plus
 * table reads/writes, behind a `PostgrestTransport`. It lives outside a `.test.ts` file so more
 * than one suite can import it without re-registering the adapter's own tests.
 *
 * Not production code and never imported by a runtime module.
 */
import { M4_TABLES } from './durable-adapter.ts';
import { M4_TRANSACTION_FUNCTIONS } from './durable-persistence.ts';
import type { PostgrestTransport } from './postgrest-client.ts';

type Row = Record<string, unknown>;

/** Fixed instant the double stamps when writing rows it does not get a timestamp for. */
const STAMP = Date.UTC(2026, 10, 23, 12, 0, 0);

const iso = (epochMs: number): string => new Date(epochMs).toISOString();

export interface FakeSupabase {
  transport: PostgrestTransport;
  tables: Record<string, Row[]>;
}

export function createFakeSupabase(): FakeSupabase {
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
    Object.entries(query).filter(([key]) => key !== 'select' && key !== 'order' && key !== 'limit' && key !== 'on_conflict');

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
    const limit = query.limit === undefined ? null : Number(query.limit);
    const cap = (list: Row[]): Row[] => (limit !== null && Number.isFinite(limit) && limit >= 0 ? list.slice(0, limit) : list);
    if (!order) return cap(rows);
    const [column, direction] = order.split('.');
    const sorted = [...rows].sort((a, b) => {
      const av = a[column!] as string | number;
      const bv = b[column!] as string | number;
      const numeric = typeof av === 'number' && typeof bv === 'number';
      const left = numeric ? av as number : Date.parse(String(av));
      const right = numeric ? bv as number : Date.parse(String(bv));
      return left === right ? 0 : left < right ? -1 : 1;
    });
    return direction === 'desc' ? cap(sorted.reverse()) : cap(sorted);
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
      limit_count: limit, completed_count: 0, reserved_count: 0, updated_at: iso(STAMP),
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
          spent_amount: 0, updated_at: iso(STAMP),
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
