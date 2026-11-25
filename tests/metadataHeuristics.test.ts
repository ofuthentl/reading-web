import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Book } from '../src/types';
import {
  buildShelfAuthorContext,
  isNonAuthorMetadataNoise,
  isReleaseMetadataNoise,
  splitNormalizedAuthors,
} from '../src/lib/authorHeuristics';
import { getDisplayAuthor } from '../src/lib/bookMetadata';
import {
  bookDuplicateKey,
  extractSeriesName,
  normalizeBookTitleDuplicateKey,
  parseFileMetadata,
} from '../src/lib/seriesShelfExtractor';
import { isVolumeOrSubtitleSegment, titleEndsWithBareVolume } from '../src/lib/shelfPlacement';
import {
  inferBatchCommonShelf,
  resolveShelfConsistentAuthor,
  resolveUploadShelfPlan,
} from '../src/lib/shelfUploadPlanner';

function makeBook(overrides: Partial<Book> & Pick<Book, 'id' | 'title'>): Book {
  return {
    author: 'Không rõ tác giả',
    shelf: 'Kho chưa phân loại',
    description: null,
    cover_color: '#4338ca',
    cover_key: null,
    file_key: `books/${overrides.id}.epub`,
    file_type: 'epub',
    file_size: 100_000,
    cover_size: 10_000,
    created_at: '2026-11-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('authorHeuristics, seriesShelfExtractor, shelfPlacement & shelfUploadPlanner (D-044 / Phase 1.3)', () => {
  it('tách rạch ròi rác nhóm dịch ([Hako], Sonako, Calibre, Full) khỏi phụ đề tập hợp lệ (?!…:, chữ số)', () => {
    assert.equal(isReleaseMetadataNoise('[Hako]'), true);
    assert.equal(isReleaseMetadataNoise('Sonako'), true);
    assert.equal(isReleaseMetadataNoise('Calibre'), true);
    assert.equal(isReleaseMetadataNoise('Full'), true);

    assert.equal(isReleaseMetadataNoise('Ai Là Kẻ Phản Bội?!'), false);
    assert.equal(isNonAuthorMetadataNoise('Ai Là Kẻ Phản Bội?!'), true);
    assert.equal(isReleaseMetadataNoise('2024 Định Mệnh'), false);
    assert.equal(isNonAuthorMetadataNoise('2024 Định Mệnh'), true);

    const parsed1 = parseFileMetadata('Eighty Six - Tập 1 - Ai Là Kẻ Phản Bội?! - [Hako].epub');
    assert.equal(parsed1.title, 'Eighty Six - Tập 1 - Ai Là Kẻ Phản Bội?!');
    assert.equal(parsed1.author, 'Không rõ tác giả');
    assert.equal(parsed1.shelf, 'Eighty Six');

    const parsed2 = parseFileMetadata('Unnamed Memory - Tập 2 - Phù Thủy Trăng Xanh - Furumiya Kuji - Sonako.epub');
    assert.equal(parsed2.title, 'Unnamed Memory - Tập 2 - Phù Thủy Trăng Xanh');
    assert.equal(parsed2.author, 'Furumiya Kuji');
    assert.equal(parsed2.shelf, 'Unnamed Memory');
  });

  it('không cắt nhầm tiêu đề tiếng Anh ("Man I", "Book a", "Part a") nhưng vẫn nhận diện đúng số tập', () => {
    assert.equal(extractSeriesName('Man I Love This'), null);
    assert.equal(extractSeriesName('Book a Table'), null);
    assert.equal(extractSeriesName('Part a Story'), null);
    assert.equal(isVolumeOrSubtitleSegment('Book a'), false);
    assert.equal(isVolumeOrSubtitleSegment('Man I'), false);

    assert.equal(extractSeriesName('Unnamed Memory I'), 'Unnamed Memory');
    assert.equal(extractSeriesName('Sword Art Online - Vol. 2'), 'Sword Art Online');
    assert.equal(extractSeriesName('The Beginning - Book II'), 'The Beginning');
  });

  it('bảo toàn đồng tác giả ("A" đi cùng "A, B") và fallback kệ trống về "kho chưa phân loại"', () => {
    assert.deepEqual(splitNormalizedAuthors('Furumiya Kuji, chibi'), ['Furumiya Kuji', 'chibi']);
    assert.deepEqual(splitNormalizedAuthors('Reki Kawahara & abec'), ['Reki Kawahara', 'abec']);
    assert.deepEqual(splitNormalizedAuthors('Nguyễn A và Trần B'), ['Nguyễn A', 'Trần B']);

    const books = [
      makeBook({ id: 'b1', title: 'Unnamed Memory - Tập 1', author: 'Furumiya Kuji', shelf: 'Unnamed Memory' }),
      makeBook({ id: 'b2', title: 'Unnamed Memory - Tập 2', author: 'Furumiya Kuji, chibi', shelf: 'Unnamed Memory' }),
      makeBook({ id: 'b3', title: 'Sách Lẻ 1', author: 'Nguyễn Nhật Ánh', shelf: '' }),
      makeBook({ id: 'b4', title: 'Sách Lẻ 2', author: 'Haruki Murakami', shelf: '' }),
    ];
    const ctx = buildShelfAuthorContext(books, getDisplayAuthor, titleEndsWithBareVolume);
    assert.equal(ctx.get('b1'), 'Furumiya Kuji');
    assert.equal(ctx.get('b2'), 'Furumiya Kuji, chibi');
    // Hai sách trong kho chưa phân loại có tác giả khác nhau vẫn được giữ nguyên (không bị loại nhầm như cùng bộ)
    assert.equal(ctx.get('b3'), 'Nguyễn Nhật Ánh');
    assert.equal(ctx.get('b4'), 'Haruki Murakami');
  });

  it('chống tải trùng hoạt động theo cả duplicateKey lẫn tiêu đề chuẩn hoá NFC', () => {
    const nfd = 'Mushoku Tensei - Ta\u0323\u0302p 1'.normalize('NFD');
    const nfc = 'Mushoku Tensei - Tập 1'.normalize('NFC');
    assert.equal(normalizeBookTitleDuplicateKey(nfd), normalizeBookTitleDuplicateKey(nfc));
    assert.notEqual(
      bookDuplicateKey(nfc, 'Rifujin na Magonote'),
      bookDuplicateKey(nfc, 'Không rõ tác giả'),
    );
  });

  it('phân kệ tách bạch bộ chính vs hậu truyện (-after the end-) & kế thừa tác giả kệ đích', () => {
    const existing = [
      makeBook({
        id: 'e1',
        title: 'Unnamed Memory -after the end- - Tập 1',
        author: 'Furumiya Kuji',
        shelf: 'Unnamed Memory -after the end-',
      }),
      makeBook({
        id: 'e2',
        title: 'Mushoku Tensei - Tập 1',
        author: 'Rifujin na Magonote',
        shelf: 'Mushoku Tensei - Thất Nghiệp Chuyển Sinh',
      }),
      makeBook({
        id: 'e3',
        title: 'Mushoku Tensei - Tập 2',
        author: 'Rifujin na Magonote',
        shelf: 'Mushoku Tensei - Thất Nghiệp Chuyển Sinh',
      }),
    ];

    // Bộ chính Unnamed Memory không bị hút nhầm vào kệ hậu truyện -after the end-
    const mainPlan = resolveUploadShelfPlan(
      { title: 'Unnamed Memory - Tập 1', author: 'Không rõ tác giả' },
      existing,
    );
    assert.equal(mainPlan.shelf, 'Unnamed Memory');

    // Hậu truyện khớp chính xác kệ hậu truyện
    const sequelPlan = resolveUploadShelfPlan(
      { title: 'Unnamed Memory -after the end- - Tập 2', author: 'Không rõ tác giả' },
      existing,
    );
    assert.equal(sequelPlan.shelf, 'Unnamed Memory -after the end-');

    // Kệ đổi tên song ngữ duy nhất vẫn khớp an toàn
    const bilingualPlan = resolveUploadShelfPlan(
      { title: 'Mushoku Tensei - Tập 3', author: 'Không rõ tác giả' },
      existing,
    );
    assert.equal(bilingualPlan.shelf, 'Mushoku Tensei - Thất Nghiệp Chuyển Sinh');

    // Kế thừa tác giả thống nhất sẵn có của kệ đích
    assert.equal(
      resolveShelfConsistentAuthor('Mushoku Tensei - Thất Nghiệp Chuyển Sinh', existing),
      'Rifujin na Magonote',
    );

    // Gom lô giữ nguyên nhánh hậu truyện thay vì rút về bộ chính
    const batchCommon = inferBatchCommonShelf(
      [
        { title: 'Unnamed Memory -after the end- - Tập 1', author: 'Furumiya Kuji' },
        { title: 'Unnamed Memory -after the end- - Tập 2', author: 'Furumiya Kuji' },
        { title: 'Unnamed Memory -after the end- - Tập 3', author: 'Furumiya Kuji' },
      ],
      existing,
    );
    assert.equal(batchCommon, 'Unnamed Memory -after the end-');
  });
});
