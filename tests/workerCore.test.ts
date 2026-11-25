import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import type { AuthContext } from '../workers/r2-storage/src/auth';
import {
  assertGuestBookEffectiveAccess,
  assertGuestChapterAccess,
  computeGuestLockedShelfKeys,
  resolveGuestBookLocked,
  toCanonicalChapterKey,
} from '../workers/r2-storage/src/bookChapterAccessDb';
import {
  type Env,
  listBooksAndProgress,
  upsertReadingProgress,
} from '../workers/r2-storage/src/booksDb';
import {
  buildDiscordReleaseMessagePayload,
  formatReleaseVolumeSummary,
} from '../workers/r2-storage/src/discordReleaseFormat';
import { getAdminGuestUsageDetail } from '../workers/r2-storage/src/usageDb';
import {
  type WatermarkBlock,
  applyForensicWatermarkToBlocks,
  deriveUserWatermarkBits,
  extractForensicObservations,
  matchForensicCandidates,
  watermarkTextString,
} from '../workers/r2-storage/src/forensicWatermark';
import {
  DECAYED_STRIKES_SQL,
  DECAYED_STRIKE_AT_SQL,
  STRIKE_DECAY_STEP_MS,
  STRIKE_RESET_IDLE_MS,
  buildStrikeDecayBindParams,
  clearLoginFailures,
  consumeGuestRateToken,
  consumeLoginAttempt,
} from '../workers/r2-storage/src/rateLimitDb';
import {
  computeMergedShelfRelationsOnRename,
  mergeShelfRelationsOnRename,
  upsertShelfRelation,
} from '../workers/r2-storage/src/shelfRelationsDb';
import { createMockD1Database } from './helpers/mockD1';

const WORKER_SCHEMA_SQL = readFileSync(
  resolve(process.cwd(), 'workers', 'r2-storage', 'schema.sql'),
  'utf8',
);

const GUEST_AUTH: AuthContext = {
  role: 'guest',
  userId: 'discord-guest-1',
  sessionId: 'sess-1',
  expiresAt: Date.now() + 3_600_000,
  watermarkLabel: 'Tester · #0001',
};

describe('Worker forensicWatermark (D-028 / Phase 1.4)', () => {
  it('nhúng & truy vết chính xác thủ phạm Discord kể cả đoạn ngắn < 3 ký tự và đa span NFD/NFC', async () => {
    const secret = 'test-forensic-secret-key-2026';
    const candidates = [
      { discordUserId: '100000000000000001', discordUsername: 'Alice' },
      { discordUserId: '200000000000000002', discordUsername: 'Bob' },
      { discordUserId: '300000000000000003', discordUsername: 'Charlie' },
    ];
    const bobBits = await deriveUserWatermarkBits(secret, candidates[1].discordUserId);

    // Kiểm tra đối xứng đoạn ngắn < 3 ký tự (`…` / `...`)
    const shortWatermarked = watermarkTextString('…', bobBits);
    const shortObs = extractForensicObservations(shortWatermarked);
    assert.equal(shortObs.length, 1);

    const blocks: WatermarkBlock[] = [
      {
        kind: 'p',
        spans: [
          { t: 'Cô ấy khẽ nói: "Tuỳ cậu thôi… ' },
          { t: 'hoá ra ngọn lửa thuỷ tinh ấy vẫn toả sáng — thật khoẻ khoắn và ngoan ngoãn…"'.normalize('NFD'), i: 1 },
        ],
      },
      {
        kind: 'p',
        spans: [
          {
            t: 'Hoàng hôn nhuộm đỏ toà tháp cổ… tiếng chuông vang hoài không dứt — mọi chuyện đều có thể thuỷ chung nếu không nguỵ tạo và thoả hiệp… thật là hoàn hảo, hoá giải mọi lo toan, tuỳ cơ ứng biến, khoá chặt cánh cửa cũ.',
          },
        ],
      },
    ];

    const marked = applyForensicWatermarkToBlocks(blocks, bobBits);
    const leakedText = marked
      .map((b) => (b.kind === 'p' ? b.spans.map((s) => s.t).join('') : ''))
      .join('\n');

    const matched = await matchForensicCandidates(leakedText, candidates, secret);
    assert.ok(matched.totalSlots >= 10);
    assert.equal(matched.results[0].discordUserId, candidates[1].discordUserId);
    assert.equal(matched.results[0].matchPercent, 100);
  });
});

