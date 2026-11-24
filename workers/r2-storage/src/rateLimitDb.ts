import { HttpError, ensureDiscordAccessTable, sha256Hex } from './auth';

// Token Bucket chống tool cào tự động (KHÔNG đặt trần tổng chương/ngày cho bạn bè đọc thật)
export const BUCKET_CAPACITY = 10; // Mở liên tiếp 10 chương đầu tức thì (0ms chờ) để dò mục lục
export const BUCKET_REFILL_PER_MS = 1 / 6000; // Hồi 1 chương mới mỗi 6 giây (10 chương mới/phút)
export const STRIKE_DECAY_STEP_MS = 30 * 60 * 1000; // Giảm -1 strike mỗi 30 phút yên ổn không vi phạm (QĐ-1 = 1A)
export const STRIKE_RESET_IDLE_MS = 24 * 60 * 60 * 1000; // Reset sạch về 0 sau 24 giờ yên ổn (D-038 / QĐ-1 = 1A)
const AUTO_CLOSE_SESSION_STRIKES = 10;

// Biểu thức SQL nguyên tử tính lại rl_strikes & rl_last_strike_at theo thời gian yên ổn thực (không bao giờ reset về 0 sau 1 request)
export const DECAYED_STRIKES_SQL = `CASE
  WHEN COALESCE(rl_strikes, 0) <= 0 THEN 0
  WHEN (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END) <= 0 THEN COALESCE(rl_strikes, 0)
  WHEN (? - (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END)) >= ? THEN 0
  WHEN (? - (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END)) >= ?
    THEN MAX(0, COALESCE(rl_strikes, 0) - CAST((? - (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END)) / ? AS INTEGER))
  ELSE COALESCE(rl_strikes, 0)
END`;

export const DECAYED_STRIKE_AT_SQL = `CASE
  WHEN COALESCE(rl_strikes, 0) <= 0 THEN 0
  WHEN (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END) <= 0 THEN COALESCE(rl_last_strike_at, 0)
  WHEN (? - (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END)) >= ? THEN 0
  WHEN (? - (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END)) >= ? THEN
    CASE
      WHEN COALESCE(rl_strikes, 0) - CAST((? - (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END)) / ? AS INTEGER) <= 0 THEN 0
      ELSE (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END)
           + CAST((? - (CASE WHEN COALESCE(rl_last_strike_at, 0) > 0 THEN rl_last_strike_at ELSE rl_updated_at END)) / ? AS INTEGER) * ?
    END
  ELSE COALESCE(rl_last_strike_at, 0)
END`;

export function buildStrikeDecayBindParams(now: number): number[] {
  return [
    now,
    STRIKE_RESET_IDLE_MS,
    now,
    STRIKE_DECAY_STEP_MS,
    now,
    STRIKE_DECAY_STEP_MS,
    now,
    STRIKE_RESET_IDLE_MS,
    now,
    STRIKE_DECAY_STEP_MS,
    now,
    STRIKE_DECAY_STEP_MS,
    now,
    STRIKE_DECAY_STEP_MS,
    STRIKE_DECAY_STEP_MS,
  ];
}

// Chống dò mật mã / chìa khoá theo IP (M-8)
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 phút
const ensuredLoginLimitDbs = new WeakSet<D1Database>();

export interface GuestRateLimitOptions {
  cost: number;
  trackStrikes: boolean;
  tooFastMessage: (waitSec: number) => string;
}

/**
 * Tiêu thụ token nguyên tử trực tiếp trong SQLite/D1 (vá race-condition H-1 & QĐ-1 = 1A):
 * - Một câu `UPDATE ... WHERE (refilled) >= cost` duy nhất, kiểm tra `meta.changes === 1`.
 * - Request thành công KHÔNG xoá trắng `rl_strikes`; chỉ hồi bậc thang `-1 / 30 phút` và về `0` sau `24 giờ` yên ổn.
 * - Nếu hết token (`trackStrikes = true`), tăng `rl_strikes` nguyên tử, ghi `rl_last_strike_at = now` và tự đóng phiên ở mốc 10.
 */
