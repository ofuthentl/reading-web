import { useEffect, useState } from 'react';
import type { ReaderFont, ReaderFontWeight } from '@/types';
import {
  clearCanvasWidthCache,
  ensureReaderCanvasFontsLoaded,
} from '@/lib/guestCanvasLayout';

/**
 * Kích hoạt nạp webfont cục bộ cho trình đọc Canvas 2D và tăng phiên bản mỗi khi
 * `document.fonts` hoàn tất hoặc đổi font/độ đậm chữ để xoá cache đo chữ & vẽ lại chính xác.
 */
export function useReaderCanvasFontVersion(
  font: ReaderFont,
  fontWeight: ReaderFontWeight = 'normal',
): number {
  const [fontVersion, setFontVersion] = useState(0);

  useEffect(() => {
    let active = true;
    clearCanvasWidthCache();
    const triggerReflow = () => {
      if (!active) return;
      clearCanvasWidthCache();
      setFontVersion((v) => v + 1);
    };
    void ensureReaderCanvasFontsLoaded(font).then(triggerReflow);
    const fontSet = typeof document !== 'undefined' ? document.fonts : undefined;
    fontSet?.addEventListener('loadingdone', triggerReflow);
    return () => {
      active = false;
      fontSet?.removeEventListener('loadingdone', triggerReflow);
    };
  }, [font, fontWeight]);

  return fontVersion;
}
