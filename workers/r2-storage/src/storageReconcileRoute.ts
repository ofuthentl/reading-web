import { HttpError } from './auth';
import type { Env } from './booksDb';

export const ORPHAN_SAFE_AGE_MS = 24 * 60 * 60 * 1000; // 24 giờ bảo vệ file đang upload
export const MAX_R2_LIST_PAGES_PER_REQUEST = 15; // Giữ chặt dưới trần 50 subrequest Free Tier
export const MAX_CLEANUP_KEYS_PER_REQUEST = 500;
const DEFAULT_R2_PAGE_LIMIT = 1000;
const MAX_RETURNED_ORPHANS = 500;
const MAX_MISSING_SAMPLE = 20;
const MAX_HEAD_FALLBACK_KEYS = 15;

export type StorageObjectKind = 'book' | 'cover' | 'guest-pack' | 'other';

export interface R2ObjectSummary {
  key: string;
  size: number;
  uploadedMs: number;
}

export interface ReconcileOrphanItem {
  key: string;
  size: number;
  uploadedAt: number;
  ageHours: number;
  kind: StorageObjectKind;
  safeToDelete: boolean;
}

export interface OrphanClassificationSummary {
  r2ObjectCount: number;
  r2TotalBytes: number;
  referencedCount: number;
  referencedBytes: number;
  orphanCount: number;
  orphanBytes: number;
  safeOrphanCount: number;
  safeOrphanBytes: number;
  recentOrphanCount: number;
  recentOrphanBytes: number;
  orphans: ReconcileOrphanItem[];
  seenR2Keys: Set<string>;
}

export function detectStorageObjectKind(key: string): StorageObjectKind {
  if (key.startsWith('books/')) return 'book';
  if (key.startsWith('covers/')) return 'cover';
  if (key.startsWith('guest-packs/')) return 'guest-pack';
  return 'other';
}

export function classifyStorageOrphans(
  r2Objects: readonly R2ObjectSummary[],
  d1ReferencedKeys: ReadonlySet<string>,
  nowMs = Date.now(),
  safeAgeMs = ORPHAN_SAFE_AGE_MS,
): OrphanClassificationSummary {
  let r2TotalBytes = 0;
  let referencedCount = 0;
  let referencedBytes = 0;
  let orphanBytes = 0;
  let safeOrphanCount = 0;
  let safeOrphanBytes = 0;
  let recentOrphanCount = 0;
  let recentOrphanBytes = 0;
  const orphans: ReconcileOrphanItem[] = [];
  const seenR2Keys = new Set<string>();

  for (const obj of r2Objects) {
    if (!obj.key) continue;
    seenR2Keys.add(obj.key);
    const size = Math.max(0, Math.floor(Number(obj.size) || 0));
    r2TotalBytes += size;

    if (d1ReferencedKeys.has(obj.key)) {
      referencedCount += 1;
      referencedBytes += size;
      continue;
    }

    const uploadedAt = Number.isFinite(obj.uploadedMs) && obj.uploadedMs > 0 ? obj.uploadedMs : nowMs;
    const ageMs = Math.max(0, nowMs - uploadedAt);
    const safeToDelete = ageMs > safeAgeMs;
    orphanBytes += size;
    if (safeToDelete) {
      safeOrphanCount += 1;
      safeOrphanBytes += size;
    } else {
      recentOrphanCount += 1;
      recentOrphanBytes += size;
    }
    orphans.push({
      key: obj.key,
      size,
      uploadedAt,
      ageHours: Math.round((ageMs / 3_600_000) * 10) / 10,
      kind: detectStorageObjectKind(obj.key),
      safeToDelete,
    });
  }

  orphans.sort((a, b) => {
    if (a.safeToDelete !== b.safeToDelete) return a.safeToDelete ? -1 : 1;
    return b.size - a.size || a.uploadedAt - b.uploadedAt;
  });

  return {
    r2ObjectCount: seenR2Keys.size,
    r2TotalBytes,
    referencedCount,
    referencedBytes,
    orphanCount: orphans.length,
    orphanBytes,
    safeOrphanCount,
    safeOrphanBytes,
    recentOrphanCount,
    recentOrphanBytes,
    orphans,
    seenR2Keys,
  };
}

interface D1StorageInventory {
  referencedKeys: Set<string>;
  bookCount: number;
  objectCount: number;
  fileBytes: number;
  coverBytes: number;
  packBytes: number;
  totalBytes: number;
}

