import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, ParsedBook, ReaderSettings, ReadingProgress } from '@/types';
import { fetchBookBlobCached, isAuthError, saveReadingProgress } from '@/lib/api';
import { parseBookBlob } from '@/lib/parsers';
import { loadReaderSettings, saveReaderSettings } from '@/lib/readerConfig';

interface UseBookReaderOptions {
  onProgressUpdated: (bookId: string, progress: ReadingProgress) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
}

export function useBookReader({ onProgressUpdated, onApiError }: UseBookReaderOptions) {
  const [settings, setSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [openingBook, setOpeningBook] = useState<Book | null>(null);
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  const requestIdRef = useRef(0);
  const parsedBookRef = useRef<ParsedBook | null>(null);

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
      setOpeningBook(book);

      try {
        const { blob, fromCache } = await fetchBookBlobCached(book);
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
        if (requestId !== requestIdRef.current) return;
        setOpeningBook(null);
        onApiError(err, `Không thể mở "${book.title}".`);
      }
    },
    [disposeCurrent, onApiError],
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
