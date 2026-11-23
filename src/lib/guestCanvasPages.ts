import type { ReaderFont, ReaderTheme } from '@/types';
import type { CanvasLayoutItem } from '@/lib/guestCanvasLayout';
import {
  drawCanvasLayoutItems,
  prepareProtectedCanvasSurface,
} from '@/lib/guestCanvasPaint';

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

function shiftColumnItems(
  page: CanvasColumnPage,
  columnWidth: number,
  offsetX: number,
  pageHeight: number,
  hitRects: CanvasImageHitRect[],
  highlightSourceY: number | null,
): CanvasLayoutItem[] {
  return page.items.map((item) => {
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
    if (item.kind === 'text-line') {
      const flashHighlight =
        highlightSourceY !== null && Math.abs(item.y - highlightSourceY) <= item.height * 1.15;
      return flashHighlight ? { ...item, y: shiftedY, flashHighlight: true } : { ...item, y: shiftedY };
    }
    return { ...item, y: shiftedY };
  });
}

/**
 * Vẽ trực tiếp 1 hoặc 2 cột vector sắc nét lên `<canvas>` chính (0 canvas phụ, 0 nhoè chữ DPR),
 * tiệp hoàn toàn với màu trang và giữ nguyên lớp thuỷ vân bảo vệ Discord (`D-028`).
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
  highlightSourceY?: number | null;
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
    highlightSourceY = null,
  } = options;

  const totalCssW = columns === 2 ? columnWidth * 2 + columnGap : columnWidth;
  canvas.style.width = `${totalCssW}px`;
  canvas.style.height = `${pageHeight}px`;

  const surface = prepareProtectedCanvasSurface({
    canvas,
    canvasCssWidth: totalCssW,
    sliceTop: 0,
    sliceHeight: pageHeight,
    theme,
    watermarkLabel,
  });
  if (!surface) return [];

  const hitRects: CanvasImageHitRect[] = [];
  const { ctx, palette } = surface;

  if (leftPage && leftPage.items.length > 0) {
    const shiftedLeft = shiftColumnItems(
      leftPage,
      columnWidth,
      0,
      pageHeight,
      hitRects,
      highlightSourceY,
    );
    drawCanvasLayoutItems({
      ctx,
      items: shiftedLeft,
      contentWidth: columnWidth,
      offsetX: 0,
      sliceTop: 0,
      sliceHeight: pageHeight,
      canvasCssWidth: totalCssW,
      palette,
      font,
      watermarkLabel,
      bitmaps,
    });
  }

  if (columns === 2 && rightPage && rightPage.items.length > 0) {
    const rightOffsetX = columnWidth + columnGap;
    const shiftedRight = shiftColumnItems(
      rightPage,
      columnWidth,
      rightOffsetX,
      pageHeight,
      hitRects,
      highlightSourceY,
    );
    drawCanvasLayoutItems({
      ctx,
      items: shiftedRight,
      contentWidth: columnWidth,
      offsetX: rightOffsetX,
      sliceTop: 0,
      sliceHeight: pageHeight,
      canvasCssWidth: totalCssW,
      palette,
      font,
      watermarkLabel,
      bitmaps,
    });
  }

  return hitRects;
}