describe('Worker rateLimitDb (strike decay SQL & atomic login lockout)', () => {
  it('DECAYED_STRIKES_SQL hồi -1/30p và reset 0 sau 24h cho cả dòng pre-0017 (rl_last_strike_at = 0)', async () => {
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    try {
      const now = 1_770_000_000_000;
      const anchor = now - 2 * STRIKE_DECAY_STEP_MS - 1_000; // 60p trước -> giảm 2 strike
      await mockDb
        .prepare(
          `INSERT INTO discord_access (discord_user_id, discord_username, rl_tokens, rl_updated_at, rl_strikes, rl_last_strike_at, updated_at)
           VALUES ('u-legacy', 'Legacy', 10, ?, 5, 0, ?)`,
        )
        .bind(anchor, anchor)
        .run();

      await mockDb
        .prepare(
          `UPDATE discord_access
           SET rl_strikes = ${DECAYED_STRIKES_SQL},
               rl_last_strike_at = ${DECAYED_STRIKE_AT_SQL}
           WHERE discord_user_id = 'u-legacy'`,
        )
        .bind(...buildStrikeDecayBindParams(now))
        .run();

      const after60m = await mockDb
        .prepare('SELECT rl_strikes, rl_last_strike_at FROM discord_access WHERE discord_user_id = ?')
        .bind('u-legacy')
        .first<{ rl_strikes: number; rl_last_strike_at: number }>();
      assert.equal(after60m?.rl_strikes, 3);
      assert.equal(after60m?.rl_last_strike_at, anchor + 2 * STRIKE_DECAY_STEP_MS);

      // Sau >= 24h yên ổn -> reset sạch về 0
      const after24hTs = (after60m?.rl_last_strike_at ?? now) + STRIKE_RESET_IDLE_MS + 1_000;
      await mockDb
        .prepare(
          `UPDATE discord_access
           SET rl_strikes = ${DECAYED_STRIKES_SQL},
               rl_last_strike_at = ${DECAYED_STRIKE_AT_SQL}
           WHERE discord_user_id = 'u-legacy'`,
        )
        .bind(...buildStrikeDecayBindParams(after24hTs))
        .run();
      const after24h = await mockDb
        .prepare('SELECT rl_strikes, rl_last_strike_at FROM discord_access WHERE discord_user_id = ?')
        .bind('u-legacy')
        .first<{ rl_strikes: number; rl_last_strike_at: number }>();
      assert.equal(after24h?.rl_strikes, 0);
      assert.equal(after24h?.rl_last_strike_at, 0);
    } finally {
      mockDb.close();
    }
  });

  it('consumeGuestRateToken chạm strike 10 trả 401 và consumeLoginAttempt khoá nguyên tử sau 5 lần sai', async () => {
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const db = mockDb as unknown as Parameters<typeof consumeGuestRateToken>[0];
    try {
      const now = Date.now();
      await mockDb
        .prepare(
          `INSERT INTO discord_access (discord_user_id, discord_username, active_session_id, session_expires_at, rl_tokens, rl_updated_at, rl_strikes, rl_last_strike_at, updated_at)
           VALUES ('u-bot', 'Bot', 'sess-bot', ?, 0, ?, 9, ?, ?)`,
        )
        .bind(now + 60_000, now, now, now)
        .run();

      await assert.rejects(
        () =>
          consumeGuestRateToken(db, 'u-bot', {
            cost: 1,
            trackStrikes: true,
            tooFastMessage: (s) => `wait ${s}s`,
          }),
        (err: { status?: number }) => err?.status === 401,
      );

      const botRow = await mockDb
        .prepare('SELECT active_session_id, rl_strikes FROM discord_access WHERE discord_user_id = ?')
        .bind('u-bot')
        .first<{ active_session_id: string | null; rl_strikes: number }>();
      assert.equal(botRow?.active_session_id, null);
      assert.equal(botRow?.rl_strikes, 10);

      // 5 lần nhập sai liên tiếp -> lần thứ 6 bị chặn 429 có Retry-After
      for (let i = 0; i < 5; i += 1) {
        await consumeLoginAttempt(db, '203.0.113.5');
      }
      await assert.rejects(
        () => consumeLoginAttempt(db, '203.0.113.5'),
        (err: { status?: number; extraHeaders?: Record<string, string> }) =>
          err?.status === 429 && Number(err?.extraHeaders?.['Retry-After']) >= 1,
      );
      await clearLoginFailures(db, '203.0.113.5');
      await consumeLoginAttempt(db, '203.0.113.5');
    } finally {
      mockDb.close();
    }
  });
});

