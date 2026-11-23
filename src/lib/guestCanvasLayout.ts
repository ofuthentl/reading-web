import type { GuestBlock, GuestInlineSpan, ReaderFont, ReaderSettings, ReaderWidth } from '@/types';

export interface CanvasSpanFragment {
  text: string;
  x: number;
  bold: boolean;
  italic: boolean;
}

export type CanvasLayoutItem =
  | {
      kind: 'chapter-header';
      y: number;
      height: number;
      partLabel: string;
      titleLines: string[];
      titleFontSize: number;
      titleLineHeight: number;
    }
  | {
      kind: 'text-line';
      y: number;
      height: number;
      fontSize: number;
      isHeading: boolean;
      isQuote: boolean;
      quoteBarTop?: boolean;
      quoteBarBottom?: boolean;
      listMarker?: string;
      markerX?: number;
      flashHighlight?: boolean;
      fragments: CanvasSpanFragment[];
    }
  | {
      kind: 'hr';
      y: number;
      height: number;
    }
  | {
      kind: 'image';
      y: number;
      height: number;
      drawWidth: number;
      drawHeight: number;
      mediaIndex: number;
      alt?: string;
    };

export interface ChapterCanvasLayout {
  contentWidth: number;
  totalHeight: number;
  items: CanvasLayoutItem[];
}

export const CANVAS_WIDTH_PX: Record<ReaderWidth, number> = {
  narrow: 886,
  medium: 1098,
  wide: 1352,
};

export function getInitialGuestStageBox(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 960, height: 720 };
  const padX = window.innerWidth >= 640 ? 56 : 28;
  return {
    width: Math.max(240, window.innerWidth - padX),
    height: Math.max(280, window.innerHeight - 64),
  };
}

const FONT_STACK_MAP: Record<ReaderFont, string> = {
  serif: '"Literata", Georgia, "Times New Roman", serif',
  sans: '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", "Cascadia Code", ui-monospace, monospace',
};

const CANVAS_PRIMARY_FAMILY: Record<ReaderFont, string> = {
  serif: '"Literata"',
  sans: '"Be Vietnam Pro"',
  mono: '"JetBrains Mono"',
};

export function buildCanvasFontSpec(
  font: ReaderFont,
  sizePx: number,
  bold: boolean,
  italic: boolean,
): string {
  const style = italic ? 'italic ' : '';
  const weight = bold ? '700 ' : '400 ';
  return `${style}${weight}${Math.round(sizePx * 10) / 10}px ${FONT_STACK_MAP[font]}`;
}

let sharedMeasureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

export function clearCanvasWidthCache(): void {
  widthCache.clear();
}

/**
 * Chủ động kích hoạt nạp webfont cục bộ trước khi vẽ Canvas 2D (vì `ctx.fillText`
 * không phải lúc nào cũng kích hoạt tải `@font-face` subset tiếng Việt tự động).
 */
export async function ensureReaderCanvasFontsLoaded(font: ReaderFont): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const primary = CANVAS_PRIMARY_FAMILY[font];
  const sample = 'Việt Nam ệữởắồỷ ABC 0123';
  const requests = [
    document.fonts.load(`400 18px ${primary}`, sample),
    document.fonts.load(`italic 400 18px ${primary}`, sample),
    document.fonts.load(`700 18px ${primary}`, sample),
    // Tiêu đề chương/mục luôn vẽ bằng Literata
    document.fonts.load('700 22px "Literata"', sample),
  ];
  await Promise.allSettled(requests);
}

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (sharedMeasureCtx) return sharedMeasureCtx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  sharedMeasureCtx = c.getContext('2d');
  return sharedMeasureCtx;
}

function measureTokenWidth(token: string, fontSpec: string): number {
  if (!token) return 0;
  const cacheKey = `${fontSpec}\0${token}`;
  const hit = widthCache.get(cacheKey);
  if (hit !== undefined) return hit;

  const ctx = getMeasureContext();
  let width: number;
  if (ctx) {
    ctx.font = fontSpec;
    width = ctx.measureText(token).width;
  } else {
    width = token.length * 9.5;
  }
  if (widthCache.size > 24_000) widthCache.clear();
  widthCache.set(cacheKey, width);
  return width;
}

