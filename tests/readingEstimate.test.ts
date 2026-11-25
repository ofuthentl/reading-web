import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Book, GuestTocItem, ReadingProgress } from '../src/types';
import { computeBookProgressPercent } from '../src/lib/bookMetadata';
import {
  computeChapterStartPercents,
  computeGuestChapterWeights,
  computeWeightedBookPercent,
  countWordsInPlainText,
  resolveWeightedBookPercentTarget,
} from '../src/lib/readingEstimate';

const SAMPLE_BOOK: Book = {
  id: 'book-ln-01',
  title: 'Unnamed Memory - Tập 1',
  author: 'Furumiya Kuji',
  shelf: 'Unnamed Memory',
  description: null,
  cover_color: '#4338ca',
  cover_key: null,
  file_key: 'books/book-ln-01.epub',
  file_type: 'epub',
  file_size: 1_000_000,
  cover_size: 30_000,
  created_at: '2026-11-25T00:00:00.000Z',
};

describe('readingEstimate & bookMetadata weighted progress (PA-A)', () => {
  it('Light Novel [Minh họa 0w, Mở đầu 1500w, Chương 1..3 mỗi chương 20000w]: xong Mở đầu ~2.4% chứ không phải 40%', () => {
    const weights = [0, 1500, 20000, 20000, 20000];
    // Hết mục Minh họa (0 chữ) vẫn 0%
    assert.equal(computeWeightedBookPercent(weights, 0, 1, false), 0);
    // Hết Mở đầu (1500 / 61500 = 2.439% -> 2.4%)
    assert.equal(computeWeightedBookPercent(weights, 1, 1, false), 2.4);
    // Bắt đầu Chương 1 nối mượt đúng 2.4%
    assert.equal(computeWeightedBookPercent(weights, 2, 0, false), 2.4);
    // Nửa Chương 2: (1500 + 20000 + 10000) / 61500 = 51.219% -> 51.2%
    assert.equal(computeWeightedBookPercent(weights, 3, 0.5, false), 51.2);
    // Kết chương cuối = 100%
    assert.equal(computeWeightedBookPercent(weights, 4, 1, false), 100);
    // Đánh dấu hoàn thành luôn trả 100% bất kể vị trí
    assert.equal(computeWeightedBookPercent(weights, 1, 0.2, true), 100);
  });

  it('chặn trần 99% khi chưa hoàn thành và chưa ở chương cuối (tránh 100% sớm trước phụ lục ảnh)', () => {
    const weights = [0, 1000, 10000, 0];
    assert.equal(computeWeightedBookPercent(weights, 2, 1, false), 99);
    assert.equal(computeWeightedBookPercent(weights, 2, 1, true), 100);
    assert.equal(computeWeightedBookPercent(weights, 3, 1, false), 100);
  });

  it('sách thuần tranh (tổng trọng số = 0) fallback chia đều theo số chương', () => {
    const weights = [0, 0, 0, 0];
    assert.equal(computeWeightedBookPercent(weights, 0, 0, false), 0);
    assert.equal(computeWeightedBookPercent(weights, 1, 0.5, false), 37.5);
    assert.equal(computeWeightedBookPercent(weights, 3, 1, false), 100);
  });

  it('computeGuestChapterWeights trừ vỏ ~180 B gzip để mục chỉ ảnh về 0 và fallback an toàn', () => {
    const toc: GuestTocItem[] = [
      { id: 'c0', title: 'Minh họa', chapterNumber: 1, compressedBytes: 155 },
      { id: 'c1', title: 'Mở đầu', chapterNumber: 2, compressedBytes: 980 },
      { id: 'c2', title: 'Chương 1', chapterNumber: 3, compressedBytes: 18180 },
      { id: 'c3', title: 'Chương 2', chapterNumber: 4, compressedBytes: 21180 },
    ];
    const weights = computeGuestChapterWeights(toc);
    assert.deepEqual(weights, [0, 800, 18000, 21000]);
    // Xong Mở đầu: 800 / 39800 = 2.01% -> 2%
    assert.equal(computeWeightedBookPercent(weights, 1, 1, false), 2);

    // Fallback raw compressedBytes nếu tất cả chương đều <= 180 B
    const tinyToc: GuestTocItem[] = [
      { id: 'a', title: 'A', chapterNumber: 1, compressedBytes: 50 },
      { id: 'b', title: 'B', chapterNumber: 2, compressedBytes: 150 },
    ];
    assert.deepEqual(computeGuestChapterWeights(tinyToc), [50, 150]);

    // Fallback toàn 0 (chia đều) khi gói thiếu compressedBytes
    const noBytesToc: GuestTocItem[] = [
      { id: 'a', title: 'A', chapterNumber: 1 },
      { id: 'b', title: 'B', chapterNumber: 2 },
    ];
    assert.deepEqual(computeGuestChapterWeights(noBytesToc), [0, 0]);
    assert.equal(computeWeightedBookPercent(computeGuestChapterWeights(noBytesToc), 0, 1, false), 50);
  });

  it('computeBookProgressPercent ưu tiên bookPercent mới, giữ 100% khi completed và tương thích ngược bản ghi cũ', () => {
    const weighted: ReadingProgress = {
      chapterId: 'c1',
      chapterIndex: 1,
      totalChapters: 5,
      scrollRatio: 1,
      scrollTop: 500,
      completed: false,
      bookPercent: 2.4,
      updatedAt: 1000,
    };
    assert.equal(computeBookProgressPercent(SAMPLE_BOOK, weighted), 2);

    const completed: ReadingProgress = { ...weighted, completed: true, bookPercent: 12 };
    assert.equal(computeBookProgressPercent(SAMPLE_BOOK, completed), 100);

    // Bản ghi D1 cũ chưa có bookPercent -> giữ công thức cũ (1 + 1) / 5 = 40%
    const legacy: ReadingProgress = {
      chapterId: 'c1',
      chapterIndex: 1,
      totalChapters: 5,
      scrollRatio: 1,
      scrollTop: 500,
      completed: false,
      updatedAt: 1000,
    };
    assert.equal(computeBookProgressPercent(SAMPLE_BOOK, legacy), 40);
    assert.equal(computeBookProgressPercent(SAMPLE_BOOK, undefined), null);
  });

  it('countWordsInPlainText đếm đúng cả tiếng Việt và ký tự CJK', () => {
    assert.equal(countWordsInPlainText('Xin chào thế giới'), 4);
    assert.ok(countWordsInPlainText('無名の記憶') >= 2);
    assert.equal(countWordsInPlainText('   '), 0);
  });

  it('resolveWeightedBookPercentTarget & computeChapterStartPercents ánh xạ ngược chuẩn 1-1 kiểu Kindle', () => {
    const weights = [0, 1500, 20000, 20000, 20000];
    const starts = computeChapterStartPercents(weights);
    assert.equal(starts.length, 5);
    assert.equal(starts[0], 0);
    assert.equal(starts[1], 0);
    assert.ok(Math.abs(starts[2] - (1500 / 61500) * 100) < 0.01);

    assert.deepEqual(resolveWeightedBookPercentTarget(weights, 0), { chapterIndex: 0, scrollRatio: 0 });
    assert.deepEqual(resolveWeightedBookPercentTarget(weights, 100), { chapterIndex: 4, scrollRatio: 1 });

    // 50% của tổng 61500w = 30750w -> rơi vào Chương 2 (index 3), scrollRatio = (30750 - 21500) / 20000 = 0.4625 -> 0.463
    const mid = resolveWeightedBookPercentTarget(weights, 50);
    assert.equal(mid.chapterIndex, 3);
    assert.ok(Math.abs(mid.scrollRatio - 0.463) <= 0.002);
    // Round-trip trở lại computeWeightedBookPercent phải đúng ~50%
    assert.equal(computeWeightedBookPercent(weights, mid.chapterIndex, mid.scrollRatio, false), 50);

    // Fallback sách thuần tranh (tổng trọng số = 0)
    const picMid = resolveWeightedBookPercentTarget([0, 0, 0, 0], 50);
    assert.equal(picMid.chapterIndex, 2);
    assert.equal(picMid.scrollRatio, 0);
  });
});
