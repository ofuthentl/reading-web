import {
  type AuthContext,
  HttpError,
  ensureDiscordAccessTable,
  resolveSigningSecret,
} from './auth';
import { type Env, assertQuota, getStorageStats, isValidId } from './booksDb';
import {
  type WatermarkBlock,
  applyForensicWatermarkToBlocks,
  deriveUserWatermarkBits,
  matchForensicCandidates,
} from './forensicWatermark';
import { assertGuestBookAccess } from './shelfAccessDb';

export const GUEST_PACK_MAGIC = 'OFGP';
export const MAX_GUEST_PACK_ENVELOPE_BYTES = 25 * 1024 * 1024; // 25 MiB
export const MAX_MEDIA_SLICE_BYTES = 25 * 1024 * 1024; // 25 MiB

// Token Bucket chống tool cào tự động (KHÔNG đặt trần tổng chương/ngày cho bạn bè đọc thật)
const BUCKET_CAPACITY = 10; // Mở liên tiếp 10 chương đầu tức thì (0ms chờ) để dò mục lục
const BUCKET_REFILL_PER_MS = 1 / 6000; // Hồi 1 chương mới mỗi 6 giây (10 chương mới/phút)
const AUTO_CLOSE_SESSION_STRIKES = 10;

export interface GuestManifestChapter {
  id: string;
  title: string;
  offset: number;
  length: number;
}

export interface GuestManifestMedia {
  offset: number;
  length: number;
  compression: 0 | 8;
  mime: string;
}

export interface GuestBookManifest {
  v: 1;
  chapters: GuestManifestChapter[];
  media: GuestManifestMedia[];
}

interface StoredChapterData {
  title: string;
  blocks: WatermarkBlock[];
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function encryptForSession(
  plaintext: Uint8Array,
  tokenSignature: string,
  bookId: string,
): Promise<{ ciphertext: ArrayBuffer; ivBase64: string; nonceHex: string }> {
  const nonceHex = randomHex(16);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const keySeed = new TextEncoder().encode(`${tokenSignature}:${bookId}:${nonceHex}`);
  const rawKey = await crypto.subtle.digest('SHA-256', keySeed);
  const aesKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintext as BufferSource,
  );
  return {
    ciphertext,
    ivBase64: bytesToBase64(iv),
    nonceHex,
  };
}

function parseAndValidateManifest(rawJson: string, packByteLength: number): GuestBookManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new HttpError('Manifest gói bảo mật khách không hợp lệ.', 400);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new HttpError('Manifest gói bảo mật khách bị rỗng.', 400);
  }
  const candidate = parsed as Partial<GuestBookManifest>;
  if (candidate.v !== 1 || !Array.isArray(candidate.chapters) || !Array.isArray(candidate.media)) {
    throw new HttpError('Phiên bản manifest gói bảo mật không được hỗ trợ.', 400);
  }
  if (candidate.chapters.length === 0 || candidate.chapters.length > 5000) {
    throw new HttpError('Số lượng chương trong gói bảo mật không hợp lệ.', 400);
  }
  if (candidate.media.length > 5000) {
    throw new HttpError('Số lượng ảnh minh hoạ vượt giới hạn.', 400);
  }

  const chapters: GuestManifestChapter[] = candidate.chapters.map((ch, idx) => {
    if (
      !ch ||
      typeof ch.id !== 'string' ||
      typeof ch.title !== 'string' ||
      typeof ch.offset !== 'number' ||
      typeof ch.length !== 'number' ||
      !Number.isInteger(ch.offset) ||
      !Number.isInteger(ch.length) ||
      ch.offset < 0 ||
      ch.length <= 0 ||
      ch.offset + ch.length > packByteLength
    ) {
      throw new HttpError(`Chỉ mục chương #${idx + 1} trong gói bảo mật không hợp lệ.`, 400);
    }
    return {
      id: ch.id.slice(0, 120),
      title: ch.title.trim().slice(0, 240) || `Chương ${idx + 1}`,
      offset: ch.offset,
      length: ch.length,
    };
  });

  const media: GuestManifestMedia[] = candidate.media.map((m, idx) => {
    if (
      !m ||
      typeof m.offset !== 'number' ||
      typeof m.length !== 'number' ||
      !Number.isInteger(m.offset) ||
      !Number.isInteger(m.length) ||
      m.offset < 0 ||
      m.length <= 0 ||
      m.length > MAX_MEDIA_SLICE_BYTES ||
      (m.compression !== 0 && m.compression !== 8) ||
      typeof m.mime !== 'string' ||
      !m.mime.startsWith('image/')
    ) {
      throw new HttpError(`Chỉ mục ảnh #${idx + 1} trong gói bảo mật không hợp lệ.`, 400);
    }
    return {
      offset: m.offset,
      length: m.length,
      compression: m.compression,
      mime: m.mime.slice(0, 64),
    };
  });

  return { v: 1, chapters, media };
}

