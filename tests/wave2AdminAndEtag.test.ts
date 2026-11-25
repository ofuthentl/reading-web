import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { resolvePackSyncConcurrency } from '../src/lib/guestPackBatchSync';
import {
  clearLibraryStateCache,
  deriveTokenScopeKey,
  readCachedBooksResponse,
  writeCachedBooksResponse,
} from '../src/lib/libraryStateCache';
import { exportOwnerBackup, importOwnerBackupData } from '../workers/r2-storage/src/backupRoute';
import {
  OWNER_BACKUP_APP_ID,
  OWNER_BACKUP_SCHEMA_VERSION,
  validateOwnerBackupPayload,
} from '../workers/r2-storage/src/backupSchema';
import { handleBookFileReplace } from '../workers/r2-storage/src/bookReplaceRoute';
import type { Env } from '../workers/r2-storage/src/booksDb';
import { computeWeakBooksEtag, matchesIfNoneMatch } from '../workers/r2-storage/src/booksEtag';
import worker from '../workers/r2-storage/src/index';
import {
  ORPHAN_SAFE_AGE_MS,
  classifyStorageOrphans,
  cleanupOrphanR2Storage,
  reconcileR2Storage,
} from '../workers/r2-storage/src/storageReconcileRoute';
import { createMockD1Database } from './helpers/mockD1';

const WORKER_SCHEMA_SQL = readFileSync(
  resolve(process.cwd(), 'workers', 'r2-storage', 'schema.sql'),
  'utf8',
);

interface MockR2Entry {
  key: string;
  size: number;
  uploaded: Date;
}

function createMockR2Bucket(initial: MockR2Entry[] = [], pageSize = 1000) {
  const store = new Map<string, MockR2Entry>();
  for (const item of initial) store.set(item.key, item);
  const deletedKeys: string[] = [];

  const bucket = {
    store,
    deletedKeys,
    async put(key: string, body: ReadableStream | ArrayBuffer | Uint8Array | string) {
      let size = 0;
      if (typeof body === 'string') {
        size = new TextEncoder().encode(body).byteLength;
      } else if (body instanceof Uint8Array) {
        size = body.byteLength;
      } else if (body instanceof ArrayBuffer) {
        size = body.byteLength;
      } else {
        const ab = await new Response(body).arrayBuffer();
        size = ab.byteLength;
      }
      const entry = { key, size, uploaded: new Date() };
      store.set(key, entry);
      return { key, size };
    },
    async delete(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        deletedKeys.push(k);
        store.delete(k);
      }
    },
    async head(key: string) {
      const item = store.get(key);
      return item ? { key: item.key, size: item.size, uploaded: item.uploaded } : null;
    },
    async list(options?: { limit?: number; cursor?: string }) {
      const all = Array.from(store.values()).sort((a, b) => a.key.localeCompare(b.key));
      const start = options?.cursor ? Number(options.cursor) || 0 : 0;
      const limit = Math.min(pageSize, options?.limit ?? pageSize);
      const slice = all.slice(start, start + limit);
      const nextIdx = start + slice.length;
      const truncated = nextIdx < all.length;
      return {
        objects: slice.map((item) => ({
          key: item.key,
          size: item.size,
          uploaded: item.uploaded,
        })),
        truncated,
        ...(truncated ? { cursor: String(nextIdx) } : {}),
      };
    },
  };
  return bucket;
}

function makeFakeEnv(
  mockDb: ReturnType<typeof createMockD1Database>,
  mockR2: ReturnType<typeof createMockR2Bucket>,
  overrides: Partial<Env> = {},
): Env {
  return {
    DB: mockDb,
    BOOKS_BUCKET: mockR2,
    APP_ORIGINS: 'https://ofu.lol',
    ALLOW_INSECURE_DEV_NO_AUTH: 'true',
    ...overrides,
  } as unknown as Env;
}

