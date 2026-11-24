/**
 * Đánh số chương chuẩn hoá dùng chung giữa Owner (`ReaderView`) và Guest (`GuestCanvasReader`) — QĐ-2 (2A):
 * - Gom các mảnh chương dài bị `splitOversizedChapter` tách (`-p2`, `-p3`...) về cùng 1 chương gốc
 *   dựa trên `chapter.id.replace(/-p\d+$/i, '')` (0 byte đóng gói lại trên R2).
 * - Khi tập có từ 2 chương gốc trở lên và chương đầu tiên là mục `"Minh họa"`, gán `null` ("Chung cả tập")
 *   cho mục `"Minh họa"` và đánh số nội dung chính `1..N`.
 */

export interface CanonicalChapterOption {
  number: number;
  title: string;
}

export interface CanonicalChapterNumbering {
  /** Bản đồ chỉ số mảng chương hiện tại (`0..chapters.length-1`) -> số chương chuẩn hoá (`1..N` hoặc `null`). */
  chapterNumberByIndex: ReadonlyArray<number | null>;
  /** Danh sách tuỳ chọn cho `<select>` gắn nhãn chương ở khung bình luận. */
  options: readonly CanonicalChapterOption[];
  /** Số chương chuẩn hoá lớn nhất của tập sách (`0` nếu sách rỗng). */
  maxChapterNumber: number;
  /** Nhãn thân thiện cho nút kéo đáy chuyển sang chương kế tiếp. */
  getChapterShortLabel: (index: number) => string;
  /** Mốc chương cao nhất độc giả đã mở khoá để che spoiler bình luận. */
  resolveReaderMaxChapterNumber: (highestChapterReached: number, completed: boolean) => number;
}

function isIllustrationFrontMatter(title: string): boolean {
  const norm = title.normalize('NFC').trim().toLocaleLowerCase('vi');
  return norm === 'minh họa' || norm === 'minh hoạ';
}

function stripSegmentCounterSuffix(title: string): string {
  return title.replace(/\s*\(1\/\d+\)\s*$/, '').trim() || title.trim();
}

export function buildCanonicalChapterNumbering(
  chapters: readonly { id: string; title: string }[],
): CanonicalChapterNumbering {
  const baseOrder: Array<{ baseId: string; title: string }> = [];
  const baseToGroupIdx = new Map<string, number>();
  const itemGroupIdx: number[] = [];

  for (let i = 0; i < chapters.length; i += 1) {
    const ch = chapters[i];
    const baseId = (ch.id || `idx-${i}`).replace(/-p\d+$/i, '');
    let groupIdx = baseToGroupIdx.get(baseId);
    if (groupIdx === undefined) {
      groupIdx = baseOrder.length;
      baseToGroupIdx.set(baseId, groupIdx);
      baseOrder.push({ baseId, title: stripSegmentCounterSuffix(ch.title || `Chương ${groupIdx + 1}`) });
    }
    itemGroupIdx.push(groupIdx);
  }

  const skipLeadingIllustration =
    baseOrder.length >= 2 && isIllustrationFrontMatter(baseOrder[0].title);

  const groupNumbers: Array<number | null> = [];
  const options: CanonicalChapterOption[] = [];
  let nextNum = 1;

  for (let g = 0; g < baseOrder.length; g += 1) {
    if (g === 0 && skipLeadingIllustration) {
      groupNumbers.push(null);
      continue;
    }
    const num = nextNum;
    nextNum += 1;
    groupNumbers.push(num);
    options.push({ number: num, title: baseOrder[g].title });
  }

  const maxChapterNumber = options.length > 0 ? options[options.length - 1].number : 0;
  const chapterNumberByIndex = itemGroupIdx.map((g) => groupNumbers[g] ?? null);

  const getChapterShortLabel = (index: number): string => {
    const num = chapterNumberByIndex[index];
    if (typeof num === 'number') return `Phần ${num}`;
    const rawTitle = chapters[index]?.title?.trim();
    return rawTitle || `Phần ${index + 1}`;
  };

  const resolveReaderMaxChapterNumber = (
    highestChapterReached: number,
    completed: boolean,
  ): number => {
    if (completed) return maxChapterNumber;
    const limit = Math.min(chapterNumberByIndex.length - 1, Math.max(0, highestChapterReached));
    let maxNum = 0;
    for (let i = 0; i <= limit; i += 1) {
      const n = chapterNumberByIndex[i];
      if (typeof n === 'number' && n > maxNum) maxNum = n;
    }
    return maxNum;
  };

  return {
    chapterNumberByIndex,
    options,
    maxChapterNumber,
    getChapterShortLabel,
    resolveReaderMaxChapterNumber,
  };
}