export async function consumeGuestRateToken(
  db: D1Database,
  discordUserId: string,
  options: GuestRateLimitOptions,
): Promise<void> {
  await ensureDiscordAccessTable(db);
  const now = Date.now();
  const { cost, trackStrikes, tooFastMessage } = options;

  const consumeRes = await db
    .prepare(
      `UPDATE discord_access
       SET rl_tokens = MIN(?, COALESCE(rl_tokens, ?) + MAX(0, ? - CASE WHEN rl_updated_at > 0 THEN rl_updated_at ELSE ? END) * ?) - ?,
           rl_updated_at = ?,
           rl_strikes = ${DECAYED_STRIKES_SQL},
           rl_last_strike_at = ${DECAYED_STRIKE_AT_SQL}
       WHERE discord_user_id = ?
         AND MIN(?, COALESCE(rl_tokens, ?) + MAX(0, ? - CASE WHEN rl_updated_at > 0 THEN rl_updated_at ELSE ? END) * ?) >= ?`,
    )
    .bind(
      BUCKET_CAPACITY,
      BUCKET_CAPACITY,
      now,
      now,
      BUCKET_REFILL_PER_MS,
      cost,
      now,
      ...buildStrikeDecayBindParams(now),
      discordUserId,
      BUCKET_CAPACITY,
      BUCKET_CAPACITY,
      now,
      now,
      BUCKET_REFILL_PER_MS,
      cost,
    )
    .run();

  if ((consumeRes.meta?.changes ?? 0) === 1) {
    return;
  }

  let remainingTokens = 0;
  if (trackStrikes) {
    const strikeRow = await db
      .prepare(
        `UPDATE discord_access
         SET rl_tokens = MIN(?, COALESCE(rl_tokens, ?) + MAX(0, ? - CASE WHEN rl_updated_at > 0 THEN rl_updated_at ELSE ? END) * ?),
             rl_updated_at = ?,
             rl_strikes = (${DECAYED_STRIKES_SQL}) + 1,
             rl_last_strike_at = ?,
             active_session_id = CASE WHEN (${DECAYED_STRIKES_SQL}) + 1 >= ? THEN NULL ELSE active_session_id END,
             session_expires_at = CASE WHEN (${DECAYED_STRIKES_SQL}) + 1 >= ? THEN NULL ELSE session_expires_at END,
             updated_at = CASE WHEN (${DECAYED_STRIKES_SQL}) + 1 >= ? THEN ? ELSE updated_at END
         WHERE discord_user_id = ?
         RETURNING rl_tokens, rl_strikes`,
      )
      .bind(
        BUCKET_CAPACITY,
        BUCKET_CAPACITY,
        now,
        now,
        BUCKET_REFILL_PER_MS,
        now,
        now,
        STRIKE_RESET_IDLE_MS,
        now,
        STRIKE_DECAY_STEP_MS,
        now,
        STRIKE_DECAY_STEP_MS,
        now,
        now,
        STRIKE_RESET_IDLE_MS,
        now,
        STRIKE_DECAY_STEP_MS,
        now,
        STRIKE_DECAY_STEP_MS,
        AUTO_CLOSE_SESSION_STRIKES,
        now,
        STRIKE_RESET_IDLE_MS,
        now,
        STRIKE_DECAY_STEP_MS,
        now,
        STRIKE_DECAY_STEP_MS,
        AUTO_CLOSE_SESSION_STRIKES,
        now,
        STRIKE_RESET_IDLE_MS,
        now,
        STRIKE_DECAY_STEP_MS,
        now,
        STRIKE_DECAY_STEP_MS,
        AUTO_CLOSE_SESSION_STRIKES,
        now,
        discordUserId,
      )
      .first<{ rl_tokens: number | null; rl_strikes: number | null }>();

    if ((strikeRow?.rl_strikes ?? 0) >= AUTO_CLOSE_SESSION_STRIKES) {
      throw new HttpError(
        'Phiên đọc đã tự động đóng do phát hiện truy vấn hàng loạt tốc độ cao bất thường.',
        401,
      );
    }
    remainingTokens = typeof strikeRow?.rl_tokens === 'number' ? strikeRow.rl_tokens : 0;
  } else {
    const row = await db
      .prepare('SELECT rl_tokens, rl_updated_at FROM discord_access WHERE discord_user_id = ?')
      .bind(discordUserId)
      .first<{ rl_tokens: number | null; rl_updated_at: number | null }>();
    const prevTokens =
      typeof row?.rl_tokens === 'number' && Number.isFinite(row.rl_tokens) ? row.rl_tokens : 0;
    const prevAt =
      typeof row?.rl_updated_at === 'number' && row.rl_updated_at > 0 ? row.rl_updated_at : now;
    remainingTokens = Math.min(
      BUCKET_CAPACITY,
      prevTokens + Math.max(0, now - prevAt) * BUCKET_REFILL_PER_MS,
    );
  }

  const waitSec = Math.max(
    3,
    Math.ceil(Math.max(0.1, cost - Math.max(0, remainingTokens)) / BUCKET_REFILL_PER_MS / 1000),
  );
  throw new HttpError(tooFastMessage(waitSec), 429, { 'Retry-After': String(waitSec) });
}

