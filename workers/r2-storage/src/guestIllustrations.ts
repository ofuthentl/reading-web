import { type AuthContext, HttpError } from './auth';
import { toCanonicalChapterKey } from './bookChapterAccessDb';
import { type Env, isValidId } from './booksDb';
import type { WatermarkBlock } from './forensicWatermark';
import { loadGuestBookAccessAndPackBatch } from './guestAccessBatchDb';
import type { GuestBookManifest } from './guestPack';
import { consumeGuestRateToken } from './rateLimitDb';

const MAX_SCAN_CHAPTERS = 400;
const MAX_SCAN_DECOMPRESSED_CHARS = 5_000_000;
const MAX_ILLUSTRATION_ITEMS = 500;
const GALLERY_INDEX_BUCKET_COST = 0.25;

interface StoredGalleryChapter {
  title?: string;
  blocks?: WatermarkBlock[];
}

export interface GuestBookIllustrationItem {
  mediaIndex: number;
  chapterIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  alt: string | null;
}

/**
 * Quét chỉ mục ảnh minh hoạ từ gói `guest-packs/<bookId>.pack` (D-036 Mục 2 & D-046):
 * - Gói mới có `media[i].ch`: đường nhanh 0 lượt đọc R2 (< 0.5ms CPU).
 * - Gói cũ chưa có `media[i].ch`: quét trực tiếp từ gói `OFGP` sẵn có (`0` re-pack), bỏ qua chương khoá.
 */
export async function getGuestBookIllustrations(
  env: Env,
  auth: AuthContext,
  bookId: string,
): Promise<{ bookId: string; illustrations: GuestBookIllustrationItem[]; truncated?: boolean }> {
  if (!isValidId(bookId)) throw new HttpError('ID sách không hợp lệ.', 400);
  const { packKey, manifestJson, lockedChapterKeys } = await loadGuestBookAccessAndPackBatch(
    env.DB,
    auth,
    bookId,
  );

  const manifest = JSON.parse(manifestJson) as GuestBookManifest;
  if (!Array.isArray(manifest.media) || manifest.media.length === 0) {
    return { bookId, illustrations: [] };
  }

  if (auth.role === 'guest') {
    await consumeGuestRateToken(env.DB, auth.userId, {
      cost: GALLERY_INDEX_BUCKET_COST,
      trackStrikes: true,
      tooFastMessage: (waitSec) =>
        `Bạn đang mở danh sách minh hoạ quá nhanh. Vui lòng đợi khoảng ${waitSec} giây rồi thử lại.`,
    });
  }

  // Đường nhanh gói mới: mọi media đều có chỉ mục `ch` → 0 lượt đọc R2 & 0 giải nén gzip
  const canUseFastPath = manifest.media.every((m) => Array.isArray(m.ch) && m.ch.length > 0);
  if (canUseFastPath) {
    const chapterMetaByKey = new Map<string, { index: number; title: string }>();
    for (let i = 0; i < manifest.chapters.length; i += 1) {
      const canonical = toCanonicalChapterKey(manifest.chapters[i].id);
      if (canonical && !chapterMetaByKey.has(canonical)) {
        chapterMetaByKey.set(canonical, { index: i, title: manifest.chapters[i].title });
      }
    }

    const fastItems: GuestBookIllustrationItem[] = [];
    for (let mediaIndex = 0; mediaIndex < manifest.media.length; mediaIndex += 1) {
      const chKeys = manifest.media[mediaIndex].ch || [];
      let earliest: { index: number; title: string } | null = null;
      for (const rawKey of chKeys) {
        const canonical = toCanonicalChapterKey(rawKey);
        if (!canonical || lockedChapterKeys.has(canonical)) continue;
        const meta = chapterMetaByKey.get(canonical);
        if (!meta) continue;
        if (!earliest || meta.index < earliest.index) {
          earliest = meta;
        }
      }
      if (!earliest) continue;
      fastItems.push({
        mediaIndex,
        chapterIndex: earliest.index,
        chapterNumber: earliest.index + 1,
        chapterTitle: earliest.title,
        alt: null,
      });
    }

    fastItems.sort((a, b) => a.chapterIndex - b.chapterIndex || a.mediaIndex - b.mediaIndex);
    const truncated = fastItems.length > MAX_ILLUSTRATION_ITEMS;
    const illustrations = truncated ? fastItems.slice(0, MAX_ILLUSTRATION_ITEMS) : fastItems;
    return {
      bookId,
      illustrations,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  const obj = await env.BOOKS_BUCKET.get(packKey);
  if (!obj) throw new HttpError('Không tìm thấy gói chương trên kho lưu trữ.', 404);

  const packBytes = new Uint8Array(await obj.arrayBuffer());
  const illustrations: GuestBookIllustrationItem[] = [];
  const seenMedia = new Set<number>();

  const scanLimit = Math.min(manifest.chapters.length, MAX_SCAN_CHAPTERS);
  let scannedChars = 0;
  let truncated = manifest.chapters.length > MAX_SCAN_CHAPTERS;

  for (let i = 0; i < scanLimit; i += 1) {
    const chMeta = manifest.chapters[i];
    if (lockedChapterKeys.has(toCanonicalChapterKey(chMeta.id))) continue;
    if (
      chMeta.offset < 0 ||
      chMeta.length <= 0 ||
      chMeta.offset + chMeta.length > packBytes.byteLength
    ) {
      continue;
    }
    const slice = packBytes.subarray(chMeta.offset, chMeta.offset + chMeta.length);
    const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('gzip'));
    const jsonStr = await new Response(stream).text();
    scannedChars += jsonStr.length;

    if (jsonStr.includes('"mediaIndex"')) {
      const parsed = JSON.parse(jsonStr) as StoredGalleryChapter;
      for (const block of parsed.blocks || []) {
        if (block.kind !== 'img') continue;
        if (
          typeof block.mediaIndex !== 'number' ||
          block.mediaIndex < 0 ||
          block.mediaIndex >= manifest.media.length
        ) {
          continue;
        }
        if (seenMedia.has(block.mediaIndex)) continue;
        seenMedia.add(block.mediaIndex);

        illustrations.push({
          mediaIndex: block.mediaIndex,
          chapterIndex: i,
          chapterNumber: i + 1,
          chapterTitle: chMeta.title,
          alt:
            typeof block.alt === 'string' && block.alt.trim()
              ? block.alt.trim().slice(0, 140)
              : null,
        });

        if (illustrations.length >= MAX_ILLUSTRATION_ITEMS) {
          truncated = true;
          break;
        }
      }
    }

    if (illustrations.length >= MAX_ILLUSTRATION_ITEMS) break;
    if (scannedChars >= MAX_SCAN_DECOMPRESSED_CHARS && i + 1 < manifest.chapters.length) {
      truncated = true;
      break;
    }
  }

  return {
    bookId,
    illustrations,
    ...(truncated ? { truncated: true } : {}),
  };
}
