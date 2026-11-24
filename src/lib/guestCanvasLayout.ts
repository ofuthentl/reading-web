import type {
  GuestBlock,
  GuestInlineSpan,
  HighlightColor,
  ReaderFont,
  ReaderFontWeight,
  ReaderSettings,
  ReaderWidth,
} from '@/types';
import {
  buildCanvasFontSpec,
  clearCanvasWidthCache,
  ensureReaderCanvasFontsLoaded,
  justifyLineFragments,
  measureCanvasTextWidth,
  splitWordToFit,
} from '@/lib/guestCanvasMetrics';

export {
  buildCanvasFontSpec,
  clearCanvasWidthCache,
  ensureReaderCanvasFontsLoaded,
  measureCanvasTextWidth,
};

export interface CanvasSpanFragment {
  text: string;
  x: number;
  bold: boolean;
  italic: boolean;
  rt?: string;
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
      blockIndex?: number;
      rubyHeadroom?: number;
      highlightColor?: HighlightColor;
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

function wrapInlineSpans(
  spans: GuestInlineSpan[],
  font: ReaderFont,
  fontSize: number,
  maxWidth: number,
  startX: number,
  forceBold = false,
  wrapOptions?: { firstLineIndent?: number; justify?: boolean; fontWeight?: ReaderFontWeight },
): CanvasSpanFragment[][] {
  const firstIndent = Math.max(0, wrapOptions?.firstLineIndent ?? 0);
  const fontWeight = wrapOptions?.fontWeight ?? 'normal';
  const lines: CanvasSpanFragment[][] = [];
  let currentLine: CanvasSpanFragment[] = [];
  let cursorX = startX + firstIndent;
  const limitX = startX + Math.max(80, maxWidth);

  const pushFragment = (text: string, x: number, bold: boolean, italic: boolean, rt?: string) => {
    const prev = currentLine[currentLine.length - 1];
    if (
      prev &&
      !prev.rt &&
      !rt &&
      prev.bold === bold &&
      prev.italic === italic &&
      Math.abs(x - cursorX) < 0.5
    ) {
      prev.text += text;
    } else {
      currentLine.push({ text, x, bold, italic, ...(rt ? { rt } : {}) });
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
    const fontSpec = buildCanvasFontSpec(font, fontSize, bold, italic, fontWeight);

    if (span.rt) {
      const rtSpec = buildCanvasFontSpec(font, Math.max(9, Math.round(fontSize * 0.52)), false, false);
      const baseW = measureCanvasTextWidth(span.t, fontSpec);
      const rtW = measureCanvasTextWidth(span.rt, rtSpec);
      const rubyBoxW = Math.max(baseW, rtW + 2);
      if (cursorX + rubyBoxW > limitX && currentLine.length > 0) commitLine();
      const padLeft = Math.max(0, (rubyBoxW - baseW) / 2);
      pushFragment(span.t, cursorX + padLeft, bold, italic, span.rt);
      cursorX += rubyBoxW;
      continue;
    }

    const tokens = span.t.match(/\S+|\s+/g) || [];

    for (const token of tokens) {
      const isSpace = /^\s+$/.test(token);
      if (isSpace) {
        if (currentLine.length === 0) continue;
        const spaceWidth = measureCanvasTextWidth(' ', fontSpec);
        if (cursorX + spaceWidth <= limitX) {
          pushFragment(' ', cursorX, bold, italic);
          cursorX += spaceWidth;
        } else {
          commitLine();
        }
        continue;
      }

      const tokenWidth = measureCanvasTextWidth(token, fontSpec);
      if (cursorX + tokenWidth <= limitX) {
        pushFragment(token, cursorX, bold, italic);
        cursorX += tokenWidth;
        continue;
      }

      if (currentLine.length > 0) commitLine();

      const availWidth = limitX - cursorX;
      if (tokenWidth <= availWidth) {
        pushFragment(token, cursorX, bold, italic);
        cursorX += tokenWidth;
      } else if (cursorX > startX && tokenWidth <= limitX - startX) {
        // Từ đầu dòng quá dài khi thụt lề: bỏ thụt lề tạm cho từ này để không tràn biên phải
        cursorX = startX;
        pushFragment(token, cursorX, bold, italic);
        cursorX += tokenWidth;
      } else {
        const splitBudget = Math.max(40, limitX - cursorX);
        const chunks = splitWordToFit(token, splitBudget, fontSpec);
        for (let idx = 0; idx < chunks.length; idx += 1) {
          const piece = chunks[idx];
          const w = measureCanvasTextWidth(piece, fontSpec);
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
      lines[i] = justifyLineFragments(
        lines[i],
        font,
        fontSize,
        lineStart,
        limitX,
        forceBold,
        fontWeight,
      );
    }
  }
  return lines;
}

function computeRubyHeadroom(fragments: readonly CanvasSpanFragment[], fontSize: number): number {
  return fragments.some((f) => Boolean(f.rt)) ? Math.round(fontSize * 0.44) : 0;
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
  blockHighlightColors?: ReadonlyMap<number, HighlightColor>;
}): ChapterCanvasLayout {
  const {
    chapterTitle, chapterIndex, totalChapters, blocks, settings,
    containerWidth, imageSizes, blockHighlightColors,
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

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx += 1) {
    const block = blocks[blockIdx];
    const hlColor = blockHighlightColors?.get(blockIdx);
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
      const lines = wrapInlineSpans(block.spans, 'serif', hSize, contentWidth, 0, true);
      for (const fragments of lines) {
        const rubyHeadroom = computeRubyHeadroom(fragments, hSize);
        const lineH = hLineHeight + rubyHeadroom;
        items.push({
          kind: 'text-line',
          y,
          height: lineH,
          fontSize: hSize,
          isHeading: true,
          isQuote: false,
          blockIndex: blockIdx,
          ...(rubyHeadroom > 0 ? { rubyHeadroom } : {}),
          ...(hlColor ? { highlightColor: hlColor } : {}),
          fragments,
        });
        y += lineH;
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
        { justify: doJustify, fontWeight: settings.fontWeight },
      );
      for (let i = 0; i < lines.length; i += 1) {
        const rubyHeadroom = computeRubyHeadroom(lines[i], baseSize);
        const lineH = baseLineHeight + rubyHeadroom;
        items.push({
          kind: 'text-line',
          y,
          height: lineH,
          fontSize: baseSize,
          isHeading: false,
          isQuote: true,
          quoteBarTop: i === 0,
          quoteBarBottom: i === lines.length - 1,
          blockIndex: blockIdx,
          ...(rubyHeadroom > 0 ? { rubyHeadroom } : {}),
          ...(hlColor ? { highlightColor: hlColor } : {}),
          fragments: lines[i],
        });
        y += lineH;
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
          false,
          { fontWeight: settings.fontWeight },
        );
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
          const rubyHeadroom = computeRubyHeadroom(lines[lineIdx], baseSize);
          const lineH = baseLineHeight + rubyHeadroom;
          items.push({
            kind: 'text-line',
            y,
            height: lineH,
            fontSize: baseSize,
            isHeading: false,
            isQuote: false,
            ...(lineIdx === 0 ? { listMarker: marker, markerX: 6 } : {}),
            blockIndex: blockIdx,
            ...(rubyHeadroom > 0 ? { rubyHeadroom } : {}),
            ...(hlColor ? { highlightColor: hlColor } : {}),
            fragments: lines[lineIdx],
          });
          y += lineH;
        }
        y += Math.round(baseSize * 0.42);
      }
      y += Math.round(paragraphGap * 0.7);
      continue;
    }

    const lines = wrapInlineSpans(block.spans, settings.font, baseSize, contentWidth, 0, false, {
      firstLineIndent,
      justify: doJustify,
      fontWeight: settings.fontWeight,
    });
    for (const fragments of lines) {
      const rubyHeadroom = computeRubyHeadroom(fragments, baseSize);
      const lineH = baseLineHeight + rubyHeadroom;
      items.push({
        kind: 'text-line',
        y,
        height: lineH,
        fontSize: baseSize,
        isHeading: false,
        isQuote: false,
        blockIndex: blockIdx,
        ...(rubyHeadroom > 0 ? { rubyHeadroom } : {}),
        ...(hlColor ? { highlightColor: hlColor } : {}),
        fragments,
      });
      y += lineH;
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
