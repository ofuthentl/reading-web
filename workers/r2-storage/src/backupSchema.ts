import { HttpError } from './auth';
import { toCanonicalChapterKey } from './bookChapterAccessDb';
import { MAX_SHELF_NAME_LENGTH, isValidId } from './booksDb';
import { type HighlightColor, VALID_HIGHLIGHT_COLORS } from './highlightsDb';
import { toShelfAccessKey } from './shelfAccessDb';
import { normalizeShelfAltTitles, normalizeShelfTags } from './shelfTagsDb';

export const OWNER_BACKUP_APP_ID = 'ofu-library';
export const OWNER_BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_JSON_BYTES = 5 * 1024 * 1024; // 5 MiB

const DISCORD_SNOWFLAKE_RE = /^\d{5,32}$/;
const VALID_RELATION_TYPES = new Set(['sequel', 'spinoff', 'same_universe'] as const);
const MAX_PROGRESS_ROWS = 5000;
const MAX_BOOKMARK_ROWS = 10000;
const MAX_HIGHLIGHT_ROWS = 10000;
const MAX_SHELF_PREF_ROWS = 3000;
const MAX_RELATION_ROWS = 5000;
const MAX_PTR_ROWS = 5000;
const MAX_COLLECTIONS = 60;
const MAX_SHELVES_PER_COLLECTION = 200;
const MAX_ACCESS_RULES = 5000;
const MAX_GRANTS_PER_RULE = 500;

export type OwnerBackupImportMode = 'merge' | 'replace';

export interface BackupProgressItem {
  bookId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string | null;
  totalChapters: number | null;
  scrollRatio: number;
  scrollTop: number;
  completed: boolean;
  bookPercent: number | null;
  readingSeconds: number;
  rereadCount: number;
  updatedAt: number;
}

export interface BackupBookmarkItem {
  id: string;
  bookId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string | null;
  scrollRatio: number;
  label: string;
  note: string | null;
  createdAt: number;
}

export interface BackupHighlightItem {
  id: string;
  bookId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string | null;
  quoteText: string;
  note: string | null;
  color: HighlightColor;
  locatorJson: string | null;
  createdAt: number;
}

export interface BackupShelfPrefItem {
  shelfKey: string;
  coverBookId: string | null;
  isFavorite: boolean;
  tags: string[];
  altTitles: string[];
  updatedAt: number;
}

export interface BackupShelfRelationItem {
  sourceShelfKey: string;
  targetShelfKey: string;
  relationType: 'sequel' | 'spinoff' | 'same_universe';
  createdAt: number;
}

export interface BackupCollectionItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  shelfKeys: string[];
  createdAt: number;
  updatedAt: number;
}

export interface BackupGrantUser {
  discordUserId: string;
  label: string | null;
  createdAt: number;
}

export interface BackupShelfAccessRule {
  shelfKey: string;
  mode: 'public' | 'restricted';
  updatedAt: number;
  grants: BackupGrantUser[];
}

export interface BackupBookAccessRule {
  bookId: string;
  mode: 'public' | 'restricted';
  updatedAt: number;
  grants: BackupGrantUser[];
}

export interface BackupChapterAccessRule {
  bookId: string;
  chapterKey: string;
  updatedAt: number;
  grants: BackupGrantUser[];
}

export interface OwnerBackupData {
  progress: BackupProgressItem[];
  bookmarks: BackupBookmarkItem[];
  highlights: BackupHighlightItem[];
  shelfPrefs: BackupShelfPrefItem[];
  shelfRelations: BackupShelfRelationItem[];
  planToRead: {
    shelves: Array<{ shelfKey: string; createdAt: number }>;
    books: Array<{ bookId: string; createdAt: number }>;
  };
  collections: BackupCollectionItem[];
  accessRules: {
    shelves: BackupShelfAccessRule[];
    books: BackupBookAccessRule[];
    chapters: BackupChapterAccessRule[];
  };
}

