import { type AuthContext, HttpError, resolveSigningSecret } from './auth';
import { toCanonicalChapterKey } from './bookChapterAccessDb';
import { type Env, isValidId } from './booksDb';
import {
  type WatermarkBlock,
  applyForensicWatermarkToBlocks,
  deriveUserWatermarkBits,
  watermarkTextString,
} from './forensicWatermark';
import {
  assertGuestMediaInUnlockedChaptersFast,
  loadGuestBookAccessAndPackBatch,
} from './guestAccessBatchDb';
import {
  listDiscordGuests,
  runAdminForensicCheck,
  setDiscordGuestBan,
} from './guestAdminDb';
import {
  GUEST_PACK_MAGIC,
  type GuestBookManifest,
  type GuestManifestChapter,
  type GuestManifestMedia,
  MAX_GUEST_PACK_ENVELOPE_BYTES,
  MAX_MEDIA_SLICE_BYTES,
  uploadBookGuestPack,
} from './guestPackUpload';
import { consumeGuestRateToken } from './rateLimitDb';
import { applySecurityHeaders } from './securityHeaders';

export {
  GUEST_PACK_MAGIC,
  type GuestBookManifest,
  type GuestManifestChapter,
  type GuestManifestMedia,
  MAX_GUEST_PACK_ENVELOPE_BYTES,
  MAX_MEDIA_SLICE_BYTES,
  listDiscordGuests,
  runAdminForensicCheck,
  setDiscordGuestBan,
  uploadBookGuestPack,
};

interface StoredChapterData {
  title: string;
  blocks: WatermarkBlock[];
  footnotes?: Record<string, string>;
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

async function buildEncryptedChapterPayload(
  env: Env,
  auth: AuthContext,
  bookId: string,
  packKey: string,
  chapterMeta: GuestManifestChapter,
  chapterIndex: number,
): Promise<{ iv: string; nonce: string; data: string }> {
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
  let footnotes: Record<string, string> | undefined;
  if (parsedChapter.footnotes && typeof parsedChapter.footnotes === 'object') {
    footnotes = { ...parsedChapter.footnotes };
  }
  if (auth.role === 'guest') {
    const bits32 = await deriveUserWatermarkBits(resolveSigningSecret(env), auth.userId);
    blocks = applyForensicWatermarkToBlocks(blocks, bits32);
    if (footnotes) {
      for (const [k, val] of Object.entries(footnotes)) {
        if (typeof val === 'string') {
          footnotes[k] = watermarkTextString(val, bits32);
        }
      }
    }
  }

  const payloadBytes = new TextEncoder().encode(
    JSON.stringify({
      id: chapterMeta.id,
      title: parsedChapter.title || chapterMeta.title,
      chapterNumber: chapterIndex + 1,
      watermarkLabel: auth.watermarkLabel ?? 'Ofu Library',
      blocks,
      ...(footnotes && Object.keys(footnotes).length > 0 ? { footnotes } : {}),
    }),
  );

  const encrypted = await encryptForSession(payloadBytes, auth.tokenSignature, bookId);
  return {
    iv: encrypted.ivBase64,
    nonce: encrypted.nonceHex,
    data: bytesToBase64(new Uint8Array(encrypted.ciphertext)),
  };
}

export async function getGuestBookToc(
  env: Env,
  auth: AuthContext,
  bookId: string,
  options?: {
    includeChapterIndex?: number;
    includeChapterId?: string;
    onRateLimited?: () => void;
  },
) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  const { packKey, manifestJson, lockedChapterKeys } = await loadGuestBookAccessAndPackBatch(
    env.DB,
    auth,
    bookId,
  );
  const manifest = JSON.parse(manifestJson) as GuestBookManifest;

  const chapters = manifest.chapters.map((ch, idx) => {
    const isLocked = lockedChapterKeys.has(toCanonicalChapterKey(ch.id));
    return {
      id: ch.id,
      title: ch.title,
      chapterNumber: idx + 1,
      compressedBytes: ch.length,
      ...(isLocked ? { locked: true } : {}),
    };
  });

  // QĐ-3A: đính kèm sẵn chương mở đầu đã mã hoá ngay trong phản hồi /toc (cắt 2 vòng mạng → 1 vòng)
  let initialChapter:
    | { chapterIndex: number; iv: string; nonce: string; data: string }
    | undefined;
  const wantsInitial =
    options?.includeChapterIndex !== undefined || Boolean(options?.includeChapterId);

