import type { AuthRole, Book } from '@/types';
import { isCloudMode } from '@/lib/authSession';
import { sortBooksByTitle } from '@/lib/bookMetadata';

const UNCLASSIFIED_SHELF_KEY = 'kho chưa phân loại';

/**
 * Tìm tập kế tiếp hợp lệ trong cùng kệ (`shelf`) để chuyển tập liền mạch ở cuối sách (D-029).
 * Bỏ qua kệ chung "Kho chưa phân loại" (chứa sách lẻ không liên quan) và ở chế độ `guest`
 * chỉ gợi ý tập đã sẵn sàng cho khách đọc (`guest_ready`).
 */
export function findNextBookInShelf(
  currentBook: Book | null,
  allBooks: readonly Book[],
  sessionRole: AuthRole = 'owner',
): Book | null {
  if (!currentBook || allBooks.length <= 1) return null;
  const shelfKey = (currentBook.shelf || '').trim().toLocaleLowerCase('vi');
  if (!shelfKey || shelfKey === UNCLASSIFIED_SHELF_KEY) return null;

  const sameShelf = sortBooksByTitle(
    allBooks.filter(
      (b) => (b.shelf || '').trim().toLocaleLowerCase('vi') === shelfKey,
    ),
  );
  if (sameShelf.length <= 1) return null;

  const currentIdx = sameShelf.findIndex((b) => b.id === currentBook.id);
  if (currentIdx < 0 || currentIdx >= sameShelf.length - 1) return null;

  for (let i = currentIdx + 1; i < sameShelf.length; i += 1) {
    const candidate = sameShelf[i];
    if (sessionRole === 'guest' && candidate.guest_locked) {
      continue;
    }
    if (isCloudMode && sessionRole === 'guest') {
      if (candidate.file_type === 'pdf' || candidate.guest_ready === false) {
        continue;
      }
    }
    return candidate;
  }

  return null;
}
