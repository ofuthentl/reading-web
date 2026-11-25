import type { Book, ReadingProgress } from '@/types';

const DB_NAME = 'arcane-library-cache-v1';
const DB_VERSION = 1;

const STORE_BOOK_BLOBS = 'book_blobs';
const STORE_COVER_BLOBS = 'cover_blobs';
const STORE_LOCAL_BOOKS = 'local_books';
const STORE_LOCAL_PROGRESS = 'local_progress';

const BOOK_CACHE_LRU_KEY = 'ofu-book-cache-lru-v1';
export const MOBILE_BOOK_CACHE_MAX_BOOKS = 6;
export const MOBILE_BOOK_CACHE_MAX_BYTES = 250 * 1024 * 1024; // 250 MiB

let bookCacheGeneration = 0;
let coverCacheGeneration = 0;

interface BookCacheLruEntry {
  at: number;
  size: number;
}

export function isConstrainedMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true;
  const isTouchMac = /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  if (isTouchMac) return true;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
    return true;
  }
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 2;
}

export function getBookCacheGeneration(): number {
  return bookCacheGeneration;
}

export function getCoverCacheGeneration(): number {
  return coverCacheGeneration;
}

function readBookCacheLru(): Record<string, BookCacheLruEntry> {
  try {
    const raw = localStorage.getItem(BOOK_CACHE_LRU_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, BookCacheLruEntry>) : {};
  } catch {
    return {};
  }
}

function writeBookCacheLru(map: Record<string, BookCacheLruEntry>): void {
  try {
    localStorage.setItem(BOOK_CACHE_LRU_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota/private mode errors
  }
}

export function touchBookCacheLru(fileKey: string, sizeBytes?: number): void {
  if (!fileKey) return;
  const map = readBookCacheLru();
  const prev = map[fileKey];
  map[fileKey] = {
    at: Date.now(),
    size: typeof sizeBytes === 'number' && sizeBytes >= 0 ? sizeBytes : (prev?.size ?? 0),
  };
  writeBookCacheLru(map);
}

function removeBookCacheLru(fileKey: string): void {
  const map = readBookCacheLru();
  if (!(fileKey in map)) return;
  delete map[fileKey];
  writeBookCacheLru(map);
}

function clearBookCacheLru(): void {
  try {
    localStorage.removeItem(BOOK_CACHE_LRU_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Kiểm tra nhanh Blob sách (.epub/.docx đều là ZIP) có còn đọc được và có chữ ký `PK` hay không.
 * Chặn văng trang trên iOS WebKit khi tệp đệm IndexedDB bị hỏng hoặc bị cắt cụt.
 */
export async function isValidZipBookBlob(blob: Blob | null | undefined): Promise<boolean> {
  if (!blob || !(blob instanceof Blob) || blob.size < 64) return false;
  try {
    const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return (
      header.length >= 4 &&
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      (header[2] === 0x03 || header[2] === 0x05 || header[2] === 0x07)
    );
  } catch {
    return false;
  }
}

export interface CachedBlobStat {
  key: string;
  sizeBytes: number;
  mimeType: string;
}

export interface IndexedDbCacheSummary {
  bookEntries: CachedBlobStat[];
  coverEntries: CachedBlobStat[];
  totalBookBytes: number;
  totalCoverBytes: number;
  totalBytes: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BOOK_BLOBS)) {
        db.createObjectStore(STORE_BOOK_BLOBS);
      }
      if (!db.objectStoreNames.contains(STORE_COVER_BLOBS)) {
        db.createObjectStore(STORE_COVER_BLOBS);
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_BOOKS)) {
        db.createObjectStore(STORE_LOCAL_BOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_PROGRESS)) {
        db.createObjectStore(STORE_LOCAL_PROGRESS);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('Bộ nhớ đệm IndexedDB đang bị tab khác khoá.'));
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Không thể mở bộ nhớ đệm IndexedDB.'));
    };
  });
  return dbPromise;
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Lỗi ghi giao dịch IndexedDB.'));
    tx.onabort = () => reject(tx.error || new Error('Giao dịch IndexedDB bị huỷ (có thể đầy bộ nhớ).'));
  });
}

async function getFromStore<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    const result = await idbRequest(tx.objectStore(storeName).get(key));
    return (result as T | undefined) ?? null;
  } catch {
    return null;
  }
}

