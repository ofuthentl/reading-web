import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  Book,
  ReaderSettings,
  ReadingProgress,
  SaveProgressOptions,
} from '@/types';
import type { PaginatedStageHandle } from '@/components/ReaderPaginatedView';
import { useReaderController } from '@/hooks/useReaderController';
import { formatRemainingChapterEstimate } from '@/lib/readingEstimate';
import type { ReaderSearchJumpTarget } from '@/lib/readerSearchJump';

export interface ReaderChapterItemMeta {
  id: string;
  title: string;
}

export interface UseReaderChapterProgressOptions {
  chapters: readonly ReaderChapterItemMeta[];
  initialProgress?: ReadingProgress;
  settings: ReaderSettings;
  isPaginated: boolean;
  blockCopyShortcuts?: boolean;
  timerEnabled?: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  paginatedRef: React.RefObject<PaginatedStageHandle | null>;
  onSaveProgress: (progress: ReadingProgress, options?: SaveProgressOptions) => void;
  onSameChapterJump?: () => void;
  onOpenNextBook?: (nextBook: Book) => void;
  onClose: () => void;
}

export function useReaderChapterProgress({
  chapters,
  initialProgress,
  settings,
  isPaginated,
  blockCopyShortcuts = false,
  timerEnabled = true,
  scrollContainerRef,
  paginatedRef,
  onSaveProgress,
  onSameChapterJump,
  onOpenNextBook,
  onClose,
}: UseReaderChapterProgressOptions) {
  const initialIdx = useMemo(() => {
    if (!initialProgress || chapters.length === 0) return 0;
    const byId = chapters.findIndex((c) => c.id === initialProgress.chapterId);
    if (byId >= 0) return byId;
    return Math.max(0, Math.min(initialProgress.chapterIndex || 0, chapters.length - 1));
  }, [chapters, initialProgress]);

  const initialStartRatio =
    initialProgress && initialProgress.chapterId === chapters[initialIdx]?.id
      ? initialProgress.scrollRatio
      : 0;

  const [chapterIndex, setChapterIndex] = useState(initialIdx);
  const [chapterScrollRatio, setChapterScrollRatio] = useState(initialStartRatio);
  const [paginatedStartRatio, setPaginatedStartRatio] = useState(initialStartRatio);
  const [searchTarget, setSearchTarget] = useState<ReaderSearchJumpTarget | null>(null);

  const restoreTargetRatioRef = useRef<number | null>(
    initialProgress && initialProgress.chapterId === chapters[initialIdx]?.id
      ? initialProgress.scrollRatio
      : null,
  );
  const suppressSaveRef = useRef(false);
  const goPrevRef = useRef<() => void>(() => undefined);
  const goNextRef = useRef<() => void>(() => undefined);

  const currentChapterMeta = chapters[chapterIndex];

  const fallbackProgress = useMemo<ReadingProgress | null>(() => {
    if (!currentChapterMeta) return null;
    return {
      chapterId: currentChapterMeta.id,
      chapterIndex,
      chapterTitle: currentChapterMeta.title,
      totalChapters: chapters.length,
      scrollRatio: chapterScrollRatio,
      scrollTop: 0,
      completed: Boolean(initialProgress?.completed),
      updatedAt: Date.now(),
    };
  }, [
    chapterIndex,
    chapterScrollRatio,
    chapters.length,
    currentChapterMeta,
    initialProgress?.completed,
  ]);

  const ctrl = useReaderController({
    initialCompleted: Boolean(initialProgress?.completed),
    settings,
    blockCopyShortcuts,
    timerEnabled,
    fallbackProgress,
    onSaveProgress,
    onPrev: () => goPrevRef.current(),
    onNext: () => goNextRef.current(),
  });

  const {
    completedRef,
    lastScrollTopRef,
    queueProgressSave,
    setImmersiveHidden,
    setTocOpen,
  } = ctrl;

  const goToChapter = useCallback(
    (nextIndex: number, targetRatio = 0) => {
      const clamped = Math.max(0, Math.min(nextIndex, chapters.length - 1));
      const target = chapters[clamped];
      if (!target) return;

      const safeRatio = Math.min(1, Math.max(0, targetRatio));
      setTocOpen(false);
      setImmersiveHidden(false);

      if (clamped === chapterIndex) {
        setChapterScrollRatio(safeRatio);
        if (isPaginated) {
          paginatedRef.current?.jumpToRatio(safeRatio);
        } else if (scrollContainerRef.current) {
          const el = scrollContainerRef.current;
          const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
          el.scrollTop = Math.round(maxScroll * safeRatio);
          onSameChapterJump?.();
        }
        return;
      }

      suppressSaveRef.current = true;
      restoreTargetRatioRef.current = safeRatio;
      lastScrollTopRef.current = 0;
      setPaginatedStartRatio(safeRatio);
      setChapterScrollRatio(safeRatio);
      setChapterIndex(clamped);

      queueProgressSave(
        {
          chapterId: target.id,
          chapterIndex: clamped,
          chapterTitle: target.title,
          totalChapters: chapters.length,
          scrollRatio: safeRatio,
          scrollTop: 0,
          completed: completedRef.current,
          updatedAt: Date.now(),
        },
        true,
      );
    },
    [
      chapterIndex,
      chapters,
      completedRef,
      isPaginated,
      lastScrollTopRef,
      onSameChapterJump,
      paginatedRef,
      queueProgressSave,
      scrollContainerRef,
      setImmersiveHidden,
      setTocOpen,
    ],
  );

  const handleJumpToSearchResult = useCallback(
    (target: {
      chapterIndex: number;
      query: string;
      occurrenceIndex: number;
      approximateRatio: number;
    }) => {
      if (target.chapterIndex !== chapterIndex) {
        goToChapter(target.chapterIndex, target.approximateRatio);
      } else {
        setTocOpen(false);
        setImmersiveHidden(false);
      }
      setSearchTarget({ ...target, nonce: Date.now() });
    },
    [chapterIndex, goToChapter, setImmersiveHidden, setTocOpen],
  );

  const goPrevChapter = useCallback(() => {
    if (chapterIndex > 0) goToChapter(chapterIndex - 1, 0);
  }, [chapterIndex, goToChapter]);

  const goNextChapter = useCallback(() => {
    if (chapterIndex < chapters.length - 1) goToChapter(chapterIndex + 1, 0);
  }, [chapterIndex, chapters.length, goToChapter]);

  goPrevRef.current = isPaginated ? () => paginatedRef.current?.stepPrev() : goPrevChapter;
  goNextRef.current = isPaginated ? () => paginatedRef.current?.stepNext() : goNextChapter;

  const handlePaginatedRatioChange = useCallback(
    (ratio: number, isEndOfChapter: boolean) => {
      if (!currentChapterMeta) return;
      setChapterScrollRatio(ratio);
      const reachedEnd = chapterIndex === chapters.length - 1 && isEndOfChapter;
      if (reachedEnd) completedRef.current = true;
      queueProgressSave(
        {
          chapterId: currentChapterMeta.id,
          chapterIndex,
          chapterTitle: currentChapterMeta.title,
          totalChapters: chapters.length,
          scrollRatio: ratio,
          scrollTop: 0,
          completed: completedRef.current,
          updatedAt: Date.now(),
        },
        reachedEnd,
      );
    },
    [chapterIndex, chapters.length, completedRef, currentChapterMeta, queueProgressSave],
  );

  const completeBook = useCallback(
    (targetNextBook?: Book) => {
      completedRef.current = true;
      if (currentChapterMeta) {
        queueProgressSave(
          {
            chapterId: currentChapterMeta.id,
            chapterIndex,
            chapterTitle: currentChapterMeta.title,
            totalChapters: chapters.length,
            scrollRatio: 1,
            scrollTop: scrollContainerRef.current?.scrollTop || 0,
            completed: true,
            updatedAt: Date.now(),
          },
          true,
        );
      }
      if (targetNextBook && onOpenNextBook) onOpenNextBook(targetNextBook);
      else onClose();
    },
    [
      chapterIndex,
      chapters.length,
      completedRef,
      currentChapterMeta,
      onClose,
      onOpenNextBook,
      queueProgressSave,
      scrollContainerRef,
    ],
  );

  const overallPercent = useMemo(() => {
    if (chapters.length === 0) return 0;
    return Math.min(100, Math.round(((chapterIndex + chapterScrollRatio) / chapters.length) * 100));
  }, [chapterIndex, chapterScrollRatio, chapters.length]);

  const computeRemainingEstimate = useCallback(
    (wordCount: number) => formatRemainingChapterEstimate(wordCount, chapterScrollRatio),
    [chapterScrollRatio],
  );

  return {
    ctrl,
    chapterIndex,
    chapterScrollRatio,
    setChapterScrollRatio,
    paginatedStartRatio,
    setPaginatedStartRatio,
    searchTarget,
    restoreTargetRatioRef,
    suppressSaveRef,
    overallPercent,
    computeRemainingEstimate,
    goToChapter,
    goPrevChapter,
    goNextChapter,
    handlePaginatedRatioChange,
    handleJumpToSearchResult,
    completeBook,
  };
}
