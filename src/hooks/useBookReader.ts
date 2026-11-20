import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, ParsedBook, ReaderSettings, ReadingProgress } from '@/types';
import type { AppTheme } from '@/hooks/useTheme';
import { fetchBookBlobCached, isAuthError, saveReadingProgress } from '@/lib/api';
import { isChunkLoadError, recoverFromChunkError } from '@/lib/chunkReload';
import {
  appThemeToReaderTheme,
  loadReaderSettings,
  saveReaderSettings,
} from '@/lib/readerConfig';

interface UseBookReaderOptions {
  appTheme: AppTheme;
  onProgressUpdated: (bookId: string, progress: ReadingProgress) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

export function useBookReader({ appTheme, onProgressUpdated, onApiError }: UseBookReaderOptions) {
  const [settings, setSettings] = useState<ReaderSettings>(() => ({
    ...loadReaderSettings(),
    theme: appThemeToReaderTheme(appTheme),
  }));
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [openingBook, setOpeningBook] = useState<Book | null>(null);
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
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
    setLoadedFromCache(false);
  }, [disposeCurrent]);

  const openBook = useCallback(
    async (book: Book) => {
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
    [appTheme, disposeCurrent, onApiError],
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
    loadedFromCache,
    updateSettings,
    openBook,
    closeBook,
    handleSaveProgress,
  };
}