async function putInStore<T>(
  storeName: string,
  value: T,
  key?: string,
  throwOnError = false,
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const done = waitForTransaction(tx);
    if (key !== undefined) store.put(value, key);
    else store.put(value);
    await done;
  } catch (err) {
    if (throwOnError) {
      const isQuota =
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      if (isQuota) {
        throw new Error('Bộ nhớ thiết bị (IndexedDB) đã đầy. Hãy dọn bớt cache rồi thử lại.');
      }
      throw err instanceof Error ? err : new Error('Không thể ghi dữ liệu vào bộ nhớ thiết bị.');
    }
    // Ignore optional cache quota errors in private browsing
  }
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readwrite');
    const done = waitForTransaction(tx);
    tx.objectStore(storeName).delete(key);
    await done;
  } catch {
    // Ignore
  }
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readonly');
    const result = await idbRequest(tx.objectStore(storeName).getAll());
    return (result as T[]) || [];
  } catch {
    return [];
  }
}

function scanBlobStoreStats(db: IDBDatabase, storeName: string): Promise<CachedBlobStat[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const entries: CachedBlobStat[] = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(entries);
          return;
        }
        const key = typeof cursor.key === 'string' ? cursor.key : String(cursor.key);
        const val = cursor.value as Blob | null | undefined;
        const sizeBytes = val && typeof val.size === 'number' ? val.size : 0;
        const mimeType = val && typeof val.type === 'string' ? val.type : '';
        entries.push({ key, sizeBytes, mimeType });
        cursor.continue();
      };
      req.onerror = () => resolve(entries);
    } catch {
      resolve([]);
    }
  });
}

// --- Book & Cover Blob Cache (used in BOTH Cloud R2 and Local modes for 0ms reopen) ---

export async function getCachedBookBlob(fileKey: string): Promise<Blob | null> {
  const blob = await getFromStore<Blob>(STORE_BOOK_BLOBS, fileKey);
  if (blob) touchBookCacheLru(fileKey, blob.size);
  return blob;
}

export async function setCachedBookBlob(
  fileKey: string,
  blob: Blob,
  strict = false,
): Promise<void> {
  const startGen = bookCacheGeneration;
  if (!strict && isConstrainedMobileDevice() && blob.size > MOBILE_BOOK_CACHE_MAX_BYTES) {
    return;
  }
  await putInStore(STORE_BOOK_BLOBS, blob, fileKey, strict);
  if (!strict && bookCacheGeneration !== startGen) {
    // Cache bị dọn trong lúc đang ghi nền -> xoá lại để không ghi đè ngược
    await deleteFromStore(STORE_BOOK_BLOBS, fileKey);
    removeBookCacheLru(fileKey);
    return;
  }
  touchBookCacheLru(fileKey, blob.size);
}

export async function deleteCachedBookBlob(fileKey: string): Promise<void> {
  bookCacheGeneration += 1;
  removeBookCacheLru(fileKey);
  await deleteFromStore(STORE_BOOK_BLOBS, fileKey);
}

/**
 * Dọn bớt cache tệp sách cũ theo LRU trên thiết bị di động (chỉ gọi ở chế độ Cloud R2)
 * để giữ bộ nhớ đệm IndexedDB trong ngưỡng an toàn (<= 6 cuốn và <= 250 MiB).
 */
export async function pruneMobileBookCache(
  keepFileKey?: string,
  incomingBytes = 0,
): Promise<void> {
  if (!isConstrainedMobileDevice()) return;
  try {
    const db = await openDb();
    const entries = await scanBlobStoreStats(db, STORE_BOOK_BLOBS);
    if (entries.length === 0) return;

    const lru = readBookCacheLru();
    const maxCountAfterIncoming =
      incomingBytes > 0 ? MOBILE_BOOK_CACHE_MAX_BOOKS - 1 : MOBILE_BOOK_CACHE_MAX_BOOKS;
    const maxBytesAfterIncoming = Math.max(0, MOBILE_BOOK_CACHE_MAX_BYTES - incomingBytes);

    let remainingCount = entries.length;
    let remainingBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
    if (remainingCount <= maxCountAfterIncoming && remainingBytes <= maxBytesAfterIncoming) {
      return;
    }

    const candidates = entries
      .filter((e) => e.key !== keepFileKey)
      .sort((a, b) => (lru[a.key]?.at ?? 0) - (lru[b.key]?.at ?? 0));

    const toDelete: string[] = [];
    for (const item of candidates) {
      if (remainingCount <= maxCountAfterIncoming && remainingBytes <= maxBytesAfterIncoming) {
        break;
      }
      toDelete.push(item.key);
      remainingCount -= 1;
      remainingBytes = Math.max(0, remainingBytes - item.sizeBytes);
    }

    if (toDelete.length === 0) return;
    const tx = db.transaction(STORE_BOOK_BLOBS, 'readwrite');
    const store = tx.objectStore(STORE_BOOK_BLOBS);
    const done = waitForTransaction(tx);
    for (const key of toDelete) {
      store.delete(key);
      delete lru[key];
    }
    await done;
    writeBookCacheLru(lru);
  } catch {
    // Ignore optional cache pruning failures
  }
}