export async function uploadBookGuestPack(
  request: Request,
  env: Env,
  bookId: string,
) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  await ensureDiscordAccessTable(env.DB);

  const book = await env.DB.prepare('SELECT id, file_type, file_size FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ id: string; file_type: string; file_size: number }>();
  if (!book) throw new HttpError('Không tìm thấy sách.', 404);
  if (book.file_type !== 'epub' && book.file_type !== 'docx') {
    throw new HttpError('Gói bảo mật chế độ khách chỉ áp dụng cho sách EPUB và DOCX.', 400);
  }

  const rawBuffer = await request.arrayBuffer();
  if (rawBuffer.byteLength < 12 || rawBuffer.byteLength > MAX_GUEST_PACK_ENVELOPE_BYTES) {
    throw new HttpError('Kích thước gói bảo mật khách không hợp lệ (tối đa 25 MB).', 400);
  }

  const bytes = new Uint8Array(rawBuffer);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== GUEST_PACK_MAGIC) {
    throw new HttpError('Định dạng gói bảo mật khách không đúng chuẩn OFGP.', 400);
  }

  const view = new DataView(rawBuffer);
  const manifestLen = view.getUint32(4, true);
  if (manifestLen === 0 || 8 + manifestLen >= rawBuffer.byteLength) {
    throw new HttpError('Độ dài manifest trong gói bảo mật không hợp lệ.', 400);
  }

  const manifestJson = new TextDecoder().decode(bytes.subarray(8, 8 + manifestLen));
  const packBytes = bytes.subarray(8 + manifestLen);
  const validatedManifest = parseAndValidateManifest(manifestJson, packBytes.byteLength);

  // Kiểm tra toạ độ ảnh không vượt quá kích thước file sách gốc trên R2
  for (const media of validatedManifest.media) {
    if (media.offset + media.length > book.file_size) {
      throw new HttpError('Toạ độ ảnh minh hoạ vượt ngoài kích thước tệp sách gốc.', 400);
    }
  }

  const existingPack = await env.DB.prepare(
    'SELECT pack_size FROM book_guest_packs WHERE book_id = ?',
  )
    .bind(bookId)
    .first<{ pack_size: number }>();
  const oldPackSize = existingPack?.pack_size ?? 0;

  const storage = await getStorageStats(env);
  assertQuota(storage.usedBytes - oldPackSize, packBytes.byteLength, storage.limitBytes);

  const packKey = `guest-packs/${bookId}.pack`;
  const putRes = await env.BOOKS_BUCKET.put(packKey, packBytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });
  if (!putRes) throw new HttpError('Không thể lưu gói bảo mật vào R2.', 500);

  const normalizedManifestStr = JSON.stringify(validatedManifest);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO book_guest_packs (book_id, pack_key, pack_size, chapter_count, manifest_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       pack_key = excluded.pack_key,
       pack_size = excluded.pack_size,
       chapter_count = excluded.chapter_count,
       manifest_json = excluded.manifest_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      bookId,
      packKey,
      putRes.size,
      validatedManifest.chapters.length,
      normalizedManifestStr,
      now,
    )
    .run();

  const updatedStorage = await getStorageStats(env);
  return {
    ok: true,
    bookId,
    chapterCount: validatedManifest.chapters.length,
    packSize: putRes.size,
    storage: updatedStorage,
  };
}

