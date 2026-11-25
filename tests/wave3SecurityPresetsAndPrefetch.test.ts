import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  GUEST_PREFETCH_RATIO_THRESHOLD,
  shouldPrefetchNextGuestChapter,
} from '../src/hooks/useGuestChapterStream';
import { buildContentSecurityPolicy, extractSafeOrigin } from '../src/lib/cspPolicy';
import {
  buildAdminSecurityAlertPayload,
  isValidDiscordWebhookUrl,
} from '../workers/r2-storage/src/adminAlerts';
import {
  OWNER_TOKEN_TTL_MS,
  createAuthToken,
  createSignedToken,
  resolveOwnerTokenIssuedAt,
  verifyAuth,
} from '../workers/r2-storage/src/auth';
import type { Env } from '../workers/r2-storage/src/booksDb';
import {
  getDiscordGuestAccessMatrix,
  revokeAllDiscordGuestAccess,
} from '../workers/r2-storage/src/discordAccessMatrixDb';
import {
  createDiscordAccessPreset,
  deleteDiscordAccessPreset,
  listDiscordAccessPresets,
  updateDiscordAccessPreset,
  validateDiscordPresetInput,
} from '../workers/r2-storage/src/discordPresetsDb';
import worker from '../workers/r2-storage/src/index';
import {
  WORKER_SECURITY_HEADERS,
  applySecurityHeaders,
  withSecurityHeaders,
} from '../workers/r2-storage/src/securityHeaders';
import {
  clearOwnerMinIatCache,
  revokeOwnerSessionsBefore,
} from '../workers/r2-storage/src/securityStateDb';
import { getAdminRecentCommunity } from '../workers/r2-storage/src/usageRecentCommunityDb';
import { createMockD1Database } from './helpers/mockD1';

const WORKER_SCHEMA_SQL = readFileSync(
  resolve(process.cwd(), 'workers', 'r2-storage', 'schema.sql'),
  'utf8',
);
const MIGRATION_0019_SQL = readFileSync(
  resolve(process.cwd(), 'workers', 'r2-storage', 'migrations', '0019_v5_security_and_presets.sql'),
  'utf8',
);

function makeTestEnv(mockDb: ReturnType<typeof createMockD1Database>, overrides: Partial<Env> = {}): Env {
  return {
    DB: mockDb,
    BOOKS_BUCKET: {} as unknown as R2Bucket,
    APP_ORIGINS: 'https://ofu.lol',
    ACCESS_PASSCODE: 'secret-owner-pass-2026',
    AUTH_SECRET: 'hmac-signing-secret-2026',
    ...overrides,
  } as unknown as Env;
}

describe('Wave 3.1 — Guest Speculative Prefetch Guard (shouldPrefetchNextGuestChapter)', () => {
  const toc = [
    { id: 'ch-1', title: 'Chương 1', chapterNumber: 1 },
    { id: 'ch-2', title: 'Chương 2', chapterNumber: 2 },
    { id: 'ch-3', title: 'Chương 3 (Khoá)', chapterNumber: 3, locked: true },
    { id: 'ch-4', title: 'Chương 4', chapterNumber: 4 },
  ];

  const baseInput = {
    chapterIndex: 0,
    scrollRatio: GUEST_PREFETCH_RATIO_THRESHOLD,
    tocChapters: toc,
    isCurrentChapterLocked: false,
    isLoadingCurrentChapter: false,
    hasCurrentChapterError: false,
    hasCurrentChapterData: true,
    isNextChapterCached: false,
    nowMs: 100_000,
    rateLimitCooldownUntilMs: 0,
    alreadyAttemptedForTarget: false,
  };

  it('chỉ kích hoạt prefetch chương N+1 khi >= ngưỡng 78%, chương kế mở và sạch mọi điều kiện chặn', () => {
    assert.equal(shouldPrefetchNextGuestChapter(baseInput), 1);
    assert.equal(
      shouldPrefetchNextGuestChapter({ ...baseInput, scrollRatio: GUEST_PREFETCH_RATIO_THRESHOLD - 0.01 }),
      null,
    );
    // Bỏ qua chương kế bị khoá (D-042)
    assert.equal(shouldPrefetchNextGuestChapter({ ...baseInput, chapterIndex: 1 }), null);
    // Bỏ qua chương cuối sách
    assert.equal(shouldPrefetchNextGuestChapter({ ...baseInput, chapterIndex: 3 }), null);
    // Bỏ qua nếu đã nằm trong RAM cache hoặc đã thử rồi
    assert.equal(shouldPrefetchNextGuestChapter({ ...baseInput, isNextChapterCached: true }), null);
    assert.equal(
      shouldPrefetchNextGuestChapter({ ...baseInput, alreadyAttemptedForTarget: true }),
      null,
    );
    // Bỏ qua nếu vừa chạm 429 gần đây (bảo toàn Token Bucket D-028)
    assert.equal(
      shouldPrefetchNextGuestChapter({ ...baseInput, rateLimitCooldownUntilMs: 120_000 }),
      null,
    );
    // Hết cooldown 429 -> cho phép prefetch lại
    assert.equal(
      shouldPrefetchNextGuestChapter({ ...baseInput, rateLimitCooldownUntilMs: 99_999 }),
      1,
    );
    // Bỏ qua nếu chương hiện tại đang tải / lỗi / khoá / chưa có dữ liệu
    assert.equal(
      shouldPrefetchNextGuestChapter({ ...baseInput, isLoadingCurrentChapter: true }),
      null,
    );
    assert.equal(
      shouldPrefetchNextGuestChapter({ ...baseInput, hasCurrentChapterError: true }),
      null,
    );
    assert.equal(
      shouldPrefetchNextGuestChapter({ ...baseInput, hasCurrentChapterData: false }),
      null,
    );
  });
});

