import type { CSSProperties } from 'react';
import type { GuestBlock, GuestTocItem, ReaderFontWeight, ReaderSettings } from '@/types';
import { READER_PARAGRAPH_SPACING_EM } from '@/lib/readerConfig';

export const VIETNAMESE_READING_WPM = 220;

const FONT_WEIGHT_CSS_MAP: Record<ReaderFontWeight, number> = {
  normal: 400,
  semibold: 600,
  bold: 700,
};

const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const DEFAULT_WORDS_PER_GZIP_BYTE = 0.38;
const GUEST_GZIP_ENVELOPE_OVERHEAD_BYTES = 180;

export function computeGuestChapterWeights(tocChapters: readonly GuestTocItem[]): number[] {
  if (tocChapters.length === 0) return [];
  const netWeights = tocChapters.map((ch) => {
    const raw =
      typeof ch.compressedBytes === 'number' && Number.isFinite(ch.compressedBytes)
        ? ch.compressedBytes
        : 0;
    return Math.max(0, raw - GUEST_GZIP_ENVELOPE_OVERHEAD_BYTES);
  });
  if (netWeights.some((w) => w > 0)) return netWeights;

  const rawWeights = tocChapters.map((ch) =>
    typeof ch.compressedBytes === 'number' &&
    Number.isFinite(ch.compressedBytes) &&
    ch.compressedBytes > 0
      ? ch.compressedBytes
      : 0,
  );
  if (rawWeights.some((w) => w > 0)) return rawWeights;

  return tocChapters.map(() => 0);
}

export function computeWeightedBookPercent(
  weights: readonly number[],
  chapterIndex: number,
  scrollRatio: number,
  completed = false,
): number {
  if (completed) return 100;
  const totalChapters = weights.length;
  if (totalChapters === 0) return 0;

  const rawIdx = Number.isFinite(chapterIndex) ? Math.floor(chapterIndex) : 0;
  const safeIdx = Math.max(0, Math.min(rawIdx, totalChapters - 1));
  const safeRatio = Number.isFinite(scrollRatio) ? Math.min(1, Math.max(0, scrollRatio)) : 0;

  let totalWeight = 0;
  let beforeWeight = 0;
  let currentWeight = 0;
  for (let i = 0; i < totalChapters; i += 1) {
    const rawW = weights[i];
    const w = typeof rawW === 'number' && Number.isFinite(rawW) && rawW > 0 ? rawW : 0;
    totalWeight += w;
    if (i < safeIdx) beforeWeight += w;
    else if (i === safeIdx) currentWeight = w;
  }

  const rawPercent =
    totalWeight > 0
      ? ((beforeWeight + currentWeight * safeRatio) / totalWeight) * 100
      : ((safeIdx + safeRatio) / totalChapters) * 100;

  const rounded = Math.round(Math.min(100, Math.max(0, rawPercent)) * 10) / 10;
  if (safeIdx < totalChapters - 1 && rounded > 99) {
    return 99;
  }
  return rounded;
}

export interface WeightedBookPercentTarget {
  chapterIndex: number;
  scrollRatio: number;
}

export function computeChapterStartPercents(weights: readonly number[]): number[] {
  const totalChapters = weights.length;
  if (totalChapters === 0) return [];
  let totalWeight = 0;
  for (let i = 0; i < totalChapters; i += 1) {
    const w = weights[i];
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) totalWeight += w;
  }
  if (totalWeight <= 0) {
    return weights.map((_, idx) => (idx / totalChapters) * 100);
  }
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < totalChapters; i += 1) {
    starts.push((acc / totalWeight) * 100);
    const w = weights[i];
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) acc += w;
  }
  return starts;
}

export function resolveWeightedBookPercentTarget(
  weights: readonly number[],
  targetPercent: number,
): WeightedBookPercentTarget {
  const totalChapters = weights.length;
  if (totalChapters === 0) return { chapterIndex: 0, scrollRatio: 0 };

  const clampedPct = Number.isFinite(targetPercent)
    ? Math.min(100, Math.max(0, targetPercent))
    : 0;
  if (clampedPct <= 0) return { chapterIndex: 0, scrollRatio: 0 };
  if (clampedPct >= 100) return { chapterIndex: totalChapters - 1, scrollRatio: 1 };

  let totalWeight = 0;
  for (let i = 0; i < totalChapters; i += 1) {
    const w = weights[i];
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) totalWeight += w;
  }

  if (totalWeight <= 0) {
    const pos = (clampedPct / 100) * totalChapters;
    const chapterIndex = Math.min(totalChapters - 1, Math.floor(pos));
    const scrollRatio = Math.min(1, Math.max(0, pos - chapterIndex));
    return { chapterIndex, scrollRatio };
  }

  const targetWeight = (clampedPct / 100) * totalWeight;
  let acc = 0;
  let lastPositiveIdx = totalChapters - 1;
  for (let i = 0; i < totalChapters; i += 1) {
    const rawW = weights[i];
    const w = typeof rawW === 'number' && Number.isFinite(rawW) && rawW > 0 ? rawW : 0;
    if (w <= 0) continue;
    lastPositiveIdx = i;
    if (acc + w >= targetWeight - 1e-6) {
      const ratio = Math.min(1, Math.max(0, (targetWeight - acc) / w));
      return { chapterIndex: i, scrollRatio: Math.round(ratio * 1000) / 1000 };
    }
    acc += w;
  }
  return { chapterIndex: lastPositiveIdx, scrollRatio: 1 };
}

