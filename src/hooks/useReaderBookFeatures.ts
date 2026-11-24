import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BookHighlight,
  HighlightColor,
  HighlightLocator,
} from '@/types';
import type { SelectionHighlightDraft } from '@/lib/domHighlights';
import type { ResolvedFootnoteItem } from '@/lib/epubFootnotes';
import {
  createBookHighlight,
  deleteBookHighlight,
  fetchBookHighlights,
  updateBookHighlight,
} from '@/lib/highlightsApi';

export interface UseReaderBookFeaturesOptions {
  bookId: string;
  chapterIndex: number;
  currentChapterId: string;
  currentChapterTitle: string;
  initialChapterIndex?: number;
  initialCompleted?: boolean;
  totalChapters: number;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
}

export function useReaderBookFeatures({
  bookId,
  chapterIndex,
  currentChapterId,
  currentChapterTitle,
  initialChapterIndex = 0,
  initialCompleted = false,
  totalChapters,
  onApiError,
}: UseReaderBookFeaturesOptions) {
  const [highlights, setHighlights] = useState<BookHighlight[]>([]);
  const [savingHighlight, setSavingHighlight] = useState(false);
  const [selectionDraft, setSelectionDraft] = useState<SelectionHighlightDraft | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<{
    highlight: BookHighlight;
    anchorX: number;
    anchorY: number;
  } | null>(null);
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [quoteVaultOpen, setQuoteVaultOpen] = useState(false);
  const [activeFootnote, setActiveFootnote] = useState<ResolvedFootnoteItem | null>(null);

  const [highestChapterReached, setHighestChapterReached] = useState(() =>
    initialCompleted ? Math.max(0, totalChapters - 1) : Math.max(0, initialChapterIndex),
  );
  const prevBookIdRef = useRef(bookId);

  useEffect(() => {
    const targetMax = initialCompleted
      ? Math.max(0, totalChapters - 1)
      : Math.max(0, initialChapterIndex, chapterIndex);
    if (prevBookIdRef.current !== bookId) {
      prevBookIdRef.current = bookId;
      setHighestChapterReached(targetMax);
    } else {
      setHighestChapterReached((prev) => Math.max(prev, targetMax));
    }
  }, [bookId, chapterIndex, initialChapterIndex, initialCompleted, totalChapters]);

  useEffect(() => {
    setActiveFootnote(null);
    setSelectionDraft(null);
    setEditingHighlight(null);
  }, [chapterIndex]);

  useEffect(() => {
    const controller = new AbortController();
    fetchBookHighlights(bookId, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setHighlights(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHighlights([]);
      });
    return () => controller.abort();
  }, [bookId]);

  const chapterHighlights = useMemo(
    () =>
      highlights.filter(
        (hl) =>
          (currentChapterId && hl.chapterId === currentChapterId) ||
          hl.chapterIndex === chapterIndex,
      ),
    [chapterIndex, currentChapterId, highlights],
  );

  const blockHighlightColors = useMemo(() => {
    const map = new Map<number, HighlightColor>();
    for (const hl of chapterHighlights) {
      const bIdx = hl.locator?.blockIndex;
      if (typeof bIdx === 'number' && bIdx >= 0) {
        map.set(bIdx, hl.color);
      }
    }
    return map;
  }, [chapterHighlights]);

  const createNewHighlight = useCallback(
    async (params: {
      quoteText: string;
      color: HighlightColor;
      note: string;
      locator?: HighlightLocator | null;
    }) => {
      if (!currentChapterId) return;
      setSavingHighlight(true);
      try {
        const created = await createBookHighlight({
          bookId,
          chapterId: currentChapterId,
          chapterIndex,
          chapterTitle: currentChapterTitle,
          quoteText: params.quoteText,
          note: params.note,
          color: params.color,
          locator: params.locator ?? null,
        });
        setHighlights((prev) => [...prev, created]);
        setSelectionDraft(null);
        setGuestPickerOpen(false);
        if (typeof window !== 'undefined') {
          window.getSelection()?.removeAllRanges();
        }
      } catch (err) {
        onApiError?.(err, 'Không thể lưu đoạn trích dẫn.');
      } finally {
        setSavingHighlight(false);
      }
    },
    [bookId, chapterIndex, currentChapterId, currentChapterTitle, onApiError],
  );

  const editExistingHighlight = useCallback(
    async (id: string, color: HighlightColor, note: string) => {
      setSavingHighlight(true);
      try {
        const updated = await updateBookHighlight(id, bookId, { color, note });
        if (updated) {
          setHighlights((prev) => prev.map((it) => (it.id === id ? updated : it)));
        }
        setEditingHighlight(null);
        setGuestPickerOpen(false);
      } catch (err) {
        onApiError?.(err, 'Không thể cập nhật trích dẫn.');
      } finally {
        setSavingHighlight(false);
      }
    },
    [bookId, onApiError],
  );

  const removeExistingHighlight = useCallback(
    async (id: string) => {
      setSavingHighlight(true);
      try {
        await deleteBookHighlight(id, bookId);
        setHighlights((prev) => prev.filter((it) => it.id !== id));
        setEditingHighlight(null);
        setGuestPickerOpen(false);
      } catch (err) {
        onApiError?.(err, 'Không thể xoá trích dẫn.');
      } finally {
        setSavingHighlight(false);
      }
    },
    [bookId, onApiError],
  );

  const removeHighlightLocal = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((it) => it.id !== id));
    setEditingHighlight((prev) => (prev?.highlight.id === id ? null : prev));
  }, []);

  return {
    highlights,
    chapterHighlights,
    blockHighlightColors,
    highestChapterReached,
    savingHighlight,
    selectionDraft,
    setSelectionDraft,
    editingHighlight,
    setEditingHighlight,
    guestPickerOpen,
    setGuestPickerOpen,
    quoteVaultOpen,
    setQuoteVaultOpen,
    activeFootnote,
    setActiveFootnote,
    createNewHighlight,
    editExistingHighlight,
    removeExistingHighlight,
    removeHighlightLocal,
  };
}