describe('Wave 2.1 — handleBookFileReplace (quota, preserve relations & rollback)', () => {
  it('thay tệp giữ nguyên books.id, tiến độ, bình luận, phân quyền và trừ old_file_size đúng hạn mức', async () => {
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const mockR2 = createMockR2Bucket([
      { key: 'books/book-rep-0001-old.epub', size: 700, uploaded: new Date(1000) },
      { key: 'covers/book-rep-0001-v2.jpg', size: 100, uploaded: new Date(1000) },
      { key: 'guest-packs/book-rep-0001-old.pack', size: 100, uploaded: new Date(1000) },
    ]);
    const env = makeFakeEnv(mockDb, mockR2, { STORAGE_LIMIT_BYTES: '1000' });

    try {
      await mockDb
        .prepare(
          `INSERT INTO books (id, title, author, shelf, cover_key, file_key, file_type, file_size, cover_size, created_at)
           VALUES ('book-rep-0001', 'Vol 1', 'Author', 'LN', 'covers/book-rep-0001-v2.jpg', 'books/book-rep-0001-old.epub', 'epub', 700, 100, '2026-11-25')`,
        )
        .run();
      await mockDb
        .prepare(
          `INSERT INTO book_guest_packs (book_id, pack_key, pack_size, chapter_count, manifest_json, updated_at)
           VALUES ('book-rep-0001', 'guest-packs/book-rep-0001-old.pack', 100, 2, '{"v":1,"chapters":[],"media":[]}', 1000)`,
        )
        .run();
      await mockDb
        .prepare(
          `INSERT INTO reading_progress (book_id, chapter_id, chapter_index, scroll_ratio, scroll_top, completed, updated_at)
           VALUES ('book-rep-0001', 'ch-2', 2, 0.5, 420, 0, 5000)`,
        )
        .run();
      await mockDb
        .prepare(
          `INSERT INTO book_bookmarks (id, user_scope, book_id, chapter_id, chapter_index, scroll_ratio, label, created_at)
           VALUES ('bm-12345678', 'owner', 'book-rep-0001', 'ch-2', 2, 0.5, 'Mốc cũ', 5000)`,
        )
        .run();
      await mockDb
        .prepare(
          `INSERT INTO library_comments (id, target_type, target_key, user_scope, author_name, author_role, content, created_at, updated_at)
           VALUES ('cmt-12345678', 'book', 'book-rep-0001', 'owner', 'Admin', 'owner', 'Bình luận giữ nguyên', 5000, 5000)`,
        )
        .run();
      await mockDb
        .prepare(
          `INSERT INTO book_access_rules (book_id, access_mode, updated_at)
           VALUES ('book-rep-0001', 'restricted', 5000)`,
        )
        .run();

      // Tổng cũ = 700 + 100 + 100 = 900. Trừ 700 + 800 mới = 1000 <= 1000 -> PHẢI HỢP LỆ!
      const payload800 = new Uint8Array(800).fill(0x50);
      const req = new Request('https://worker.test/api/books/book-rep-0001/replace-file', {
        method: 'PUT',
        headers: { 'X-File-Type': 'docx', 'X-File-Size': '800' },
        body: payload800,
      });

      const res = await handleBookFileReplace(req, env, 'book-rep-0001');
      assert.equal(res.book.id, 'book-rep-0001');
      assert.equal(res.book.file_type, 'docx');
      assert.equal(res.book.file_size, 800);
      assert.equal(res.book.guest_ready, false);
      assert.notEqual(res.book.file_key, 'books/book-rep-0001-old.epub');
      assert.ok(mockR2.store.has(res.book.file_key));
      assert.equal(mockR2.store.has('books/book-rep-0001-old.epub'), false);
      assert.equal(mockR2.store.has('guest-packs/book-rep-0001-old.pack'), false);
      assert.equal(res.storage.usedBytes, 900); // 800 file mới + 100 cover (pack cũ đã dọn)

      // Kiểm tra 100% tiến độ, dấu trang, bình luận, phân quyền còn nguyên
      const prog = await mockDb
        .prepare('SELECT chapter_id FROM reading_progress WHERE book_id = ?')
        .bind('book-rep-0001')
        .first<{ chapter_id: string }>();
      const bm = await mockDb
        .prepare('SELECT label FROM book_bookmarks WHERE id = ?')
        .bind('bm-12345678')
        .first<{ label: string }>();
      const cmt = await mockDb
        .prepare('SELECT content FROM library_comments WHERE id = ?')
        .bind('cmt-12345678')
        .first<{ content: string }>();
      const access = await mockDb
        .prepare('SELECT access_mode FROM book_access_rules WHERE book_id = ?')
        .bind('book-rep-0001')
        .first<{ access_mode: string }>();
      assert.equal(prog?.chapter_id, 'ch-2');
      assert.equal(bm?.label, 'Mốc cũ');
      assert.equal(cmt?.content, 'Bình luận giữ nguyên');
      assert.equal(access?.access_mode, 'restricted');
    } finally {
      mockDb.close();
    }
  });

  it('rollback xoá tệp R2 mới và giữ nguyên tệp cũ khi vượt hạn mức hoặc D1 lỗi', async () => {
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const mockR2 = createMockR2Bucket([
      { key: 'books/book-rb-0001-old.epub', size: 500, uploaded: new Date(1000) },
    ]);
    const env = makeFakeEnv(mockDb, mockR2, { STORAGE_LIMIT_BYTES: '600' });

    try {
      await mockDb
        .prepare(
          `INSERT INTO books (id, title, author, shelf, file_key, file_type, file_size, cover_size, created_at)
           VALUES ('book-rb-0001', 'Vol 1', 'Author', 'LN', 'books/book-rb-0001-old.epub', 'epub', 500, 0, '2026-11-25')`,
        )
        .run();

      // Khai báo X-File-Size nhỏ hơn thực tế (100) nhưng body thật 700 > 600 -> kích hoạt rollback sau khi PUT R2!
      const oversizedBody = new Uint8Array(700).fill(0x50);
      const quotaReq = new Request('https://worker.test/api/books/book-rb-0001/replace-file', {
        method: 'PUT',
        headers: { 'X-File-Type': 'epub', 'X-File-Size': '100' },
        body: oversizedBody,
      });
      await assert.rejects(
        () => handleBookFileReplace(quotaReq, env, 'book-rb-0001'),
        (err: { status?: number }) => err?.status === 413,
      );
      // Tệp cũ vẫn còn nguyên, không còn tệp rác mới nào trên R2
      assert.deepEqual(Array.from(mockR2.store.keys()), ['books/book-rb-0001-old.epub']);

      // Giả lập D1 lỗi ngay lúc batch UPDATE -> phải xoá tệp R2 mới và giữ tệp cũ
      const failingDb = {
        prepare: mockDb.prepare,
        batch: async (stmts: Parameters<typeof mockDb.batch>[0]) => {
          if (stmts.some((s) => s._sql.includes('UPDATE books'))) {
            throw new Error('Simulated D1 write failure');
          }
          return mockDb.batch(stmts);
        },
      };
      const failingEnv = { ...env, DB: failingDb } as unknown as Env;
      const failReq = new Request('https://worker.test/api/books/book-rb-0001/replace-file', {
        method: 'PUT',
        headers: { 'X-File-Type': 'epub', 'X-File-Size': '400' },
        body: new Uint8Array(400).fill(0x50),
      });
      await assert.rejects(
        () => handleBookFileReplace(failReq, failingEnv, 'book-rb-0001'),
        /Simulated D1 write failure/,
      );
      assert.deepEqual(Array.from(mockR2.store.keys()), ['books/book-rb-0001-old.epub']);
    } finally {
      mockDb.close();
    }
  });
});

