import { HttpError, sha256Hex } from './auth';

// Token Bucket chống tool cào tự động (KHÔNG đặt trần tổng chương/ngày cho bạn bè đọc thật)
export const BUCKET_CAPACITY = 10; // Mở liên tiếp 10 chương đầu tức thì (0ms chờ) để dò mục lục
export const BUCKET_REFILL_PER_MS = 1 / 6000; // Hồi 1 chương mới mỗi 6 giây (10 chương mới/phút)
const AUTO_CLOSE_SESSION_STRIKES = 10;

// Chống dò mật mã / chìa khoá theo IP (M-8)
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 phút
const ensuredLoginLimitDbs = new WeakSet<D1Database>();

export interface GuestRateLimitOptions {
  cost: number;
  trackStrikes: boolean;
  tooFastMessage: (waitSec: number) => string;
}

/**
 * Tiêu thụ token nguyên tử trực tiếp trong SQLite/D1 (vá race-condition H-1):
 * - Một câu `UPDATE ... WHERE (refilled) >= cost` duy nhất, kiểm tra `meta.changes === 1`.
 * - Nếu hết token, tăng `rl_strikes` nguyên tử (với tải chương) và tự đóng phiên khi chạm ngưỡng.
 */
export async function consumeGuestRateToken(
  db: D1Database,
  discordUserId: string,
  options: GuestRateLimitOptions,
): Promise<void> {
  const now = Date.now();
  const { cost, trackStrikes, tooFastMessage } = options;

  const consumeRes = await db
    .prepare(
      `UPDATE discord_access
       SET rl_tokens = MIN(?, COALESCE(rl_tokens, ?) + MAX(0, ? - CASE WHEN rl_updated_at > 0 THEN rl_updated_at ELSE ? END) * ?) - ?,
           rl_updated_at = ?,
           rl_strikes = CASE WHEN ? = 1 THEN 0 ELSE rl_strikes END
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
      trackStrikes ? 1 : 0,
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
             rl_strikes = COALESCE(rl_strikes, 0) + 1,
             active_session_id = CASE WHEN COALESCE(rl_strikes, 0) + 1 >= ? THEN NULL ELSE active_session_id END,
             session_expires_at = CASE WHEN COALESCE(rl_strikes, 0) + 1 >= ? THEN NULL ELSE session_expires_at END,
             updated_at = CASE WHEN COALESCE(rl_strikes, 0) + 1 >= ? THEN ? ELSE updated_at END
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
        AUTO_CLOSE_SESSION_STRIKES,
        AUTO_CLOSE_SESSION_STRIKES,
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

function computeLoginLockDurationMs(failCount: number): number {
  if (failCount >= 12) return 15 * 60 * 1000;
  if (failCount >= 8) return 3 * 60 * 1000;
  if (failCount >= 5) return 30 * 1000;
  return 0;
}

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
  const existing = await db
    .prepare('SELECT fail_count, window_start FROM login_rate_limits WHERE ip_hash = ?')
    .bind(ipHash)
    .first<{ fail_count: number; window_start: number }>();

  const withinWindow = existing && now - existing.window_start <= LOGIN_WINDOW_MS;
  const nextCount = withinWindow ? existing.fail_count + 1 : 1;
  const windowStart = withinWindow ? existing.window_start : now;
  const lockMs = computeLoginLockDurationMs(nextCount);
  const lockedUntil = lockMs > 0 ? now + lockMs : 0;

  await db
    .prepare(
      `INSERT INTO login_rate_limits (ip_hash, fail_count, window_start, locked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ip_hash) DO UPDATE SET
         fail_count = excluded.fail_count,
         window_start = excluded.window_start,
         locked_until = excluded.locked_until`,
    )
    .bind(ipHash, nextCount, windowStart, lockedUntil)
    .run();
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
