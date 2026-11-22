import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AuthRole,
  Book,
  GuestTocItem,
  ParsedBook,
  ReaderSettings,
  ReadingProgress,
} from '@/types';
import type { AppTheme } from '@/hooks/useTheme';
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
  appTheme: AppTheme;
  sessionRole: AuthRole;
  onProgressUpdated: (bookId: string, progress: ReadingProgress) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

export function useBookReader({
  appTheme,
  sessionRole,
  onProgressUpdated,
  onApiError,
}: UseBookReaderOptions) {
  const [settings, setSettings] = useState<ReaderSettings>(() => ({
    ...loadReaderSettings(),
    theme: appThemeToReaderTheme(appTheme),
  }));
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [openingBook, setOpeningBook] = useState<Book | null>(null);
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
  const [guestSession, setGuestSession] = useState<GuestReaderSessionState | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  const requestIdRef = useRef(0);
  const parsedBookRef = useRef<ParsedBook | null>(null);

  useEffect(() => {
    const syncedTheme = appThemeToReaderTheme(appTheme);
    setSettings((prev) => {
      if (prev.theme === syncedTheme) return prev;
      const next = { ...prev, theme: syncedTheme };
      saveReaderSettings(next);
      return next;
    });
  }, [appTheme]);

  const disposeCurrent = useCallback(() => {
    if (parsedBookRef.current) {
      parsedBookRef.current.dispose();
      parsedBookRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      disposeCurrent();
    };
  }, [disposeCurrent]);

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveReaderSettings(next);
      return next;
    });
  }, []);

  const closeBook = useCallback(() => {
    requestIdRef.current += 1;
    disposeCurrent();
    setOpeningBook(null);
    setActiveBook(null);
    setParsedBook(null);
    setGuestSession(null);
    setLoadedFromCache(false);
  }, [disposeCurrent]);

  const openBook = useCallback(
    async (book: Book) => {
      if (isCloudMode && sessionRole === 'guest' && book.file_type === 'pdf') {
        onApiError(
          new Error('Định dạng PDF chỉ dành cho Quản trị viên thư viện.'),
          'Định dạng PDF chỉ dành cho Quản trị viên thư viện.',
        );
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const syncedTheme = appThemeToReaderTheme(appTheme);
      setSettings((prev) => {
        if (prev.theme === syncedTheme) return prev;
        const next = { ...prev, theme: syncedTheme };
        saveReaderSettings(next);
        return next;
      });
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

        const { blob, fromCache } = await fetchBookBlobCached(book);
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
        if (recoverFromChunkError(err)) return;
        if (requestId !== requestIdRef.current) return;
        setOpeningBook(null);
        if (isChunkLoadError(err)) {
          onApiError(
            new Error('Cần kết nối mạng để tải trình đọc lần đầu.'),
            'Cần kết nối mạng để tải trình đọc lần đầu.',
          );
          return;
        }
        onApiError(err, `Không thể mở "${book.title}".`);
      }
    },
    [appTheme, disposeCurrent, onApiError, sessionRole],
  );

  const handleSaveProgress = useCallback(
    (nextProgress: ReadingProgress) => {
      if (!activeBook) return;
      const bookId = activeBook.id;
      onProgressUpdated(bookId, nextProgress);

      void saveReadingProgress(bookId, nextProgress).catch((err) => {
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
    closeBook,
    handleSaveProgress,
  };
}
