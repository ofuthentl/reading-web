import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GuestBlock } from '../src/types';
import { buildCanonicalChapterNumbering } from '../src/lib/readerChapterNumbers';
import { isTocChapterTitle, prepareGuestTocBlocks } from '../src/lib/tocFormat';

describe('tocFormat & readerChapterNumbers (D-041 / D-043)', () => {
  it('isTocChapterTitle nhận diện đúng mục lục tiếng Việt/Anh và loại tiêu đề thường', () => {
    assert.equal(isTocChapterTitle('Mục lục'), true);
    assert.equal(isTocChapterTitle('MỤC LỤC - Tập 1'), true);
    assert.equal(isTocChapterTitle('Table of Contents'), true);
    assert.equal(isTocChapterTitle('Chương 1: Khởi đầu'), false);
  });

  it('prepareGuestTocBlocks tắt đánh số ordered -> plain và tự tách dòng mục lục dính chữ gói cũ', () => {
    const orderedBlocks: GuestBlock[] = [
      { kind: 'h', level: 1, spans: [{ t: 'Mục lục' }] },
      {
        kind: 'list',
        ordered: 1,
        items: [[{ t: 'Mở đầu' }], [{ t: 'Chương 1: Khởi hành' }]],
      },
    ];
    const preparedOrdered = prepareGuestTocBlocks(orderedBlocks, 'Mục lục');
    // Bỏ tiêu đề Mục lục lặp lại ở đầu và bỏ ordered -> plain: 1, giữ đúng blockIndex gốc = 1
    assert.equal(preparedOrdered.length, 1);
    assert.equal(preparedOrdered[0].blockIndex, 1);
    assert.equal(preparedOrdered[0].block.kind, 'list');
    if (preparedOrdered[0].block.kind === 'list') {
      assert.equal(preparedOrdered[0].block.plain, 1);
      assert.equal(preparedOrdered[0].block.ordered, undefined);
    }

    // Gói cũ bị dính trọn <nav> vào 1 đoạn <p> -> tách lại thành list giữ nguyên cụm viết thường "mở đầu" trong tên chương
    const squashed: GuestBlock[] = [
      {
        kind: 'p',
        spans: [
          {
            t: 'Mục lục Mở đầu Chương 1: Câu chuyện mở đầu một hành trình Chương 2: Đêm trăng Lời bạt',
          },
        ],
      },
    ];
    const recovered = prepareGuestTocBlocks(squashed, 'Mục lục', [
      'Minh họa',
      'Mục lục',
      'Mở đầu',
      'Chương 1: Câu chuyện mở đầu một hành trình',
      'Chương 2: Đêm trăng',
      'Lời bạt',
    ]);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].blockIndex, 0);
    assert.equal(recovered[0].block.kind, 'list');
    if (recovered[0].block.kind === 'list') {
      assert.equal(recovered[0].block.plain, 1);
      assert.deepEqual(
        recovered[0].block.items.map((spans) => spans.map((s) => s.t).join('')),
        ['Mở đầu', 'Chương 1: Câu chuyện mở đầu một hành trình', 'Chương 2: Đêm trăng', 'Lời bạt'],
      );
    }
  });

  it('buildCanonicalChapterNumbering gom mảnh -p2/-p3 về cùng chương gốc và bỏ qua Minh họa đầu sách', () => {
    const chapters = [
      { id: 'illust-0', title: 'Minh họa' },
      { id: 'ch-1', title: 'Chương 1 (1/2)' },
      { id: 'ch-1-p2', title: 'Chương 1 (2/2)' },
      { id: 'ch-2', title: 'Chương 2' },
    ];
    const numbering = buildCanonicalChapterNumbering(chapters);
    assert.deepEqual(numbering.chapterNumberByIndex, [null, 1, 1, 2]);
    assert.equal(numbering.maxChapterNumber, 2);
    assert.deepEqual(numbering.options, [
      { number: 1, title: 'Chương 1' },
      { number: 2, title: 'Chương 2' },
    ]);
    assert.equal(numbering.resolveReaderMaxChapterNumber(0, false), 0);
    assert.equal(numbering.resolveReaderMaxChapterNumber(2, false), 1);
    assert.equal(numbering.resolveReaderMaxChapterNumber(0, true), 2);
  });
});
