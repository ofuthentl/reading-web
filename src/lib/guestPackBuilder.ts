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

export async function buildGuestPackEnvelope(blob: Blob, book: Book): Promise<Uint8Array> {
  if (book.file_type !== 'epub' && book.file_type !== 'docx') {
    throw new Error('Chỉ hỗ trợ tạo gói bảo mật khách cho EPUB và DOCX.');
  }

  const arrayBuffer = await blob.arrayBuffer();
  const zipMap = parseZipEntryOffsets(arrayBuffer);
  const parsed = await parseBookBlob(blob, book, {
    skipMediaBlobs: true,
    arrayBuffer,
  });

  try {
    const mediaByZipPath = new Map<string, number>();
    const mediaList: PackManifestMedia[] = [];
    const manifestChapters: PackManifestChapter[] = [];
    const compressedChunks: Uint8Array[] = [];
    let currentOffset = 0;

    for (const chapter of parsed.chapters) {
      const rawBlocks = convertChapterToGuestBlocks(chapter, zipMap, mediaByZipPath, mediaList);
      const chapterFootnotes = extractChapterFootnotesForGuestPack(chapter, parsed.chapters);
      const segments = splitOversizedChapter(chapter.id, chapter.title, rawBlocks);

      for (const seg of segments) {
        const chapterJsonBytes = new TextEncoder().encode(
          JSON.stringify({
            title: seg.title,
            blocks: seg.blocks,
            ...(chapterFootnotes ? { footnotes: chapterFootnotes } : {}),
          }),
        );
        const compressed = await gzipCompressBytes(chapterJsonBytes);
        manifestChapters.push({
          id: seg.id,
          title: seg.title,
          offset: currentOffset,
          length: compressed.byteLength,
        });
        compressedChunks.push(compressed);
        currentOffset += compressed.byteLength;
      }
    }

    const manifest: PackManifest = {
      v: 1,
      chapters: manifestChapters,
      media: mediaList,
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));

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

export async function buildAndUploadGuestPack(
  blob: Blob,
  book: Book,
): Promise<{ chapterCount: number; packSize: number; storage?: StorageStats }> {
  const envelope = await buildGuestPackEnvelope(blob, book);
  const res = await apiFetch(`/api/books/${book.id}/guest-pack`, {
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
    throw new Error(data.error || 'Không thể tải gói bảo mật chế độ khách lên máy chủ.');
  }
  return {
    chapterCount: data.chapterCount ?? 0,
    packSize: data.packSize ?? envelope.byteLength,
    storage: data.storage,
  };
}
