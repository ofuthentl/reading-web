import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AuthRole,
  Book,
  GuestTocItem,
  ParsedBook,
  ReaderSettings,
  ReadingProgress,
  SaveProgressOptions,
} from '@/types';
import type { UiTheme } from '@/hooks/useTheme';
import { fetchBookBlobCached, isAuthError, isCloudMode, saveReadingProgress } from '@/lib/api';
import { isChunkLoadError, recoverFromChunkError } from '@/lib/chunkReload';
import {
  appThemeToReaderTheme,
  loadReaderSettings,
  saveReaderSettings,
} from '@/lib/readerConfig';

export interface GuestReaderSessionState {
  chapters: GuestTocItem[];
  watermarkLabel: string;
}

interface UseBookReaderOptions {
  appTheme: UiTheme;
  sessionRole: AuthRole;
  authenticated?: boolean;
  onProgressUpdated: (bookId: string, progress: ReadingProgress, readingDeltaSec?: number) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

export function useBookReader({
  appTheme,
  sessionRole,
  authenticated = false,
  onProgressUpdated,
  onApiError,
}: UseBookReaderOptions) {
  // Vá lỗi B1: ưu tiên giữ nguyên màu nền đọc người dùng đã chọn trong localStorage;
  // chỉ dùng appTheme làm mặc định cho lần đầu chưa từng lưu cài đặt đọc.
  const [settings, setSettings] = useState<ReaderSettings>(() =>
    loadReaderSettings(appThemeToReaderTheme(appTheme)),
  );
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [openingBook, setOpeningBook] = useState<Book | null>(null);
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
  const [guestSession, setGuestSession] = useState<GuestReaderSessionState | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  const requestIdRef = useRef(0);
  const parsedBookRef = useRef<ParsedBook | null>(null);
  const openAbortRef = useRef<AbortController | null>(null);
  const prevAppThemeRef = useRef<UiTheme>(appTheme);

  // Chỉ đồng bộ nền trình đọc khi người dùng THỰC SỰ bấm đổi theme App, không ghi đè lúc mount/F5
  useEffect(() => {
    if (prevAppThemeRef.current === appTheme) return;
    prevAppThemeRef.current = appTheme;
    const syncedTheme = appThemeToReaderTheme(appTheme);
    setSettings((prev) => {
      if (prev.theme === syncedTheme) return prev;
      const next = { ...prev, theme: syncedTheme };
      saveReaderSettings(next);
      if (authenticated && isCloudMode) {
        void import('@/lib/readerSettingsSync')
          .then((m) => m.scheduleRemoteReaderSettingsSync(next))
          .catch(() => undefined);
      }
      return next;
    });
  }, [appTheme, authenticated]);

  // Tải cài đặt trình đọc đồng bộ từ D1 khi đăng nhập thành công (D-036 Mục 7)
  useEffect(() => {
    if (!authenticated || !isCloudMode) return;
    let cancelled = false;
    void import('@/lib/readerSettingsSync')
      .then((m) => m.fetchRemoteReaderSettings(appThemeToReaderTheme(appTheme)))
      .then((remote) => {
        if (cancelled || !remote) return;
        saveReaderSettings(remote);
        setSettings(remote);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [appTheme, authenticated]);

  const disposeCurrent = useCallback(() => {
    if (parsedBookRef.current) {
      parsedBookRef.current.dispose();
      parsedBookRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      openAbortRef.current?.abort();
      openAbortRef.current = null;
      disposeCurrent();
    };
  }, [disposeCurrent]);

  const updateSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      setSettings((prev) => {
        const merged = { ...prev, ...patch };
        saveReaderSettings(merged);
        if (authenticated && isCloudMode) {
          void import('@/lib/readerSettingsSync')
            .then((m) => m.scheduleRemoteReaderSettingsSync(merged))
            .catch(() => undefined);
        }
        return merged;
      });
    },
    [authenticated],
  );

  /** Chỉ huỷ lượt tải sách mới mà không đóng cuốn đang mở phía dưới (vá M-10) */
  const cancelOpeningBook = useCallback(() => {
    requestIdRef.current += 1;
    openAbortRef.current?.abort();
    openAbortRef.current = null;
    setOpeningBook(null);
  }, []);

  const closeBook = useCallback(() => {
    requestIdRef.current += 1;
    openAbortRef.current?.abort();
    openAbortRef.current = null;
    disposeCurrent();
    setOpeningBook(null);
    setActiveBook(null);
    setParsedBook(null);
    setGuestSession(null);
    setLoadedFromCache(false);
  }, [disposeCurrent]);

  const openBook = useCallback(
    async (book: Book) => {
      if (sessionRole === 'guest' && book.guest_locked) {
        onApiError(
          new Error('🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.'),
          '🔒 Bộ truyện này chỉ mở quyền đọc cho thành viên Discord được chỉ định.',
        );
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      openAbortRef.current?.abort();
      const controller = new AbortController();
      openAbortRef.current = controller;
      setOpeningBook(book);

      try {
        if (isCloudMode && sessionRole === 'guest') {
          const { fetchGuestBookToc } = await import('@/lib/guestCrypto');
          if (requestId !== requestIdRef.current) return;
          const toc = await fetchGuestBookToc(book.id);
          if (requestId !== requestIdRef.current) return;

          disposeCurrent();
          setParsedBook(null);
          setGuestSession({
            chapters: toc.chapters,
            watermarkLabel: toc.watermarkLabel,
          });
          setActiveBook(book);
          setLoadedFromCache(false);
          setOpeningBook(null);
          return;
        }

        const { blob, fromCache } = await fetchBookBlobCached(book, { signal: controller.signal });
        if (requestId !== requestIdRef.current) return;

        const { parseBookBlob } = await import('@/lib/parsers');
        if (requestId !== requestIdRef.current) return;

        const parsed = await parseBookBlob(blob, book);
        if (requestId !== requestIdRef.current) {
          parsed.dispose();
          return;
        }

        disposeCurrent();
        parsedBookRef.current = parsed;
        setGuestSession(null);
        setActiveBook(book);
        setParsedBook(parsed);
        setLoadedFromCache(fromCache);
        setOpeningBook(null);
      } catch (err) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (recoverFromChunkError(err)) return;
        setOpeningBook(null);
        if (isChunkLoadError(err)) {
          onApiError(
            new Error('Cần kết nối mạng để tải trình đọc lần đầu.'),
            'Cần kết nối mạng để tải trình đọc lần đầu.',
          );
          return;
        }
        onApiError(err, `Không thể mở "${book.title}".`);
      } finally {
        if (openAbortRef.current === controller) {
          openAbortRef.current = null;
        }
      }
    },
    [disposeCurrent, onApiError, sessionRole],
  );

  const handleSaveProgress = useCallback(
    (nextProgress: ReadingProgress, options?: SaveProgressOptions) => {
      if (!activeBook) return;
      const bookId = activeBook.id;
      onProgressUpdated(bookId, nextProgress, options?.readingDeltaSec);

      void saveReadingProgress(bookId, nextProgress, options).catch((err) => {
        if (isAuthError(err)) {
          closeBook();
          onApiError(err, 'Phiên đăng nhập đã hết hạn.');
        }
      });
    },
    [activeBook, closeBook, onApiError, onProgressUpdated],
  );

  return {
    settings,
    activeBook,
    openingBook,
    parsedBook,
    guestSession,
    loadedFromCache,
    updateSettings,
    openBook,
    cancelOpeningBook,
    closeBook,
    handleSaveProgress,
  };
}
