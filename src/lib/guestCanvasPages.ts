import type { ReaderFont, ReaderTheme } from '@/types';
import type { CanvasLayoutItem, ChapterCanvasLayout } from '@/lib/guestCanvasLayout';
import { paintGuestViewportCanvas } from '@/lib/guestCanvasPaint';

export interface CanvasColumnPage {
  startY: number;
  endY: number;
  items: CanvasLayoutItem[];
}

export interface CanvasImageHitRect {
  x: number;
  y: number;
  width: number;
  height: number;
  mediaIndex: number;
  alt?: string;
}

/**
 * Chia danh sách `layout.items` thành các trang cột vừa khít chiều cao `pageHeight`
 * mà không cắt ngang dòng chữ hoặc ảnh minh hoạ (D-011 + D-028).
 */
export function paginateCanvasLayoutItems(
  items: readonly CanvasLayoutItem[],
  pageHeight: number,
): CanvasColumnPage[] {
  const safeHeight = Math.max(220, pageHeight);
  if (items.length === 0) {
    return [{ startY: 0, endY: safeHeight, items: [] }];
  }

  const pages: CanvasColumnPage[] = [];
  let currentItems: CanvasLayoutItem[] = [];
  let pageStartY = items[0].y;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const relBottom = item.y + item.height - pageStartY;

    if (currentItems.length > 0 && relBottom > safeHeight) {
      const prev = currentItems[currentItems.length - 1];
      pages.push({
        startY: pageStartY,
        endY: prev.y + prev.height,
        items: currentItems,
      });
      currentItems = [item];
      pageStartY = item.y;
    } else {
      currentItems.push(item);
    }
  }

  if (currentItems.length > 0) {
    const last = currentItems[currentItems.length - 1];
    pages.push({
      startY: pageStartY,
      endY: last.y + last.height,
      items: currentItems,
    });
  }

  return pages;
}

/**
 * Vẽ 1 hoặc 2 cột song song lên `<canvas>` bảo vệ (`hardenProtectedCanvas`) cho chế độ khách:
 * giữ nguyên 100% vân giấy sóng độ sáng chống OCR & lưới thuỷ vân định danh Discord (`D-028`).
 */
export function paintGuestPaginatedCanvas(options: {
  canvas: HTMLCanvasElement;
  leftPage: CanvasColumnPage | null;
  rightPage: CanvasColumnPage | null;
  columnWidth: number;
  columnGap: number;
  pageHeight: number;
  columns: 1 | 2;
  theme: ReaderTheme;
  font: ReaderFont;
  watermarkLabel: string;
  bitmaps: ReadonlyMap<number, ImageBitmap>;
}): CanvasImageHitRect[] {
  const {
    canvas,
    leftPage,
    rightPage,
    columnWidth,
    columnGap,
    pageHeight,
    columns,
    theme,
    font,
    watermarkLabel,
    bitmaps,
  } = options;

  const totalCssW = columns === 2 ? columnWidth * 2 + columnGap : columnWidth;
  const hitRects: CanvasImageHitRect[] = [];

  // Tạo 1 layout ghép tạm thời: vẽ nền + vân giấy + thuỷ vân trước bằng paintGuestViewportCanvas
  const renderColumnOnto = (
    page: CanvasColumnPage,
    offsetX: number,
    targetCanvas: HTMLCanvasElement,
  ) => {
    const shiftedItems: CanvasLayoutItem[] = page.items.map((item) => {
      const shiftedY = item.y - page.startY + 8;
      if (item.kind === 'image') {
        const maxImgH = Math.max(140, pageHeight - 40);
        const scale = item.drawHeight > maxImgH ? maxImgH / item.drawHeight : 1;
        const drawW = Math.round(item.drawWidth * scale);
        const drawH = Math.round(item.drawHeight * scale);
        const imgX = offsetX + Math.round((columnWidth - drawW) / 2);
        hitRects.push({
          x: imgX,
          y: shiftedY + 12,
          width: drawW,
          height: drawH,
          mediaIndex: item.mediaIndex,
          alt: item.alt,
        });
        return {
          ...item,
          y: shiftedY,
          drawWidth: drawW,
          drawHeight: drawH,
          height: drawH + 24,
        };
      }
      return { ...item, y: shiftedY };
    });

    const tempLayout: ChapterCanvasLayout = {
      contentWidth: columnWidth,
      totalHeight: pageHeight,
      items: shiftedItems,
    };

    paintGuestViewportCanvas({
      canvas: targetCanvas,
      layout: tempLayout,
      sliceTop: 0,
      sliceHeight: pageHeight,
      canvasCssWidth: columnWidth,
      theme,
      font,
      watermarkLabel,
      bitmaps,
    });
  };

  if (columns === 1) {
    canvas.style.width = `${columnWidth}px`;
    canvas.style.height = `${pageHeight}px`;
    renderColumnOnto(leftPage ?? { startY: 0, endY: pageHeight, items: [] }, 0, canvas);
    return hitRects;
  }

  // Hai cột song song: vẽ từng cột vào canvas tạm rồi ghép kèm bóng gáy sách ở giữa
  const leftOff = document.createElement('canvas');
  const rightOff = document.createElement('canvas');
  renderColumnOnto(leftPage ?? { startY: 0, endY: pageHeight, items: [] }, 0, leftOff);
  renderColumnOnto(
    rightPage ?? { startY: 0, endY: pageHeight, items: [] },
    columnWidth + columnGap,
    rightOff,
  );

  // Vẽ nền giấy + thuỷ vân toàn bộ khung trước bằng layout rỗng
  paintGuestViewportCanvas({
    canvas,
    layout: { contentWidth: totalCssW, totalHeight: pageHeight, items: [] },
    sliceTop: 0,
    sliceHeight: pageHeight,
    canvasCssWidth: totalCssW,
    theme,
    font,
    watermarkLabel,
    bitmaps,
  });

  canvas.style.width = `${totalCssW}px`;
  canvas.style.height = `${pageHeight}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return hitRects;

  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.25);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(leftOff, 0, 0, columnWidth, pageHeight);
  ctx.drawImage(rightOff, columnWidth + columnGap, 0, columnWidth, pageHeight);

  // Bóng gáy sách dịu ở giữa 2 trang
  const spineCenterX = columnWidth + columnGap / 2;
  const spineGrad = ctx.createLinearGradient(spineCenterX - 18, 0, spineCenterX + 18, 0);
  const isDark = theme === 'dark' || theme === 'midnight';
  if (isDark) {
    spineGrad.addColorStop(0, 'rgba(0,0,0,0)');
    spineGrad.addColorStop(0.47, 'rgba(0,0,0,0.38)');
    spineGrad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    spineGrad.addColorStop(0.53, 'rgba(0,0,0,0.38)');
    spineGrad.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    spineGrad.addColorStop(0, 'rgba(72,52,32,0)');
    spineGrad.addColorStop(0.47, 'rgba(72,52,32,0.13)');
    spineGrad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    spineGrad.addColorStop(0.53, 'rgba(72,52,32,0.13)');
    spineGrad.addColorStop(1, 'rgba(72,52,32,0)');
  }
  ctx.fillStyle = spineGrad;
  ctx.fillRect(spineCenterX - 18, 8, 36, pageHeight - 16);
  ctx.restore();

  return hitRects;
}
