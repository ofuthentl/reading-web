import { useEffect } from 'react';

let activeLockCount = 0;
let savedOverflow = '';

/**
 * Khoá cuộn nền `document.body` có đếm tham chiếu (hỗ trợ modal lồng nhau như
 * ReadingStatsModal → QuoteVaultModal mà không mở khoá sớm khi đóng lớp con).
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;
    if (activeLockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeLockCount += 1;

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount === 0) {
        document.body.style.overflow = savedOverflow;
      }
    };
  }, [locked]);
}
