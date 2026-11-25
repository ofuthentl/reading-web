import type JSZip from 'jszip';
import type { Book, GuestBlock, StorageStats } from '@/types';
import { apiFetch } from '@/lib/authSession';
import { extractChapterFootnotesForGuestPack } from '@/lib/epubFootnotes';
import {
  type PackManifestMedia,
  convertChapterToGuestBlocks,
} from '@/lib/guestPackHtml';
import { parseBookBlob } from '@/lib/parsers';
import { parseZipEntryOffsets } from '@/lib/zipDirectory';

const GUEST_PACK_MAGIC_BYTES = [0x4f, 0x46, 0x47, 0x50]; // "OFGP"
const GZIP_CONCURRENCY = 6;
const MAX_MEDIA_CHAPTER_KEYS = 200;

export interface GuestPackPreloadedZip {
  arrayBuffer?: ArrayBuffer;
  zip?: JSZip;
  signal?: AbortSignal;
}

function createPackAbortError(): Error {
  return typeof DOMException !== 'undefined'
    ? new DOMException('The operation was aborted.', 'AbortError')
    : new Error('The operation was aborted.');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createPackAbortError();
}

interface PackManifestChapter {
  id: string;
  title: string;
  offset: number;
  length: number;
}

interface PackManifest {
  v: 1;
  chapters: PackManifestChapter[];
  media: PackManifestMedia[];
}

const MAX_BLOCKS_PER_PACK_CHAPTER = 260;
const TARGET_BLOCKS_PER_SEGMENT = 210;

function splitOversizedChapter(
  chapterId: string,
  chapterTitle: string,
  blocks: GuestBlock[],
): Array<{ id: string; title: string; blocks: GuestBlock[] }> {
  if (blocks.length <= MAX_BLOCKS_PER_PACK_CHAPTER) {
    return [{ id: chapterId, title: chapterTitle, blocks }];
  }

  const rawChunks: GuestBlock[][] = [];
  let start = 0;
  while (start < blocks.length) {
    if (blocks.length - start <= MAX_BLOCKS_PER_PACK_CHAPTER) {
      rawChunks.push(blocks.slice(start));
      break;
    }
    let splitAt = start + TARGET_BLOCKS_PER_SEGMENT;
    const searchFrom = Math.max(start + 90, splitAt - 45);
    const searchTo = Math.min(blocks.length - 40, splitAt + 45);
    for (let i = searchFrom; i <= searchTo; i += 1) {
      if (blocks[i].kind === 'h' || blocks[i].kind === 'hr') {
        splitAt = blocks[i].kind === 'hr' ? i + 1 : i;
        break;
      }
    }
    rawChunks.push(blocks.slice(start, splitAt));
    start = splitAt;
  }

  return rawChunks.map((segBlocks, idx) => {
    const first = segBlocks[0];
    const headingLabel =
      idx > 0 && first?.kind === 'h'
        ? first.spans.map((s) => s.t).join('').trim().slice(0, 120)
        : '';
    const segTitle = headingLabel || `${chapterTitle} (${idx + 1}/${rawChunks.length})`;
    return {
      id: idx === 0 ? chapterId : `${chapterId}-p${idx + 1}`,
      title: segTitle,
      blocks: segBlocks,
    };
  });
}

async function gzipCompressBytes(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

async function compressSegmentsInParallel(
  payloads: readonly Uint8Array[],
  concurrency: number,
  signal?: AbortSignal,
): Promise<Uint8Array[]> {
  if (payloads.length === 0) return [];
  throwIfAborted(signal);
  const results = new Array<Uint8Array>(payloads.length);
  let cursor = 0;
  const workerCount = Math.min(concurrency, payloads.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < payloads.length) {
        throwIfAborted(signal);
        const idx = cursor;
        cursor += 1;
        results[idx] = await gzipCompressBytes(payloads[idx]);
      }
    }),
  );
  throwIfAborted(signal);
  return results;
}

function toCanonicalChapterKey(chapterId: string): string {
  return chapterId.normalize('NFC').trim().replace(/-p\d+$/i, '');
}