async function loadD1StorageInventory(db: D1Database): Promise<D1StorageInventory> {
  const [booksRes, packsRes] = await Promise.all([
    db
      .prepare('SELECT file_key, file_size, cover_key, cover_size FROM books')
      .all<{
        file_key: string;
        file_size: number;
        cover_key: string | null;
        cover_size: number;
      }>(),
    db
      .prepare('SELECT pack_key, pack_size FROM book_guest_packs')
      .all<{ pack_key: string; pack_size: number }>()
      .catch(() => ({ results: [] as Array<{ pack_key: string; pack_size: number }> })),
  ]);

  const referencedKeys = new Set<string>();
  let fileBytes = 0;
  let coverBytes = 0;
  let packBytes = 0;
  const bookRows = booksRes.results || [];

  for (const row of bookRows) {
    if (row.file_key) referencedKeys.add(row.file_key);
    if (row.cover_key) referencedKeys.add(row.cover_key);
    fileBytes += Math.max(0, Number(row.file_size) || 0);
    coverBytes += Math.max(0, Number(row.cover_size) || 0);
  }
  for (const row of packsRes.results || []) {
    if (row.pack_key) referencedKeys.add(row.pack_key);
    packBytes += Math.max(0, Number(row.pack_size) || 0);
  }

  return {
    referencedKeys,
    bookCount: bookRows.length,
    objectCount: referencedKeys.size,
    fileBytes,
    coverBytes,
    packBytes,
    totalBytes: fileBytes + coverBytes + packBytes,
  };
}

async function scanR2ObjectsPaginated(
  bucket: R2Bucket,
  options?: { cursor?: string | null; limit?: number; maxPages?: number },
): Promise<{
  objects: R2ObjectSummary[];
  truncated: boolean;
  nextCursor: string | null;
  scannedPages: number;
}> {
  const limit = Math.min(DEFAULT_R2_PAGE_LIMIT, Math.max(10, Math.floor(options?.limit ?? DEFAULT_R2_PAGE_LIMIT)));
  const maxPages = Math.min(
    MAX_R2_LIST_PAGES_PER_REQUEST,
    Math.max(1, Math.floor(options?.maxPages ?? MAX_R2_LIST_PAGES_PER_REQUEST)),
  );

  const objects: R2ObjectSummary[] = [];
  let cursor = options?.cursor || undefined;
  let truncated = false;
  let scannedPages = 0;

  while (scannedPages < maxPages) {
    const page = await bucket.list({ limit, ...(cursor ? { cursor } : {}) });
    scannedPages += 1;
    for (const item of page.objects || []) {
      const uploadedMs =
        item.uploaded instanceof Date
          ? item.uploaded.getTime()
          : Number(new Date(item.uploaded as unknown as string | number).getTime());
      objects.push({
        key: item.key,
        size: Number(item.size) || 0,
        uploadedMs: Number.isFinite(uploadedMs) ? uploadedMs : Date.now(),
      });
    }
    if (page.truncated && page.cursor) {
      cursor = page.cursor;
      truncated = true;
    } else {
      cursor = undefined;
      truncated = false;
      break;
    }
  }

  return {
    objects,
    truncated,
    nextCursor: truncated && cursor ? cursor : null,
    scannedPages,
  };
}

export async function reconcileR2Storage(env: Env, url: URL, nowMs = Date.now()) {
  const rawCursor = url.searchParams.get('cursor')?.trim() || null;
  const rawLimit = Number(url.searchParams.get('limit') || DEFAULT_R2_PAGE_LIMIT);
  const rawMaxPages = Number(url.searchParams.get('maxPages') || MAX_R2_LIST_PAGES_PER_REQUEST);

  const [d1, scan] = await Promise.all([
    loadD1StorageInventory(env.DB),
    scanR2ObjectsPaginated(env.BOOKS_BUCKET, {
      cursor: rawCursor,
      limit: Number.isFinite(rawLimit) ? rawLimit : DEFAULT_R2_PAGE_LIMIT,
      maxPages: Number.isFinite(rawMaxPages) ? rawMaxPages : MAX_R2_LIST_PAGES_PER_REQUEST,
    }),
  ]);

  const classified = classifyStorageOrphans(scan.objects, d1.referencedKeys, nowMs);

  let missingInR2Count = 0;
  const missingInR2Sample: string[] = [];
  if (!rawCursor && !scan.truncated) {
    for (const key of d1.referencedKeys) {
      if (!classified.seenR2Keys.has(key)) {
        missingInR2Count += 1;
        if (missingInR2Sample.length < MAX_MISSING_SAMPLE) {
          missingInR2Sample.push(key);
        }
      }
    }
  }

  return {
    generatedAt: nowMs,
    truncated: scan.truncated,
    nextCursor: scan.nextCursor,
    scannedPages: scan.scannedPages,
    safeAgeHours: 24,
    d1: {
      objectCount: d1.objectCount,
      totalBytes: d1.totalBytes,
      bookCount: d1.bookCount,
      fileBytes: d1.fileBytes,
      coverBytes: d1.coverBytes,
      packBytes: d1.packBytes,
    },
    r2: {
      objectCount: classified.r2ObjectCount,
      totalBytes: classified.r2TotalBytes,
      referencedCount: classified.referencedCount,
      referencedBytes: classified.referencedBytes,
      orphanCount: classified.orphanCount,
      orphanBytes: classified.orphanBytes,
      safeOrphanCount: classified.safeOrphanCount,
      safeOrphanBytes: classified.safeOrphanBytes,
      recentOrphanCount: classified.recentOrphanCount,
      recentOrphanBytes: classified.recentOrphanBytes,
    },
    diffBytes: classified.r2TotalBytes - d1.totalBytes,
    missingInR2Count,
    missingInR2Sample,
    orphansTruncated: classified.orphans.length > MAX_RETURNED_ORPHANS,
    orphans: classified.orphans.slice(0, MAX_RETURNED_ORPHANS),
  };
}

