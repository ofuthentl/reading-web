import type { Book } from '@/types';

const UNKNOWN_AUTHOR = 'Không rõ tác giả';
const DEFAULT_SHELF = 'Kho chưa phân loại';
const UNTITLED_BOOK = 'Sách chưa đặt tên';

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

/**
 * Tách tên bộ truyện nếu tiêu đề có hậu tố số tập/vol/quyển/phần/chương.
 * Trả về tên bộ (khác tiêu đề gốc) nếu là truyện nhiều tập, ngược lại trả về null.
 */
export function extractSeriesName(title: string): string | null {
  const clean = title.trim();
  if (!clean || clean === UNTITLED_BOOK) return null;
  const stripped = clean
    .replace(
      /\s*[-_:|]\s*(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|#)?\.?\s*\d+.*$/i,
      '',
    )
    .replace(
      /\s*(?:\(|\[)?\s*(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|book|part|#)\.?\s*\d+.*$/i,
      '',
    )
    .trim();

  if (stripped && normalizeKey(stripped) !== normalizeKey(clean)) {
    return stripped;
  }
  return null;
}

export function isKnownAuthor(author: string): boolean {
  const clean = author.trim();
  return Boolean(clean) && normalizeKey(clean) !== normalizeKey(UNKNOWN_AUTHOR);
}

/**
 * Suy luận tên kệ đơn lẻ (chưa xét ngữ cảnh thư viện):
 * - Truyện nhiều tập (có Vol/Tập/Quyển...): ưu tiên tên bộ truyện (VD: "Mushoku").
 * - Tác phẩm lẻ: lấy tên tác phẩm (VD: "Bạch Dạ Hành").
 * - Fallback về tác giả hoặc "Kho chưa phân loại" khi thiếu tiêu đề.
 */
export function inferSingleBookShelf(title: string, author: string): string {
  const series = extractSeriesName(title);
  if (series) return series;
  const cleanTitle = title.trim();
  if (cleanTitle && cleanTitle !== UNTITLED_BOOK) return cleanTitle;
  if (isKnownAuthor(author)) return author.trim();
  return DEFAULT_SHELF;
}

function isStandaloneInTitleShelf(book: Book): boolean {
  if (extractSeriesName(book.title) !== null) return false;
  return normalizeKey(book.shelf) === normalizeKey(book.title);
}

/**
 * Quyết định kệ mục tiêu cho 1 sách sắp tải lên dựa trên các sách hiện có:
 * 1. Truyện nhiều tập (có Vol/Tập...): luôn ưu tiên tên bộ truyện (VD: "Mushoku").
 * 2. Tác phẩm lẻ có tác giả rõ ràng:
 *    - Nếu chưa có sách lẻ nào khác cùng tác giả → kệ = tên tác phẩm (VD: "Bạch Dạ Hành").
 *    - Nếu đã có sách lẻ khác cùng tác giả (hoặc đã có kệ tên tác giả) → gom vào kệ tên tác giả
 *      và trả về `booksToRegroup` (các sách lẻ cũ đang đứng riêng ở kệ tên tác phẩm) để tự động chuyển cùng.
 */
export function resolveUploadShelfPlan(
  incoming: { title: string; author: string },
  existingBooks: Book[],
): { shelf: string; booksToRegroup: Book[] } {
  const series = extractSeriesName(incoming.title);
  if (series) {
    const existingSeriesShelf = existingBooks.find(
      (book) => normalizeKey(book.shelf) === normalizeKey(series),
    )?.shelf;
    return { shelf: existingSeriesShelf || series, booksToRegroup: [] };
  }

  const cleanTitle = incoming.title.trim();
  const cleanAuthor = incoming.author.trim();

  if (isKnownAuthor(cleanAuthor)) {
    const authorKey = normalizeKey(cleanAuthor);
    const titleKey = normalizeKey(cleanTitle);

    const existingAuthorShelf = existingBooks.find(
      (book) => normalizeKey(book.shelf) === authorKey,
    )?.shelf;

    const standalonePeers = existingBooks.filter((book) => {
      if (normalizeKey(book.author) !== authorKey) return false;
      if (extractSeriesName(book.title) !== null) return false;
      return normalizeKey(book.title) !== titleKey;
    });

    if (existingAuthorShelf || standalonePeers.length > 0) {
      const targetAuthorShelf = existingAuthorShelf || cleanAuthor;
      const booksToRegroup = standalonePeers.filter((book) => isStandaloneInTitleShelf(book));
      return { shelf: targetAuthorShelf, booksToRegroup };
    }
  }

  return { shelf: inferSingleBookShelf(cleanTitle, cleanAuthor), booksToRegroup: [] };
}

/**
 * Dự đoán tên kệ hiển thị trong danh sách hàng đợi UploadDropzone
 * (tính gộp cả sách đã có trong kho và các tệp cùng nằm trong hàng đợi).
 */
export function resolvePreviewShelfName(
  item: { id: string; title: string; author: string },
  activeQueue: Array<{ id: string; title: string; author: string }>,
  existingBooks: Book[],
): string {
  const series = extractSeriesName(item.title);
  if (series) {
    const existingSeriesShelf = existingBooks.find(
      (book) => normalizeKey(book.shelf) === normalizeKey(series),
    )?.shelf;
    return existingSeriesShelf || series;
  }

  const cleanAuthor = item.author.trim();
  if (isKnownAuthor(cleanAuthor)) {
    const authorKey = normalizeKey(cleanAuthor);
    const titleKey = normalizeKey(item.title);

    const existingAuthorShelf = existingBooks.find(
      (book) => normalizeKey(book.shelf) === authorKey,
    )?.shelf;
    if (existingAuthorShelf) return existingAuthorShelf;

    const hasExistingStandalonePeer = existingBooks.some(
      (book) =>
        normalizeKey(book.author) === authorKey &&
        extractSeriesName(book.title) === null &&
        normalizeKey(book.title) !== titleKey,
    );
    if (hasExistingStandalonePeer) return cleanAuthor;

    const hasQueuedStandalonePeer = activeQueue.some(
      (other) =>
        other.id !== item.id &&
        normalizeKey(other.author) === authorKey &&
        extractSeriesName(other.title) === null &&
        normalizeKey(other.title) !== titleKey,
    );
    if (hasQueuedStandalonePeer) return cleanAuthor;
  }

  return inferSingleBookShelf(item.title, item.author);
}
