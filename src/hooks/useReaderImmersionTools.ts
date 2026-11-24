import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ReaderSoundscapeEngine,
  type ReaderSoundscapeId,
  type SleepTimerMinutes,
  createReaderSoundscapeEngine,
  loadReaderSoundPrefs,
  saveReaderSoundPrefs,
} from '@/lib/readerSoundscapes';

/**
 * Hook quản lý vòng đời âm thanh trình đọc + hẹn giờ tắt fade-out + tự động cuộn rảnh tay:
 * - Luôn khởi tạo ở trạng thái TẮT (`preset = 'off'`, `autoScrollActive = false`) khi mở sách (`QĐ-2 = 2A`).
 * - Đóng sạch `AudioContext.close()` và huỷ mọi timer/RAF khi rời trình đọc.
 */

const AUTO_SCROLL_SPEED_KEY = 'ofu-reader-autoscroll-speed-v1';

function loadAutoScrollSpeed(): number {
  try {
    const raw = Number(localStorage.getItem(AUTO_SCROLL_SPEED_KEY));
    if (Number.isFinite(raw) && raw >= 1 && raw <= 10) return Math.round(raw);
    return 3;
  } catch {
    return 3;
  }
}

function saveAutoScrollSpeed(speed: number): void {
  try {
    localStorage.setItem(AUTO_SCROLL_SPEED_KEY, String(speed));
  } catch {
    // Ignore storage quota errors
  }
}

interface UseReaderImmersionToolsOptions {
  isPaginated: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  overlayOpen: boolean;
  immersiveHidden?: boolean;
  chapterId: string;
}

