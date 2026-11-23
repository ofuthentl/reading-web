import { useEffect, useState } from 'react';
import type { ReaderFont } from '@/types';
import {
  clearCanvasWidthCache,
  ensureReaderCanvasFontsLoaded,
} from '@/lib/guestCanvasLayout';

/**
 * Kích hoạt nạp webfont cục bộ cho trình đọc Canvas 2D và tăng phiên bản mỗi khi
 * `document.fonts` hoàn tất để xoá cache đo chữ & vẽ lại chính xác theo font mới.
 */
export function useReaderCanvasFontVersion(font: ReaderFont): number {
  const [fontVersion, setFontVersion] = useState(0);

  useEffect(() => {
    let active = true;
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
  }, [font]);

  return fontVersion;
}
