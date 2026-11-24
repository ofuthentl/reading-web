import type { CanvasSpanFragment } from '@/lib/guestCanvasLayout';
import type { ReaderFont, ReaderFontWeight } from '@/types';

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

function resolveCanvasFontWeightToken(
  font: ReaderFont,
  bold: boolean,
  baseWeight: ReaderFontWeight,
): string {
  if (bold || baseWeight === 'bold') return '700 ';
  if (baseWeight === 'semibold') return font === 'mono' ? '700 ' : '600 ';
  return '400 ';
}

export function buildCanvasFontSpec(
  font: ReaderFont,
  sizePx: number,
  bold: boolean,
  italic: boolean,
  baseWeight: ReaderFontWeight = 'normal',
): string {
  const style = italic ? 'italic ' : '';
  const weight = resolveCanvasFontWeightToken(font, bold, baseWeight);
  return `${style}${weight}${Math.round(sizePx * 10) / 10}px ${FONT_STACK_MAP[font]}`;
}

let sharedMeasureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

export function clearCanvasWidthCache(): void {
  widthCache.clear();
}

export async function ensureReaderCanvasFontsLoaded(font: ReaderFont): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const primary = CANVAS_PRIMARY_FAMILY[font];
  const sample = 'Việt Nam ệữởắồỷ ABC 0123';
  const jobs: Promise<FontFace[]>[] = [
    document.fonts.load(`400 18px ${primary}`, sample),
    document.fonts.load(`italic 400 18px ${primary}`, sample),
    document.fonts.load(`700 18px ${primary}`, sample),
    document.fonts.load('700 22px "Literata"', sample),
  ];
  if (font === 'serif' || font === 'sans') {
    jobs.push(document.fonts.load(`600 18px ${primary}`, sample));
  }
  await Promise.allSettled(jobs);
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

export function measureCanvasTextWidth(token: string, fontSpec: string): number {
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

export function splitWordToFit(word: string, maxWidth: number, fontSpec: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (const ch of word) {
    const next = current + ch;
    if (current && measureCanvasTextWidth(next, fontSpec) > maxWidth) {
      parts.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [word];
}

export function justifyLineFragments(
  fragments: CanvasSpanFragment[],
  font: ReaderFont,
  fontSize: number,
  lineStartX: number,
  targetEndX: number,
  forceBold: boolean,
  fontWeight: ReaderFontWeight = 'normal',
): CanvasSpanFragment[] {
  const tokens: Array<{
    text: string;
    isSpace: boolean;
    width: number;
    padLeft: number;
    bold: boolean;
    italic: boolean;
    rt?: string;
  }> = [];
  const rtSpec = buildCanvasFontSpec(font, Math.max(9, Math.round(fontSize * 0.52)), false, false);

  for (const frag of fragments) {
    const bold = forceBold || frag.bold;
    const spec = buildCanvasFontSpec(font, fontSize, bold, frag.italic, fontWeight);
    if (frag.rt) {
      const baseW = measureCanvasTextWidth(frag.text, spec);
      const rtW = measureCanvasTextWidth(frag.rt, rtSpec);
      const rubyBoxW = Math.max(baseW, rtW + 2);
      const padLeft = Math.max(0, (rubyBoxW - baseW) / 2);
      tokens.push({
        text: frag.text,
        isSpace: false,
        width: rubyBoxW,
        padLeft,
        bold: frag.bold,
        italic: frag.italic,
        rt: frag.rt,
      });
      continue;
    }
    const parts = frag.text.match(/\S+|\s+/g) || [];
    for (const part of parts) {
      const isSpace = /^\s+$/.test(part);
      tokens.push({
        text: isSpace ? ' ' : part,
        isSpace,
        width: measureCanvasTextWidth(isSpace ? ' ' : part, spec),
        padLeft: 0,
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
      justified.push({
        text: tk.text,
        x: x + tk.padLeft,
        bold: tk.bold,
        italic: tk.italic,
        ...(tk.rt ? { rt: tk.rt } : {}),
      });
      x += tk.width;
    }
  }
  return justified;
}