async function consumeGuestChapterToken(db: D1Database, discordUserId: string): Promise<void> {
  const now = Date.now();
  const row = await db
    .prepare(
      'SELECT rl_tokens, rl_updated_at, rl_strikes FROM discord_access WHERE discord_user_id = ?',
    )
    .bind(discordUserId)
    .first<{ rl_tokens: number | null; rl_updated_at: number | null; rl_strikes: number | null }>();

  const prevTokens =
    typeof row?.rl_tokens === 'number' && Number.isFinite(row.rl_tokens)
      ? row.rl_tokens
      : BUCKET_CAPACITY;
  const prevAt =
    typeof row?.rl_updated_at === 'number' && row.rl_updated_at > 0 ? row.rl_updated_at : now;
  const prevStrikes = typeof row?.rl_strikes === 'number' ? row.rl_strikes : 0;

  const elapsedMs = Math.max(0, now - prevAt);
  const refilled = Math.min(BUCKET_CAPACITY, prevTokens + elapsedMs * BUCKET_REFILL_PER_MS);

  if (refilled < 1) {
    const nextStrikes = prevStrikes + 1;
    if (nextStrikes >= AUTO_CLOSE_SESSION_STRIKES) {
      await db
        .prepare(
          `UPDATE discord_access
           SET active_session_id = NULL,
               session_expires_at = NULL,
               rl_tokens = ?,
               rl_updated_at = ?,
               rl_strikes = ?,
               updated_at = ?
           WHERE discord_user_id = ?`,
        )
        .bind(refilled, now, nextStrikes, now, discordUserId)
        .run();
      throw new HttpError(
        'Phiên đọc đã tự động đóng do phát hiện truy vấn hàng loạt tốc độ cao bất thường.',
        401,
      );
    }

    await db
      .prepare(
        'UPDATE discord_access SET rl_tokens = ?, rl_updated_at = ?, rl_strikes = ? WHERE discord_user_id = ?',
      )
      .bind(refilled, now, nextStrikes, discordUserId)
      .run();

    const waitSec = Math.max(3, Math.ceil((1 - refilled) / BUCKET_REFILL_PER_MS / 1000));
    throw new HttpError(
      `Bạn đang chuyển chương liên tục quá nhanh. Vui lòng đợi khoảng ${waitSec} giây rồi thử lại.`,
      429,
      { 'Retry-After': String(waitSec) },
    );
  }

  await db
    .prepare(
      'UPDATE discord_access SET rl_tokens = ?, rl_updated_at = ?, rl_strikes = 0 WHERE discord_user_id = ?',
    )
    .bind(refilled - 1, now, discordUserId)
    .run();
}

async function loadManifestRecord(
  env: Env,
  bookId: string,
): Promise<{ packKey: string; manifest: GuestBookManifest }> {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  await ensureDiscordAccessTable(env.DB);
  const row = await env.DB.prepare(
    'SELECT pack_key, manifest_json FROM book_guest_packs WHERE book_id = ?',
  )
    .bind(bookId)
    .first<{ pack_key: string; manifest_json: string }>();
  if (!row) {
    throw new HttpError(
      'Sách này chưa bật gói đọc chế độ khách. Hãy nhờ chủ thư viện bấm đồng bộ bảo mật cho sách này.',
      404,
    );
  }
  return {
    packKey: row.pack_key,
    manifest: JSON.parse(row.manifest_json) as GuestBookManifest,
  };
}

export async function getGuestBookToc(env: Env, auth: AuthContext, bookId: string) {
  await assertGuestBookAccess(env.DB, auth, bookId);
  const { manifest } = await loadManifestRecord(env, bookId);
  return {
    bookId,
    watermarkLabel: auth.watermarkLabel ?? 'Ofu Library',
    chapters: manifest.chapters.map((ch, idx) => ({
      id: ch.id,
      title: ch.title,
      chapterNumber: idx + 1,
    })),
  };
}