export function countWordsInPlainText(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const cjkMatches = trimmed.match(CJK_CHAR_RE);
  const cjkWordEquiv = cjkMatches ? Math.ceil(cjkMatches.length * 0.55) : 0;
  const nonCjk = cjkMatches ? trimmed.replace(CJK_CHAR_RE, ' ').trim() : trimmed;
  const spaceWords = nonCjk ? nonCjk.split(/\s+/).filter(Boolean).length : 0;
  return spaceWords + cjkWordEquiv;
}

export function countWordsInGuestBlocks(blocks: readonly GuestBlock[] | null | undefined): number {
  if (!blocks || blocks.length === 0) return 0;
  let total = 0;
  for (const block of blocks) {
    if (block.kind === 'h' || block.kind === 'p' || block.kind === 'quote') {
      const joined = block.spans.map((s) => s.t).join('');
      total += countWordsInPlainText(joined);
    } else if (block.kind === 'list') {
      for (const item of block.items) {
        total += countWordsInPlainText(item.map((s) => s.t).join(''));
      }
    }
  }
  return total;
}

export function formatMinutesCompact(minutes: number): string {
  const safeMin = Math.max(1, Math.round(minutes));
  if (safeMin < 60) return `~${safeMin}p`;
  const hours = Math.floor(safeMin / 60);
  const remMin = safeMin % 60;
  return remMin > 0 ? `~${hours}g ${remMin}p` : `~${hours}g`;
}

export function formatRemainingChapterEstimate(
  totalWords: number,
  scrollRatio: number,
  wpm = VIETNAMESE_READING_WPM,
): string {
  if (!Number.isFinite(totalWords) || totalWords <= 0) return '';
  const clamped = Math.min(1, Math.max(0, Number.isFinite(scrollRatio) ? scrollRatio : 0));
  if (clamped >= 0.96) return 'Sắp hết chương';
  const effectiveWpm = Number.isFinite(wpm) && wpm >= 60 ? wpm : VIETNAMESE_READING_WPM;
  const remainingWords = Math.max(0, Math.round(totalWords * (1 - clamped)));
  const minutes = Math.max(1, Math.ceil(remainingWords / effectiveWpm));
  return `Còn ~${minutes} phút hết chương`;
}

export function formatCombinedReadingEstimate(params: {
  chapterWords: number;
  laterBookWords: number;
  isLastChapter: boolean;
  scrollRatio: number;
  wpm?: number;
}): string {
  const { chapterWords, laterBookWords, isLastChapter, scrollRatio, wpm } = params;
  const effectiveWpm =
    typeof wpm === 'number' && Number.isFinite(wpm) && wpm >= 60 ? wpm : VIETNAMESE_READING_WPM;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(scrollRatio) ? scrollRatio : 0));
  const safeChapWords = Math.max(0, Number.isFinite(chapterWords) ? chapterWords : 0);
  const safeLaterWords = Math.max(0, Number.isFinite(laterBookWords) ? laterBookWords : 0);

  const remChapWords = Math.max(0, Math.round(safeChapWords * (1 - clamped)));
  const totalRemBookWords = remChapWords + safeLaterWords;

  if (totalRemBookWords <= 0 && safeChapWords <= 0) return '';

  if (isLastChapter || safeLaterWords <= 0) {
    if (clamped >= 0.96 || totalRemBookWords <= 15) return 'Sắp hết cuốn';
    const minLeft = Math.max(1, Math.ceil(totalRemBookWords / effectiveWpm));
    return `Còn ${formatMinutesCompact(minLeft)} hết cuốn`;
  }

  const bookMinutes = Math.max(1, Math.ceil(totalRemBookWords / effectiveWpm));
  const bookLabel = `${formatMinutesCompact(bookMinutes)} cuốn`;

  if (safeChapWords <= 15) {
    return `Còn ${bookLabel}`;
  }
  if (clamped >= 0.96) {
    return `Sắp hết chương · ${bookLabel}`;
  }

  const chapMinutes = Math.max(1, Math.ceil(remChapWords / effectiveWpm));
  return `Còn ${formatMinutesCompact(chapMinutes)} chương · ${bookLabel}`;
}

export function estimateGuestLaterBookWords(
  tocChapters: readonly GuestTocItem[],
  chapterIndex: number,
  currentChapterWords: number,
): number {
  if (chapterIndex >= tocChapters.length - 1) return 0;
  const currentCompressed = tocChapters[chapterIndex]?.compressedBytes ?? 0;
  let wordsPerByte = DEFAULT_WORDS_PER_GZIP_BYTE;
  if (currentCompressed >= 120 && currentChapterWords >= 35) {
    const measured = currentChapterWords / currentCompressed;
    wordsPerByte = Math.min(0.75, Math.max(0.18, measured));
  }

  let laterBytes = 0;
  let missingByteChapters = 0;
  for (let i = chapterIndex + 1; i < tocChapters.length; i += 1) {
    const cb = tocChapters[i]?.compressedBytes;
    if (typeof cb === 'number' && cb > 0) {
      laterBytes += cb;
    } else {
      missingByteChapters += 1;
    }
  }

  const fallbackPerChapter = currentChapterWords >= 80 ? currentChapterWords : 2200;
  return Math.round(laterBytes * wordsPerByte + missingByteChapters * fallbackPerChapter);
}

export function buildReaderTypographyStyle(settings: ReaderSettings): CSSProperties {
  return {
    fontSize: `${settings.fontSizePx}px`,
    lineHeight: settings.lineHeight,
    ['--reader-font-weight' as string]: FONT_WEIGHT_CSS_MAP[settings.fontWeight ?? 'normal'],
    ['--reader-text-align' as string]: settings.textAlign,
    ['--reader-para-indent' as string]: settings.paragraphIndent ? '1.6em' : '0px',
    ['--reader-para-gap' as string]: `${READER_PARAGRAPH_SPACING_EM[settings.paragraphSpacing]}em`,
  };
}
