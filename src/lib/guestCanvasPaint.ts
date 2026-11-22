import type { ReaderFont, ReaderTheme } from '@/types';
import {
  type CanvasLayoutItem,
  type ChapterCanvasLayout,
  buildCanvasFontSpec,
} from '@/lib/guestCanvasLayout';

export interface CanvasThemeColors {
  baseRgb: [number, number, number];
  grainAmplitude: number;
  inkPrimary: string;
  inkSecondary: string;
  inkQuote: string;
  divider: string;
  watermarkText: string;
  imageFrameBg: string;
}

export const CANVAS_THEMES: Record<ReaderTheme, CanvasThemeColors> = {
  paper: {
    baseRgb: [252, 251, 248],
    grainAmplitude: 2.5,
    inkPrimary: '#2b241d',
    inkSecondary: '#6d6154',
    inkQuote: '#4a3e33',
    divider: 'rgba(140, 94, 53, 0.22)',
    watermarkText: 'rgba(92, 68, 45, 0.048)',
    imageFrameBg: 'rgba(235, 227, 212, 0.65)',
  },
  sepia: {
    baseRgb: [244, 236, 216],
    grainAmplitude: 2.5,
    inkPrimary: '#3c2f1e',
    inkSecondary: '#7c664a',
    inkQuote: '#54422b',
    divider: 'rgba(140, 94, 53, 0.24)',
    watermarkText: 'rgba(104, 74, 42, 0.052)',
    imageFrameBg: 'rgba(228, 214, 185, 0.72)',
  },
  dark: {
    baseRgb: [13, 17, 23],
    grainAmplitude: 2,
    inkPrimary: '#e6ebf0',
    inkSecondary: '#8b96a8',
    inkQuote: '#c5d0de',
    divider: 'rgba(148, 163, 184, 0.18)',
    watermarkText: 'rgba(214, 224, 238, 0.042)',
    imageFrameBg: 'rgba(24, 32, 44, 0.82)',
  },
  midnight: {
    baseRgb: [6, 6, 8],
    grainAmplitude: 2,
    inkPrimary: '#e4e4e7',
    inkSecondary: '#9a9aa3',
    inkQuote: '#c8c8d0',
    divider: 'rgba(161, 161, 170, 0.16)',
    watermarkText: 'rgba(228, 228, 234, 0.04)',
    imageFrameBg: 'rgba(18, 18, 23, 0.85)',
  },
};

const grainPatternCache = new Map<ReaderTheme, CanvasPattern | null>();

function getPaperGrainPattern(
  ctx: CanvasRenderingContext2D,
  theme: ReaderTheme,
): CanvasPattern | null {
  if (grainPatternCache.has(theme)) {
    return grainPatternCache.get(theme) ?? null;
  }
  const size = 256;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  if (!octx) return null;

  const palette = CANVAS_THEMES[theme];
  const [r0, g0, b0] = palette.baseRgb;
  const img = octx.createImageData(size, size);
  const data = img.data;

  // Hạt giấy mịn tuần hoàn 2π liền mạch 100% hai chiều (0 đường gãy ô vuông, tiệp hoàn toàn màu trang)
  let seed = theme === 'sepia' ? 0x51f3a9 : theme === 'paper' ? 0x2c8b17 : 0x93d14f;
  for (let py = 0; py < size; py += 1) {
    const wy = Math.sin((py / size) * Math.PI * 2) * 1.4;
    for (let px = 0; px < size; px += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = ((seed >>> 24) / 255 - 0.5) * 2 * palette.grainAmplitude;
      const wx = Math.cos((px / size) * Math.PI * 2) * 1.4;
      const delta = Math.round(wx + wy + noise);

      const idx = (py * size + px) * 4;
      data[idx] = Math.max(0, Math.min(255, r0 + delta));
      data[idx + 1] = Math.max(0, Math.min(255, g0 + delta));
      data[idx + 2] = Math.max(0, Math.min(255, b0 + delta));
      data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);

  const pattern = ctx.createPattern(off, 'repeat');
  grainPatternCache.set(theme, pattern);
  return pattern;
}

const hardenedCanvases = new WeakSet<HTMLCanvasElement>();

/**
 * Khoá các API trích xuất điểm ảnh trực tiếp từ script nối thêm trên trình duyệt (toDataURL / toBlob / getImageData).
 */
export function hardenProtectedCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (!hardenedCanvases.has(canvas)) {
    hardenedCanvases.add(canvas);
    try {
      Object.defineProperty(canvas, 'toDataURL', {
        value: () => 'data:,',
        writable: false,
        configurable: false,
      });
      Object.defineProperty(canvas, 'toBlob', {
        value: (cb: BlobCallback) => {
          if (typeof cb === 'function') cb(null);
        },
        writable: false,
        configurable: false,
      });
      Object.defineProperty(ctx, 'getImageData', {
        value: () => new ImageData(1, 1),
        writable: false,
        configurable: false,
      });
    } catch {
      // Bỏ qua nếu môi trường đóng băng sẵn prototype
    }
  }
  return ctx;
}