export function useReaderImmersionTools({
  isPaginated,
  scrollContainerRef,
  overlayOpen,
  immersiveHidden = false,
  chapterId,
}: UseReaderImmersionToolsOptions) {
  const initialSoundPrefs = useRef(loadReaderSoundPrefs());
  const engineRef = useRef<ReaderSoundscapeEngine | null>(null);

  // Soundscapes — mặc định TẮT khi mở sách (QĐ-2 = 2A)
  const [soundOpen, setSoundOpen] = useState(false);
  const [preset, setPresetState] = useState<ReaderSoundscapeId>('off');
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(initialSoundPrefs.current.volume);
  const [pageTurnSound, setPageTurnSoundState] = useState(initialSoundPrefs.current.pageTurnSound);
  const [sleepMinutes, setSleepMinutesState] = useState<SleepTimerMinutes>(0);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const sleepDeadlineRef = useRef<number | null>(null);

  // Auto-scroll — mặc định TẮT khi mở sách (QĐ-2 = 2A)
  const [autoScrollOpen, setAutoScrollOpen] = useState(false);
  const autoScrollOpenRef = useRef(false);
  autoScrollOpenRef.current = autoScrollOpen;
  const [autoScrollPlaying, setAutoScrollPlaying] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeedState] = useState(loadAutoScrollSpeed);

  const ensureEngine = useCallback((): ReaderSoundscapeEngine => {
    if (!engineRef.current) {
      engineRef.current = createReaderSoundscapeEngine({
        onPlaybackError: (msg) => {
          setPresetState('off');
          sleepDeadlineRef.current = null;
          setSleepRemainingSec(null);
          setPlaybackError(msg);
        },
      });
      engineRef.current.setVolume(volume);
    }
    return engineRef.current;
  }, [volume]);

  useEffect(() => {
    const onVis = () => {
      engineRef.current?.setDocumentHidden(document.visibilityState === 'hidden');
      if (document.visibilityState === 'hidden') {
        setAutoScrollPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const setPreset = useCallback(
    (next: ReaderSoundscapeId) => {
      setPlaybackError(null);
      setPresetState(next);
      const eng = ensureEngine();
      eng.setPreset(next);
      if (next === 'off') {
        sleepDeadlineRef.current = null;
        setSleepRemainingSec(null);
      } else if (sleepMinutes > 0) {
        sleepDeadlineRef.current = Date.now() + sleepMinutes * 60_000;
        setSleepRemainingSec(sleepMinutes * 60);
      }
    },
    [ensureEngine, sleepMinutes],
  );

  const setVolume = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0.05, Math.round(next * 100) / 100));
    setVolumeState(clamped);
    engineRef.current?.setVolume(clamped);
    saveReaderSoundPrefs({ volume: clamped, pageTurnSound });
  }, [pageTurnSound]);

  const setPageTurnSound = useCallback((enabled: boolean) => {
    setPageTurnSoundState(enabled);
    saveReaderSoundPrefs({ volume, pageTurnSound: enabled });
  }, [volume]);

  const setSleepMinutes = useCallback((mins: SleepTimerMinutes) => {
    setSleepMinutesState(mins);
    if (mins === 0 || preset === 'off') {
      sleepDeadlineRef.current = null;
      setSleepRemainingSec(null);
      engineRef.current?.setFadeMultiplier(1);
    } else {
      sleepDeadlineRef.current = Date.now() + mins * 60_000;
      setSleepRemainingSec(mins * 60);
      engineRef.current?.setFadeMultiplier(1);
    }
  }, [preset]);

  useEffect(() => {
    if (preset === 'off' || sleepMinutes === 0) return;
    const timer = window.setInterval(() => {
      const deadline = sleepDeadlineRef.current;
      if (!deadline) return;
      const remMs = deadline - Date.now();
      if (remMs <= 0) {
        sleepDeadlineRef.current = null;
        setSleepRemainingSec(null);
        setSleepMinutesState(0);
        setPresetState('off');
        engineRef.current?.setPreset('off');
        return;
      }
      setSleepRemainingSec(Math.ceil(remMs / 1000));
      // Fade-out mượt trong 12 giây cuối
      if (remMs <= 12_000) {
        engineRef.current?.setFadeMultiplier(Math.max(0.02, remMs / 12_000));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [preset, sleepMinutes]);

  const triggerPageTurnSound = useCallback(() => {
    if (!pageTurnSound) return;
    ensureEngine().playPageTurn(volume);
  }, [ensureEngine, pageTurnSound, volume]);

  // Dừng tự cuộn khi chuyển sang Lật trang, mở hộp thoại hoặc sang chương mới
  useEffect(() => {
    if (isPaginated) {
      setAutoScrollPlaying(false);
      setAutoScrollOpen(false);
    }
  }, [isPaginated]);

  useEffect(() => {
    if (overlayOpen || soundOpen) {
      setAutoScrollPlaying(false);
    }
  }, [overlayOpen, soundOpen]);

  // Đóng Popover âm thanh khi Header tự ẩn (Immersive Mode) hoặc bấm Esc
  useEffect(() => {
    if (immersiveHidden) {
      setSoundOpen(false);
    }
  }, [immersiveHidden]);

  useEffect(() => {
    if (!soundOpen) {
      setPlaybackError(null);
      return;
    }
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setSoundOpen(false);
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [soundOpen]);

  useEffect(() => {
    setAutoScrollPlaying(false);
  }, [chapterId]);

  const setAutoScrollSpeed = useCallback((nextSpeed: number) => {
    const clamped = Math.min(10, Math.max(1, Math.round(nextSpeed)));
    setAutoScrollSpeedState(clamped);
    saveAutoScrollSpeed(clamped);
  }, []);

  const toggleAutoScrollBar = useCallback(() => {
    if (isPaginated) return;
    const next = !autoScrollOpenRef.current;
    autoScrollOpenRef.current = next;
    setAutoScrollOpen(next);
    setAutoScrollPlaying(next);
  }, [isPaginated]);

  useEffect(() => {
    if (!autoScrollPlaying || isPaginated) return;
    const targetEl = scrollContainerRef.current;
    if (!targetEl) {
      setAutoScrollPlaying(false);
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();
    let carry = 0;
    let touchActive = false;
    let yieldUntil = 0;

    const onTouchStart = () => {
      touchActive = true;
      carry = 0;
    };
    const onTouchRelease = () => {
      touchActive = false;
      yieldUntil = performance.now() + 750;
      carry = 0;
    };
    const onWheel = () => {
      yieldUntil = performance.now() + 750;
      carry = 0;
    };

    targetEl.addEventListener('touchstart', onTouchStart, { passive: true });
    targetEl.addEventListener('touchend', onTouchRelease, { passive: true });
    targetEl.addEventListener('touchcancel', onTouchRelease, { passive: true });
    targetEl.addEventListener('wheel', onWheel, { passive: true });

    const tick = (now: number) => {
      const el = scrollContainerRef.current;
      if (!el) {
        setAutoScrollPlaying(false);
        return;
      }
      if (touchActive || now < yieldUntil) {
        lastTs = now;
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const dtSec = Math.min(0.08, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;
      const pxPerSec = 10 + autoScrollSpeed * 9.5; // 19.5 px/s .. 105 px/s
      carry += pxPerSec * dtSec;
      const wholePx = Math.floor(carry);
      if (wholePx >= 1) {
        carry -= wholePx;
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        if (el.scrollTop >= maxScroll - 1) {
          setAutoScrollPlaying(false);
          return;
        }
        el.scrollTop = Math.min(maxScroll, el.scrollTop + wholePx);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      targetEl.removeEventListener('touchstart', onTouchStart);
      targetEl.removeEventListener('touchend', onTouchRelease);
      targetEl.removeEventListener('touchcancel', onTouchRelease);
      targetEl.removeEventListener('wheel', onWheel);
    };
  }, [autoScrollPlaying, autoScrollSpeed, isPaginated, scrollContainerRef]);

  // Phím Space tạm dừng / tiếp tục khi thanh Tự cuộn đang mở
  useEffect(() => {
    if (!autoScrollOpen || isPaginated) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      event.preventDefault();
      setAutoScrollPlaying((v) => !v);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [autoScrollOpen, isPaginated]);

  return {
    soundOpen,
    setSoundOpen,
    preset,
    setPreset,
    playbackError,
    volume,
    setVolume,
    pageTurnSound,
    setPageTurnSound,
    sleepMinutes,
    setSleepMinutes,
    sleepRemainingSec,
    triggerPageTurnSound,
    autoScrollOpen,
    setAutoScrollOpen,
    autoScrollPlaying,
    setAutoScrollPlaying,
    autoScrollSpeed,
    setAutoScrollSpeed,
    toggleAutoScrollBar,
  };
}