export async function getCachedCoverBlob(coverKey: string): Promise<Blob | null> {
  return getFromStore<Blob>(STORE_COVER_BLOBS, coverKey);
}

export async function setCachedCoverBlob(coverKey: string, blob: Blob): Promise<void> {
  const startGen = coverCacheGeneration;
  await putInStore(STORE_COVER_BLOBS, blob, coverKey);
  if (coverCacheGeneration !== startGen) {
    await deleteFromStore(STORE_COVER_BLOBS, coverKey);
  }
}

export async function deleteCachedCoverBlob(coverKey: string): Promise<void> {
  coverCacheGeneration += 1;
  await deleteFromStore(STORE_COVER_BLOBS, coverKey);
}

export async function inspectIndexedDbCache(): Promise<IndexedDbCacheSummary> {
  try {
    const db = await openDb();
    const [bookEntries, coverEntries] = await Promise.all([
      scanBlobStoreStats(db, STORE_BOOK_BLOBS),
      scanBlobStoreStats(db, STORE_COVER_BLOBS),
    ]);
    bookEntries.sort((a, b) => b.sizeBytes - a.sizeBytes);
    coverEntries.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const totalBookBytes = bookEntries.reduce((sum, item) => sum + item.sizeBytes, 0);
    const totalCoverBytes = coverEntries.reduce((sum, item) => sum + item.sizeBytes, 0);
    return {
      bookEntries,
      coverEntries,
      totalBookBytes,
      totalCoverBytes,
      totalBytes: totalBookBytes + totalCoverBytes,
    };
  } catch {
    return {
      bookEntries: [],
      coverEntries: [],
      totalBookBytes: 0,
      totalCoverBytes: 0,
      totalBytes: 0,
    };
  }
}

export async function clearCachedBookBlobs(): Promise<void> {
  bookCacheGeneration += 1;
  clearBookCacheLru();
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_BOOK_BLOBS, 'readwrite');
    const done = waitForTransaction(tx);
    tx.objectStore(STORE_BOOK_BLOBS).clear();
    await done;
  } catch {
    // Ignore
  }
}

export async function clearCachedCoverBlobs(): Promise<void> {
  coverCacheGeneration += 1;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_COVER_BLOBS, 'readwrite');
    const done = waitForTransaction(tx);
    tx.objectStore(STORE_COVER_BLOBS).clear();
    await done;
  } catch {
    // Ignore
  }
}

export async function clearAllMediaCache(): Promise<void> {
  bookCacheGeneration += 1;
  coverCacheGeneration += 1;
  clearBookCacheLru();
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_BOOK_BLOBS, STORE_COVER_BLOBS], 'readwrite');
    const done = waitForTransaction(tx);
    tx.objectStore(STORE_BOOK_BLOBS).clear();
    tx.objectStore(STORE_COVER_BLOBS).clear();
    await done;
  } catch {
    // Ignore
  }
}

// --- Local-First Mode Store (when VITE_API_URL is not configured yet) ---

export async function getLocalBooks(): Promise<Book[]> {
  return getAllFromStore<Book>(STORE_LOCAL_BOOKS);
}

export async function putLocalBook(book: Book): Promise<void> {
  await putInStore(STORE_LOCAL_BOOKS, book, undefined, true);
}

export async function getLocalProgress(bookId: string): Promise<ReadingProgress | null> {
  return getFromStore<ReadingProgress>(STORE_LOCAL_PROGRESS, bookId);
}

export async function deleteLocalBook(bookId: string): Promise<void> {
  await deleteFromStore(STORE_LOCAL_BOOKS, bookId);
}

export async function getAllLocalProgress(): Promise<Record<string, ReadingProgress>> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_LOCAL_PROGRESS, 'readonly');
    const store = tx.objectStore(STORE_LOCAL_PROGRESS);
    const [keys, values] = await Promise.all([
      idbRequest(store.getAllKeys()),
      idbRequest(store.getAll()),
    ]);
    const map: Record<string, ReadingProgress> = {};
    keys.forEach((key, index) => {
      if (typeof key === 'string' && values[index]) {
        map[key] = values[index] as ReadingProgress;
      }
    });
    return map;
  } catch {
    return {};
  }
}

export async function putLocalProgress(bookId: string, progress: ReadingProgress): Promise<void> {
  await putInStore(STORE_LOCAL_PROGRESS, progress, bookId);
}

export async function deleteLocalProgress(bookId: string): Promise<void> {
  await deleteFromStore(STORE_LOCAL_PROGRESS, bookId);
}
