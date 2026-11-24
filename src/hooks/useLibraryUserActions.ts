import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react';
import type { AuthRole, Book, ReadingProgress } from '@/types';
import { clearReadingProgress, saveReadingProgress } from '@/lib/api';
import { bumpKeyVersion, toggleSetValue } from '@/lib/libraryStoreHelpers';
import {
  type ShelfPrefsState,
  patchShelfFavorite,
  setShelfFavorite,
  toShelfPrefKey,
} from '@/lib/shelfPrefs';
import type { ToastType } from '@/hooks/useToast';

export interface UseLibraryUserActionsOptions {
  sessionRole: AuthRole;
  progress: Record<string, ReadingProgress>;
  progressRef: MutableRefObject<Record<string, ReadingProgress>>;
  toggleVerRef: MutableRefObject<Map<string, number>>;
  setProgress: Dispatch<SetStateAction<Record<string, ReadingProgress>>>;
  setShelfPrefs: Dispatch<SetStateAction<ShelfPrefsState>>;
  setPlanToReadShelfKeys: Dispatch<SetStateAction<Set<string>>>;
  setPlanToReadBookIds: Dispatch<SetStateAction<Set<string>>>;
  toggleGuestFavorite: (shelfName: string, nextFavorite: boolean) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  addToast: (message: string, type?: ToastType) => void;
}

