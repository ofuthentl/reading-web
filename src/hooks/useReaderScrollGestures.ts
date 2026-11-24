import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReaderSoundTopBarModel } from '@/components/ReaderTopBar';
import type { useReaderImmersionTools } from '@/hooks/useReaderImmersionTools';

/**
 * Các hook cử chỉ & điều khiển thanh âm thanh trình đọc (tách khỏi `.tsx` để tuân thủ `react-refresh/only-export-components`):
 * 1. `useMobileLeftEdgeDimGesture`: vuốt dọc sát mép trái `24px` trên Mobile chỉnh `nightDimPercent` (`0..50%`).
 * 2. `usePullToNextChapter`: chạm đáy chương kéo thêm 1 nhịp chuyển sang chương kế tiếp.
 * 3. `useReaderSoundBarModel`: chuẩn hoá model điều khiển `ReaderSoundscapePopover` trên `ReaderTopBar`.
 */

export function useMobileLeftEdgeDimGesture(
  nightDimPercent: number,
  onUpdateDim: (nextPercent: number) => void,
) {
  const [hudPercent, setHudPercent] = useState<number | null>(null);
  const dimRef = useRef(nightDimPercent);
  dimRef.current = nightDimPercent;
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let gesture: { startX: number; startY: number; baseDim: number; active: boolean } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.getSelection()?.toString()) {
        gesture = null;
        return;
      }
      const t = e.touches[0];
      if (!t || t.clientX > 24 || window.innerWidth >= 1024) {
        gesture = null;
        return;
      }
      if ((e.target as HTMLElement | null)?.closest('button, input, a, [role="dialog"]')) {
        gesture = null;
        return;
      }
      gesture = { startX: t.clientX, startY: t.clientY, baseDim: dimRef.current, active: false };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!gesture || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - gesture.startX;
      const dy = t.clientY - gesture.startY;
      if (!gesture.active) {
        if (Math.abs(dx) > 14) {
          gesture = null;
          return;
        }
        if (Math.abs(dy) < 12) return;
        gesture.active = true;
      }
      if (e.cancelable) e.preventDefault();
      // Vuốt xuống tăng độ tối dịu mắt (0..50%), vuốt lên giảm độ tối
      const deltaPercent = Math.round(dy / 4.5);
      const next = Math.min(50, Math.max(0, gesture.baseDim + deltaPercent));
      if (next !== dimRef.current) {
        onUpdateDim(next);
      }
      setHudPercent(next);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };

    const finishGesture = () => {
      if (gesture?.active) {
        if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => setHudPercent(null), 850);
      }
      gesture = null;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', finishGesture, { passive: true });
    window.addEventListener('touchcancel', finishGesture, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', finishGesture);
      window.removeEventListener('touchcancel', finishGesture);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, [onUpdateDim]);

  return hudPercent;
}

const PULL_THRESHOLD_PX = 76;

export function usePullToNextChapter(options: {
  enabled: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  onAdvanceChapter: () => void;
}) {
  const { enabled, scrollContainerRef, onAdvanceChapter } = options;
  const [pullProgress, setPullProgress] = useState(0);
  const advanceRef = useRef(onAdvanceChapter);
  advanceRef.current = onAdvanceChapter;

  useEffect(() => {
    if (!enabled) {
      setPullProgress(0);
      return;
    }
    const el = scrollContainerRef.current;
    if (!el) return;

    let startAtBottomY: number | null = null;
    let currentProgress = 0;
    let wheelAccum = 0;
    let bottomSettledAt = 0;
    let wheelResetTimer: number | null = null;

    const isAtBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 6;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1 && isAtBottom()) {
        startAtBottomY = e.touches[0].clientY;
        currentProgress = 0;
      } else {
        startAtBottomY = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startAtBottomY === null || e.touches.length !== 1) return;
      if (!isAtBottom()) {
        startAtBottomY = null;
        currentProgress = 0;
        setPullProgress(0);
        return;
      }
      const pullDy = startAtBottomY - e.touches[0].clientY;
      if (pullDy <= 6) {
        currentProgress = 0;
        setPullProgress(0);
        return;
      }
      currentProgress = Math.min(1, (pullDy - 6) / PULL_THRESHOLD_PX);
      setPullProgress(currentProgress);
    };

    const onTouchEnd = () => {
      const triggered = currentProgress >= 1;
      startAtBottomY = null;
      currentProgress = 0;
      setPullProgress(0);
      if (triggered) advanceRef.current();
    };

    const onWheel = (e: WheelEvent) => {
      if (!isAtBottom()) {
        bottomSettledAt = 0;
        wheelAccum = 0;
        if (currentProgress > 0) {
          currentProgress = 0;
          setPullProgress(0);
        }
        return;
      }
      const now = Date.now();
      if (bottomSettledAt === 0) {
        bottomSettledAt = now;
        return;
      }
      if (now - bottomSettledAt < 380 || e.deltaY <= 0) {
        if (e.deltaY < 0) {
          wheelAccum = 0;
          currentProgress = 0;
          setPullProgress(0);
        }
        return;
      }
      wheelAccum += Math.min(48, e.deltaY * 0.45);
      const prog = Math.min(1, wheelAccum / 135);
      currentProgress = prog;
      setPullProgress(prog);

      if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer);
      if (prog >= 1) {
        wheelAccum = 0;
        bottomSettledAt = 0;
        currentProgress = 0;
        setPullProgress(0);
        advanceRef.current();
      } else {
        wheelResetTimer = window.setTimeout(() => {
          wheelAccum = 0;
          currentProgress = 0;
          setPullProgress(0);
        }, 550);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
      if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer);
    };
  }, [enabled, scrollContainerRef]);

  return pullProgress;
}

export type ReaderImmersionState = ReturnType<typeof useReaderImmersionTools>;

export function useReaderSoundBarModel(
  immersion: ReaderImmersionState,
  closeOthers: () => void,
): ReaderSoundTopBarModel {
  const {
    soundOpen, setSoundOpen, preset, setPreset, volume, setVolume,
    pageTurnSound, setPageTurnSound, sleepMinutes, setSleepMinutes, sleepRemainingSec,
  } = immersion;
  return useMemo(
    () => ({
      open: soundOpen,
      preset,
      volume,
      pageTurnSound,
      sleepMinutes,
      sleepRemainingSec,
      onToggleOpen: () => {
        closeOthers();
        setSoundOpen((v) => !v);
      },
      onClose: () => setSoundOpen(false),
      onSelectPreset: setPreset,
      onChangeVolume: setVolume,
      onTogglePageTurnSound: setPageTurnSound,
      onSelectSleepMinutes: setSleepMinutes,
    }),
    [
      closeOthers, pageTurnSound, preset, setPageTurnSound, setPreset,
      setSleepMinutes, setSoundOpen, setVolume, sleepMinutes, sleepRemainingSec, soundOpen, volume,
    ],
  );
}
