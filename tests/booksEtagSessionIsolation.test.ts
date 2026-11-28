import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { resolveBooksResponseSession } from '../src/lib/libraryStateCache';
import { authenticatePasscodeOrKey, sha256Hex } from '../workers/r2-storage/src/auth';
import type { Env } from '../workers/r2-storage/src/booksDb';
import worker from '../workers/r2-storage/src/index';
import { createMockD1Database } from './helpers/mockD1';

const WORKER_SCHEMA_SQL = readFileSync(
  resolve(process.cwd(), 'workers', 'r2-storage', 'schema.sql'),
  'utf8',
);

function createAuthedEnv(mockDb: ReturnType<typeof createMockD1Database>): Env {
  return {
    DB: mockDb,
    BOOKS_BUCKET: {},
    APP_ORIGINS: 'https://ofu.lol',
    ACCESS_PASSCODE: 'owner-secret-passcode-123',
    AUTH_SECRET: 'signing-secret-for-tests-xyz',
  } as unknown as Env;
}

async function issueGuestKey(
  mockDb: ReturnType<typeof createMockD1Database>,
  discordUserId: string,
  username: string,
  rawKey: string,
) {
  const now = Date.now();
  const keyHash = await sha256Hex(rawKey);
  await mockDb
    .prepare(
      `INSERT INTO discord_access (discord_user_id, discord_username, key_hash, key_issued_at, key_expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(discord_user_id) DO UPDATE SET
         discord_username = excluded.discord_username,
         key_hash = excluded.key_hash,
         key_issued_at = excluded.key_issued_at,
         key_expires_at = excluded.key_expires_at,
         updated_at = excluded.updated_at`,
    )
    .bind(discordUserId, username, keyHash, now, now + 5 * 60_000, now)
    .run();
}

describe('Regression — GET /api/books ETag isolation across guest sessions', () => {
  it('cùng 1 tài khoản Discord đổi key phiên mới phải nhận ETag mới + 200 (không bao giờ 304 theo phiên cũ)', async () => {
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const env = createAuthedEnv(mockDb);
    const ua = 'Mozilla/5.0 Chrome/131.0.0.0';

    try {
      await mockDb
        .prepare(
          `INSERT INTO books (id, title, author, shelf, file_key, file_type, created_at)
           VALUES ('book-iso-0001', 'Vol 1', 'Author', 'Series', 'books/v1.epub', 'epub', '2026-11-28')`,
        )
        .run();

      // Phiên 1 của khách Discord
      await issueGuestKey(mockDb, '645939800213553155', 't.mk', 'ABCDEFGH2345');
      const session1 = await authenticatePasscodeOrKey('ABCDEFGH2345', env, env.DB, ua);

      const res1 = await worker.fetch(
        new Request('https://worker.test/api/books', {
          headers: { Authorization: `Bearer ${session1.token}`, 'User-Agent': ua },
        }),
        env,
      );
      assert.equal(res1.status, 200);
      assert.equal(res1.headers.get('Cache-Control'), 'private, no-store');
      const etag1 = res1.headers.get('ETag');
      assert.ok(etag1 && etag1.startsWith('W/"v2-guest-'));
      const body1 = (await res1.json()) as { session: { role: string; expiresAt: number } };
      assert.equal(body1.session.role, 'guest');
      assert.equal(body1.session.expiresAt, session1.expiresAt);

      // Trong cùng Phiên 1: gửi lại If-None-Match phải trả 304 Not Modified để tiết kiệm băng thông
      const res1NotModified = await worker.fetch(
        new Request('https://worker.test/api/books', {
          headers: {
            Authorization: `Bearer ${session1.token}`,
            'User-Agent': ua,
            'If-None-Match': etag1,
          },
        }),
        env,
      );
      assert.equal(res1NotModified.status, 304);
      assert.equal(res1NotModified.headers.get('Cache-Control'), 'private, no-store');

      // Phiên 2 của CÙNG tài khoản Discord (kho sách & tiến độ không đổi)
      await issueGuestKey(mockDb, '645939800213553155', 't.mk', 'JKLMNPQR6789');
      const session2 = await authenticatePasscodeOrKey('JKLMNPQR6789', env, env.DB, ua);

      // Giả lập trình duyệt vẫn gửi If-None-Match cũ từ Phiên 1 (hoặc ETag v1 cũ trước bản vá)
      const res2 = await worker.fetch(
        new Request('https://worker.test/api/books', {
          headers: {
            Authorization: `Bearer ${session2.token}`,
            'User-Agent': ua,
            'If-None-Match': etag1,
          },
        }),
        env,
      );
      assert.equal(res2.status, 200);
      assert.equal(res2.headers.get('Cache-Control'), 'private, no-store');
      const etag2 = res2.headers.get('ETag');
      assert.ok(etag2 && etag2.startsWith('W/"v2-guest-'));
      assert.notEqual(etag2, etag1);
      const body2 = (await res2.json()) as { session: { role: string; expiresAt: number } };
      assert.equal(body2.session.expiresAt, session2.expiresAt);

      // Trong cùng Phiên 2: gửi If-None-Match với etag2 trả 304 bình thường
      const res2NotModified = await worker.fetch(
        new Request('https://worker.test/api/books', {
          headers: {
            Authorization: `Bearer ${session2.token}`,
            'User-Agent': ua,
            'If-None-Match': etag2,
          },
        }),
        env,
      );
      assert.equal(res2NotModified.status, 304);
    } finally {
      mockDb.close();
    }
  });

  it('resolveBooksResponseSession giữ nguyên expiresAt token hiện hành khi gặp 304 hoặc payload cũ quá hạn', () => {
    const now = 1_795_857_231_498;
    const activeTokenSession = { role: 'guest' as const, expiresAt: now + 86_400_000 };
    const stalePayload = { role: 'guest' as const, expiresAt: now - 3_600_000, watermarkLabel: 't.mk · #3155' };

    const from304 = resolveBooksResponseSession(stalePayload, activeTokenSession, 304, now);
    assert.equal(from304.expiresAt, activeTokenSession.expiresAt);
    assert.equal(from304.watermarkLabel, 't.mk · #3155');

    const fromStale200 = resolveBooksResponseSession(stalePayload, activeTokenSession, 200, now);
    assert.equal(fromStale200.expiresAt, activeTokenSession.expiresAt);

    const freshServerExp = now + 43_200_000;
    const fromFresh200 = resolveBooksResponseSession(
      { role: 'guest', expiresAt: freshServerExp, watermarkLabel: 't.mk · #3155' },
      activeTokenSession,
      200,
      now,
    );
    assert.equal(fromFresh200.expiresAt, freshServerExp);
  });
});
