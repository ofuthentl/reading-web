import {
  LOCAL_COLLECTIONS_STORAGE_KEY,
  LOCAL_PTR_BOOKS_STORAGE_KEY,
  LOCAL_PTR_STORAGE_KEY,
  LOCAL_SHELF_RELATIONS_STORAGE_KEY,
  isCloudMode,
} from '@/lib/api';
import { apiFetch, assertApiConfigured } from '@/lib/authSession';
import { getAllLocalProgress } from '@/lib/cache';
import { clearLibraryStateCache } from '@/lib/libraryStateCache';
import { readLocalShelfPrefs } from '@/lib/shelfPrefs';

export type OwnerBackupImportMode = 'merge' | 'replace';

export interface OwnerBackupPayload {
  app: 'ofu-library';
  schemaVersion: 1;
  exportedAt: number;
  data: {
    progress: unknown[];
    bookmarks: unknown[];
    highlights: unknown[];
    shelfPrefs: unknown[];
    shelfRelations: unknown[];
    planToRead: {
      shelves: unknown[];
      books: unknown[];
    };
    collections: unknown[];
    accessRules: {
      shelves: unknown[];
      books: unknown[];
      chapters: unknown[];
    };
  };
}

export interface OwnerBackupSummary {
  exportedAt: number | null;
  progressCount: number;
  bookmarksCount: number;
  highlightsCount: number;
  shelfPrefsCount: number;
  shelfRelationsCount: number;
  planToReadCount: number;
  collectionsCount: number;
  accessRulesCount: number;
}

export interface OwnerBackupImportResult {
  ok: boolean;
  mode: OwnerBackupImportMode;
  skippedMissingBooks: number;
  restored: {
    progress: number;
    bookmarks: number;
    highlights: number;
    shelfPrefs: number;
    shelfRelations: number;
    planToReadShelves: number;
    planToReadBooks: number;
    collections: number;
    shelfAccessRules: number;
    bookAccessRules: number;
    chapterAccessRules: number;
  };
}

export function parseAndSummarizeBackupJson(rawText: string): {
  payload: OwnerBackupPayload;
  summary: OwnerBackupSummary;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Tệp không phải định dạng JSON hợp lệ.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Cấu trúc tệp sao lưu không hợp lệ.');
  }
  const obj = parsed as Partial<OwnerBackupPayload>;
  if (obj.app !== 'ofu-library' || obj.schemaVersion !== 1 || !obj.data || typeof obj.data !== 'object') {
    throw new Error("Tệp JSON không đúng chuẩn sao lưu Ofu's Library (schemaVersion = 1).");
  }
  const d = obj.data;
  const arrLen = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const ptrShelves = arrLen(d.planToRead?.shelves);
  const ptrBooks = arrLen(d.planToRead?.books);
  const accessCount =
    arrLen(d.accessRules?.shelves) +
    arrLen(d.accessRules?.books) +
    arrLen(d.accessRules?.chapters);

  return {
    payload: obj as OwnerBackupPayload,
    summary: {
      exportedAt: typeof obj.exportedAt === 'number' && obj.exportedAt > 0 ? obj.exportedAt : null,
      progressCount: arrLen(d.progress),
      bookmarksCount: arrLen(d.bookmarks),
      highlightsCount: arrLen(d.highlights),
      shelfPrefsCount: arrLen(d.shelfPrefs),
      shelfRelationsCount: arrLen(d.shelfRelations),
      planToReadCount: ptrShelves + ptrBooks,
      collectionsCount: arrLen(d.collections),
      accessRulesCount: accessCount,
    },
  };
}

export async function exportOwnerBackupApi(): Promise<OwnerBackupPayload> {
  assertApiConfigured();
  if (!isCloudMode) {
    const [progressMap] = await Promise.all([getAllLocalProgress()]);
    const prefs = readLocalShelfPrefs();
    const now = Date.now();
    const shelfKeys = Array.from(
      new Set([
        ...Object.keys(prefs.covers || {}),
        ...(prefs.favorites || []),
        ...Object.keys(prefs.tags || {}),
        ...Object.keys(prefs.altTitles || {}),
      ]),
    );
    const readArr = (key: string): unknown[] => {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]') as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    const favSet = new Set(prefs.favorites || []);
    return {
      app: 'ofu-library',
      schemaVersion: 1,
      exportedAt: now,
      data: {
        progress: Object.entries(progressMap).map(([bookId, p]) => ({
          bookId,
          chapterId: p.chapterId,
          chapterIndex: p.chapterIndex,
          chapterTitle: p.chapterTitle ?? null,
          totalChapters: p.totalChapters ?? null,
          scrollRatio: p.scrollRatio,
          scrollTop: p.scrollTop,
          completed: p.completed,
          bookPercent: p.bookPercent ?? null,
          readingSeconds: p.readingSeconds ?? 0,
          rereadCount: p.rereadCount ?? 0,
          updatedAt: p.updatedAt,
        })),
        bookmarks: [],
        highlights: [],
        shelfPrefs: shelfKeys.map((shelfKey) => ({
          shelfKey,
          coverBookId: prefs.covers?.[shelfKey] ?? null,
          isFavorite: favSet.has(shelfKey),
          tags: prefs.tags?.[shelfKey] ?? [],
          altTitles: prefs.altTitles?.[shelfKey] ?? [],
          updatedAt: now,
        })),
        shelfRelations: readArr(LOCAL_SHELF_RELATIONS_STORAGE_KEY),
        planToRead: {
          shelves: readArr(LOCAL_PTR_STORAGE_KEY).map((k) => ({ shelfKey: String(k), createdAt: now })),
          books: readArr(LOCAL_PTR_BOOKS_STORAGE_KEY).map((id) => ({ bookId: String(id), createdAt: now })),
        },
        collections: readArr(LOCAL_COLLECTIONS_STORAGE_KEY),
        accessRules: { shelves: [], books: [], chapters: [] },
      },
    };
  }

  const res = await apiFetch('/api/admin/backup/export');
  const data = (await res.json().catch(() => ({}))) as Partial<OwnerBackupPayload> & { error?: string };
  if (!res.ok || data.app !== 'ofu-library' || !data.data) {
    throw new Error(data.error || 'Không thể xuất bản sao lưu JSON từ máy chủ.');
  }
  return data as OwnerBackupPayload;
}

export function downloadOwnerBackupJson(payload: OwnerBackupPayload): string {
  const datePart = new Date(payload.exportedAt || Date.now()).toISOString().slice(0, 10);
  const fileName = `ofu-library-owner-backup-${datePart}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json; charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 45_000);
  return fileName;
}

export async function importOwnerBackupApi(
  payload: OwnerBackupPayload,
  mode: OwnerBackupImportMode,
): Promise<OwnerBackupImportResult> {
  assertApiConfigured();
  if (!isCloudMode) {
    throw new Error('Khôi phục bản sao lưu JSON cần kết nối Cloudflare Worker (Cloud Mode).');
  }

  const res = await apiFetch('/api/admin/backup/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, backup: payload }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<OwnerBackupImportResult> & {
    error?: string;
  };
  if (!res.ok || !data.ok || !data.restored) {
    throw new Error(data.error || 'Không thể khôi phục bản sao lưu JSON.');
  }
  clearLibraryStateCache();
  return data as OwnerBackupImportResult;
}
