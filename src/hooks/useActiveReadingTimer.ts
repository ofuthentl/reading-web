import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderEyeBreakMinutes } from '@/types';

const ACTIVE_IDLE_WINDOW_MS = 90_000;
const EYE_BREAK_HIDDEN_RESET_MS = 120_000;
const MAX_DELTA_SEC = 300;
const AUTO_CHECKPOINT_SEC = 60;

export interface UseActiveReadingTimerOptions {
  enabled: boolean;
  eyeBreakMinutes?: ReaderEyeBreakMinutes;
  onAutoCheckpoint: () => void;
  onKeepaliveFlush: () => void;
}

/**
 * Bộ đếm thời gian đọc thực tế ở phía Client (D-036 PA-1 + C13 Eye-Care Break):
 * - Chỉ cộng giây khi `document.visibilityState === 'visible'` VÀ người dùng có thao tác
 *   cuộn / chạm / gõ phím / di chuột trong vòng 90 giây gần nhất.
 * - Theo dõi thêm giây đọc liên tục cho Nhắc nghỉ mắt (tự đặt lại nếu ẩn tab >= 2 phút).
 */
export function useActiveReadingTimer({
  enabled,
  eyeBreakMinutes = 0,
  onAutoCheckpoint,
  onKeepaliveFlush,
}: UseActiveReadingTimerOptions) {
  const pendingSecondsRef = useRef(0);
  const totalActiveSecRef = useRef(0);
  const continuousBreakSecRef = useRef(0);
  const hiddenSinceRef = useRef<number | null>(null);
  const eyeBreakMinutesRef = useRef<ReaderEyeBreakMinutes>(eyeBreakMinutes);
  const lastInteractionAtRef = useRef<number>(Date.now());
  const lastPointerMoveMarkRef = useRef(0);
  const autoCheckpointRef = useRef(onAutoCheckpoint);
  const keepaliveFlushRef = useRef(onKeepaliveFlush);
  const [eyeBreakDue, setEyeBreakDue] = useState(false);

  eyeBreakMinutesRef.current = eyeBreakMinutes;
  autoCheckpointRef.current = onAutoCheckpoint;
  keepaliveFlushRef.current = onKeepaliveFlush;

  useEffect(() => {
    if (!eyeBreakMinutes) {
      continuousBreakSecRef.current = 0;
      setEyeBreakDue(false);
    } else if (continuousBreakSecRef.current < eyeBreakMinutes * 60) {
      setEyeBreakDue(false);
    }
  }, [eyeBreakMinutes]);

  const acknowledgeEyeBreak = useCallback(() => {
    continuousBreakSecRef.current = 0;
    setEyeBreakDue(false);
  }, []);

  const getTotalActiveSec = useCallback((): number => totalActiveSecRef.current, []);

  const consumeDeltaSec = useCallback((minSeconds = 1): number => {
    const available = Math.floor(pendingSecondsRef.current);
    if (available < minSeconds || available <= 0) return 0;
    const drained = Math.min(MAX_DELTA_SEC, available);
    pendingSecondsRef.current = Math.max(0, pendingSecondsRef.current - drained);
    return drained;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    lastInteractionAtRef.current = Date.now();

    const markInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };
    const markPointerMove = () => {
      const now = Date.now();
      if (now - lastPointerMoveMarkRef.current >= 2000) {
        lastPointerMoveMarkRef.current = now;
        lastInteractionAtRef.current = now;
      }
    };

    window.addEventListener('scroll', markInteraction, { capture: true, passive: true });
    window.addEventListener('wheel', markInteraction, { passive: true });
    window.addEventListener('pointerdown', markInteraction, { passive: true });
    window.addEventListener('pointermove', markPointerMove, { passive: true });
    window.addEventListener('touchstart', markInteraction, { passive: true });
    window.addEventListener('touchmove', markInteraction, { passive: true });
    window.addEventListener('keydown', markInteraction, { passive: true });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now();
        if (pendingSecondsRef.current >= 2) {
          keepaliveFlushRef.current();
        }
      } else {
        const now = Date.now();
        if (
          hiddenSinceRef.current !== null &&
          now - hiddenSinceRef.current >= EYE_BREAK_HIDDEN_RESET_MS
        ) {
          continuousBreakSecRef.current = 0;
          setEyeBreakDue(false);
        }
        hiddenSinceRef.current = null;
        lastInteractionAtRef.current = now;
      }
    };
    const onPageHide = () => {
      if (pendingSecondsRef.current >= 1) {
        keepaliveFlushRef.current();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastInteractionAtRef.current > ACTIVE_IDLE_WINDOW_MS) return;

      totalActiveSecRef.current += 1;
      pendingSecondsRef.current = Math.min(MAX_DELTA_SEC, pendingSecondsRef.current + 1);
      if (pendingSecondsRef.current >= AUTO_CHECKPOINT_SEC) {
        autoCheckpointRef.current();
      }

      const limitMin = eyeBreakMinutesRef.current;
      if (limitMin > 0) {
        continuousBreakSecRef.current += 1;
        if (continuousBreakSecRef.current >= limitMin * 60) {
          setEyeBreakDue((prev) => (prev ? prev : true));
        }
      }
    }, 1000);

    return () => {
      if (pendingSecondsRef.current >= 2) {
        keepaliveFlushRef.current();
      }
      window.clearInterval(intervalId);
      window.removeEventListener('scroll', markInteraction, true);
      window.removeEventListener('wheel', markInteraction);
      window.removeEventListener('pointerdown', markInteraction);
      window.removeEventListener('pointermove', markPointerMove);
      window.removeEventListener('touchstart', markInteraction);
      window.removeEventListener('touchmove', markInteraction);
      window.removeEventListener('keydown', markInteraction);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled]);

  return { consumeDeltaSec, getTotalActiveSec, eyeBreakDue, acknowledgeEyeBreak };
}