  if (wantsInitial && manifest.chapters.length > 0) {
    let targetIdx = 0;
    if (options?.includeChapterId) {
      const byId = manifest.chapters.findIndex((c) => c.id === options.includeChapterId);
      targetIdx =
        byId >= 0
          ? byId
          : Math.max(0, Math.min(options.includeChapterIndex ?? 0, manifest.chapters.length - 1));
    } else if (typeof options?.includeChapterIndex === 'number') {
      targetIdx = Math.max(0, Math.min(options.includeChapterIndex, manifest.chapters.length - 1));
    }

    if (chapters[targetIdx]?.locked) {
      targetIdx = chapters.findIndex((c) => !c.locked);
    }

    if (targetIdx >= 0 && manifest.chapters[targetIdx]) {
      try {
        if (auth.role === 'guest') {
          await consumeGuestRateToken(env.DB, auth.userId, {
            cost: 1,
            trackStrikes: true,
            tooFastMessage: (waitSec) =>
              `Bạn đang chuyển chương liên tục quá nhanh. Vui lòng đợi khoảng ${waitSec} giây rồi thử lại.`,
          });
        }
        const encrypted = await buildEncryptedChapterPayload(
          env,
          auth,
          bookId,
          packKey,
          manifest.chapters[targetIdx],
          targetIdx,
        );
        initialChapter = { chapterIndex: targetIdx, ...encrypted };
      } catch (err) {
        // Không bao giờ nuốt 401 khi phiên Guest vừa chạm strike 10 tự đóng cửa
        if (err instanceof HttpError && err.status === 401) {
          throw err;
        }
        if (err instanceof HttpError && err.status === 429) {
          options?.onRateLimited?.();
        }
        // Bỏ qua gọn lỗi 429/lỗi tạm khi đính kèm initialChapter để /toc vẫn trả mục lục và client xử lý lỗi chương chuẩn
      }
    }
  }

  return {
    bookId,
    watermarkLabel: auth.watermarkLabel ?? 'Ofu Library',
    chapters,
    ...(initialChapter ? { initialChapter } : {}),
  };
}

export async function getGuestEncryptedChapter(
  env: Env,
  auth: AuthContext,
  bookId: string,
  chapterIndex: number,
) {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
    throw new HttpError('Chỉ số chương không hợp lệ.', 400);
  }
  const { packKey, manifestJson, lockedChapterKeys } = await loadGuestBookAccessAndPackBatch(
    env.DB,
    auth,
    bookId,
  );
  const manifest = JSON.parse(manifestJson) as GuestBookManifest;
  const chapterMeta = manifest.chapters[chapterIndex];
  if (!chapterMeta) throw new HttpError('Không tìm thấy chương yêu cầu.', 404);

  if (
    auth.role === 'guest' &&
    lockedChapterKeys.has(toCanonicalChapterKey(chapterMeta.id))
  ) {
    throw new HttpError('🔒 Chương này chỉ mở cho thành viên Discord được chỉ định.', 403);
  }

  if (auth.role === 'guest') {
    await consumeGuestRateToken(env.DB, auth.userId, {
      cost: 1,
      trackStrikes: true,
      tooFastMessage: (waitSec) =>
        `Bạn đang chuyển chương liên tục quá nhanh. Vui lòng đợi khoảng ${waitSec} giây rồi thử lại.`,
    });
  }

  return buildEncryptedChapterPayload(env, auth, bookId, packKey, chapterMeta, chapterIndex);
}

export async function getGuestEncryptedMediaResponse(
  env: Env,
  auth: AuthContext,
  bookId: string,
  mediaIndex: number,
  corsApply: (headers: Headers) => void,
): Promise<Response> {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  if (!Number.isInteger(mediaIndex) || mediaIndex < 0) {
    throw new HttpError('Chỉ số ảnh minh hoạ không hợp lệ.', 400);
  }

  const { fileKey, packKey, manifestJson, lockedChapterKeys } =
    await loadGuestBookAccessAndPackBatch(env.DB, auth, bookId);
  const manifest = JSON.parse(manifestJson) as GuestBookManifest;
  const mediaMeta = manifest.media[mediaIndex];
  if (!mediaMeta) throw new HttpError('Không tìm thấy ảnh minh hoạ.', 404);
  if (!fileKey) throw new HttpError('Không tìm thấy tệp sách gốc.', 404);

  if (auth.role === 'guest') {
    await consumeGuestRateToken(env.DB, auth.userId, {
      cost: 0.2,
      trackStrikes: false,
      tooFastMessage: (waitSec) =>
        `Bạn đang tải ảnh minh hoạ quá nhanh. Vui lòng đợi khoảng ${waitSec} giây rồi thử lại.`,
    });
    if (lockedChapterKeys.size > 0) {
      await assertGuestMediaInUnlockedChaptersFast(
        env.BOOKS_BUCKET,
        packKey,
        manifest.chapters,
        mediaIndex,
        mediaMeta.ch,
        lockedChapterKeys,
      );
    }
  }

  const obj = await env.BOOKS_BUCKET.get(fileKey, {
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
  applySecurityHeaders(headers);
  corsApply(headers);
  return new Response(encrypted.ciphertext, { status: 200, headers });
}