describe('Wave 2.2 — R2 Storage Reconcile & > 24h Orphan Cleanup', () => {
  it('phân loại chính xác tệp đang dùng vs mồ côi > 24h vs mồ côi <= 24h và chỉ dọn tệp > 24h', async () => {
    const now = 1_780_000_000_000;
    const oldTs = now - ORPHAN_SAFE_AGE_MS - 3_600_000; // 25 giờ trước -> safeToDelete = true
    const exact24hTs = now - ORPHAN_SAFE_AGE_MS; // đúng 24.0h -> safeToDelete = false (chặt > 24h)
    const recentTs = now - 2 * 3_600_000; // 2 giờ trước -> safeToDelete = false

    const summary = classifyStorageOrphans(
      [
        { key: 'books/active.epub', size: 1000, uploadedMs: oldTs },
        { key: 'books/orphan-old.epub', size: 500, uploadedMs: oldTs },
        { key: 'covers/orphan-exact24.jpg', size: 200, uploadedMs: exact24hTs },
        { key: 'guest-packs/orphan-recent.pack', size: 300, uploadedMs: recentTs },
      ],
      new Set(['books/active.epub']),
      now,
    );

    assert.equal(summary.r2ObjectCount, 4);
    assert.equal(summary.referencedCount, 1);
    assert.equal(summary.orphanCount, 3);
    assert.equal(summary.safeOrphanCount, 1);
    assert.equal(summary.recentOrphanCount, 2);
    assert.equal(summary.orphans[0].key, 'books/orphan-old.epub');
    assert.equal(summary.orphans[0].safeToDelete, true);

    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    // pageSize = 2 để kiểm chứng phân trang nhiều trang BOOKS_BUCKET.list()
    const mockR2 = createMockR2Bucket(
      [
        { key: 'books/active.epub', size: 1000, uploaded: new Date(oldTs) },
        { key: 'books/orphan-old.epub', size: 500, uploaded: new Date(oldTs) },
        { key: 'covers/orphan-recent.jpg', size: 250, uploaded: new Date(recentTs) },
      ],
      2,
    );
    const env = makeFakeEnv(mockDb, mockR2);

    try {
      await mockDb
        .prepare(
          `INSERT INTO books (id, title, author, shelf, cover_key, file_key, file_type, file_size, cover_size, created_at)
           VALUES ('book-rec-0001', 'Tập 1', 'Author', 'Shelf', 'covers/missing-in-r2.jpg', 'books/active.epub', 'epub', 1000, 50, '2026-11-25')`,
        )
        .run();

      const report = await reconcileR2Storage(
        env,
        new URL('https://worker.test/api/admin/storage/reconcile'),
        now,
      );
      assert.equal(report.scannedPages, 2);
      assert.equal(report.r2.orphanCount, 2);
      assert.equal(report.r2.safeOrphanCount, 1);
      assert.equal(report.missingInR2Count, 1);
      assert.deepEqual(report.missingInR2Sample, ['covers/missing-in-r2.jpg']);

      // Thử gửi yêu cầu xoá cả tệp đang dùng + tệp mới 2h + tệp mồ côi 25h -> CHỈ xoá tệp 25h!
      const cleanup = await cleanupOrphanR2Storage(
        env,
        { keys: ['books/active.epub', 'covers/orphan-recent.jpg', 'books/orphan-old.epub'] },
        now,
      );
      assert.deepEqual(cleanup.deletedKeys, ['books/orphan-old.epub']);
      assert.equal(cleanup.reclaimedBytes, 500);
      assert.equal(cleanup.skippedActiveCount, 1);
      assert.equal(cleanup.skippedRecentCount, 1);
      assert.equal(mockR2.store.has('books/active.epub'), true);
      assert.equal(mockR2.store.has('covers/orphan-recent.jpg'), true);
      assert.equal(mockR2.store.has('books/orphan-old.epub'), false);
    } finally {
      mockDb.close();
    }
  });
});