export async function getGuestEncryptedChapter(
  env: Env,
  auth: AuthContext,
  bookId: string,
  chapterIndex: number,
) {
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
    throw new HttpError('Chỉ số chương không hợp lệ.', 400);
  }
  await assertGuestBookAccess(env.DB, auth, bookId);
  const { packKey, manifest } = await loadManifestRecord(env, bookId);
  const chapterMeta = manifest.chapters[chapterIndex];
  if (!chapterMeta) throw new HttpError('Không tìm thấy chương yêu cầu.', 404);

  if (auth.role === 'guest') {
    await consumeGuestChapterToken(env.DB, auth.userId);
  }

  const obj = await env.BOOKS_BUCKET.get(packKey, {
    range: { offset: chapterMeta.offset, length: chapterMeta.length },
  });
  if (!obj || !('body' in obj) || !obj.body) {
    throw new HttpError('Không tìm thấy dữ liệu chương trên kho lưu trữ.', 404);
  }

  const decompressedStream = obj.body.pipeThrough(new DecompressionStream('gzip'));
  const rawJsonText = await new Response(decompressedStream).text();
  const parsedChapter = JSON.parse(rawJsonText) as StoredChapterData;

  let blocks = parsedChapter.blocks || [];
  if (auth.role === 'guest') {
    const bits32 = await deriveUserWatermarkBits(resolveSigningSecret(env), auth.userId);
    blocks = applyForensicWatermarkToBlocks(blocks, bits32);
  }

  const payloadBytes = new TextEncoder().encode(
    JSON.stringify({
      id: chapterMeta.id,
      title: parsedChapter.title || chapterMeta.title,
      chapterNumber: chapterIndex + 1,
      watermarkLabel: auth.watermarkLabel ?? 'Ofu Library',
      blocks,
    }),
  );

  const encrypted = await encryptForSession(payloadBytes, auth.tokenSignature, bookId);
  return {
    iv: encrypted.ivBase64,
    nonce: encrypted.nonceHex,
    data: bytesToBase64(new Uint8Array(encrypted.ciphertext)),
  };
}

export async function getGuestEncryptedMediaResponse(
  env: Env,
  auth: AuthContext,
  bookId: string,
  mediaIndex: number,
  corsApply: (headers: Headers) => void,
): Promise<Response> {
  if (!Number.isInteger(mediaIndex) || mediaIndex < 0) {
    throw new HttpError('Chỉ số ảnh minh hoạ không hợp lệ.', 400);
  }
  await assertGuestBookAccess(env.DB, auth, bookId);
  const { manifest } = await loadManifestRecord(env, bookId);
  const mediaMeta = manifest.media[mediaIndex];
  if (!mediaMeta) throw new HttpError('Không tìm thấy ảnh minh hoạ.', 404);

  const bookRow = await env.DB.prepare('SELECT file_key FROM books WHERE id = ?')
    .bind(bookId)
    .first<{ file_key: string }>();
  if (!bookRow) throw new HttpError('Không tìm thấy tệp sách gốc.', 404);

  const obj = await env.BOOKS_BUCKET.get(bookRow.file_key, {
    range: { offset: mediaMeta.offset, length: mediaMeta.length },
  });
  if (!obj || !('body' in obj) || !obj.body) {
    throw new HttpError('Không đọc được dữ liệu ảnh minh hoạ từ R2.', 404);
  }

  let imageBytes: Uint8Array;
  if (mediaMeta.compression === 8) {
    const inflated = obj.body.pipeThrough(new DecompressionStream('deflate-raw'));
    imageBytes = new Uint8Array(await new Response(inflated).arrayBuffer());
  } else {
    imageBytes = new Uint8Array(await obj.arrayBuffer());
  }

  const encrypted = await encryptForSession(imageBytes, auth.tokenSignature, bookId);
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Guest-Iv': encrypted.ivBase64,
    'X-Guest-Nonce': encrypted.nonceHex,
    'X-Guest-Mime': mediaMeta.mime,
  });
  corsApply(headers);
  return new Response(encrypted.ciphertext, { status: 200, headers });
}

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
