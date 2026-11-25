import { isCloudMode } from '@/lib/api';
import { apiFetch, assertApiConfigured } from '@/lib/authSession';
import { getLocalBooks } from '@/lib/cache';

export type StorageObjectKind = 'book' | 'cover' | 'guest-pack' | 'other';

export interface ReconcileOrphanItem {
  key: string;
  size: number;
  uploadedAt: number;
  ageHours: number;
  kind: StorageObjectKind;
  safeToDelete: boolean;
}

export interface StorageReconcileReport {
  generatedAt: number;
  truncated: boolean;
  nextCursor: string | null;
  scannedPages: number;
  safeAgeHours: number;
  d1: {
    objectCount: number;
    totalBytes: number;
    bookCount: number;
    fileBytes: number;
    coverBytes: number;
    packBytes: number;
  };
  r2: {
    objectCount: number;
    totalBytes: number;
    referencedCount: number;
    referencedBytes: number;
    orphanCount: number;
    orphanBytes: number;
    safeOrphanCount: number;
    safeOrphanBytes: number;
    recentOrphanCount: number;
    recentOrphanBytes: number;
  };
  diffBytes: number;
  missingInR2Count: number;
  missingInR2Sample: string[];
  orphansTruncated: boolean;
  orphans: ReconcileOrphanItem[];
}

export interface StorageCleanupResult {
  ok: boolean;
  deletedKeys: string[];
  deletedCount: number;
  reclaimedBytes: number;
  skippedActiveCount: number;
  skippedRecentCount: number;
  skippedNotFoundCount: number;
}

export async function fetchStorageReconcileReport(options?: {
  cursor?: string | null;
  signal?: AbortSignal;
}): Promise<StorageReconcileReport> {
  assertApiConfigured();
  if (!isCloudMode) {
    const books = await getLocalBooks();
    let fileBytes = 0;
    let coverBytes = 0;
    let objCount = 0;
    for (const b of books) {
      if (b.file_key) objCount += 1;
      if (b.cover_key) objCount += 1;
      fileBytes += b.file_size || 0;
      coverBytes += b.cover_size || 0;
    }
    const totalBytes = fileBytes + coverBytes;
    return {
      generatedAt: Date.now(),
      truncated: false,
      nextCursor: null,
      scannedPages: 1,
      safeAgeHours: 24,
      d1: {
        objectCount: objCount,
        totalBytes,
        bookCount: books.length,
        fileBytes,
        coverBytes,
        packBytes: 0,
      },
      r2: {
        objectCount: objCount,
        totalBytes,
        referencedCount: objCount,
        referencedBytes: totalBytes,
        orphanCount: 0,
        orphanBytes: 0,
        safeOrphanCount: 0,
        safeOrphanBytes: 0,
        recentOrphanCount: 0,
        recentOrphanBytes: 0,
      },
      diffBytes: 0,
      missingInR2Count: 0,
      missingInR2Sample: [],
      orphansTruncated: false,
      orphans: [],
    };
  }

  const query = options?.cursor
    ? `?cursor=${encodeURIComponent(options.cursor)}`
    : '';
  const res = await apiFetch(`/api/admin/storage/reconcile${query}`, {
    signal: options?.signal,
  });
  const data = (await res.json().catch(() => ({}))) as Partial<StorageReconcileReport> & {
    error?: string;
  };
  if (!res.ok || !data.d1 || !data.r2 || !Array.isArray(data.orphans)) {
    throw new Error(data.error || 'Không thể đối soát dung lượng R2 thực tế.');
  }
  return data as StorageReconcileReport;
}

export async function cleanupOrphanStorageKeys(keys: string[]): Promise<StorageCleanupResult> {
  assertApiConfigured();
  if (!isCloudMode) {
    return {
      ok: true,
      deletedKeys: [],
      deletedCount: 0,
      reclaimedBytes: 0,
      skippedActiveCount: 0,
      skippedRecentCount: 0,
      skippedNotFoundCount: 0,
    };
  }

  const res = await apiFetch('/api/admin/storage/reconcile/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<StorageCleanupResult> & {
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Không thể dọn các tệp rác mồ côi trên R2.');
  }
  return {
    ok: true,
    deletedKeys: Array.isArray(data.deletedKeys) ? data.deletedKeys : [],
    deletedCount: Number(data.deletedCount ?? 0),
    reclaimedBytes: Number(data.reclaimedBytes ?? 0),
    skippedActiveCount: Number(data.skippedActiveCount ?? 0),
    skippedRecentCount: Number(data.skippedRecentCount ?? 0),
    skippedNotFoundCount: Number(data.skippedNotFoundCount ?? 0),
  };
}
