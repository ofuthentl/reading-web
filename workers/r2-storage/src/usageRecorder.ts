import type { AuthRole } from './auth';

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_READING_DELTA_SEC = 300;
const FIRST_SYNC_MAX_DELTA_SEC = 180;

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
  readingSeconds?: number;
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

async function ensureColumnIfMissing(
  db: D1Database,
  table: 'usage_daily_stats' | 'usage_daily_readers',
  column: string,
  definitionSql: string,
): Promise<void> {
  const cols = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if ((cols.results || []).some((c) => c.name === column)) return;
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql}`).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('duplicate column')) throw err;
  }
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
         owner_reading_seconds INTEGER NOT NULL DEFAULT 0,
         guest_reading_seconds INTEGER NOT NULL DEFAULT 0,
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS usage_daily_readers (
         day_key TEXT NOT NULL,
         reader_scope TEXT NOT NULL,
         role TEXT NOT NULL CHECK (role IN ('owner', 'guest')),
         last_seen_at INTEGER NOT NULL,
         reading_seconds INTEGER NOT NULL DEFAULT 0,
         last_reading_sync_at INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (day_key, reader_scope)
       )`,
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_usage_daily_readers_day ON usage_daily_readers(day_key)',
    ),
  ]);

  await ensureColumnIfMissing(db, 'usage_daily_stats', 'owner_reading_seconds', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumnIfMissing(db, 'usage_daily_stats', 'guest_reading_seconds', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumnIfMissing(db, 'usage_daily_readers', 'reading_seconds', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumnIfMissing(db, 'usage_daily_readers', 'last_reading_sync_at', 'INTEGER NOT NULL DEFAULT 0');
  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_usage_daily_readers_scope_day ON usage_daily_readers(reader_scope, day_key)',
    )
    .run();

  ensuredUsageDbs.add(db);
}

export async function recordUsageEvent(db: D1Database, input: UsageEventInput): Promise<void> {
  const metric = input.metric && VALID_METRICS.has(input.metric) ? input.metric : null;
  const hasReader = Boolean(input.readerScope && input.readerRole);
  const rawSec = Number(input.readingSeconds ?? 0);
  const requestedSec =
    Number.isFinite(rawSec) && rawSec > 0
      ? Math.min(MAX_READING_DELTA_SEC, Math.floor(rawSec))
      : 0;

  if (!metric && !hasReader && requestedSec <= 0) return;

  await ensureUsageTables(db);
  const now = Date.now();
  const dayKey = toVietnamDayKey(now);

  let creditedSec = 0;
  let nextSyncAt = 0;

  if (requestedSec > 0 && hasReader && input.readerScope && input.readerRole) {
    const prevReader = await db
      .prepare(
        `SELECT last_reading_sync_at
         FROM usage_daily_readers
         WHERE reader_scope = ?
         ORDER BY day_key DESC
         LIMIT 1`,
      )
      .bind(input.readerScope)
      .first<{ last_reading_sync_at: number | null }>()
      .catch(() => null);

    const prevSync = Number(prevReader?.last_reading_sync_at ?? 0);
    if (prevSync > 0) {
      const budgetSec = Math.max(0, Math.floor((now + 2000 - prevSync) / 1000));
      creditedSec = Math.min(requestedSec, MAX_READING_DELTA_SEC, budgetSec);
      nextSyncAt =
        creditedSec > 0
          ? Math.min(now + 2000, Math.max(now - 5000, prevSync + creditedSec * 1000))
          : prevSync;
    } else {
      creditedSec = Math.min(requestedSec, FIRST_SYNC_MAX_DELTA_SEC);
      nextSyncAt = now;
    }
  }

  const stmts: D1PreparedStatement[] = [];
  const readingCol =
    creditedSec > 0 && input.readerRole
      ? input.readerRole === 'owner'
        ? 'owner_reading_seconds'
        : 'guest_reading_seconds'
      : null;

  if (metric && readingCol) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO usage_daily_stats (day_key, ${metric}, ${readingCol}, updated_at)
           VALUES (?, 1, ?, ?)
           ON CONFLICT(day_key) DO UPDATE SET
             ${metric} = ${metric} + 1,
             ${readingCol} = ${readingCol} + excluded.${readingCol},
             updated_at = excluded.updated_at`,
        )
        .bind(dayKey, creditedSec, now),
    );
  } else if (metric) {
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
  } else if (readingCol) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO usage_daily_stats (day_key, ${readingCol}, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(day_key) DO UPDATE SET
             ${readingCol} = ${readingCol} + excluded.${readingCol},
             updated_at = excluded.updated_at`,
        )
        .bind(dayKey, creditedSec, now),
    );
  }

  if (hasReader && input.readerScope && input.readerRole) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO usage_daily_readers (day_key, reader_scope, role, last_seen_at, reading_seconds, last_reading_sync_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(day_key, reader_scope) DO UPDATE SET
             last_seen_at = excluded.last_seen_at,
             reading_seconds = usage_daily_readers.reading_seconds + excluded.reading_seconds,
             last_reading_sync_at = CASE
               WHEN excluded.last_reading_sync_at > 0 THEN excluded.last_reading_sync_at
               ELSE usage_daily_readers.last_reading_sync_at
             END`,
        )
        .bind(
          dayKey,
          input.readerScope,
          input.readerRole,
          now,
          creditedSec,
          creditedSec > 0 ? nextSyncAt : 0,
        ),
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
