import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Book,
  ReaderSettings,
  ReadingProgress,
  SaveProgressOptions,
} from '@/types';
import type { PaginatedStageHandle } from '@/components/ReaderPaginatedView';
import { useReaderController } from '@/hooks/useReaderController';
import {
  computeWeightedBookPercent,
  formatCombinedReadingEstimate,
} from '@/lib/readingEstimate';
import type { ReaderSearchJumpTarget } from '@/lib/readerSearchJump';
import {
  readLearnedWpm,
  recordReadingSpeedSample,
  subscribeLearnedWpm,
} from '@/lib/readingSpeedTracker';

export interface ReaderChapterItemMeta {
  id: string;
  title: string;
}

export interface UseReaderChapterProgressOptions {
  chapters: readonly ReaderChapterItemMeta[];
  chapterWeights?: readonly number[];
  initialProgress?: ReadingProgress;
  settings: ReaderSettings;
  isPaginated: boolean;
  blockCopyShortcuts?: boolean;
  timerEnabled?: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  paginatedRef: React.RefObject<PaginatedStageHandle | null>;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
  onSaveProgress: (progress: ReadingProgress, options?: SaveProgressOptions) => void;
  onSameChapterJump?: () => void;
  onOpenNextBook?: (nextBook: Book) => void;
  onClose: () => void;
}