export function useLibraryUserActions({
  sessionRole,
  progress,
  progressRef,
  toggleVerRef,
  setProgress,
  setShelfPrefs,
  setPlanToReadShelfKeys,
  setPlanToReadBookIds,
  toggleGuestFavorite,
  onApiError,
  addToast,
}: UseLibraryUserActionsOptions) {
  const handleProgressUpdated = useCallback(
    (bookId: string, nextProgress: ReadingProgress, readingDeltaSec = 0) => {
      const wasCompleted = Boolean(progressRef.current[bookId]?.completed);
      if (!wasCompleted && nextProgress.completed) {
        void import('@/lib/confettiBurst').then((m) => m.triggerConfettiBurst()).catch(() => undefined);
      }
      setProgress((prev) => {
        const prevItem = prev[bookId];
        const prevSec = prevItem?.readingSeconds ?? 0;
        const baseSec = Math.max(prevSec, nextProgress.readingSeconds ?? 0);
        const totalSec = baseSec + Math.max(0, Math.floor(readingDeltaSec));
        const rereadCount = Math.max(prevItem?.rereadCount ?? 0, nextProgress.rereadCount ?? 0);
        return {
          ...prev,
          [bookId]: {
            ...nextProgress,
            ...(totalSec > 0 ? { readingSeconds: totalSec } : {}),
            ...(rereadCount > 0 ? { rereadCount } : {}),
          },
        };
      });
    },
    [progressRef, setProgress],
  );

  const handleTogglePlanToRead = useCallback(
    (shelfName: string, nextPlanToRead: boolean) => {
      const key = toShelfPrefKey(shelfName);
      if (!key) return;
      const verKey = `ptr-shelf:${key}`;
      const ver = bumpKeyVersion(toggleVerRef.current, verKey);
      setPlanToReadShelfKeys((prev) => toggleSetValue(prev, key, nextPlanToRead));
      addToast(
        nextPlanToRead
          ? `Đã thêm "${shelfName}" vào danh sách Đọc sau.`
          : `Đã gỡ "${shelfName}" khỏi danh sách Đọc sau.`,
        'info',
      );
      void import('@/lib/catalogApi')
        .then((m) => m.setPlanToReadShelf(shelfName, nextPlanToRead))
        .catch((err) => {
          if (toggleVerRef.current.get(verKey) !== ver) return;
          setPlanToReadShelfKeys((prev) => toggleSetValue(prev, key, !nextPlanToRead));
          onApiError(err, 'Không thể cập nhật danh sách Đọc sau.');
        });
    },
    [addToast, onApiError, setPlanToReadShelfKeys, toggleVerRef],
  );

  const handleTogglePlanToReadBook = useCallback(
    (book: Book, nextPlanToRead: boolean) => {
      const bookId = book.id;
      if (!bookId) return;
      const verKey = `ptr-book:${bookId}`;
      const ver = bumpKeyVersion(toggleVerRef.current, verKey);
      setPlanToReadBookIds((prev) => toggleSetValue(prev, bookId, nextPlanToRead));
      addToast(
        nextPlanToRead
          ? `Đã thêm "${book.title}" vào danh sách Đọc sau.`
          : `Đã gỡ "${book.title}" khỏi danh sách Đọc sau.`,
        'info',
      );
      void import('@/lib/catalogApi')
        .then((m) => m.setPlanToReadBook(bookId, nextPlanToRead))
        .catch((err) => {
          if (toggleVerRef.current.get(verKey) !== ver) return;
          setPlanToReadBookIds((prev) => toggleSetValue(prev, bookId, !nextPlanToRead));
          onApiError(err, 'Không thể cập nhật Đọc sau cho tập sách.');
        });
    },
    [addToast, onApiError, setPlanToReadBookIds, toggleVerRef],
  );

  const handleToggleFavoriteShelf = useCallback(
    (shelfName: string, nextFavorite: boolean) => {
      if (sessionRole !== 'owner') {
        toggleGuestFavorite(shelfName, nextFavorite);
        addToast(
          nextFavorite
            ? `Đã ghim kệ "${shelfName}" lên đầu trên thiết bị này.`
            : `Đã bỏ ghim kệ "${shelfName}".`,
          'info',
        );
        return;
      }
      const verKey = `fav:${toShelfPrefKey(shelfName)}`;
      const ver = bumpKeyVersion(toggleVerRef.current, verKey);
      setShelfPrefs((prev) => patchShelfFavorite(prev, shelfName, nextFavorite));
      addToast(
        nextFavorite
          ? `Đã ghim kệ "${shelfName}" lên đầu danh sách.`
          : `Đã bỏ yêu thích kệ "${shelfName}".`,
        'info',
      );
      void setShelfFavorite(shelfName, nextFavorite).catch((err) => {
        if (toggleVerRef.current.get(verKey) !== ver) return;
        setShelfPrefs((prev) => patchShelfFavorite(prev, shelfName, !nextFavorite));
        onApiError(err, 'Không thể cập nhật kệ yêu thích.');
      });
    },
    [addToast, onApiError, sessionRole, setShelfPrefs, toggleGuestFavorite, toggleVerRef],
  );

  const handleMarkBookCompleted = useCallback(
    (book: Book) => {
      const existing = progress[book.id];
      const nextProgress: ReadingProgress = {
        chapterId: existing?.chapterId || 'manual-complete',
        chapterIndex: Math.max(0, (existing?.totalChapters ?? 1) - 1),
        ...(existing?.chapterTitle ? { chapterTitle: existing.chapterTitle } : {}),
        ...(existing?.totalChapters ? { totalChapters: existing.totalChapters } : {}),
        scrollRatio: 1,
        scrollTop: existing?.scrollTop ?? 0,
        completed: true,
        ...(existing?.readingSeconds ? { readingSeconds: existing.readingSeconds } : {}),
        ...(existing?.rereadCount ? { rereadCount: existing.rereadCount } : {}),
        updatedAt: Date.now(),
      };
      setProgress((prev) => ({ ...prev, [book.id]: nextProgress }));
      if (!existing?.completed) {
        void import('@/lib/confettiBurst').then((m) => m.triggerConfettiBurst()).catch(() => undefined);
      }
      addToast(`Đã đánh dấu hoàn thành "${book.title}".`, 'success');
      void saveReadingProgress(book.id, nextProgress).catch((err) => {
        setProgress((prev) => {
          const restored = { ...prev };
          if (existing) restored[book.id] = existing;
          else delete restored[book.id];
          return restored;
        });
        onApiError(err, 'Không thể lưu trạng thái hoàn thành.');
      });
    },
    [addToast, onApiError, progress, setProgress],
  );

  const handleStartRereadBook = useCallback(
    (book: Book) => {
      const existing = progress[book.id];
      const nextRereadCount = Math.min(999, (existing?.rereadCount ?? 0) + 1);
      const nextProgress: ReadingProgress = {
        chapterId: '',
        chapterIndex: 0,
        ...(existing?.totalChapters ? { totalChapters: existing.totalChapters } : {}),
        scrollRatio: 0,
        scrollTop: 0,
        completed: false,
        ...(existing?.readingSeconds ? { readingSeconds: existing.readingSeconds } : {}),
        rereadCount: nextRereadCount,
        updatedAt: Date.now(),
      };
      setProgress((prev) => ({ ...prev, [book.id]: nextProgress }));
      addToast(
        `Bắt đầu đọc lại "${book.title}" (lần đọc lại thứ ${nextRereadCount}).`,
        'success',
      );
      void saveReadingProgress(book.id, nextProgress).catch((err) => {
        setProgress((prev) => {
          const restored = { ...prev };
          if (existing) restored[book.id] = existing;
          else delete restored[book.id];
          return restored;
        });
        onApiError(err, 'Không thể lưu trạng thái đọc lại.');
      });
    },
    [addToast, onApiError, progress, setProgress],
  );

  const handleResetBookProgress = useCallback(
    (book: Book) => {
      const previous = progress[book.id];
      setProgress((prev) => {
        const next = { ...prev };
        delete next[book.id];
        return next;
      });
      addToast(`Đã đặt lại tiến độ đọc "${book.title}".`, 'info');
      void clearReadingProgress(book.id).catch((err) => {
        if (previous) {
          setProgress((prev) => ({ ...prev, [book.id]: previous }));
        }
        onApiError(err, 'Không thể xoá tiến độ đọc.');
      });
    },
    [addToast, onApiError, progress, setProgress],
  );

  return {
    handleProgressUpdated,
    handleTogglePlanToRead,
    handleTogglePlanToReadBook,
    handleToggleFavoriteShelf,
    handleMarkBookCompleted,
    handleStartRereadBook,
    handleResetBookProgress,
  };
}