export async function cleanupOrphanR2Storage(env: Env, rawBody: unknown, nowMs = Date.now()) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    keys?: unknown;
  } | null;

  if (!Array.isArray(body?.keys)) {
    throw new HttpError('Danh sách khoá cần dọn không hợp lệ.', 400);
  }
  const requestedKeys = Array.from(
    new Set(
      body.keys
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length > 0 && k.length <= 512),
    ),
  );
  if (requestedKeys.length === 0) {
    throw new HttpError('Vui lòng chọn ít nhất 1 tệp mồ côi để dọn.', 400);
  }
  if (requestedKeys.length > MAX_CLEANUP_KEYS_PER_REQUEST) {
    throw new HttpError(
      `Mỗi lượt dọn tối đa ${MAX_CLEANUP_KEYS_PER_REQUEST} tệp mồ côi.`,
      400,
    );
  }

  // Luôn đối chiếu trực tiếp với D1 + tuổi tệp thực tế trên R2 (tuyệt đối không tin dữ liệu client)
  const [d1, scan] = await Promise.all([
    loadD1StorageInventory(env.DB),
    scanR2ObjectsPaginated(env.BOOKS_BUCKET, {
      limit: DEFAULT_R2_PAGE_LIMIT,
      maxPages: MAX_R2_LIST_PAGES_PER_REQUEST,
    }),
  ]);

  const r2Map = new Map<string, R2ObjectSummary>();
  for (const obj of scan.objects) {
    r2Map.set(obj.key, obj);
  }

  // Nếu kho R2 bị phân trang (> 15.000 object), chỉ fallback head() tối đa 15 key để giữ chặt < 50 subrequest
  if (scan.truncated) {
    const missingFromFirstScan = requestedKeys
      .filter((key) => !d1.referencedKeys.has(key) && !r2Map.has(key))
      .slice(0, MAX_HEAD_FALLBACK_KEYS);
    for (const key of missingFromFirstScan) {
      const head = await env.BOOKS_BUCKET.head(key).catch(() => null);
      if (head) {
        const uploadedMs =
          head.uploaded instanceof Date
            ? head.uploaded.getTime()
            : Number(new Date(head.uploaded as unknown as string | number).getTime());
        r2Map.set(key, {
          key: head.key,
          size: Number(head.size) || 0,
          uploadedMs: Number.isFinite(uploadedMs) ? uploadedMs : nowMs,
        });
      }
    }
  }

  const safeKeysToDelete: string[] = [];
  let reclaimedBytes = 0;
  let skippedActiveCount = 0;
  let skippedRecentCount = 0;
  let skippedNotFoundCount = 0;

  for (const key of requestedKeys) {
    if (d1.referencedKeys.has(key)) {
      skippedActiveCount += 1;
      continue;
    }
    const obj = r2Map.get(key);
    if (!obj) {
      skippedNotFoundCount += 1;
      continue;
    }
    const ageMs = Math.max(0, nowMs - obj.uploadedMs);
    if (ageMs <= ORPHAN_SAFE_AGE_MS) {
      skippedRecentCount += 1;
      continue;
    }
    safeKeysToDelete.push(key);
    reclaimedBytes += Math.max(0, Math.floor(obj.size));
  }

  if (safeKeysToDelete.length > 0) {
    await env.BOOKS_BUCKET.delete(safeKeysToDelete);
  }

  return {
    ok: true,
    deletedKeys: safeKeysToDelete,
    deletedCount: safeKeysToDelete.length,
    reclaimedBytes,
    skippedActiveCount,
    skippedRecentCount,
    skippedNotFoundCount,
  };
}
