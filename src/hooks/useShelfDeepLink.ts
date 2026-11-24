import { useEffect, useRef } from 'react';
import type { AuthRole, ShelfGroup, ViewMode } from '@/types';
import { toShelfPrefKey } from '@/lib/shelfPrefs';
import type { ToastType } from '@/hooks/useToast';

interface UseShelfDeepLinkOptions {
  authenticated: boolean;
  hasLoadedOnce: boolean;
  allShelves: readonly ShelfGroup[];
  sessionRole: AuthRole;
  effectiveMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onJumpToShelf: (shelfKey: string) => void;
  onSwitchToLibraryTab: () => void;
  addToast: (message: string, type?: ToastType) => void;
}

/**
 * Xử lý Deep-link `/?shelf=<tên bộ>` từ nút `🌐 Mở thư viện` trên Embed Discord (`D-039` Mục 5):
 * - Chờ đăng nhập & tải xong kho sách (`hasLoadedOnce`) mới điều hướng sang Tab `Thư viện` -> `ShelfDetailView`.
 * - Dọn sạch tham số `?shelf=` khỏi thanh địa chỉ bằng `history.replaceState`.
 * - Chặn an toàn nếu kệ không tồn tại hoặc toàn bộ tập trong kệ bị khoá `guest_locked` (`D-030`).
 */
export function useShelfDeepLink({
  authenticated,
  hasLoadedOnce,
  allShelves,
  sessionRole,
  effectiveMode,
  setViewMode,
  onJumpToShelf,
  onSwitchToLibraryTab,
  addToast,
}: UseShelfDeepLinkOptions): void {
  const consumedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authenticated || !hasLoadedOnce || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const rawShelf = params.get('shelf')?.trim();
    if (!rawShelf) return;

    // Dọn query `?shelf=` ngay để F5 hoặc Back/Forward giữ URL sạch
    params.delete('shelf');
    const remaining = params.toString();
    const cleanHref = `${window.location.pathname}${remaining ? `?${remaining}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', cleanHref);

    if (consumedRef.current === rawShelf) return;
    consumedRef.current = rawShelf;

    const targetKey = toShelfPrefKey(rawShelf);
    const matched = allShelves.find((shelf) => shelf.key === targetKey);
    if (!matched) {
      onSwitchToLibraryTab();
      addToast('Không tìm thấy bộ truyện được liên kết trong thư viện.', 'warning');
      return;
    }

    const isGuestLocked =
      sessionRole === 'guest' &&
      matched.books.length > 0 &&
      matched.books.every((book) => Boolean(book.guest_locked));
    if (isGuestLocked) {
      onSwitchToLibraryTab();
      addToast(
        '🔒 Bộ truyện này hiện giới hạn quyền đọc cho thành viên Discord được chỉ định.',
        'warning',
      );
      return;
    }

    if (effectiveMode === '3d') {
      setViewMode('2d');
    }
    onJumpToShelf(matched.key);
  }, [
    addToast,
    allShelves,
    authenticated,
    effectiveMode,
    hasLoadedOnce,
    onJumpToShelf,
    onSwitchToLibraryTab,
    sessionRole,
    setViewMode,
  ]);
}
