import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderSettings, ReadingProgress, SaveProgressOptions } from '@/types';
import type { ReaderLightboxTarget } from '@/components/ReaderImageLightbox';
import type { ReaderDrawerTab } from '@/components/ReaderTocDrawer';
import { useActiveReadingTimer } from '@/hooks/useActiveReadingTimer';

interface UseReaderControllerOptions {
  initialCompleted: boolean;
  settings: ReaderSettings;
  blockCopyShortcuts?: boolean;
  timerEnabled?: boolean;
  fallbackProgress?: ReadingProgress | null;
  onSaveProgress: (progress: ReadingProgress, options?: SaveProgressOptions) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Điều phối dùng chung cho cả `ReaderView` (`owner`) và `GuestCanvasReader` (`guest`, D-029/D-036):
 * quản lý hàng đợi lưu tiến độ đọc + thời gian đọc chủ động (debounce 600ms, checkpoint 60s,
 * flush `keepalive` khi `pagehide`/đóng sách), ngăn kéo 3 tab, chế độ tự ẩn thanh công cụ
 * (`Immersive Mode`), Lightbox ảnh và phím tắt `M` / `B` / `F` / `←` / `→`.
 */
export function useReaderController({
  initialCompleted,
  settings,
  blockCopyShortcuts = false,
  timerEnabled = true,
  fallbackProgress = null,
  onSaveProgress,
  onPrev,
  onNext,
}: UseReaderControllerOptions) {
  const [tocOpen, setTocOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<ReaderDrawerTab>('toc');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [immersiveHidden, setImmersiveHidden] = useState(false);
  const [lightboxTarget, setLightboxTarget] = useState<ReaderLightboxTarget | null>(null);

  const lastScrollTopRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<ReadingProgress | null>(null);
  const fallbackProgressRef = useRef<ReadingProgress | null>(fallbackProgress);
  const lastSentProgressRef = useRef<ReadingProgress | null>(fallbackProgress);
  const completedRef = useRef(initialCompleted);

  fallbackProgressRef.current = fallbackProgress;
  if (fallbackProgress && !lastSentProgressRef.current) {
    lastSentProgressRef.current = fallbackProgress;
  }

  useEffect(() => {
    completedRef.current = initialCompleted;
  }, [initialCompleted]);

  const flushRef = useRef<(opts?: { forceTimeFlush?: boolean; keepalive?: boolean }) => void>(
    () => undefined,
  );

  const { consumeDeltaSec, getTotalActiveSec, eyeBreakDue, acknowledgeEyeBreak } =
    useActiveReadingTimer({
      enabled: timerEnabled && !lightboxTarget,
      eyeBreakMinutes: settings.eyeBreakMinutes,
      onAutoCheckpoint: () => flushRef.current({ forceTimeFlush: true }),
      onKeepaliveFlush: () => flushRef.current({ forceTimeFlush: true, keepalive: true }),
    });

  const flushProgress = useCallback(
    (opts?: { forceTimeFlush?: boolean; keepalive?: boolean }) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const minSec =
        pendingProgressRef.current || opts?.forceTimeFlush || opts?.keepalive ? 1 : 5;
      const deltaSec = consumeDeltaSec(minSec);
      const target =
        pendingProgressRef.current ??
        (deltaSec > 0 ? (fallbackProgressRef.current ?? lastSentProgressRef.current) : null);

      if (!target) return;
      pendingProgressRef.current = null;
      lastSentProgressRef.current = target;

      const saveOpts: SaveProgressOptions | undefined =
        deltaSec > 0 || opts?.keepalive
          ? {
              ...(deltaSec > 0 ? { readingDeltaSec: deltaSec } : {}),
              ...(opts?.keepalive ? { keepalive: true } : {}),
            }
          : undefined;
      onSaveProgress(target, saveOpts);
    },
    [consumeDeltaSec, onSaveProgress],
  );

  flushRef.current = flushProgress;

  const queueProgressSave = useCallback(
    (progress: ReadingProgress, immediate = false) => {
      pendingProgressRef.current = progress;
      lastSentProgressRef.current = progress;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (immediate) flushProgress({ forceTimeFlush: true });
      else saveTimerRef.current = setTimeout(() => flushProgress(), 600);
    },
    [flushProgress],
  );

  useEffect(
    () => () => flushProgress({ forceTimeFlush: true, keepalive: true }),
    [flushProgress],
  );

  const openDrawerTab = useCallback((tab: ReaderDrawerTab) => {
    setSettingsOpen(false);
    setImmersiveHidden(false);
    setDrawerTab(tab);
    setTocOpen(true);
  }, []);

  const updateImmersiveOnScroll = useCallback((currentTop: number, suppressed: boolean) => {
    const delta = currentTop - lastScrollTopRef.current;
    if (!suppressed) {
      if (delta > 24 && currentTop > 120) {
        setImmersiveHidden(true);
        setSettingsOpen(false);
      } else if (delta < -18 || currentTop < 48) {
        setImmersiveHidden(false);
      }
    }
    lastScrollTopRef.current = currentTop;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (blockCopyShortcuts && (event.ctrlKey || event.metaKey)) {
        const lowerKey = event.key.toLowerCase();
        // Cho phép khách Copy/Cut bên trong ô nhập bình luận/ghi chú, vẫn chặn Save/Print/ViewSource và Copy ngoài văn bản
        if (['s', 'p', 'u'].includes(lowerKey) || (!isTyping && ['c', 'x'].includes(lowerKey))) {
          event.preventDefault();
          return;
        }
      }

      if (event.key === 'Escape') {
        if (lightboxTarget) setLightboxTarget(null);
        else if (tocOpen) setTocOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (immersiveHidden) setImmersiveHidden(false);
        return;
      }

      if (isTyping || lightboxTarget) return;
      const hasOpenDialog =
        typeof document !== 'undefined' && Boolean(document.querySelector('[role="dialog"]'));
      if (hasOpenDialog) return;

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'm') {
          event.preventDefault();
          if (tocOpen && drawerTab === 'toc') setTocOpen(false);
          else openDrawerTab('toc');
          return;
        }
        if (key === 'b') {
          event.preventDefault();
          if (tocOpen && drawerTab === 'bookmarks') setTocOpen(false);
          else openDrawerTab('bookmarks');
          return;
        }
        if (key === 'f') {
          event.preventDefault();
          setSettingsOpen(false);
          setImmersiveHidden((prev) => !prev);
          return;
        }
      }

      if (!settings.sideTapNavigation || tocOpen || settingsOpen) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft') onPrev();
      else if (event.key === 'ArrowRight') onNext();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    blockCopyShortcuts,
    drawerTab,
    immersiveHidden,
    lightboxTarget,
    onNext,
    onPrev,
    openDrawerTab,
    settings.sideTapNavigation,
    settingsOpen,
    tocOpen,
  ]);

  return {
    tocOpen,
    setTocOpen,
    drawerTab,
    settingsOpen,
    setSettingsOpen,
    immersiveHidden,
    setImmersiveHidden,
    lightboxTarget,
    setLightboxTarget,
    eyeBreakDue,
    acknowledgeEyeBreak,
    getTotalActiveSec,
    lastScrollTopRef,
    completedRef,
    flushProgress,
    queueProgressSave,
    openDrawerTab,
    updateImmersiveOnScroll,
  };
}