describe('Worker bookChapterAccessDb (D-030 / D-042 / Phase 1.4)', () => {
  it('áp đúng thứ tự ưu tiên 3 tầng Bộ -> Tập -> Chương và fail-closed 404 khi sách không tồn tại', async () => {
    assert.equal(toCanonicalChapterKey('ch-1-p2'), 'ch-1');

    const shelfAccess = {
      restrictedKeys: new Set(['shelf-a']),
      allowedRestrictedKeys: new Set<string>(),
    };
    const bookAccess = {
      publicOverrideBookIds: new Set(['book-open-sample']),
      restrictedBookIds: new Set(['book-secret-in-public']),
      allowedRestrictedBookIds: new Set<string>(),
    };
    // Tập public override mở được dù kệ restricted
    assert.equal(resolveGuestBookLocked('book-open-sample', 'shelf-a', shelfAccess, bookAccess), false);
    // Tập khác cùng kệ restricted vẫn bị khoá
    assert.equal(resolveGuestBookLocked('book-locked-vol2', 'shelf-a', shelfAccess, bookAccess), true);
    // Tập restricted trong kệ public bị khoá
    assert.equal(
      resolveGuestBookLocked('book-secret-in-public', 'shelf-public', shelfAccess, bookAccess),
      true,
    );
    const lockedShelves = computeGuestLockedShelfKeys(
      [
        { id: 'book-open-sample', shelf: 'Shelf-A' },
        { id: 'book-locked-vol2', shelf: 'Shelf-A' },
        { id: 'book-secret-in-public', shelf: 'Shelf-Public' },
      ],
      shelfAccess,
      bookAccess,
    );
    assert.equal(lockedShelves.has('shelf-a'), false);
    assert.equal(lockedShelves.has('shelf-public'), true);

    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const db = mockDb as unknown as Parameters<typeof assertGuestBookEffectiveAccess>[0];
    try {
      await assert.rejects(
        () => assertGuestBookEffectiveAccess(db, GUEST_AUTH, 'missing-book-id'),
        (err: { status?: number }) => err?.status === 404,
      );

      await mockDb
        .prepare(
          `INSERT INTO books (id, title, author, shelf, file_key, file_type, created_at)
           VALUES ('book-12345678', 'Vol 1', 'Author', 'Public Shelf', 'books/1.epub', 'epub', '2026-11-25')`,
        )
        .run();
      await mockDb
        .prepare(
          `INSERT INTO chapter_access_rules (book_id, chapter_key, access_mode, updated_at)
           VALUES ('book-12345678', 'ch-final', 'restricted', 1000)`,
        )
        .run();

      // Mảnh tách ch-final-p2 cũng bị chặn 403 theo khoá chương gốc ch-final
      await assert.rejects(
        () => assertGuestChapterAccess(db, GUEST_AUTH, 'book-12345678', 'ch-final-p2'),
        (err: { status?: number }) => err?.status === 403,
      );

      // Cấp quyền riêng cho khách -> đọc được ngay
      await mockDb
        .prepare(
          `INSERT INTO chapter_guest_grants (book_id, chapter_key, discord_user_id, created_at)
           VALUES ('book-12345678', 'ch-final', ?, 1000)`,
        )
        .bind(GUEST_AUTH.userId)
        .run();
      await assertGuestChapterAccess(db, GUEST_AUTH, 'book-12345678', 'ch-final-p2');
    } finally {
      mockDb.close();
    }
  });
});

