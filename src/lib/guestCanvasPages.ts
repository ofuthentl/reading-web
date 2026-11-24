import type { ReaderFont, ReaderFontWeight, ReaderTheme } from '@/types';
import {
  INLINE_FOOTNOTE_TOKEN_RE,
  normalizeFootnoteKey,
} from '@/lib/epubFootnotes';
import {
  type CanvasLayoutItem,
  buildCanvasFontSpec,
  measureCanvasTextWidth,
} from '@/lib/guestCanvasLayout';
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

export interface CanvasFootnoteHitRect {
  x: number;
  y: number;
  width: number;
  height: number;
  markerLabel: string;
  key: string;
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
  font: ReaderFont,
  fontWeight: ReaderFontWeight,
  hitRects: CanvasImageHitRect[],
  footnoteRects: CanvasFootnoteHitRect[],
  footnoteKeys: ReadonlySet<string> | undefined,
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
      if (footnoteKeys && footnoteKeys.size > 0) {
        for (const frag of item.fragments) {
          if (!frag.text.includes('[') && !frag.text.includes('(')) continue;
          const spec = buildCanvasFontSpec(
            item.isHeading ? 'serif' : font,
            item.fontSize,
            item.isHeading || frag.bold,
            frag.italic,
            fontWeight,
          );
          INLINE_FOOTNOTE_TOKEN_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = INLINE_FOOTNOTE_TOKEN_RE.exec(frag.text)) !== null) {
            const key = normalizeFootnoteKey(m[0]);
            if (!footnoteKeys.has(key)) continue;
            const prefixW = m.index > 0 ? measureCanvasTextWidth(frag.text.slice(0, m.index), spec) : 0;
            const tokenW = measureCanvasTextWidth(m[0], spec);
            footnoteRects.push({
              x: offsetX + frag.x + prefixW - 4,
              y: shiftedY - 2,
              width: tokenW + 8,
              height: item.height + 4,
              markerLabel: m[0],
              key,
            });
          }
        }
      }
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
  fontWeight?: ReaderFontWeight;
  watermarkLabel: string;
  bitmaps: ReadonlyMap<number, ImageBitmap>;
  highlightSourceY?: number | null;
  footnoteKeys?: ReadonlySet<string>;
  footnoteHitRectsOut?: CanvasFootnoteHitRect[];
  focusedTarget?: { col: 0 | 1; blockIndex: number } | null;
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
    fontWeight = 'normal',
    watermarkLabel,
    bitmaps,
    highlightSourceY = null,
    footnoteKeys,
    footnoteHitRectsOut,
    focusedTarget = null,
  } = options;

  const totalCssW = columns === 2 ? columnWidth * 2 + columnGap : columnWidth;
  const padX = focusedTarget ? 10 : 0;
  const surfaceW = totalCssW + padX * 2;
  canvas.style.width = `${surfaceW}px`;
  canvas.style.height = `${pageHeight}px`;

  const surface = prepareProtectedCanvasSurface({
    canvas,
    canvasCssWidth: surfaceW,
    sliceTop: 0,
    sliceHeight: pageHeight,
    theme,
    watermarkLabel,
  });
  if (!surface) return [];

  const hitRects: CanvasImageHitRect[] = [];
  const footnoteRects: CanvasFootnoteHitRect[] = [];
  const { ctx, palette } = surface;
  const leftFocusSet =
    focusedTarget === null
      ? null
      : focusedTarget.col === 0
        ? new Set([focusedTarget.blockIndex])
        : new Set<number>();
  const rightFocusSet =
    focusedTarget === null
      ? null
      : focusedTarget.col === 1
        ? new Set([focusedTarget.blockIndex])
        : new Set<number>();

  if (leftPage && leftPage.items.length > 0) {
    const shiftedLeft = shiftColumnItems(
      leftPage,
      columnWidth,
      padX,
      pageHeight,
      font,
      fontWeight,
      hitRects,
      footnoteRects,
      footnoteKeys,
      highlightSourceY,
    );
    drawCanvasLayoutItems({
      ctx,
      items: shiftedLeft,
      contentWidth: columnWidth,
      offsetX: padX,
      sliceTop: 0,
      sliceHeight: pageHeight,
      canvasCssWidth: surfaceW,
      palette,
      font,
      fontWeight,
      watermarkLabel,
      bitmaps,
      footnoteKeys,
      focusedBlockSet: leftFocusSet,
      showFocusAccentBar: focusedTarget?.col === 0,
    });
  }

  if (columns === 2 && rightPage && rightPage.items.length > 0) {
    const rightOffsetX = padX + columnWidth + columnGap;
    const shiftedRight = shiftColumnItems(
      rightPage,
      columnWidth,
      rightOffsetX,
      pageHeight,
      font,
      fontWeight,
      hitRects,
      footnoteRects,
      footnoteKeys,
      highlightSourceY,
    );
    drawCanvasLayoutItems({
      ctx,
      items: shiftedRight,
      contentWidth: columnWidth,
      offsetX: rightOffsetX,
      sliceTop: 0,
      sliceHeight: pageHeight,
      canvasCssWidth: surfaceW,
      palette,
      font,
      fontWeight,
      watermarkLabel,
      bitmaps,
      footnoteKeys,
      focusedBlockSet: rightFocusSet,
      showFocusAccentBar: focusedTarget?.col === 1,
    });
  }

  if (footnoteHitRectsOut) {
    footnoteHitRectsOut.length = 0;
    footnoteHitRectsOut.push(...footnoteRects);
  }
  return hitRects;
}