async function ensureLoginRateLimitTable(db: D1Database): Promise<void> {
  if (ensuredLoginLimitDbs.has(db)) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS login_rate_limits (
         ip_hash TEXT PRIMARY KEY,
         fail_count INTEGER NOT NULL DEFAULT 0,
         window_start INTEGER NOT NULL,
         locked_until INTEGER NOT NULL DEFAULT 0
       )`,
    )
    .run();
  ensuredLoginLimitDbs.add(db);
}

async function hashClientIp(rawIp: string): Promise<string> {
  const clean = rawIp.trim() || 'unknown';
  return (await sha256Hex(`login-ip-v1:${clean}`)).slice(0, 32);
}

const STALE_LOGIN_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

export async function assertLoginNotRateLimited(db: D1Database, rawIp: string): Promise<void> {
  await ensureLoginRateLimitTable(db);
  const ipHash = await hashClientIp(rawIp);
  const now = Date.now();
  const row = await db
    .prepare('SELECT locked_until FROM login_rate_limits WHERE ip_hash = ?')
    .bind(ipHash)
    .first<{ locked_until: number }>();
  if (row && row.locked_until > now) {
    const waitSec = Math.max(1, Math.ceil((row.locked_until - now) / 1000));
    throw new HttpError(
      `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${waitSec} giây.`,
      429,
      { 'Retry-After': String(waitSec) },
    );
  }
}

export async function recordLoginFailure(db: D1Database, rawIp: string): Promise<void> {
  await ensureLoginRateLimitTable(db);
  const ipHash = await hashClientIp(rawIp);
  const now = Date.now();
  const staleBefore = now - STALE_LOGIN_LIMIT_MS;

  // Nguyên tử hoàn toàn trong SQLite để chống bắn song song vượt ngưỡng khoá 5/8/12 lần sai
  await db.batch([
    db
      .prepare(
        `INSERT INTO login_rate_limits (ip_hash, fail_count, window_start, locked_until)
         VALUES (?, 1, ?, 0)
         ON CONFLICT(ip_hash) DO UPDATE SET
           fail_count = CASE
             WHEN (? - login_rate_limits.window_start) <= ? THEN login_rate_limits.fail_count + 1
             ELSE 1
           END,
           window_start = CASE
             WHEN (? - login_rate_limits.window_start) <= ? THEN login_rate_limits.window_start
             ELSE ?
           END,
           locked_until = CASE
             WHEN (? - login_rate_limits.window_start) > ? THEN 0
             WHEN login_rate_limits.fail_count + 1 >= 12 THEN ? + 900000
             WHEN login_rate_limits.fail_count + 1 >= 8 THEN ? + 180000
             WHEN login_rate_limits.fail_count + 1 >= 5 THEN ? + 30000
             ELSE login_rate_limits.locked_until
           END`,
      )
      .bind(
        ipHash,
        now,
        now,
        LOGIN_WINDOW_MS,
        now,
        LOGIN_WINDOW_MS,
        now,
        now,
        LOGIN_WINDOW_MS,
        now,
        now,
        now,
      ),
    db
      .prepare('DELETE FROM login_rate_limits WHERE window_start < ? AND locked_until < ?')
      .bind(staleBefore, now),
  ]);
}

export async function clearLoginFailures(db: D1Database, rawIp: string): Promise<void> {
  await ensureLoginRateLimitTable(db);
  const ipHash = await hashClientIp(rawIp);
  await db
    .prepare('DELETE FROM login_rate_limits WHERE ip_hash = ?')
    .bind(ipHash)
    .run()
    .catch(() => undefined);
}