export function useReaderChapterProgress({
  chapters,
  chapterWeights,
  initialProgress,
  settings,
  isPaginated,
  blockCopyShortcuts = false,
  timerEnabled = true,
  scrollContainerRef,
  paginatedRef,
  onUpdateSettings,
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
    initialProgress &&
    (!initialProgress.chapterId || initialProgress.chapterId === chapters[initialIdx]?.id)
      ? Math.min(1, Math.max(0, initialProgress.scrollRatio || 0))
      : 0;

  const [chapterIndex, setChapterIndex] = useState(initialIdx);
  const [chapterScrollRatio, setChapterScrollRatio] = useState(initialStartRatio);
  const [paginatedStartRatio, setPaginatedStartRatio] = useState(initialStartRatio);
  const [searchTarget, setSearchTarget] = useState<ReaderSearchJumpTarget | null>(null);

  const restoreTargetRatioRef = useRef<number | null>(
    initialProgress &&
      (!initialProgress.chapterId || initialProgress.chapterId === chapters[initialIdx]?.id)
      ? Math.min(1, Math.max(0, initialProgress.scrollRatio || 0))
      : null,
  );
  const suppressSaveRef = useRef(false);
  const completedRef = useRef(Boolean(initialProgress?.completed));
  const rereadCountRef = useRef(Math.max(0, Math.floor(initialProgress?.rereadCount ?? 0)));
  const goPrevRef = useRef<() => void>(() => undefined);
  const goNextRef = useRef<() => void>(() => undefined);

  const currentChapterMeta = chapters[chapterIndex];

  const effectiveWeights = useMemo<readonly number[]>(() => {
    if (chapterWeights && chapterWeights.length === chapters.length) {
      return chapterWeights;
    }
    return chapters.map(() => 1);
  }, [chapterWeights, chapters]);

  const computeBookPercent = useCallback(
    (idx: number, ratio: number, completed = false) =>
      computeWeightedBookPercent(effectiveWeights, idx, ratio, completed),
    [effectiveWeights],
  );

  const fallbackProgress = useMemo<ReadingProgress | null>(() => {
    if (!currentChapterMeta) return null;
    return {
      chapterId: currentChapterMeta.id,
      chapterIndex,
      chapterTitle: currentChapterMeta.title,
      totalChapters: chapters.length,
      scrollRatio: chapterScrollRatio,
      scrollTop: 0,
      completed: completedRef.current,
      bookPercent: computeBookPercent(chapterIndex, chapterScrollRatio, completedRef.current),
      ...(rereadCountRef.current > 0 ? { rereadCount: rereadCountRef.current } : {}),
      updatedAt: Date.now(),
    };
  }, [
    chapterIndex,
    chapterScrollRatio,
    chapters.length,
    computeBookPercent,
    currentChapterMeta,
  ]);

  const ctrl = useReaderController({
    initialCompleted: Boolean(initialProgress?.completed),
    completedRef,
    settings,
    blockCopyShortcuts,
    timerEnabled,
    fallbackProgress,
    onSaveProgress,
    onPrev: () => goPrevRef.current(),
    onNext: () => goNextRef.current(),
  });

  const {
    getTotalActiveSec,
    lastScrollTopRef,
    queueProgressSave,
    setImmersiveHidden,
    setTocOpen,
  } = ctrl;

  const [learnedWpm, setLearnedWpm] = useState(() => readLearnedWpm().wpm);
  const wpmAnchorRef = useRef<{
    chapterId: string;
    chapterIdx: number;
    ratio: number;
    lastRatio: number;
    activeSec: number;
    words: number;
  } | null>(null);
  const manualSeekRef = useRef(false);

  useEffect(() => {
    return subscribeLearnedWpm(() => {
      setLearnedWpm(readLearnedWpm().wpm);
    });
  }, []);

  const syncChapterWords = useCallback(
    (words: number) => {
      if (!currentChapterMeta || words <= 0) return;
      const nowSec = getTotalActiveSec();
      const prev = wpmAnchorRef.current;

      if (!prev || prev.chapterId !== currentChapterMeta.id) {
        // Khi vừa đọc hết chương trước chuyển tuần tự sang chương kế tiếp -> ghi mẫu phần cuối chương trước
        if (
          prev &&
          !manualSeekRef.current &&
          chapterIndex === prev.chapterIdx + 1 &&
          prev.words >= 80
        ) {
          const endRatio = Math.max(prev.lastRatio, 0.96);
          const deltaRatio = endRatio - prev.ratio;
          if (deltaRatio >= 0.12) {
            recordReadingSpeedSample(
              Math.round(deltaRatio * prev.words),
              nowSec - prev.activeSec,
            );
          }
        }
        manualSeekRef.current = false;
        wpmAnchorRef.current = {
          chapterId: currentChapterMeta.id,
          chapterIdx: chapterIndex,
          ratio: chapterScrollRatio,
          lastRatio: chapterScrollRatio,
          activeSec: nowSec,
          words,
        };
        return;
      }

      prev.words = words;
      if (manualSeekRef.current || chapterScrollRatio < prev.ratio - 0.04) {
        manualSeekRef.current = false;
        prev.ratio = chapterScrollRatio;
        prev.lastRatio = chapterScrollRatio;
        prev.activeSec = nowSec;
        return;
      }

      prev.lastRatio = chapterScrollRatio;
      const deltaRatio = chapterScrollRatio - prev.ratio;
      if (deltaRatio >= 0.12) {
        recordReadingSpeedSample(
          Math.round(deltaRatio * words),
          nowSec - prev.activeSec,
        );
        prev.ratio = chapterScrollRatio;
        prev.activeSec = nowSec;
      }
    },
    [chapterIndex, chapterScrollRatio, currentChapterMeta, getTotalActiveSec],
  );

  const goToChapter = useCallback(
    (nextIndex: number, targetRatio = 0, skipSave = false) => {
      const clamped = Math.max(0, Math.min(nextIndex, chapters.length - 1));
      const target = chapters[clamped];
      if (!target) return;

      const safeRatio = Math.min(1, Math.max(0, targetRatio));
      manualSeekRef.current = !(clamped === chapterIndex + 1 && safeRatio === 0);
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

      if (!skipSave) {
        queueProgressSave(
          {
            chapterId: target.id,
            chapterIndex: clamped,
            chapterTitle: target.title,
            totalChapters: chapters.length,
            scrollRatio: safeRatio,
            scrollTop: 0,
            completed: completedRef.current,
            bookPercent: computeBookPercent(clamped, safeRatio, completedRef.current),
            ...(rereadCountRef.current > 0 ? { rereadCount: rereadCountRef.current } : {}),
            updatedAt: Date.now(),
          },
          true,
        );
      }
    },
    [
      chapterIndex,
      chapters,
      completedRef,
      computeBookPercent,
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
          bookPercent: computeBookPercent(chapterIndex, ratio, completedRef.current),
          ...(rereadCountRef.current > 0 ? { rereadCount: rereadCountRef.current } : {}),
          updatedAt: Date.now(),
        },
        reachedEnd,
      );
    },
    [
      chapterIndex,
      chapters.length,
      completedRef,
      computeBookPercent,
      currentChapterMeta,
      queueProgressSave,
    ],
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
            bookPercent: 100,
            ...(rereadCountRef.current > 0 ? { rereadCount: rereadCountRef.current } : {}),
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

  const restartBookReread = useCallback(() => {
    const first = chapters[0];
    if (!first) return;
    rereadCountRef.current = Math.min(999, rereadCountRef.current + 1);
    completedRef.current = false;
    goToChapter(0, 0, true);
    queueProgressSave(
      {
        chapterId: first.id,
        chapterIndex: 0,
        chapterTitle: first.title,
        totalChapters: chapters.length,
        scrollRatio: 0,
        scrollTop: 0,
        completed: false,
        bookPercent: 0,
        rereadCount: rereadCountRef.current,
        updatedAt: Date.now(),
      },
      true,
    );
  }, [chapters, completedRef, goToChapter, queueProgressSave]);

  const overallPercent = useMemo(() => {
    if (chapters.length === 0) return 0;
    return Math.min(100, Math.round(computeBookPercent(chapterIndex, chapterScrollRatio, false)));
  }, [chapterIndex, chapterScrollRatio, chapters.length, computeBookPercent]);

  const computeRemainingEstimate = useCallback(
    (chapterWords: number, laterBookWords = 0) =>
      formatCombinedReadingEstimate({
        chapterWords,
        laterBookWords,
        isLastChapter: chapterIndex >= chapters.length - 1,
        scrollRatio: chapterScrollRatio,
        wpm: learnedWpm,
      }),
    [chapterIndex, chapterScrollRatio, chapters.length, learnedWpm],
  );

  const chapterScrollRatioRef = useRef(chapterScrollRatio);
  chapterScrollRatioRef.current = chapterScrollRatio;

  const handleUpdateSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      if (patch.layoutMode && patch.layoutMode !== settings.layoutMode) {
        if (patch.layoutMode === 'paginated') setPaginatedStartRatio(chapterScrollRatioRef.current);
        else restoreTargetRatioRef.current = chapterScrollRatioRef.current;
      } else if (
        !isPaginated &&
        (patch.width ||
          patch.fontSizePx ||
          patch.lineHeight ||
          patch.font ||
          patch.fontWeight ||
          patch.textAlign ||
          patch.paragraphIndent !== undefined ||
          patch.paragraphSpacing)
      ) {
        restoreTargetRatioRef.current = chapterScrollRatioRef.current;
      }
      onUpdateSettings(patch);
    },
    [isPaginated, onUpdateSettings, settings.layoutMode],
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
    computeBookPercent,
    syncChapterWords,
    computeRemainingEstimate,
    handleUpdateSettings,
    goToChapter,
    goPrevChapter,
    goNextChapter,
    handlePaginatedRatioChange,
    handleJumpToSearchResult,
    completeBook,
    restartBookReread,
  };
}
