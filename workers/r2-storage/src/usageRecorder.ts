import type { AuthRole } from './auth';

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type UsageMetricColumn =
  | 'owner_logins'
  | 'guest_logins'
  | 'discord_keys_issued'
  | 'login_failures'
  | 'guest_chapter_reads'
  | 'owner_progress_updates'
  | 'guest_searches'
  | 'rate_limit_hits';

export interface UsageEventInput {
  metric?: UsageMetricColumn;
  readerScope?: string;
  readerRole?: AuthRole;
}

const VALID_METRICS: ReadonlySet<UsageMetricColumn> = new Set([
  'owner_logins',
  'guest_logins',
  'discord_keys_issued',
  'login_failures',
  'guest_chapter_reads',
  'owner_progress_updates',
  'guest_searches',
  'rate_limit_hits',
]);

const ensuredUsageDbs = new WeakSet<D1Database>();

export function toVietnamDayKey(timestampMs: number): string {
  return new Date(timestampMs + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function buildDayKeys(days: number, nowMs: number): string[] {
  const out: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    out.push(toVietnamDayKey(nowMs - offset * DAY_MS));
  }
  return out;
}

export async function ensureUsageTables(db: D1Database): Promise<void> {
  if (ensuredUsageDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS usage_daily_stats (
         day_key TEXT PRIMARY KEY,
         owner_logins INTEGER NOT NULL DEFAULT 0,
         guest_logins INTEGER NOT NULL DEFAULT 0,
         discord_keys_issued INTEGER NOT NULL DEFAULT 0,
         login_failures INTEGER NOT NULL DEFAULT 0,
         guest_chapter_reads INTEGER NOT NULL DEFAULT 0,
         owner_progress_updates INTEGER NOT NULL DEFAULT 0,
         guest_searches INTEGER NOT NULL DEFAULT 0,
         rate_limit_hits INTEGER NOT NULL DEFAULT 0,
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS usage_daily_readers (
         day_key TEXT NOT NULL,
         reader_scope TEXT NOT NULL,
         role TEXT NOT NULL CHECK (role IN ('owner', 'guest')),
         last_seen_at INTEGER NOT NULL,
         PRIMARY KEY (day_key, reader_scope)
       )`,
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_usage_daily_readers_day ON usage_daily_readers(day_key)',
    ),
  ]);
  ensuredUsageDbs.add(db);
}

export async function recordUsageEvent(db: D1Database, input: UsageEventInput): Promise<void> {
  const metric = input.metric && VALID_METRICS.has(input.metric) ? input.metric : null;
  const hasReader = Boolean(input.readerScope && input.readerRole);
  if (!metric && !hasReader) return;

  await ensureUsageTables(db);
  const now = Date.now();
  const dayKey = toVietnamDayKey(now);
  const stmts: D1PreparedStatement[] = [];

  if (metric) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO usage_daily_stats (day_key, ${metric}, updated_at)
           VALUES (?, 1, ?)
           ON CONFLICT(day_key) DO UPDATE SET
             ${metric} = ${metric} + 1,
             updated_at = excluded.updated_at`,
        )
        .bind(dayKey, now),
    );
  }

  if (hasReader && input.readerScope && input.readerRole) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO usage_daily_readers (day_key, reader_scope, role, last_seen_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(day_key, reader_scope) DO UPDATE SET
             last_seen_at = excluded.last_seen_at`,
        )
        .bind(dayKey, input.readerScope, input.readerRole, now),
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }
}

export function scheduleUsageEvent(
  ctx: ExecutionContext | undefined,
  db: D1Database,
  input: UsageEventInput,
): void {
  const work = recordUsageEvent(db, input).catch(() => undefined);
  if (ctx) ctx.waitUntil(work);
  else void work;
}
