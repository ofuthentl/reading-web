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
  /** Số giây đọc đã được chốt nguyên tử vào `usage_daily_readers` từ `claimReadingTimeBudget` (chỉ cộng vào `usage_daily_stats`). */
  preCreditedReadingSeconds?: number;
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

/**
 * Chốt ngân sách thời gian đọc nguyên tử theo đồng hồ thực `usage_daily_readers.last_reading_sync_at` (D-046):
 * - Dùng chung 1 đồng hồ duy nhất theo `reader_scope` xuyên suốt tất cả các tập sách (chặn bơm khống `FIRST_SYNC_MAX_DELTA_SEC` trên nhiều sách mới).
 * - Tách biệt hoàn toàn khỏi các lần lưu tiến độ `readingDeltaSec = 0` (không bao giờ đẩy lùi mốc đo thời gian đọc).
 */
export async function claimReadingTimeBudget(
  db: D1Database,
  readerScope: string,
  readerRole: AuthRole,
  requestedSec: number,
  nowMs = Date.now(),
): Promise<number> {
  const clamped =
    Number.isFinite(requestedSec) && requestedSec > 0
      ? Math.min(MAX_READING_DELTA_SEC, Math.floor(requestedSec))
      : 0;
  if (clamped <= 0) return 0;

  await ensureUsageTables(db);
  const dayKey = toVietnamDayKey(nowMs);
  const prevReader = await db
    .prepare(
      `SELECT last_reading_sync_at
       FROM usage_daily_readers
       WHERE reader_scope = ? AND last_reading_sync_at > 0
       ORDER BY day_key DESC
       LIMIT 1`,
    )
    .bind(readerScope)
    .first<{ last_reading_sync_at: number | null }>()
    .catch(() => null);

  const prevSync = Number(prevReader?.last_reading_sync_at ?? 0);
  const initialBudget =
    prevSync > 0
      ? Math.min(clamped, MAX_READING_DELTA_SEC, Math.max(0, Math.floor((nowMs - prevSync) / 1000)))
      : Math.min(clamped, FIRST_SYNC_MAX_DELTA_SEC);

  const [beforeBatchRes, afterBatchRes] = await db.batch<{ reading_seconds: number }>([
    db
      .prepare(
        'SELECT reading_seconds FROM usage_daily_readers WHERE day_key = ? AND reader_scope = ?',
      )
      .bind(dayKey, readerScope),
    db
      .prepare(
        `INSERT INTO usage_daily_readers (day_key, reader_scope, role, last_seen_at, reading_seconds, last_reading_sync_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(day_key, reader_scope) DO UPDATE SET
           last_seen_at = MAX(usage_daily_readers.last_seen_at, excluded.last_seen_at),
           reading_seconds = usage_daily_readers.reading_seconds + CASE
             WHEN ? <= 0 THEN 0
             WHEN usage_daily_readers.last_reading_sync_at > 0
               THEN MIN(?, MAX(0, CAST((? - usage_daily_readers.last_reading_sync_at) / 1000 AS INTEGER)))
             ELSE ?
           END,
           last_reading_sync_at = CASE
             WHEN ? > 0 AND (
               usage_daily_readers.last_reading_sync_at <= 0
               OR (? - usage_daily_readers.last_reading_sync_at) >= 1000
             ) THEN ?
             ELSE usage_daily_readers.last_reading_sync_at
           END
         RETURNING reading_seconds`,
      )
      .bind(
        dayKey,
        readerScope,
        readerRole,
        nowMs,
        initialBudget,
        initialBudget > 0 ? nowMs : 0,
        initialBudget,
        initialBudget,
        nowMs,
        initialBudget,
        initialBudget,
        nowMs,
        nowMs,
      ),
  ]);

  const beforeSec = Number(beforeBatchRes.results?.[0]?.reading_seconds ?? 0);
  const afterSec = Number(afterBatchRes.results?.[0]?.reading_seconds ?? beforeSec);
  return Math.max(0, Math.min(initialBudget, afterSec - beforeSec));
}

export async function recordUsageEvent(db: D1Database, input: UsageEventInput): Promise<void> {
  const metric = input.metric && VALID_METRICS.has(input.metric) ? input.metric : null;
  const hasReader = Boolean(input.readerScope && input.readerRole);
  const rawSec = Number(input.readingSeconds ?? 0);
  const requestedSec =
    Number.isFinite(rawSec) && rawSec > 0
      ? Math.min(MAX_READING_DELTA_SEC, Math.floor(rawSec))
      : 0;
  const rawPreCredited = Number(input.preCreditedReadingSeconds ?? 0);
  const preCreditedSec =
    Number.isFinite(rawPreCredited) && rawPreCredited > 0
      ? Math.min(MAX_READING_DELTA_SEC, Math.floor(rawPreCredited))
      : 0;

  if (!metric && !hasReader && requestedSec <= 0 && preCreditedSec <= 0) return;

  await ensureUsageTables(db);
  const now = Date.now();
  const dayKey = toVietnamDayKey(now);

  let creditedSec = preCreditedSec;

  if (preCreditedSec <= 0 && hasReader && input.readerScope && input.readerRole) {
    if (requestedSec > 0) {
      creditedSec = await claimReadingTimeBudget(
        db,
        input.readerScope,
        input.readerRole,
        requestedSec,
        now,
      );
    } else {
      await db
        .prepare(
          `INSERT INTO usage_daily_readers (day_key, reader_scope, role, last_seen_at, reading_seconds, last_reading_sync_at)
           VALUES (?, ?, ?, ?, 0, 0)
           ON CONFLICT(day_key, reader_scope) DO UPDATE SET
             last_seen_at = MAX(usage_daily_readers.last_seen_at, excluded.last_seen_at)`,
        )
        .bind(dayKey, input.readerScope, input.readerRole, now)
        .run();
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