export async function buildGuestPackEnvelope(
  blob: Blob,
  book: Book,
  preloaded?: GuestPackPreloadedZip,
): Promise<Uint8Array> {
  if (book.file_type !== 'epub' && book.file_type !== 'docx') {
    throw new Error('Chỉ hỗ trợ tạo gói bảo mật khách cho EPUB và DOCX.');
  }

  const signal = preloaded?.signal;
  throwIfAborted(signal);
  const arrayBuffer = preloaded?.arrayBuffer ?? (await blob.arrayBuffer());
  throwIfAborted(signal);
  const zipMap = parseZipEntryOffsets(arrayBuffer);
  const parsed = await parseBookBlob(blob, book, {
    skipMediaBlobs: true,
    arrayBuffer,
    preloadedZip: preloaded?.zip,
  });

  try {
    throwIfAborted(signal);
    const encoder = new TextEncoder();
    const mediaByZipPath = new Map<string, number>();
    const mediaList: PackManifestMedia[] = [];
    const mediaChapterKeys = new Map<number, Set<string>>();
    const pendingSegments: Array<{ id: string; title: string; jsonBytes: Uint8Array }> = [];

    for (const chapter of parsed.chapters) {
      throwIfAborted(signal);
      // Parse HTML đúng 1 lần duy nhất cho cả chuyển đổi block và trích chú thích
      const parsedDoc =
        chapter.content_html && typeof DOMParser !== 'undefined'
          ? new DOMParser().parseFromString(chapter.content_html, 'text/html')
          : undefined;
      const rawBlocks = convertChapterToGuestBlocks(
        chapter,
        zipMap,
        mediaByZipPath,
        mediaList,
        parsedDoc,
      );
      const chapterFootnotes = extractChapterFootnotesForGuestPack(
        chapter,
        parsed.chapters,
        parsedDoc,
      );
      const canonicalKey = toCanonicalChapterKey(chapter.id);
      if (canonicalKey) {
        for (const block of rawBlocks) {
          if (block.kind !== 'img') continue;
          let keySet = mediaChapterKeys.get(block.mediaIndex);
          if (!keySet) {
            keySet = new Set<string>();
            mediaChapterKeys.set(block.mediaIndex, keySet);
          }
          keySet.add(canonicalKey);
        }
      }

      const segments = splitOversizedChapter(chapter.id, chapter.title, rawBlocks);
      for (const seg of segments) {
        pendingSegments.push({
          id: seg.id,
          title: seg.title,
          jsonBytes: encoder.encode(
            JSON.stringify({
              title: seg.title,
              blocks: seg.blocks,
              ...(chapterFootnotes ? { footnotes: chapterFootnotes } : {}),
            }),
          ),
        });
      }
    }

    // Ghi bảng ánh xạ `media.ch` (QĐ-3A) — bỏ qua nếu ảnh lặp > 200 chương để Worker tự fallback chính xác
    for (let i = 0; i < mediaList.length; i += 1) {
      const keys = mediaChapterKeys.get(i);
      if (keys && keys.size > 0 && keys.size <= MAX_MEDIA_CHAPTER_KEYS) {
        mediaList[i].ch = Array.from(keys);
      }
    }

    // Nén gzip song song (tối đa 6 luồng) trong khi giữ nguyên thứ tự offset chương
    const compressedChunks = await compressSegmentsInParallel(
      pendingSegments.map((s) => s.jsonBytes),
      GZIP_CONCURRENCY,
      signal,
    );

    const manifestChapters: PackManifestChapter[] = [];
    let currentOffset = 0;
    for (let i = 0; i < pendingSegments.length; i += 1) {
      const seg = pendingSegments[i];
      const compressed = compressedChunks[i];
      manifestChapters.push({
        id: seg.id,
        title: seg.title,
        offset: currentOffset,
        length: compressed.byteLength,
      });
      currentOffset += compressed.byteLength;
    }

    const manifest: PackManifest = {
      v: 1,
      chapters: manifestChapters,
      media: mediaList,
    };
    const manifestBytes = encoder.encode(JSON.stringify(manifest));

    const totalEnvelopeSize = 8 + manifestBytes.byteLength + currentOffset;
    const envelope = new Uint8Array(totalEnvelopeSize);
    envelope.set(GUEST_PACK_MAGIC_BYTES, 0);
    new DataView(envelope.buffer).setUint32(4, manifestBytes.byteLength, true);
    envelope.set(manifestBytes, 8);

    let writePos = 8 + manifestBytes.byteLength;
    for (const chunk of compressedChunks) {
      envelope.set(chunk, writePos);
      writePos += chunk.byteLength;
    }
    return envelope;
  } finally {
    parsed.dispose();
  }
}

export async function uploadGuestPackEnvelope(
  bookId: string,
  envelope: Uint8Array,
): Promise<{ chapterCount: number; packSize: number; storage?: StorageStats }> {
  const res = await apiFetch(`/api/books/${bookId}/guest-pack`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: envelope as BodyInit,
  });
  const data = (await res.json().catch(() => ({}))) as {
    chapterCount?: number;
    packSize?: number;
    storage?: StorageStats;
    error?: string;
  };
  if (!res.ok) {
    const err = new Error(
      data.error || 'Không thể tải gói bảo mật chế độ khách lên máy chủ.',
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return {
    chapterCount: data.chapterCount ?? 0,
    packSize: data.packSize ?? envelope.byteLength,
    storage: data.storage,
  };
}

export async function buildAndUploadGuestPack(
  blob: Blob,
  book: Book,
  preloaded?: GuestPackPreloadedZip,
): Promise<{ chapterCount: number; packSize: number; storage?: StorageStats }> {
  const envelope = await buildGuestPackEnvelope(blob, book, preloaded);
  return uploadGuestPackEnvelope(book.id, envelope);
}