function splitWordToFit(word: string, maxWidth: number, fontSpec: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (const ch of word) {
    const next = current + ch;
    if (current && measureTokenWidth(next, fontSpec) > maxWidth) {
      parts.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [word];
}

function justifyLineFragments(
  fragments: CanvasSpanFragment[],
  font: ReaderFont,
  fontSize: number,
  lineStartX: number,
  targetEndX: number,
  forceBold: boolean,
): CanvasSpanFragment[] {
  const tokens: Array<{ text: string; isSpace: boolean; width: number; bold: boolean; italic: boolean }> = [];
  for (const frag of fragments) {
    const bold = forceBold || frag.bold;
    const spec = buildCanvasFontSpec(font, fontSize, bold, frag.italic);
    const parts = frag.text.match(/\S+|\s+/g) || [];
    for (const part of parts) {
      const isSpace = /^\s+$/.test(part);
      tokens.push({
        text: isSpace ? ' ' : part,
        isSpace,
        width: measureTokenWidth(isSpace ? ' ' : part, spec),
        bold: frag.bold,
        italic: frag.italic,
      });
    }
  }
  while (tokens.length > 0 && tokens[tokens.length - 1].isSpace) {
    tokens.pop();
  }
  const spaceCount = tokens.reduce((acc, tk) => acc + (tk.isSpace ? 1 : 0), 0);
  if (spaceCount <= 0) return fragments;

  const naturalWidth = tokens.reduce((acc, tk) => acc + tk.width, 0);
  const availWidth = targetEndX - lineStartX;
  const slack = availWidth - naturalWidth;
  if (slack <= 0.5 || slack > availWidth * 0.28) return fragments;

  const extraPerSpace = slack / spaceCount;
  const justified: CanvasSpanFragment[] = [];
  let x = lineStartX;
  for (const tk of tokens) {
    if (tk.isSpace) {
      x += tk.width + extraPerSpace;
    } else {
      justified.push({ text: tk.text, x, bold: tk.bold, italic: tk.italic });
      x += tk.width;
    }
  }
  return justified;
}

function wrapInlineSpans(
  spans: GuestInlineSpan[],
  font: ReaderFont,
  fontSize: number,
  maxWidth: number,
  startX: number,
  forceBold = false,
  wrapOptions?: { firstLineIndent?: number; justify?: boolean },
): CanvasSpanFragment[][] {
  const firstIndent = Math.max(0, wrapOptions?.firstLineIndent ?? 0);
  const lines: CanvasSpanFragment[][] = [];
  let currentLine: CanvasSpanFragment[] = [];
  let cursorX = startX + firstIndent;
  const limitX = startX + Math.max(80, maxWidth);

  const pushFragment = (text: string, x: number, bold: boolean, italic: boolean) => {
    const prev = currentLine[currentLine.length - 1];
    if (prev && prev.bold === bold && prev.italic === italic && Math.abs(x - cursorX) < 0.5) {
      prev.text += text;
    } else {
      currentLine.push({ text, x, bold, italic });
    }
  };

  const commitLine = () => {
    if (currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [];
    }
    cursorX = startX;
  };

  for (const span of spans) {
    const bold = forceBold || span.b === 1;
    const italic = span.i === 1;
    const fontSpec = buildCanvasFontSpec(font, fontSize, bold, italic);
    const tokens = span.t.match(/\S+|\s+/g) || [];

    for (const token of tokens) {
      const isSpace = /^\s+$/.test(token);
      if (isSpace) {
        if (currentLine.length === 0) continue;
        const spaceWidth = measureTokenWidth(' ', fontSpec);
        if (cursorX + spaceWidth <= limitX) {
          pushFragment(' ', cursorX, bold, italic);
          cursorX += spaceWidth;
        } else {
          commitLine();
        }
        continue;
      }

      const tokenWidth = measureTokenWidth(token, fontSpec);
      if (cursorX + tokenWidth <= limitX) {
        pushFragment(token, cursorX, bold, italic);
        cursorX += tokenWidth;
        continue;
      }

      if (currentLine.length > 0) {
        commitLine();
      }

      if (tokenWidth <= limitX - startX) {
        pushFragment(token, cursorX, bold, italic);
        cursorX += tokenWidth;
      } else {
        const chunks = splitWordToFit(token, limitX - startX, fontSpec);
        for (let idx = 0; idx < chunks.length; idx += 1) {
          const piece = chunks[idx];
          const w = measureTokenWidth(piece, fontSpec);
          pushFragment(piece, cursorX, bold, italic);
          cursorX += w;
          if (idx < chunks.length - 1) commitLine();
        }
      }
    }
  }

  commitLine();
  if (wrapOptions?.justify && lines.length > 1) {
    for (let i = 0; i < lines.length - 1; i += 1) {
      const lineStart = i === 0 ? startX + firstIndent : startX;
      lines[i] = justifyLineFragments(lines[i], font, fontSize, lineStart, limitX, forceBold);
    }
  }
  return lines;
}

function wrapPlainTitle(title: string, fontSize: number, maxWidth: number): string[] {
  const wrapped = wrapInlineSpans([{ t: title, b: 1 }], 'serif', fontSize, maxWidth, 0, true);
  return wrapped.map((line) => line.map((f) => f.text).join('').trim()).filter(Boolean);
}

export function computeChapterCanvasLayout(options: {
  chapterTitle: string;
  chapterIndex: number;
  totalChapters: number;
  blocks: GuestBlock[];
  settings: ReaderSettings;
  containerWidth: number;
  imageSizes: ReadonlyMap<number, { width: number; height: number }>;
}): ChapterCanvasLayout {
  const {
    chapterTitle,
    chapterIndex,
    totalChapters,
    blocks,
    settings,
    containerWidth,
    imageSizes,
  } = options;

  const maxTargetWidth = CANVAS_WIDTH_PX[settings.width];
  const contentWidth = Math.max(240, Math.min(containerWidth, maxTargetWidth));
  const baseSize = settings.fontSizePx;
  const baseLineHeight = Math.round(baseSize * settings.lineHeight);
  const paraGapScale =
    settings.paragraphSpacing === 'compact'
      ? 0.64
      : settings.paragraphSpacing === 'relaxed'
        ? 1.56
        : 1.1;
  const paragraphGap = Math.round(baseSize * paraGapScale);
  const firstLineIndent = settings.paragraphIndent ? Math.round(baseSize * 1.6) : 0;
  const doJustify = settings.textAlign === 'justify';

  const items: CanvasLayoutItem[] = [];
  let y = 12;

  // 1. Khối tiêu đề chương mở đầu trên Canvas
  const titleFontSize = Math.min(30, Math.max(22, Math.round(baseSize * 1.36)));
  const titleLineHeight = Math.round(titleFontSize * 1.32);
  const titleLines = wrapPlainTitle(
    chapterTitle || `Chương ${chapterIndex + 1}`,
    titleFontSize,
    contentWidth - 16,
  );
  const headerHeight = 26 + titleLines.length * titleLineHeight + 28;
  items.push({
    kind: 'chapter-header',
    y,
    height: headerHeight,
    partLabel: `PHẦN ${chapterIndex + 1} / ${Math.max(1, totalChapters)}`,
    titleLines,
    titleFontSize,
    titleLineHeight,
  });
  y += headerHeight + Math.round(baseSize * 1.35);

  // 2. Dàn từng khối nội dung chương
  for (const block of blocks) {
    if (block.kind === 'hr') {
      const hrHeight = Math.round(baseSize * 2.1);
      items.push({ kind: 'hr', y, height: hrHeight });
      y += hrHeight;
      continue;
    }

    if (block.kind === 'img') {
      const known = imageSizes.get(block.mediaIndex);
      const maxImgW = contentWidth;
      const maxImgH = 720;
      let drawWidth: number;
      let drawHeight: number;
      if (known && known.width > 0 && known.height > 0) {
        const scale = Math.min(1, maxImgW / known.width, maxImgH / known.height);
        drawWidth = Math.max(120, Math.round(known.width * scale));
        drawHeight = Math.max(90, Math.round(known.height * scale));
      } else {
        drawWidth = Math.min(maxImgW, 440);
        drawHeight = Math.round(drawWidth * 1.36);
      }
      const boxHeight = drawHeight + 28;
      items.push({
        kind: 'image',
        y,
        height: boxHeight,
        drawWidth,
        drawHeight,
        mediaIndex: block.mediaIndex,
        alt: block.alt,
      });
      y += boxHeight + Math.round(paragraphGap * 0.6);
      continue;
    }

    if (block.kind === 'h') {
      const scale = block.level === 1 ? 1.28 : block.level === 2 ? 1.16 : 1.08;
      const hSize = Math.round(baseSize * scale);
      const hLineHeight = Math.round(hSize * 1.42);
      y += Math.round(baseSize * 0.55);
      // Vá M-04: đo chiều rộng tiêu đề bằng đúng font 'serif' (Literata) giống lúc vẽ ở guestCanvasPaint
      const lines = wrapInlineSpans(block.spans, 'serif', hSize, contentWidth, 0, true);
      for (const fragments of lines) {
        items.push({
          kind: 'text-line',
          y,
          height: hLineHeight,
          fontSize: hSize,
          isHeading: true,
          isQuote: false,
          fragments,
        });
        y += hLineHeight;
      }
      y += Math.round(paragraphGap * 0.72);
      continue;
    }

    if (block.kind === 'quote') {
      const quoteIndent = 18;
      const lines = wrapInlineSpans(
        block.spans,
        settings.font,
        baseSize,
        contentWidth - quoteIndent - 6,
        quoteIndent,
        false,
        { justify: doJustify },
      );
      for (let i = 0; i < lines.length; i += 1) {
        items.push({
          kind: 'text-line',
          y,
          height: baseLineHeight,
          fontSize: baseSize,
          isHeading: false,
          isQuote: true,
          quoteBarTop: i === 0,
          quoteBarBottom: i === lines.length - 1,
          fragments: lines[i],
        });
        y += baseLineHeight;
      }
      y += paragraphGap;
      continue;
    }

    if (block.kind === 'list') {
      const listIndent = 28;
      for (let idx = 0; idx < block.items.length; idx += 1) {
        const marker = block.ordered ? `${idx + 1}.` : '•';
        const lines = wrapInlineSpans(
          block.items[idx],
          settings.font,
          baseSize,
          contentWidth - listIndent,
          listIndent,
        );
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
          items.push({
            kind: 'text-line',
            y,
            height: baseLineHeight,
            fontSize: baseSize,
            isHeading: false,
            isQuote: false,
            ...(lineIdx === 0 ? { listMarker: marker, markerX: 6 } : {}),
            fragments: lines[lineIdx],
          });
          y += baseLineHeight;
        }
        y += Math.round(baseSize * 0.42);
      }
      y += Math.round(paragraphGap * 0.7);
      continue;
    }

    // Đoạn văn xuôi thông thường ('p')
    const lines = wrapInlineSpans(block.spans, settings.font, baseSize, contentWidth, 0, false, {
      firstLineIndent,
      justify: doJustify,
    });
    for (const fragments of lines) {
      items.push({
        kind: 'text-line',
        y,
        height: baseLineHeight,
        fontSize: baseSize,
        isHeading: false,
        isQuote: false,
        fragments,
      });
      y += baseLineHeight;
    }
    y += paragraphGap;
  }

  return {
    contentWidth,
    totalHeight: Math.max(320, y + 24),
    items,
  };
}

export function findCanvasLayoutImageAtPoint(
  layout: ChapterCanvasLayout,
  stageWidth: number,
  stageX: number,
  stageY: number,
): Extract<CanvasLayoutItem, { kind: 'image' }> | null {
  if (stageY < 0 || stageY > layout.totalHeight) return null;
  const offsetX = Math.max(0, Math.floor((stageWidth - layout.contentWidth) / 2));
  for (const item of layout.items) {
    if (item.kind !== 'image') continue;
    const imgX = offsetX + Math.round((layout.contentWidth - item.drawWidth) / 2);
    const imgY = item.y + 12;
    if (
      stageX >= imgX &&
      stageX <= imgX + item.drawWidth &&
      stageY >= imgY &&
      stageY <= imgY + item.drawHeight
    ) {
      return item;
    }
  }
  return null;
}