describe('Worker shelfRelationsDb & discordReleaseFormat (Phase 1.4)', () => {
  it('mergeShelfRelationsOnRename không tạo cạnh ngược chiều, giữ chuẩn same_universe và cho phép sửa ở trần 30', async () => {
    const merged = computeMergedShelfRelationsOnRename(
      [
        { source_shelf_key: 'bộ a', target_shelf_key: 'bộ c', relation_type: 'sequel', created_at: 10 },
        { source_shelf_key: 'bộ c', target_shelf_key: 'bộ b', relation_type: 'sequel', created_at: 20 },
        { source_shelf_key: 'bộ a', target_shelf_key: 'bộ b', relation_type: 'spinoff', created_at: 30 },
        { source_shelf_key: 'bộ a', target_shelf_key: 'alpha', relation_type: 'same_universe', created_at: 40 },
      ],
      'bộ a',
      'bộ b',
    );
    // (bộ a -> bộ c) trùng ngược chiều với (bộ c -> bộ b) đã tồn tại nên bị loại; (bộ a -> bộ b) thành self-loop bị loại;
    // (bộ a -> alpha) thành same_universe (alpha, bộ b) đúng thứ tự localeCompare('vi')
    assert.deepEqual(merged, [
      { source_shelf_key: 'alpha', target_shelf_key: 'bộ b', relation_type: 'same_universe', created_at: 40 },
    ]);

    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const db = mockDb as unknown as Parameters<typeof upsertShelfRelation>[0];
    try {
      for (let i = 0; i <= 31; i += 1) {
        await mockDb
          .prepare(
            `INSERT INTO books (id, title, author, shelf, file_key, file_type, created_at)
             VALUES (?, ?, 'Author', ?, ?, 'epub', '2026-11-25')`,
          )
          .bind(`book-rel-${String(i).padStart(2, '0')}`, `T${i}`, `Shelf ${i}`, `books/r${i}.epub`)
          .run();
      }
      for (let i = 1; i <= 30; i += 1) {
        await upsertShelfRelation(db, {
          sourceShelfName: 'Shelf 0',
          targetShelfName: `Shelf ${i}`,
          relationType: 'sequel',
        });
      }
      // Chặn cạnh mới thứ 31 khi nguồn chạm trần 30
      await assert.rejects(
        () =>
          upsertShelfRelation(db, {
            sourceShelfName: 'Shelf 31',
            targetShelfName: 'Shelf 0',
            relationType: 'sequel',
          }),
        (err: { status?: number }) => err?.status === 400,
      );
      // Cho phép cập nhật loại liên kết của cạnh đã tồn tại ngay khi đang ở trần 30
      const updated = await upsertShelfRelation(db, {
        sourceShelfName: 'Shelf 0',
        targetShelfName: 'Shelf 1',
        relationType: 'spinoff',
      });
      assert.equal(updated.relation.relationType, 'spinoff');

      await mergeShelfRelationsOnRename(db, 'Shelf 1', 'Shelf 2');
      const countOld = await mockDb
        .prepare("SELECT COUNT(*) AS cnt FROM shelf_relations WHERE source_shelf_key = 'shelf 1' OR target_shelf_key = 'shelf 1'")
        .first<{ cnt: number }>();
      assert.equal(countOld?.cnt, 0);
    } finally {
      mockDb.close();
    }
  });

  it('discordReleaseFormat rút gọn dải tập và tính đúng số tập dư khi có nhãn trùng', () => {
    const range = formatReleaseVolumeSummary(
      [
        { title: 'Unnamed Memory - Tập 1' },
        { title: 'Unnamed Memory - Tập 2' },
        { title: 'Unnamed Memory - Tập 3' },
      ],
      'Unnamed Memory',
    );
    assert.equal(range, '**Tập 1 – Tập 3** (3 tập) vừa');

    const dupSummary = formatReleaseVolumeSummary(
      [
        { title: 'Series X - Ngoại truyện A' },
        { title: 'Series X - Ngoại truyện A' },
        { title: 'Series X - Ngoại truyện B' },
        { title: 'Series X - Ngoại truyện C' },
        { title: 'Series X - Ngoại truyện D' },
        { title: 'Series X - Ngoại truyện E' },
        { title: 'Series X - Ngoại truyện F' },
        { title: 'Series X - Ngoại truyện G' },
      ],
      'Series X',
    );
    // 8 sách tổng cộng, 6 nhãn đầu tiên đã đại diện cho 7 sách (A×2 + B..F×1) -> chỉ còn +1 tập khác (G), không báo nhầm +2
    assert.ok(dupSummary.includes('+1 tập khác'));

    const payload = buildDiscordReleaseMessagePayload(
      {
        shelfKey: 'test_series',
        shelfName: 'Test *Series* _Name_',
        books: [
          {
            id: 'book-00000001',
            title: 'Test *Series* _Name_ - Tập 1',
            author: 'Author_One',
            shelf: 'Test *Series* _Name_',
            cover_key: 'covers/1-v2.jpg',
          },
        ],
        tags: ['Fantasy', 'Romance'],
        hasCoverAttachment: true,
      },
      {
        appUrl: 'https://ofu.lol',
        keyChannelUrl: 'https://discord.com/channels/1/2',
        mentionRoleIds: ['123456789012345678', 'invalid-role'],
      },
    );
    assert.equal(payload.content, '<@&123456789012345678>');
    assert.deepEqual(payload.allowed_mentions, { parse: [], roles: ['123456789012345678'] });
    const embeds = payload.embeds as Array<{ title: string; image?: { url: string } }>;
    assert.ok(embeds[0].title.includes('\\*Series\\*'));
    assert.equal(embeds[0].image?.url, 'attachment://cover.jpg');
  });

  it('progressDb + booksDb + usageDb lưu và trả bookPercent chuẩn (tương thích ngược bản ghi cũ NULL)', async () => {
    const mockDb = createMockD1Database(WORKER_SCHEMA_SQL);
    const fakeEnv = {
      DB: mockDb,
      BOOKS_BUCKET: {},
      APP_ORIGINS: 'https://ofu.lol',
      ACCESS_PASSCODE: 'test-pass',
      AUTH_SECRET: 'test-secret',
    } as unknown as Env;
    const ownerAuth: AuthContext = { role: 'owner', userId: 'owner', sessionId: 's-owner', expiresAt: null };
    try {
      await mockDb
        .prepare(
          `INSERT INTO books (id, title, author, shelf, file_key, file_type, created_at)
           VALUES ('book-wt-0001', 'LN Vol 1', 'Author', 'LN', 'books/1.epub', 'epub', '2026-11-25'),
                  ('book-wt-0002', 'LN Vol 2', 'Author', 'LN', 'books/2.epub', 'epub', '2026-11-25')`,
        )
        .run();
      await mockDb
        .prepare(
          `INSERT INTO discord_access (discord_user_id, discord_username, updated_at)
           VALUES ('discord-guest-1', 'Tester', 1000)`,
        )
        .run();

      // Owner lưu bookPercent = 2.43 -> làm tròn 1 chữ số thập phân = 2.4
      await upsertReadingProgress(fakeEnv, ownerAuth, 'book-wt-0001', {
        chapterId: 'ch-1',
        chapterIndex: 1,
        totalChapters: 5,
        scrollRatio: 1,
        scrollTop: 100,
        completed: false,
        bookPercent: 2.43,
      });
      // Guest lưu bookPercent = 2.4 trên sách 1 và không gửi bookPercent (legacy) trên sách 2
      await upsertReadingProgress(fakeEnv, GUEST_AUTH, 'book-wt-0001', {
        chapterId: 'ch-1',
        chapterIndex: 1,
        totalChapters: 5,
        scrollRatio: 1,
        scrollTop: 100,
        completed: false,
        bookPercent: 2.4,
      });
      await upsertReadingProgress(fakeEnv, GUEST_AUTH, 'book-wt-0002', {
        chapterId: 'ch-1',
        chapterIndex: 1,
        totalChapters: 5,
        scrollRatio: 1,
        scrollTop: 100,
        completed: false,
      });

      const ownerState = await listBooksAndProgress(fakeEnv, ownerAuth);
      assert.equal(ownerState.progress['book-wt-0001']?.bookPercent, 2.4);

      const guestState = await listBooksAndProgress(fakeEnv, GUEST_AUTH);
      assert.equal(guestState.progress['book-wt-0001']?.bookPercent, 2.4);
      assert.equal(guestState.progress['book-wt-0002']?.bookPercent, undefined);

      const guestDetail = await getAdminGuestUsageDetail(fakeEnv, GUEST_AUTH.userId);
      const byId = new Map(guestDetail.books.map((b) => [b.bookId, b.percent]));
      assert.equal(byId.get('book-wt-0001'), 2);
      assert.equal(byId.get('book-wt-0002'), 40);
    } finally {
      mockDb.close();
    }
  });
});
