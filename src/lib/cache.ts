import type { Book, ReadingProgress } from '@/types';

const DB_NAME = 'arcane-library-cache-v1';
const DB_VERSION = 1;

const STORE_BOOK_BLOBS = 'book_blobs';
const STORE_COVER_BLOBS = 'cover_blobs';
const STORE_LOCAL_BOOKS = 'local_books';
const STORE_LOCAL_PROGRESS = 'local_progress';

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
    request.onsuccess = () => resolve(request.result);
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

async function putInStore<T>(storeName: string, value: T, key?: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await idbRequest(key !== undefined ? store.put(value, key) : store.put(value));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readwrite');
    await idbRequest(tx.objectStore(storeName).delete(key));
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
  return getFromStore<Blob>(STORE_BOOK_BLOBS, fileKey);
}

export async function setCachedBookBlob(fileKey: string, blob: Blob): Promise<void> {
  await putInStore(STORE_BOOK_BLOBS, blob, fileKey);
}

export async function deleteCachedBookBlob(fileKey: string): Promise<void> {
  await deleteFromStore(STORE_BOOK_BLOBS, fileKey);
}

export async function getCachedCoverBlob(coverKey: string): Promise<Blob | null> {
  return getFromStore<Blob>(STORE_COVER_BLOBS, coverKey);
}

export async function setCachedCoverBlob(coverKey: string, blob: Blob): Promise<void> {
  await putInStore(STORE_COVER_BLOBS, blob, coverKey);
}

export async function deleteCachedCoverBlob(coverKey: string): Promise<void> {
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
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_BOOK_BLOBS, 'readwrite');
    await idbRequest(tx.objectStore(STORE_BOOK_BLOBS).clear());
  } catch {
    // Ignore
  }
}

export async function clearCachedCoverBlobs(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_COVER_BLOBS, 'readwrite');
    await idbRequest(tx.objectStore(STORE_COVER_BLOBS).clear());
  } catch {
    // Ignore
  }
}

export async function clearAllMediaCache(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_BOOK_BLOBS, STORE_COVER_BLOBS], 'readwrite');
    await Promise.all([
      idbRequest(tx.objectStore(STORE_BOOK_BLOBS).clear()),
      idbRequest(tx.objectStore(STORE_COVER_BLOBS).clear()),
    ]);
  } catch {
    // Ignore
  }
}

// --- Local-First Mode Store (when VITE_API_URL is not configured yet) ---

export async function getLocalBooks(): Promise<Book[]> {
  return getAllFromStore<Book>(STORE_LOCAL_BOOKS);
}

export async function putLocalBook(book: Book): Promise<void> {
  await putInStore(STORE_LOCAL_BOOKS, book);
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
