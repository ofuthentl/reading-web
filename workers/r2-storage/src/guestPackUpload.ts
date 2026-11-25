import { HttpError, ensureDiscordAccessTable } from './auth';
import { toCanonicalChapterKey } from './bookChapterAccessDb';
import { type Env, assertQuota, getLimitBytes, isValidId } from './booksDb';

export const GUEST_PACK_MAGIC = 'OFGP';
export const MAX_GUEST_PACK_ENVELOPE_BYTES = 25 * 1024 * 1024; // 25 MiB
export const MAX_MEDIA_SLICE_BYTES = 25 * 1024 * 1024; // 25 MiB

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
  ch?: string[];
}

export interface GuestBookManifest {
  v: 1;
  chapters: GuestManifestChapter[];
  media: GuestManifestMedia[];
}

export function parseAndValidateManifest(
  rawJson: string,
  packByteLength: number,
): GuestBookManifest {
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
    let ch: string[] | undefined;
    if (Array.isArray(m.ch) && m.ch.length > 0 && m.ch.length <= 200) {
      const cleanKeys = m.ch
        .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
        .map((k) => toCanonicalChapterKey(k).slice(0, 120))
        .filter(Boolean);
      if (cleanKeys.length > 0) {
        ch = Array.from(new Set(cleanKeys));
      }
    }
    return {
      offset: m.offset,
      length: m.length,
      compression: m.compression,
      mime: m.mime.slice(0, 64),
      ...(ch ? { ch } : {}),
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

  // Kiểm tra Content-Length trước khi nạp toàn bộ gói vào RAM Worker (vá M-7)
  const declaredLen = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_GUEST_PACK_ENVELOPE_BYTES) {
    throw new HttpError('Kích thước gói bảo mật khách vượt tối đa 25 MB.', 413);
  }

  await ensureDiscordAccessTable(env.DB);
  const [bookRes, existingPackRes, booksSumRes, packsSumRes] = await env.DB.batch([
    env.DB.prepare('SELECT id, file_type, file_size FROM books WHERE id = ?').bind(bookId),
    env.DB.prepare(
      'SELECT pack_key, pack_size, chapter_count, manifest_json, updated_at FROM book_guest_packs WHERE book_id = ?',
    ).bind(bookId),
    env.DB.prepare(
      'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
    ),
    env.DB.prepare('SELECT COALESCE(SUM(pack_size), 0) AS pack_bytes FROM book_guest_packs'),
  ]);

  const book =
    (bookRes.results?.[0] as { id: string; file_type: string; file_size: number } | undefined) ??
    null;
  if (!book) throw new HttpError('Không tìm thấy sách.', 404);
  if (book.file_type !== 'epub' && book.file_type !== 'docx') {
    throw new HttpError('Gói bảo mật chế độ khách chỉ áp dụng cho sách EPUB và DOCX.', 400);
  }

  const existingPack =
    (existingPackRes.results?.[0] as
      | {
          pack_key: string;
          pack_size: number;
          chapter_count: number;
          manifest_json: string;
          updated_at: number;
        }
      | undefined) ?? null;
  const oldPackSize = existingPack?.pack_size ?? 0;

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

  const limitBytes = getLimitBytes(env);
  const preUsedBytes =
    Number((booksSumRes.results?.[0] as { used_bytes?: number } | undefined)?.used_bytes ?? 0) +
    Number((packsSumRes.results?.[0] as { pack_bytes?: number } | undefined)?.pack_bytes ?? 0);
  assertQuota(preUsedBytes - oldPackSize, packBytes.byteLength, limitBytes);

  // Dùng pack_key có phiên bản thời gian để không làm hỏng khách đang đọc gói cũ (vá M-7)
  const now = Date.now();
  const packKey = `guest-packs/${bookId}-${now}.pack`;
  const putRes = await env.BOOKS_BUCKET.put(packKey, packBytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });
  if (!putRes) throw new HttpError('Không thể lưu gói bảo mật vào R2.', 500);

  const normalizedManifestStr = JSON.stringify(validatedManifest);
  let postBooksSum: { used_bytes?: number; book_count?: number } | undefined;
  let postPacksSum: { pack_bytes?: number } | undefined;
  try {
    const [, booksAfterRes, packsAfterRes] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO book_guest_packs (book_id, pack_key, pack_size, chapter_count, manifest_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(book_id) DO UPDATE SET
           pack_key = excluded.pack_key,
           pack_size = excluded.pack_size,
           chapter_count = excluded.chapter_count,
           manifest_json = excluded.manifest_json,
           updated_at = excluded.updated_at`,
      ).bind(
        bookId,
        packKey,
        putRes.size,
        validatedManifest.chapters.length,
        normalizedManifestStr,
        now,
      ),
      env.DB.prepare(
        'SELECT COALESCE(SUM(file_size + cover_size), 0) AS used_bytes, COUNT(*) AS book_count FROM books',
      ),
      env.DB.prepare('SELECT COALESCE(SUM(pack_size), 0) AS pack_bytes FROM book_guest_packs'),
    ]);
    postBooksSum = booksAfterRes.results?.[0] as
      | { used_bytes?: number; book_count?: number }
      | undefined;
    postPacksSum = packsAfterRes.results?.[0] as { pack_bytes?: number } | undefined;
  } catch (dbErr) {
    const committed = await env.DB.prepare('SELECT pack_key FROM book_guest_packs WHERE book_id = ?')
      .bind(bookId)
      .first<{ pack_key: string }>()
      .catch(() => null);
    if (!committed || committed.pack_key !== packKey) {
      await env.BOOKS_BUCKET.delete(packKey).catch(() => undefined);
    }
    throw dbErr;
  }

  const usedBytes = Number(postBooksSum?.used_bytes ?? 0) + Number(postPacksSum?.pack_bytes ?? 0);
  if (usedBytes > limitBytes) {
    if (existingPack) {
      await env.DB.prepare(
        `UPDATE book_guest_packs
         SET pack_key = ?, pack_size = ?, chapter_count = ?, manifest_json = ?, updated_at = ?
         WHERE book_id = ?`,
      )
        .bind(
          existingPack.pack_key,
          existingPack.pack_size,
          existingPack.chapter_count,
          existingPack.manifest_json,
          existingPack.updated_at,
          bookId,
        )
        .run()
        .catch(() => undefined);
    } else {
      await env.DB.prepare('DELETE FROM book_guest_packs WHERE book_id = ?')
        .bind(bookId)
        .run()
        .catch(() => undefined);
    }
    await env.BOOKS_BUCKET.delete(packKey).catch(() => undefined);
    assertQuota(Math.max(0, usedBytes - putRes.size), putRes.size, limitBytes);
  }

  if (existingPack?.pack_key && existingPack.pack_key !== packKey) {
    await env.BOOKS_BUCKET.delete(existingPack.pack_key).catch(() => undefined);
  }

  return {
    ok: true,
    bookId,
    chapterCount: validatedManifest.chapters.length,
    packSize: putRes.size,
    storage: {
      usedBytes,
      limitBytes,
      remainingBytes: Math.max(0, limitBytes - usedBytes),
      bookCount: Number(postBooksSum?.book_count ?? 0),
    },
  };
}
