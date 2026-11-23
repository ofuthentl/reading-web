import { useCallback, useEffect, useRef } from 'react';

const ACTIVE_IDLE_WINDOW_MS = 90_000;
const MAX_DELTA_SEC = 300;
const AUTO_CHECKPOINT_SEC = 60;

export interface UseActiveReadingTimerOptions {
  enabled: boolean;
  onAutoCheckpoint: () => void;
  onKeepaliveFlush: () => void;
}

/**
 * Bộ đếm thời gian đọc thực tế ở phía Client (D-036 PA-1):
 * - Chỉ cộng giây khi `document.visibilityState === 'visible'` VÀ người dùng có thao tác
 *   cuộn / chạm / gõ phím / di chuột trong vòng 90 giây gần nhất.
 * - Gửi ghép `readingDeltaSec` vào `PUT /api/progress/:bookId`, tự checkpoint nhẹ mỗi 60s
 *   đọc liên tục và flush `keepalive: true` ngay khi `pagehide` hoặc ẩn tab.
 */
export function useActiveReadingTimer({
  enabled,
  onAutoCheckpoint,
  onKeepaliveFlush,
}: UseActiveReadingTimerOptions) {
  const pendingSecondsRef = useRef(0);
  const lastInteractionAtRef = useRef<number>(Date.now());
  const lastPointerMoveMarkRef = useRef(0);
  const autoCheckpointRef = useRef(onAutoCheckpoint);
  const keepaliveFlushRef = useRef(onKeepaliveFlush);

  autoCheckpointRef.current = onAutoCheckpoint;
  keepaliveFlushRef.current = onKeepaliveFlush;

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
        if (pendingSecondsRef.current >= 2) {
          keepaliveFlushRef.current();
        }
      } else {
        lastInteractionAtRef.current = Date.now();
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

      pendingSecondsRef.current = Math.min(MAX_DELTA_SEC, pendingSecondsRef.current + 1);
      if (pendingSecondsRef.current >= AUTO_CHECKPOINT_SEC) {
        autoCheckpointRef.current();
      }
    }, 1000);

    return () => {
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

  return { consumeDeltaSec };
}