describe('Wave 3.3 — Security Headers, Frontend CSP & Owner Session Revocation (owner_min_iat)', () => {
  it('applySecurityHeaders & Worker HTTP responses luôn mang đủ 3 header bảo mật chuẩn', async () => {
    const h = applySecurityHeaders(new Headers());
    for (const [key, val] of Object.entries(WORKER_SECURITY_HEADERS)) {
      assert.equal(h.get(key), val);
    }

    const wrapped = withSecurityHeaders(new Response('ok', { status: 200 }));
    assert.equal(wrapped.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(wrapped.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(wrapped.headers.get('Referrer-Policy'), 'no-referrer');

    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const env = makeTestEnv(mockDb);
    try {
      const healthRes = await worker.fetch(new Request('https://worker.test/api/health'), env);
      assert.equal(healthRes.status, 200);
      assert.equal(healthRes.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(healthRes.headers.get('X-Frame-Options'), 'DENY');
      assert.equal(healthRes.headers.get('Referrer-Policy'), 'no-referrer');

      const optRes = await worker.fetch(
        new Request('https://worker.test/api/health', {
          method: 'OPTIONS',
          headers: { Origin: 'https://ofu.lol' },
        }),
        env,
      );
      assert.equal(optRes.status, 204);
      assert.equal(optRes.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(optRes.headers.get('X-Frame-Options'), 'DENY');
      assert.equal(optRes.headers.get('Referrer-Policy'), 'no-referrer');

      const unauthRes = await worker.fetch(new Request('https://worker.test/api/books'), env);
      assert.equal(unauthRes.status, 401);
      assert.equal(unauthRes.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal(unauthRes.headers.get('X-Frame-Options'), 'DENY');
    } finally {
      mockDb.close();
    }
  });

  it('buildContentSecurityPolicy chặt chẽ ở production (không unsafe-inline ở script-src) và ghép đúng origin API', () => {
    assert.equal(extractSafeOrigin('https://api.ofu.lol/v1/test'), 'https://api.ofu.lol');
    assert.equal(extractSafeOrigin('javascript:alert(1)'), null);

    const prodCsp = buildContentSecurityPolicy({
      apiUrl: 'https://api.ofu.lol',
      isDev: false,
    });
    assert.ok(prodCsp.includes("script-src 'self';"));
    assert.ok(!prodCsp.includes('unsafe-eval'));
    assert.ok(!prodCsp.includes('frame-ancestors'));
    assert.ok(prodCsp.includes('https://api.ofu.lol'));
    assert.ok(prodCsp.includes('https://graphql.anilist.co'));
    assert.ok(prodCsp.includes("img-src 'self' blob: data:"));

    const devCsp = buildContentSecurityPolicy({
      apiUrl: 'http://127.0.0.1:8787',
      isDev: true,
    });
    assert.ok(devCsp.includes("script-src 'self' 'unsafe-inline'"));
    assert.ok(devCsp.includes('http://127.0.0.1:8787'));
    assert.ok(devCsp.includes('ws:'));
  });

  it('owner_min_iat thu hồi tức thì cả token cũ (không iat) lẫn token mới và hỗ trợ cấp lại phiên thiết bị hiện tại', async () => {
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const env = makeTestEnv(mockDb);
    try {
      const now = Date.now();
      // Token cũ chưa có trường `iat` -> tương thích ngược bằng `exp - OWNER_TOKEN_TTL_MS`
      const legacyExp = now + OWNER_TOKEN_TTL_MS - 5000;
      assert.equal(resolveOwnerTokenIssuedAt({ exp: legacyExp }), Math.floor(legacyExp - OWNER_TOKEN_TTL_MS));
      const legacyToken = await createSignedToken(env, {
        sub: 'owner',
        role: 'owner',
        exp: legacyExp,
      });

      // Token mới có `iat`
      const currentSession = await createAuthToken(env, now - 1000);

      // Trước khi thu hồi: cả 2 token đều hợp lệ
      const ctxLegacy = await verifyAuth(
        new Request('https://worker.test/api/auth/session', {
          headers: { Authorization: `Bearer ${legacyToken}` },
        }),
        env,
        mockDb,
      );
      assert.equal(ctxLegacy.role, 'owner');

      const ctxCurrent = await verifyAuth(
        new Request('https://worker.test/api/auth/session', {
          headers: { Authorization: `Bearer ${currentSession.token}` },
        }),
        env,
        mockDb,
      );
      assert.equal(ctxCurrent.role, 'owner');

      // Gọi endpoint POST /api/admin/sessions/revoke-owner với reissueCurrent: true
      const revokeRes = await worker.fetch(
        new Request('https://worker.test/api/admin/sessions/revoke-owner', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentSession.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reissueCurrent: true }),
        }),
        env,
      );
      assert.equal(revokeRes.status, 200);
      const revokeBody = (await revokeRes.json()) as {
        ok: boolean;
        revokedBefore: number;
        session?: { token: string; role: string; expiresAt: number };
      };
      assert.equal(revokeBody.ok, true);
      assert.ok(revokeBody.session?.token);

      // Cả token legacy lẫn token trước khi thu hồi đều bị từ chối 401 ngay lập tức
      for (const staleTok of [legacyToken, currentSession.token]) {
        await assert.rejects(
          () =>
            verifyAuth(
              new Request('https://worker.test/api/auth/session', {
                headers: { Authorization: `Bearer ${staleTok}` },
              }),
              env,
              mockDb,
            ),
          (err: { status?: number }) => err?.status === 401,
        );
      }

      // Token vừa cấp lại (`iat === revokedBefore`) phải đi qua sạch cả trước lẫn sau khi xoá cache isolate
      const ctxFresh = await verifyAuth(
        new Request('https://worker.test/api/auth/session', {
          headers: { Authorization: `Bearer ${revokeBody.session!.token}` },
        }),
        env,
        mockDb,
      );
      assert.equal(ctxFresh.role, 'owner');

      clearOwnerMinIatCache(mockDb);
      const ctxFreshReloaded = await verifyAuth(
        new Request('https://worker.test/api/auth/session', {
          headers: { Authorization: `Bearer ${revokeBody.session!.token}` },
        }),
        env,
        mockDb,
      );
      assert.equal(ctxFreshReloaded.role, 'owner');

      // Thu hồi toàn bộ không reissue -> token mới cũng bị từ chối 401
      await revokeOwnerSessionsBefore(mockDb, Date.now() + 10);
      await assert.rejects(
        () =>
          verifyAuth(
            new Request('https://worker.test/api/auth/session', {
              headers: { Authorization: `Bearer ${revokeBody.session!.token}` },
            }),
            env,
            mockDb,
          ),
        (err: { status?: number }) => err?.status === 401,
      );
    } finally {
      mockDb.close();
    }
  });
});

describe('Wave 3.4 — Discord Presets CRUD, Access Matrix, Recent Community, Alerts & Migration 0019', () => {
  it('validateDiscordPresetInput chặn dữ liệu sai và khử trùng thành viên, CRUD Preset chạy trọn vòng đời', async () => {
    assert.throws(() => validateDiscordPresetInput({ name: '   ', members: [] }), /trống/);
    assert.throws(
      () =>
        validateDiscordPresetInput({
          name: 'Nhóm lỗi',
          members: [{ discordUserId: 'not-numeric' }],
        }),
      /Discord User ID/,
    );

    const validated = validateDiscordPresetInput({
      name: '  Nhóm Bạn Thân  ',
      description: '  Đọc sớm tập mới  ',
      members: [
        { discordUserId: '100000000000000001', label: 'Alice' },
        { discordUserId: '100000000000000001', label: 'Alice Dup' },
        { discordUserId: '200000000000000002', label: 'Bob' },
      ],
    });
    assert.equal(validated.name, 'Nhóm Bạn Thân');
    assert.equal(validated.members.length, 2);

    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    try {
      await mockDb
        .prepare(
          `INSERT INTO discord_access (discord_user_id, discord_username, updated_at)
           VALUES ('100000000000000001', 'AliceDiscord', 1000)`,
        )
        .run();

      const { preset } = await createDiscordAccessPreset(mockDb, validated);
      assert.equal(preset.name, 'Nhóm Bạn Thân');
      assert.equal(preset.members.length, 2);
      assert.equal(preset.members[0].discordUsername, 'AliceDiscord');

      const listed = await listDiscordAccessPresets(mockDb);
      assert.equal(listed.presets.length, 1);

      const { preset: updated } = await updateDiscordAccessPreset(mockDb, preset.id, {
        name: 'Nhóm VIP',
        members: [{ discordUserId: '200000000000000002', label: 'Bob' }],
      });
      assert.equal(updated.name, 'Nhóm VIP');
      assert.equal(updated.members.length, 1);

      await deleteDiscordAccessPreset(mockDb, preset.id);
      const afterDel = await listDiscordAccessPresets(mockDb);
      assert.equal(afterDel.presets.length, 0);

      await assert.rejects(
        () => deleteDiscordAccessPreset(mockDb, preset.id),
        (err: { status?: number }) => err?.status === 404,
      );
    } finally {
      mockDb.close();
    }
  });

  it('Access Matrix liệt kê đủ Bộ/Tập/Chương/Preset & Revoke-All thu hồi sạch, Recent Community trả đúng bản ghi', async () => {
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    try {
      const uid = '300000000000000003';
      await mockDb.batch([
        mockDb.prepare(
          `INSERT INTO books (id, title, author, shelf, file_key, file_type, created_at)
           VALUES ('book-m-01', 'LN Tập 1', 'Author', 'Bộ Giới Hạn', 'books/m1.epub', 'epub', '2026-11-25')`,
        ),
        mockDb.prepare(
          `INSERT INTO discord_access (discord_user_id, discord_username, active_session_id, session_expires_at, updated_at)
           VALUES ('${uid}', 'Charlie', 'sess-xyz', ${Date.now() + 60_000}, 1000)`,
        ),
        mockDb.prepare(
          `INSERT INTO shelf_access_rules (shelf_key, access_mode, updated_at) VALUES ('bộ giới hạn', 'restricted', 1000)`,
        ),
        mockDb.prepare(
          `INSERT INTO shelf_guest_grants (shelf_key, discord_user_id, granted_label, created_at) VALUES ('bộ giới hạn', '${uid}', 'Charlie', 1000)`,
        ),
        mockDb.prepare(
          `INSERT INTO book_access_rules (book_id, access_mode, updated_at) VALUES ('book-m-01', 'restricted', 1000)`,
        ),
        mockDb.prepare(
          `INSERT INTO book_guest_grants (book_id, discord_user_id, granted_label, created_at) VALUES ('book-m-01', '${uid}', 'Charlie', 1000)`,
        ),
        mockDb.prepare(
          `INSERT INTO chapter_access_rules (book_id, chapter_key, access_mode, updated_at) VALUES ('book-m-01', 'ch-9', 'restricted', 1000)`,
        ),
        mockDb.prepare(
          `INSERT INTO chapter_guest_grants (book_id, chapter_key, discord_user_id, granted_label, created_at) VALUES ('book-m-01', 'ch-9', '${uid}', 'Charlie', 1000)`,
        ),
        mockDb.prepare(
          `INSERT INTO library_comments (id, target_type, target_key, user_scope, author_name, author_role, content, chapter_number, created_at, updated_at)
           VALUES ('cmt-rc-1', 'book', 'book-m-01', 'guest:${uid}', 'Charlie', 'guest', 'Tập này hay quá!', 2, 5000, 5000)`,
        ),
        mockDb.prepare(
          `INSERT INTO library_ratings (target_type, target_key, user_scope, author_name, rating, rating_half, updated_at)
           VALUES ('book', 'book-m-01', 'guest:${uid}', 'Charlie', 5, 9, 5000)`,
        ),
      ]);
      await createDiscordAccessPreset(mockDb, {
        name: 'Nhóm Beta',
        members: [{ discordUserId: uid, label: 'Charlie' }],
      });

      const matrix = await getDiscordGuestAccessMatrix(mockDb, uid);
      assert.equal(matrix.shelves.length, 1);
      assert.equal(matrix.shelves[0].shelfName, 'Bộ Giới Hạn');
      assert.equal(matrix.books.length, 1);
      assert.equal(matrix.chapters.length, 1);
      assert.equal(matrix.presets.length, 1);
      assert.equal(matrix.totalGrants, 3);

      const revoked = await revokeAllDiscordGuestAccess(mockDb, uid, {
        includePresets: true,
        closeSession: true,
      });
      assert.equal(revoked.removedShelves, 1);
      assert.equal(revoked.removedBooks, 1);
      assert.equal(revoked.removedChapters, 1);
      assert.equal(revoked.removedPresets, 1);
      assert.equal(revoked.sessionClosed, true);

      const matrixAfter = await getDiscordGuestAccessMatrix(mockDb, uid);
      assert.equal(matrixAfter.totalGrants, 0);
      assert.equal(matrixAfter.presets.length, 0);
      assert.equal(matrixAfter.sessionExpiresAt, null);

      const recent = await getAdminRecentCommunity(mockDb, '20');
      assert.equal(recent.comments.length, 1);
      assert.equal(recent.comments[0].targetLabel, 'LN Tập 1');
      assert.equal(recent.comments[0].chapterNumber, 2);
      assert.equal(recent.ratings.length, 1);
      assert.equal(recent.ratings[0].rating, 4.5);
    } finally {
      mockDb.close();
    }
  });

  it('Webhook cảnh báo chỉ chấp nhận Discord HTTPS hợp lệ và Migration 0019 backfill strike + xoá 2 index dư thừa', async () => {
    assert.equal(
      isValidDiscordWebhookUrl('https://discord.com/api/webhooks/123456789012345678/abc_DEF-123'),
      true,
    );
    assert.equal(isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123/abc'), false);
    assert.equal(isValidDiscordWebhookUrl('https://evil.example/api/webhooks/123/abc'), false);

    const payload = buildAdminSecurityAlertPayload({
      kind: 'guest_strike_lockout',
      discordUserId: '123456789',
      discordUsername: 'BotUser',
      strikes: 10,
      endpoint: '/api/guest/books/b1/chapters/5',
    });
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.ok(payload.embeds[0].description.includes('10 strikes'));

    // Mô phỏng DB trước migration 0019 có 2 index dư thừa & 1 dòng strike cũ còn rl_last_strike_at = 0
    const pre0019Sql = `
      CREATE TABLE discord_access (
        discord_user_id TEXT PRIMARY KEY,
        discord_username TEXT NOT NULL,
        rl_tokens REAL NOT NULL DEFAULT 10,
        rl_updated_at INTEGER NOT NULL DEFAULT 0,
        rl_strikes INTEGER NOT NULL DEFAULT 0,
        rl_last_strike_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE usage_daily_readers (day_key TEXT NOT NULL, reader_scope TEXT NOT NULL, PRIMARY KEY (day_key, reader_scope));
      CREATE INDEX idx_usage_daily_readers_day ON usage_daily_readers(day_key);
      CREATE TABLE library_comments (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
      CREATE TABLE library_ratings (target_type TEXT NOT NULL, target_key TEXT NOT NULL, user_scope TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (target_type, target_key, user_scope));
      CREATE TABLE library_comment_reactions (comment_id TEXT NOT NULL, user_scope TEXT NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY (comment_id, user_scope, emoji));
      CREATE INDEX idx_comment_reactions_comment ON library_comment_reactions(comment_id);
      INSERT INTO discord_access (discord_user_id, discord_username, rl_updated_at, rl_strikes, rl_last_strike_at, updated_at)
      VALUES ('999999', 'OldStrike', 1700000000000, 4, 0, 1700000000000);
    `;
    const mockDb = createMockD1Database(pre0019Sql);
    try {
      // Thực thi toàn bộ file migration 0019 thật
      mockDb.raw.exec(MIGRATION_0019_SQL);

      const backfilled = await mockDb
        .prepare("SELECT rl_last_strike_at FROM discord_access WHERE discord_user_id = '999999'")
        .first<{ rl_last_strike_at: number }>();
      assert.equal(backfilled?.rl_last_strike_at, 1700000000000);

      const droppedIdxs = await mockDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_usage_daily_readers_day', 'idx_comment_reactions_comment')",
        )
        .all<{ name: string }>();
      assert.equal((droppedIdxs.results || []).length, 0);

      const secRow = await mockDb
        .prepare('SELECT owner_min_iat FROM app_security_state WHERE id = 1')
        .first<{ owner_min_iat: number }>();
      assert.equal(secRow?.owner_min_iat, 0);
    } finally {
      mockDb.close();
    }
  });
});