export interface OwnerBackupPayload {
  app: typeof OWNER_BACKUP_APP_ID;
  schemaVersion: typeof OWNER_BACKUP_SCHEMA_VERSION;
  exportedAt: number;
  data: OwnerBackupData;
}

function asObject(value: unknown, errorMessage: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(errorMessage, 400);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, fieldName: string, maxLen: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new HttpError(`Trường "${fieldName}" phải là mảng hợp lệ.`, 400);
  }
  if (value.length > maxLen) {
    throw new HttpError(`Trường "${fieldName}" vượt quá giới hạn ${maxLen} bản ghi.`, 400);
  }
  return value;
}

function clampTimestamp(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function cleanOptionalText(raw: unknown, maxLen: number): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    throw new HttpError('Trường văn bản trong bản sao lưu không hợp lệ.', 400);
  }
  const trimmed = raw.normalize('NFC').trim().slice(0, maxLen).trim();
  return trimmed || null;
}

function sanitizeLocatorJson(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return sanitizeLocatorJson(parsed);
    } catch {
      throw new HttpError('Trường locator của trích dẫn không hợp lệ.', 400);
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError('Trường locator của trích dẫn không hợp lệ.', 400);
  }
  const src = raw as Record<string, unknown>;
  const clean: Record<string, number> = {};
  for (const key of ['blockIndex', 'startOffset', 'endOffset']) {
    if (typeof src[key] === 'number' && Number.isFinite(src[key]) && (src[key] as number) >= 0) {
      clean[key] = Math.floor(src[key] as number);
    }
  }
  if (typeof src.scrollRatio === 'number' && Number.isFinite(src.scrollRatio)) {
    clean.scrollRatio = Math.min(1, Math.max(0, Math.round(src.scrollRatio * 1000) / 1000));
  }
  if (Object.keys(clean).length === 0) return null;
  const json = JSON.stringify(clean);
  return json.length <= 400 ? json : null;
}

function validateGrantsList(raw: unknown, fallbackNow: number): BackupGrantUser[] {
  const arr = asArray(raw, 'grants', MAX_GRANTS_PER_RULE);
  const byUser = new Map<string, BackupGrantUser>();
  for (const entry of arr) {
    const obj = asObject(entry, 'Bản ghi thành viên phân quyền không hợp lệ.');
    const uid = typeof obj.discordUserId === 'string' ? obj.discordUserId.trim() : '';
    if (!DISCORD_SNOWFLAKE_RE.test(uid)) {
      throw new HttpError(`Discord User ID "${uid || '(trống)'}" trong bản sao lưu không hợp lệ.`, 400);
    }
    byUser.set(uid, {
      discordUserId: uid,
      label: cleanOptionalText(obj.label, 80),
      createdAt: clampTimestamp(obj.createdAt, fallbackNow),
    });
  }
  return Array.from(byUser.values());
}