describe('Wave 2.3 & 2.4 — Selective Concurrency, Owner JSON Backup & ETag 304', () => {
  it('resolvePackSyncConcurrency chọn 2 cho tệp <= 40 MB và 1 cho tệp > 40 MB', () => {
    assert.equal(resolvePackSyncConcurrency(10 * 1024 * 1024), 2);
    assert.equal(resolvePackSyncConcurrency(40 * 1024 * 1024), 2);
    assert.equal(resolvePackSyncConcurrency(40 * 1024 * 1024 + 1), 1);
  });

  it('validateOwnerBackupPayload chặn dữ liệu sai schema và export/import khôi phục chuẩn giữ nguyên dữ liệu Guest', async () => {
    assert.throws(() => validateOwnerBackupPayload({ app: 'other', schemaVersion: 1, data: {} }), /Ofu's Library/);
    assert.throws(
      () => validateOwnerBackupPayload({ app: OWNER_BACKUP_APP_ID, schemaVersion: 2, data: {} }),
      /schemaVersion/,
    );
    assert.throws(
      () =>
        validateOwnerBackupPayload({
          app: OWNER_BACKUP_APP_ID,
          schemaVersion: OWNER_BACKUP_SCHEMA_VERSION,
          data: {
            shelfRelations: [{ sourceShelfKey: 'same', targetShelfKey: 'same', relationType: 'sequel' }],
          },
        }),
      /chính mình/,
    );
    assert.throws(
      () =>
        validateOwnerBackupPayload({
          app: OWNER_BACKUP_APP_ID,
          schemaVersion: OWNER_BACKUP_SCHEMA_VERSION,
          data: {
            accessRules: {
              shelves: [
                {
                  shelfKey: 'ln',
                  mode: 'restricted',
                  grants: [{ discordUserId: 'not-a-snowflake' }],
                },
              ],
            },
          },
        }),
      /Discord User ID/,
    );

    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const mockR2 = createMockR2Bucket();
    const env = makeFakeEnv(mockDb, mockR2);
    try {
      await mockDb
        .prepare(
          `INSERT INTO books (id, title, author, shelf, file_key, file_type, created_at)
           VALUES ('book-bk-0001', 'Vol 1', 'Author', 'Series A', 'books/a.epub', 'epub', '2026-11-25'),
                  ('book-bk-0002', 'Vol 2', 'Author', 'Series B', 'books/b.epub', 'epub', '2026-11-25')`,
        )
        .run();
      await mockDb.batch([
        mockDb.prepare(
          `INSERT INTO reading_progress (book_id, chapter_id, chapter_index, scroll_ratio, scroll_top, completed, book_percent, reading_seconds, reread_count, updated_at)
           VALUES ('book-bk-0001', 'ch-3', 3, 0.8, 120, 0, 62.5, 900, 1, 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO book_bookmarks (id, user_scope, book_id, chapter_id, chapter_index, scroll_ratio, label, note, created_at)
           VALUES ('bm-owner-01', 'owner', 'book-bk-0001', 'ch-3', 3, 0.8, 'Đoạn hay', 'Note', 10000),
                  ('bm-guest-01', 'guest:99999', 'book-bk-0001', 'ch-1', 1, 0.2, 'Guest BM', NULL, 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO book_highlights (id, user_scope, book_id, chapter_id, chapter_index, quote_text, color, created_at)
           VALUES ('hl-owner-01', 'owner', 'book-bk-0001', 'ch-3', 3, 'Một câu trích dẫn', 'emerald', 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO shelf_prefs (shelf_key, cover_book_id, is_favorite, tags_json, alt_titles_json, updated_at)
           VALUES ('series a', 'book-bk-0001', 1, '["Fantasy"]', '["Series A JP"]', 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO shelf_relations (source_shelf_key, target_shelf_key, relation_type, created_at)
           VALUES ('series a', 'series b', 'sequel', 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO user_plan_to_read (user_scope, shelf_key, created_at) VALUES ('owner', 'series b', 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO user_plan_to_read_books (user_scope, book_id, created_at) VALUES ('owner', 'book-bk-0002', 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO custom_collections (id, name, description, sort_order, created_at, updated_at)
           VALUES ('col-owner-01', 'Yêu thích', 'Mô tả', 1, 10000, 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO collection_shelves (collection_id, shelf_key, sort_order) VALUES ('col-owner-01', 'series a', 0)`,
        ),
        mockDb.prepare(
          `INSERT INTO shelf_access_rules (shelf_key, access_mode, updated_at) VALUES ('series a', 'restricted', 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO shelf_guest_grants (shelf_key, discord_user_id, granted_label, created_at) VALUES ('series a', '123456789012345', 'Bạn A', 10000)`,
        ),
        mockDb.prepare(
          `INSERT INTO chapter_access_rules (book_id, chapter_key, access_mode, updated_at) VALUES ('book-bk-0001', 'ch-5', 'restricted', 10000)`,
        ),
      ]);

      const exported = await exportOwnerBackup(env);
      assert.equal(exported.data.progress.length, 1);
      assert.equal(exported.data.bookmarks.length, 1); // không xuất bookmark của guest
      assert.equal(exported.data.highlights.length, 1);
      assert.equal(exported.data.collections[0].shelfKeys[0], 'series a');
      assert.equal(exported.data.accessRules.shelves[0].grants[0].discordUserId, '123456789012345');

      // Thêm 1 bản ghi progress cho sách không còn tồn tại -> import chế độ replace phải bỏ qua sạch (0 lỗi FK)
      const withMissingBook = structuredClone(exported);
      withMissingBook.data.progress.push({
        ...exported.data.progress[0],
        bookId: 'book-deleted-9999',
      });
      const restored = await importOwnerBackupData(env, withMissingBook, 'replace');
      assert.equal(restored.skippedMissingBooks, 1);
      assert.equal(restored.restored.progress, 1);
      assert.equal(restored.restored.bookmarks, 1);
      assert.equal(restored.restored.shelfAccessRules, 1);

      // Bookmark của Guest phải còn nguyên dù chạy replace
      const guestBm = await mockDb
        .prepare("SELECT id FROM book_bookmarks WHERE id = 'bm-guest-01'")
        .first<{ id: string }>();
      assert.equal(guestBm?.id, 'bm-guest-01');
    } finally {
      mockDb.close();
    }
  });

  it('computeWeakBooksEtag + matchesIfNoneMatch + GET /api/books trả 304 và cache client tôn trọng scopeKey', async () => {
    const etagOwner = await computeWeakBooksEtag('{"books":[]}', 'owner', 'owner');
    const etagGuest = await computeWeakBooksEtag('{"books":[]}', 'guest', '12345');
    const etagChanged = await computeWeakBooksEtag('{"books":[{"id":"1"}]}', 'owner', 'owner');
    assert.ok(etagOwner.startsWith('W/"v1-owner-'));
    assert.notEqual(etagOwner, etagGuest);
    assert.notEqual(etagOwner, etagChanged);
    assert.equal(matchesIfNoneMatch(etagOwner, etagOwner), true);
    assert.equal(matchesIfNoneMatch(etagOwner.slice(2), etagOwner), true); // weak comparison
    assert.equal(matchesIfNoneMatch(`"other", ${etagOwner}`, etagOwner), true);
    assert.equal(matchesIfNoneMatch('*', etagOwner), true);
    assert.equal(matchesIfNoneMatch(etagChanged, etagOwner), false);
    assert.equal(matchesIfNoneMatch(null, etagOwner), false);

    // Kiểm tra end-to-end GET /api/books trả 200 -> 304 -> sửa tiêu đề -> 200 mới
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const mockR2 = createMockR2Bucket();
    const env = makeFakeEnv(mockDb, mockR2);
    try {
      await mockDb
        .prepare(
          `INSERT INTO books (id, title, author, shelf, file_key, file_type, created_at)
           VALUES ('book-et-0001', 'Tựa Cũ', 'Author', 'Shelf', 'books/e.epub', 'epub', '2026-11-25')`,
        )
        .run();

      const res1 = await worker.fetch(new Request('https://worker.test/api/books'), env);
      assert.equal(res1.status, 200);
      const etag1 = res1.headers.get('ETag');
      assert.ok(etag1 && etag1.startsWith('W/"v1-owner-'));
      assert.equal(res1.headers.get('Cache-Control'), 'private, no-cache');

      const res304 = await worker.fetch(
        new Request('https://worker.test/api/books', {
          headers: { 'If-None-Match': etag1 },
        }),
        env,
      );
      assert.equal(res304.status, 304);
      assert.equal(await res304.text(), '');

      // Sửa 1 chữ trong title -> ETag đổi ngay lập tức, không bao giờ dính 304 cũ
      await mockDb
        .prepare("UPDATE books SET title = 'Tựa Mới' WHERE id = 'book-et-0001'")
        .run();
      const resAfterEdit = await worker.fetch(
        new Request('https://worker.test/api/books', {
          headers: { 'If-None-Match': etag1 },
        }),
        env,
      );
      assert.equal(resAfterEdit.status, 200);
      assert.notEqual(resAfterEdit.headers.get('ETag'), etag1);
    } finally {
      mockDb.close();
    }

    // Kiểm tra client cache theo scopeKey không rò giữa 2 phiên
    clearLibraryStateCache();
    const scopeA = deriveTokenScopeKey('payloadA.sigA');
    const scopeB = deriveTokenScopeKey('payloadB.sigB');
    writeCachedBooksResponse(scopeA, etagOwner, { books: [] });
    assert.equal(readCachedBooksResponse(scopeA)?.etag, etagOwner);
    assert.equal(readCachedBooksResponse(scopeB), null);
    clearLibraryStateCache();
    assert.equal(readCachedBooksResponse(scopeA), null);
  });
});
