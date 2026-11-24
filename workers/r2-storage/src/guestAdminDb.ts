import { HttpError, ensureDiscordAccessTable, resolveSigningSecret } from './auth';
import type { Env } from './booksDb';
import { matchForensicCandidates } from './forensicWatermark';

export async function listDiscordGuests(db: D1Database) {
  await ensureDiscordAccessTable(db);
  const rows = await db
    .prepare(
      `SELECT discord_user_id, discord_username, session_expires_at, rl_strikes,
              COALESCE(is_banned, 0) AS is_banned, ban_reason, updated_at
       FROM discord_access
       ORDER BY updated_at DESC`,
    )
    .all<{
      discord_user_id: string;
      discord_username: string;
      session_expires_at: number | null;
      rl_strikes: number | null;
      is_banned: number;
      ban_reason: string | null;
      updated_at: number;
    }>();

  return {
    guests: (rows.results || []).map((r) => ({
      discordUserId: r.discord_user_id,
      discordUsername: r.discord_username,
      sessionExpiresAt: r.session_expires_at,
      strikes: r.rl_strikes ?? 0,
      isBanned: r.is_banned === 1,
      banReason: r.ban_reason ?? null,
      updatedAt: r.updated_at,
    })),
  };
}

export async function setDiscordGuestBan(
  db: D1Database,
  discordUserId: string,
  banned: boolean,
  reason: string | null,
) {
  if (!/^\d{5,32}$/.test(discordUserId)) {
    throw new HttpError('Discord User ID không hợp lệ.', 400);
  }
  await ensureDiscordAccessTable(db);
  const now = Date.now();
  const cleanReason = banned && reason?.trim() ? reason.trim().slice(0, 200) : null;

  const res = await db
    .prepare(
      `UPDATE discord_access
       SET is_banned = ?,
           ban_reason = ?,
           key_hash = CASE WHEN ? = 1 THEN NULL ELSE key_hash END,
           key_expires_at = CASE WHEN ? = 1 THEN NULL ELSE key_expires_at END,
           active_session_id = CASE WHEN ? = 1 THEN NULL ELSE active_session_id END,
           session_expires_at = CASE WHEN ? = 1 THEN NULL ELSE session_expires_at END,
           updated_at = ?
       WHERE discord_user_id = ?`,
    )
    .bind(
      banned ? 1 : 0,
      cleanReason,
      banned ? 1 : 0,
      banned ? 1 : 0,
      banned ? 1 : 0,
      banned ? 1 : 0,
      now,
      discordUserId,
    )
    .run();

  if ((res.meta?.changes ?? 0) === 0) {
    throw new HttpError('Không tìm thấy thành viên Discord này trong lịch sử truy cập.', 404);
  }
  return { ok: true, discordUserId, isBanned: banned, banReason: cleanReason };
}

export async function runAdminForensicCheck(env: Env, rawText: unknown) {
  if (typeof rawText !== 'string' || rawText.trim().length < 80) {
    throw new HttpError(
      'Vui lòng dán đoạn văn bản cần kiểm tra dài tối thiểu 80 ký tự (nên dán 1 đoạn dài hoặc cả chương).',
      400,
    );
  }
  await ensureDiscordAccessTable(env.DB);
  const rows = await env.DB.prepare(
    'SELECT discord_user_id, discord_username FROM discord_access ORDER BY updated_at DESC',
  ).all<{ discord_user_id: string; discord_username: string }>();

  const candidates = (rows.results || []).map((r) => ({
    discordUserId: r.discord_user_id,
    discordUsername: r.discord_username,
  }));

  return matchForensicCandidates(rawText.slice(0, 300_000), candidates, resolveSigningSecret(env));
}