export function validateOwnerBackupPayload(raw: unknown, nowMs = Date.now()): OwnerBackupPayload {
  const root = asObject(raw, 'Tệp sao lưu JSON không đúng định dạng đối tượng.');
  if (root.app !== OWNER_BACKUP_APP_ID) {
    throw new HttpError('Tệp JSON không phải bản sao lưu của Ofu\'s Library.', 400);
  }
  if (root.schemaVersion !== OWNER_BACKUP_SCHEMA_VERSION) {
    throw new HttpError(
      `Phiên bản sao lưu không được hỗ trợ (yêu cầu schemaVersion = ${OWNER_BACKUP_SCHEMA_VERSION}).`,
      400,
    );
  }
  const data = asObject(root.data, 'Thiếu khối dữ liệu "data" trong bản sao lưu.');

  // 1. Progress
  const progressByBook = new Map<string, BackupProgressItem>();
  for (const item of asArray(data.progress, 'data.progress', MAX_PROGRESS_ROWS)) {
    const obj = asObject(item, 'Bản ghi tiến độ đọc không hợp lệ.');
    const bookId = typeof obj.bookId === 'string' ? obj.bookId.trim() : '';
    const chapterId =
      typeof obj.chapterId === 'string' ? obj.chapterId.normalize('NFC').trim().slice(0, 120) : '';
    if (!isValidId(bookId) || !chapterId) {
      throw new HttpError('Bản ghi tiến độ đọc thiếu bookId hoặc chapterId hợp lệ.', 400);
    }
    const rawTotal = obj.totalChapters === null || obj.totalChapters === undefined ? null : Number(obj.totalChapters);
    const totalChapters =
      rawTotal !== null && Number.isFinite(rawTotal) && rawTotal > 0 ? Math.floor(rawTotal) : null;
    const rawPct = obj.bookPercent === null || obj.bookPercent === undefined ? null : Number(obj.bookPercent);
    const bookPercent =
      rawPct !== null && Number.isFinite(rawPct)
        ? Math.round(Math.min(100, Math.max(0, rawPct)) * 10) / 10
        : null;
    const rawRatio = Number(obj.scrollRatio ?? 0);
    const rawTop = Number(obj.scrollTop ?? 0);
    progressByBook.set(bookId, {
      bookId,
      chapterId,
      chapterIndex: Math.max(0, Math.floor(Number(obj.chapterIndex ?? 0) || 0)),
      chapterTitle: cleanOptionalText(obj.chapterTitle, 200),
      totalChapters,
      scrollRatio: Number.isFinite(rawRatio) ? Math.min(1, Math.max(0, rawRatio)) : 0,
      scrollTop: Number.isFinite(rawTop) && rawTop > 0 ? rawTop : 0,
      completed: Boolean(obj.completed),
      bookPercent,
      readingSeconds: Math.max(0, Math.floor(Number(obj.readingSeconds ?? 0) || 0)),
      rereadCount: Math.max(0, Math.floor(Number(obj.rereadCount ?? 0) || 0)),
      updatedAt: clampTimestamp(obj.updatedAt, nowMs),
    });
  }

  // 2. Bookmarks
  const bookmarksById = new Map<string, BackupBookmarkItem>();
  for (const item of asArray(data.bookmarks, 'data.bookmarks', MAX_BOOKMARK_ROWS)) {
    const obj = asObject(item, 'Bản ghi dấu trang không hợp lệ.');
    const id = typeof obj.id === 'string' ? obj.id.trim() : '';
    const bookId = typeof obj.bookId === 'string' ? obj.bookId.trim() : '';
    const chapterId =
      typeof obj.chapterId === 'string' ? obj.chapterId.normalize('NFC').trim().slice(0, 120) : '';
    const label = typeof obj.label === 'string' ? obj.label.normalize('NFC').trim().slice(0, 160) : '';
    if (!isValidId(id) || !isValidId(bookId) || !chapterId || !label) {
      throw new HttpError('Bản ghi dấu trang thiếu id, bookId, chapterId hoặc label hợp lệ.', 400);
    }
    const rawRatio = Number(obj.scrollRatio ?? 0);
    bookmarksById.set(id, {
      id,
      bookId,
      chapterId,
      chapterIndex: Math.max(0, Math.floor(Number(obj.chapterIndex ?? 0) || 0)),
      chapterTitle: cleanOptionalText(obj.chapterTitle, 200),
      scrollRatio: Number.isFinite(rawRatio) ? Math.min(1, Math.max(0, rawRatio)) : 0,
      label,
      note: cleanOptionalText(obj.note, 300),
      createdAt: clampTimestamp(obj.createdAt, nowMs),
    });
  }

  // 3. Highlights
  const highlightsById = new Map<string, BackupHighlightItem>();
  for (const item of asArray(data.highlights, 'data.highlights', MAX_HIGHLIGHT_ROWS)) {
    const obj = asObject(item, 'Bản ghi trích dẫn không hợp lệ.');
    const id = typeof obj.id === 'string' ? obj.id.trim() : '';
    const bookId = typeof obj.bookId === 'string' ? obj.bookId.trim() : '';
    const chapterId =
      typeof obj.chapterId === 'string' ? obj.chapterId.normalize('NFC').trim().slice(0, 120) : '';
    const quoteText =
      typeof obj.quoteText === 'string'
        ? obj.quoteText.replace(/\s+/g, ' ').trim().normalize('NFC').slice(0, 600)
        : '';
    if (!isValidId(id) || !isValidId(bookId) || !chapterId || !quoteText) {
      throw new HttpError('Bản ghi trích dẫn thiếu id, bookId, chapterId hoặc quoteText.', 400);
    }
    const color =
      typeof obj.color === 'string' && VALID_HIGHLIGHT_COLORS.has(obj.color as HighlightColor)
        ? (obj.color as HighlightColor)
        : 'amber';
    highlightsById.set(id, {
      id,
      bookId,
      chapterId,
      chapterIndex: Math.max(0, Math.floor(Number(obj.chapterIndex ?? 0) || 0)),
      chapterTitle: cleanOptionalText(obj.chapterTitle, 200),
      quoteText,
      note: cleanOptionalText(obj.note, 400),
      color,
      locatorJson: sanitizeLocatorJson(obj.locator ?? obj.locatorJson),
      createdAt: clampTimestamp(obj.createdAt, nowMs),
    });
  }

  // 4. Shelf Prefs
  const prefsByKey = new Map<string, BackupShelfPrefItem>();
  for (const item of asArray(data.shelfPrefs, 'data.shelfPrefs', MAX_SHELF_PREF_ROWS)) {
    const obj = asObject(item, 'Bản ghi tuỳ chọn kệ không hợp lệ.');
    const rawKey = typeof obj.shelfKey === 'string' ? obj.shelfKey.normalize('NFC').trim() : '';
    if (!rawKey || rawKey.length > MAX_SHELF_NAME_LENGTH) {
      throw new HttpError('Khoá kệ trong shelfPrefs không hợp lệ.', 400);
    }
    const shelfKey = toShelfAccessKey(rawKey);
    const coverBookId =
      typeof obj.coverBookId === 'string' && obj.coverBookId.trim()
        ? obj.coverBookId.trim()
        : null;
    if (coverBookId && !isValidId(coverBookId)) {
      throw new HttpError(`coverBookId "${coverBookId}" trong shelfPrefs không hợp lệ.`, 400);
    }
    const tags = obj.tags !== undefined ? normalizeShelfTags(obj.tags) : [];
    const altTitles = obj.altTitles !== undefined ? normalizeShelfAltTitles(obj.altTitles) : [];
    prefsByKey.set(shelfKey, {
      shelfKey,
      coverBookId,
      isFavorite: Boolean(obj.isFavorite),
      tags,
      altTitles,
      updatedAt: clampTimestamp(obj.updatedAt, nowMs),
    });
  }

  // 5. Shelf Relations
  const relByPair = new Map<string, BackupShelfRelationItem>();
  for (const item of asArray(data.shelfRelations, 'data.shelfRelations', MAX_RELATION_ROWS)) {
    const obj = asObject(item, 'Bản ghi liên kết bộ truyện không hợp lệ.');
    const srcRaw =
      typeof obj.sourceShelfKey === 'string' ? obj.sourceShelfKey.normalize('NFC').trim() : '';
    const dstRaw =
      typeof obj.targetShelfKey === 'string' ? obj.targetShelfKey.normalize('NFC').trim() : '';
    const relationType = obj.relationType;
    if (
      !srcRaw ||
      !dstRaw ||
      srcRaw.length > MAX_SHELF_NAME_LENGTH ||
      dstRaw.length > MAX_SHELF_NAME_LENGTH ||
      typeof relationType !== 'string' ||
      !VALID_RELATION_TYPES.has(relationType as 'sequel' | 'spinoff' | 'same_universe')
    ) {
      throw new HttpError('Bản ghi liên kết shelfRelations không hợp lệ.', 400);
    }
    let src = toShelfAccessKey(srcRaw);
    let dst = toShelfAccessKey(dstRaw);
    if (src === dst) {
      throw new HttpError('Liên kết shelfRelations không thể trỏ vào chính mình.', 400);
    }
    if (relationType === 'same_universe' && src.localeCompare(dst, 'vi') > 0) {
      [src, dst] = [dst, src];
    }
    const pairKey = src < dst ? `${src}\0${dst}` : `${dst}\0${src}`;
    relByPair.set(pairKey, {
      sourceShelfKey: src,
      targetShelfKey: dst,
      relationType: relationType as 'sequel' | 'spinoff' | 'same_universe',
      createdAt: clampTimestamp(obj.createdAt, nowMs),
    });
  }

  // 6. Plan to Read
  const ptrObj =
    data.planToRead !== undefined
      ? asObject(data.planToRead, 'Trường data.planToRead không hợp lệ.')
      : {};
  const ptrShelvesMap = new Map<string, { shelfKey: string; createdAt: number }>();
  for (const item of asArray(ptrObj.shelves, 'data.planToRead.shelves', MAX_PTR_ROWS)) {
    const obj = asObject(item, 'Mục Đọc sau (bộ) không hợp lệ.');
    const rawKey = typeof obj.shelfKey === 'string' ? obj.shelfKey.normalize('NFC').trim() : '';
    if (!rawKey || rawKey.length > MAX_SHELF_NAME_LENGTH) {
      throw new HttpError('Khoá kệ trong planToRead.shelves không hợp lệ.', 400);
    }
    const shelfKey = toShelfAccessKey(rawKey);
    ptrShelvesMap.set(shelfKey, { shelfKey, createdAt: clampTimestamp(obj.createdAt, nowMs) });
  }
  const ptrBooksMap = new Map<string, { bookId: string; createdAt: number }>();
  for (const item of asArray(ptrObj.books, 'data.planToRead.books', MAX_PTR_ROWS)) {
    const obj = asObject(item, 'Mục Đọc sau (tập) không hợp lệ.');
    const bookId = typeof obj.bookId === 'string' ? obj.bookId.trim() : '';
    if (!isValidId(bookId)) {
      throw new HttpError('bookId trong planToRead.books không hợp lệ.', 400);
    }
    ptrBooksMap.set(bookId, { bookId, createdAt: clampTimestamp(obj.createdAt, nowMs) });
  }

  // 7. Collections
  const colsById = new Map<string, BackupCollectionItem>();
  for (const item of asArray(data.collections, 'data.collections', MAX_COLLECTIONS)) {
    const obj = asObject(item, 'Bản ghi tuyển tập không hợp lệ.');
    const id = typeof obj.id === 'string' ? obj.id.trim() : '';
    const name = typeof obj.name === 'string' ? obj.name.normalize('NFC').trim() : '';
    if (!isValidId(id) || !name || name.length > 80) {
      throw new HttpError('Bản ghi tuyển tập thiếu id hoặc tên hợp lệ.', 400);
    }
    const rawKeys = asArray(obj.shelfKeys, 'collection.shelfKeys', MAX_SHELVES_PER_COLLECTION);
    const seenKeys = new Set<string>();
    const shelfKeys: string[] = [];
    for (const k of rawKeys) {
      if (typeof k !== 'string') continue;
      const trimmed = k.normalize('NFC').trim();
      if (!trimmed || trimmed.length > MAX_SHELF_NAME_LENGTH) continue;
      const key = toShelfAccessKey(trimmed);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      shelfKeys.push(key);
    }
    colsById.set(id, {
      id,
      name,
      description: cleanOptionalText(obj.description, 300),
      sortOrder: Number.isFinite(Number(obj.sortOrder)) ? Math.floor(Number(obj.sortOrder)) : 0,
      shelfKeys,
      createdAt: clampTimestamp(obj.createdAt, nowMs),
      updatedAt: clampTimestamp(obj.updatedAt, nowMs),
    });
  }

  // 8. Access Rules (Shelf / Book / Chapter)
  const accessObj =
    data.accessRules !== undefined
      ? asObject(data.accessRules, 'Trường data.accessRules không hợp lệ.')
      : {};
  const shelfAccessMap = new Map<string, BackupShelfAccessRule>();
  for (const item of asArray(accessObj.shelves, 'data.accessRules.shelves', MAX_ACCESS_RULES)) {
    const obj = asObject(item, 'Luật phân quyền bộ không hợp lệ.');
    const rawKey = typeof obj.shelfKey === 'string' ? obj.shelfKey.normalize('NFC').trim() : '';
    const mode = obj.mode;
    if (!rawKey || rawKey.length > MAX_SHELF_NAME_LENGTH || (mode !== 'public' && mode !== 'restricted')) {
      throw new HttpError('Luật phân quyền bộ trong accessRules.shelves không hợp lệ.', 400);
    }
    const shelfKey = toShelfAccessKey(rawKey);
    shelfAccessMap.set(shelfKey, {
      shelfKey,
      mode,
      updatedAt: clampTimestamp(obj.updatedAt, nowMs),
      grants: mode === 'restricted' ? validateGrantsList(obj.grants, nowMs) : [],
    });
  }

  const bookAccessMap = new Map<string, BackupBookAccessRule>();
  for (const item of asArray(accessObj.books, 'data.accessRules.books', MAX_ACCESS_RULES)) {
    const obj = asObject(item, 'Luật phân quyền tập không hợp lệ.');
    const bookId = typeof obj.bookId === 'string' ? obj.bookId.trim() : '';
    const mode = obj.mode;
    if (!isValidId(bookId) || (mode !== 'public' && mode !== 'restricted')) {
      throw new HttpError('Luật phân quyền tập trong accessRules.books không hợp lệ.', 400);
    }
    bookAccessMap.set(bookId, {
      bookId,
      mode,
      updatedAt: clampTimestamp(obj.updatedAt, nowMs),
      grants: mode === 'restricted' ? validateGrantsList(obj.grants, nowMs) : [],
    });
  }

  const chapterAccessMap = new Map<string, BackupChapterAccessRule>();
  for (const item of asArray(accessObj.chapters, 'data.accessRules.chapters', MAX_ACCESS_RULES)) {
    const obj = asObject(item, 'Luật phân quyền chương không hợp lệ.');
    const bookId = typeof obj.bookId === 'string' ? obj.bookId.trim() : '';
    const chapterKey =
      typeof obj.chapterKey === 'string' ? toCanonicalChapterKey(obj.chapterKey) : '';
    if (!isValidId(bookId) || !chapterKey || chapterKey.length > 120) {
      throw new HttpError('Luật phân quyền chương trong accessRules.chapters không hợp lệ.', 400);
    }
    chapterAccessMap.set(`${bookId}\0${chapterKey}`, {
      bookId,
      chapterKey,
      updatedAt: clampTimestamp(obj.updatedAt, nowMs),
      grants: validateGrantsList(obj.grants, nowMs),
    });
  }

  return {
    app: OWNER_BACKUP_APP_ID,
    schemaVersion: OWNER_BACKUP_SCHEMA_VERSION,
    exportedAt: clampTimestamp(root.exportedAt, nowMs),
    data: {
      progress: Array.from(progressByBook.values()),
      bookmarks: Array.from(bookmarksById.values()),
      highlights: Array.from(highlightsById.values()),
      shelfPrefs: Array.from(prefsByKey.values()),
      shelfRelations: Array.from(relByPair.values()),
      planToRead: {
        shelves: Array.from(ptrShelvesMap.values()),
        books: Array.from(ptrBooksMap.values()),
      },
      collections: Array.from(colsById.values()),
      accessRules: {
        shelves: Array.from(shelfAccessMap.values()),
        books: Array.from(bookAccessMap.values()),
        chapters: Array.from(chapterAccessMap.values()),
      },
    },
  };
}