export function drawWatermarkGrid(
  ctx: CanvasRenderingContext2D,
  label: string,
  canvasWidth: number,
  sliceTop: number,
  sliceHeight: number,
  color: string,
  fontSize = 13,
) {
  const cleanLabel = label.trim() || 'Ofu Library';
  ctx.save();
  ctx.font = `500 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';

  const stepX = 260;
  const stepY = 168;
  const startGridY = Math.floor((sliceTop - 200) / stepY) * stepY;
  const endGridY = sliceTop + sliceHeight + 200;

  for (let gy = startGridY; gy <= endGridY; gy += stepY) {
    const rowIdx = Math.round(gy / stepY);
    const shiftX = (rowIdx & 1) === 1 ? stepX * 0.5 : 0;
    for (let gx = -120 + shiftX; gx <= canvasWidth + 140; gx += stepX) {
      const localY = gy - sliceTop;
      ctx.save();
      ctx.translate(gx, localY);
      ctx.rotate(-0.34);
      ctx.fillText(cleanLabel, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

export function prepareProtectedCanvasSurface(options: {
  canvas: HTMLCanvasElement;
  canvasCssWidth: number;
  sliceTop: number;
  sliceHeight: number;
  theme: ReaderTheme;
  watermarkLabel: string;
}): { ctx: CanvasRenderingContext2D; dpr: number; palette: CanvasThemeColors } | null {
  const { canvas, canvasCssWidth, sliceTop, sliceHeight, theme, watermarkLabel } = options;
  const ctx = hardenProtectedCanvas(canvas);
  if (!ctx) return null;

  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);
  const targetPixelW = Math.max(1, Math.round(canvasCssWidth * dpr));
  const targetPixelH = Math.max(1, Math.round(sliceHeight * dpr));
  if (canvas.width !== targetPixelW || canvas.height !== targetPixelH) {
    canvas.width = targetPixelW;
    canvas.height = targetPixelH;
  }

  const palette = CANVAS_THEMES[theme];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pattern = getPaperGrainPattern(ctx, theme);
  if (pattern) {
    ctx.save();
    ctx.translate(0, -(sliceTop % 256));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, sliceTop % 256, canvasCssWidth, sliceHeight + 256);
    ctx.restore();
  } else {
    const [r, g, b] = palette.baseRgb;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, canvasCssWidth, sliceHeight);
  }

  drawWatermarkGrid(ctx, watermarkLabel, canvasCssWidth, sliceTop, sliceHeight, palette.watermarkText);
  return { ctx, dpr, palette };
}

export function drawCanvasLayoutItems(options: {
  ctx: CanvasRenderingContext2D;
  items: readonly CanvasLayoutItem[];
  contentWidth: number;
  offsetX: number;
  sliceTop: number;
  sliceHeight: number;
  canvasCssWidth: number;
  palette: CanvasThemeColors;
  font: ReaderFont;
  watermarkLabel: string;
  bitmaps: ReadonlyMap<number, ImageBitmap>;
}) {
  const {
    ctx,
    items,
    contentWidth,
    offsetX,
    sliceTop,
    sliceHeight,
    canvasCssWidth,
    palette,
    font,
    watermarkLabel,
    bitmaps,
  } = options;

  const sliceBottom = sliceTop + sliceHeight;

  for (const item of items) {
    if (item.y + item.height < sliceTop - 16) continue;
    if (item.y > sliceBottom + 16) break;

    const localY = item.y - sliceTop;

    if (item.kind === 'chapter-header') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = palette.inkSecondary;
      ctx.fillText(item.partLabel, offsetX + contentWidth / 2, localY + 2);

      ctx.font = buildCanvasFontSpec('serif', item.titleFontSize, true, false);
      ctx.fillStyle = palette.inkPrimary;
      let ty = localY + 24;
      for (const line of item.titleLines) {
        ctx.fillText(line, offsetX + contentWidth / 2, ty);
        ty += item.titleLineHeight;
      }

      ctx.strokeStyle = palette.divider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(offsetX, localY + item.height - 6);
      ctx.lineTo(offsetX + contentWidth, localY + item.height - 6);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    if (item.kind === 'hr') {
      const midY = localY + item.height / 2;
      const centerX = offsetX + contentWidth / 2;
      ctx.save();
      ctx.strokeStyle = palette.divider;
      ctx.fillStyle = palette.inkSecondary;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX - 72, midY);
      ctx.lineTo(centerX - 18, midY);
      ctx.moveTo(centerX + 18, midY);
      ctx.lineTo(centerX + 72, midY);
      ctx.stroke();
      ctx.font = '13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('❖', centerX, midY);
      ctx.restore();
      continue;
    }

    if (item.kind === 'image') {
      const imgX = offsetX + Math.round((contentWidth - item.drawWidth) / 2);
      const imgY = localY + 12;
      const bitmap = bitmaps.get(item.mediaIndex);

      ctx.save();
      if (bitmap) {
        ctx.drawImage(bitmap, imgX, imgY, item.drawWidth, item.drawHeight);
        ctx.beginPath();
        ctx.rect(imgX, imgY, item.drawWidth, item.drawHeight);
        ctx.clip();
        drawWatermarkGrid(
          ctx,
          watermarkLabel,
          canvasCssWidth,
          sliceTop,
          sliceHeight,
          'rgba(255, 255, 255, 0.14)',
          12,
        );
        drawWatermarkGrid(
          ctx,
          watermarkLabel,
          canvasCssWidth,
          sliceTop + 2,
          sliceHeight,
          'rgba(0, 0, 0, 0.12)',
          12,
        );
      } else {
        ctx.fillStyle = palette.imageFrameBg;
        ctx.strokeStyle = palette.divider;
        ctx.lineWidth = 1;
        ctx.fillRect(imgX, imgY, item.drawWidth, item.drawHeight);
        ctx.strokeRect(imgX, imgY, item.drawWidth, item.drawHeight);
        ctx.fillStyle = palette.inkSecondary;
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          'Đang tải minh hoạ bảo mật...',
          imgX + item.drawWidth / 2,
          imgY + item.drawHeight / 2,
        );
      }
      ctx.restore();
      continue;
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const baselineY = localY + Math.round(item.fontSize * 1.05);

    if (item.isQuote) {
      ctx.fillStyle = palette.divider;
      const barTop = localY + (item.quoteBarTop ? 3 : 0);
      const barH = item.height - (item.quoteBarTop ? 3 : 0) - (item.quoteBarBottom ? 3 : 0);
      ctx.fillRect(offsetX + 2, barTop, 3, Math.max(4, barH));
    }

    if (item.listMarker && item.markerX !== undefined) {
      ctx.font = buildCanvasFontSpec(font, item.fontSize, false, false);
      ctx.fillStyle = palette.inkSecondary;
      ctx.fillText(item.listMarker, offsetX + item.markerX, baselineY);
    }

    ctx.fillStyle = item.isQuote ? palette.inkQuote : palette.inkPrimary;
    for (const frag of item.fragments) {
      ctx.font = buildCanvasFontSpec(
        item.isHeading ? 'serif' : font,
        item.fontSize,
        item.isHeading || frag.bold,
        frag.italic,
      );
      ctx.fillText(frag.text, offsetX + frag.x, baselineY);
    }
    ctx.restore();
  }
}

export function paintGuestViewportCanvas(options: {
  canvas: HTMLCanvasElement;
  layout: ChapterCanvasLayout;
  sliceTop: number;
  sliceHeight: number;
  canvasCssWidth: number;
  theme: ReaderTheme;
  font: ReaderFont;
  watermarkLabel: string;
  bitmaps: ReadonlyMap<number, ImageBitmap>;
}) {
  const {
    canvas,
    layout,
    sliceTop,
    sliceHeight,
    canvasCssWidth,
    theme,
    font,
    watermarkLabel,
    bitmaps,
  } = options;

  const surface = prepareProtectedCanvasSurface({
    canvas,
    canvasCssWidth,
    sliceTop,
    sliceHeight,
    theme,
    watermarkLabel,
  });
  if (!surface) return;

  const offsetX = Math.max(0, Math.floor((canvasCssWidth - layout.contentWidth) / 2));
  drawCanvasLayoutItems({
    ctx: surface.ctx,
    items: layout.items,
    contentWidth: layout.contentWidth,
    offsetX,
    sliceTop,
    sliceHeight,
    canvasCssWidth,
    palette: surface.palette,
    font,
    watermarkLabel,
    bitmaps,
  });
}
