import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderSettings, ReadingProgress } from '@/types';
import type { ReaderLightboxTarget } from '@/components/ReaderImageLightbox';
import type { ReaderDrawerTab } from '@/components/ReaderTocDrawer';

interface UseReaderControllerOptions {
  initialCompleted: boolean;
  isPdf: boolean;
  settings: ReaderSettings;
  blockCopyShortcuts?: boolean;
  onSaveProgress: (progress: ReadingProgress) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Điều phối dùng chung cho cả `ReaderView` (`owner`) và `GuestCanvasReader` (`guest`, D-029):
 * quản lý hàng đợi lưu tiến độ đọc (debounce 600ms + flush khi đóng), ngăn kéo 3 tab,
 * chế độ tự ẩn thanh công cụ (`Immersive Mode`), Lightbox ảnh và phím tắt `M` / `B` / `F` / `←` / `→`.
 */
export function useReaderController({
  initialCompleted,
  isPdf,
  settings,
  blockCopyShortcuts = false,
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
  const completedRef = useRef(initialCompleted);

  const flushProgress = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingProgressRef.current) {
      onSaveProgress(pendingProgressRef.current);
      pendingProgressRef.current = null;
    }
  }, [onSaveProgress]);

  const queueProgressSave = useCallback(
    (progress: ReadingProgress, immediate = false) => {
      pendingProgressRef.current = progress;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (immediate) flushProgress();
      else saveTimerRef.current = setTimeout(flushProgress, 600);
    },
    [flushProgress],
  );

  useEffect(() => () => flushProgress(), [flushProgress]);

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
      if (
        blockCopyShortcuts &&
        (event.ctrlKey || event.metaKey) &&
        ['s', 'p', 'c', 'u'].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.key === 'Escape') {
        if (lightboxTarget) setLightboxTarget(null);
        else if (tocOpen) setTocOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (immersiveHidden) setImmersiveHidden(false);
        return;
      }

      if (isTyping || lightboxTarget) return;
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
        if (key === 'f' && !isPdf) {
          event.preventDefault();
          setSettingsOpen(false);
          setImmersiveHidden((prev) => !prev);
          return;
        }
      }

      if (!settings.sideTapNavigation) return;
      if (event.key === 'ArrowLeft') onPrev();
      else if (event.key === 'ArrowRight') onNext();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    blockCopyShortcuts,
    drawerTab,
    immersiveHidden,
    isPdf,
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
    lastScrollTopRef,
    completedRef,
    flushProgress,
    queueProgressSave,
    openDrawerTab,
    updateImmersiveOnScroll,
  };
}
