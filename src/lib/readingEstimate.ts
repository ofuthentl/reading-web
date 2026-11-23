import type { CSSProperties } from 'react';
import type { GuestBlock, ReaderSettings } from '@/types';
import { READER_PARAGRAPH_SPACING_EM } from '@/lib/readerConfig';

export const VIETNAMESE_READING_WPM = 220;

const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

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

export function formatRemainingChapterEstimate(totalWords: number, scrollRatio: number): string {
  if (!Number.isFinite(totalWords) || totalWords <= 0) return '';
  const clamped = Math.min(1, Math.max(0, Number.isFinite(scrollRatio) ? scrollRatio : 0));
  if (clamped >= 0.96) return 'Sắp hết chương';
  const remainingWords = Math.max(0, Math.round(totalWords * (1 - clamped)));
  const minutes = Math.max(1, Math.ceil(remainingWords / VIETNAMESE_READING_WPM));
  return `Còn ~${minutes} phút hết chương`;
}

export function buildReaderTypographyStyle(settings: ReaderSettings): CSSProperties {
  return {
    fontSize: `${settings.fontSizePx}px`,
    lineHeight: settings.lineHeight,
    ['--reader-text-align' as string]: settings.textAlign,
    ['--reader-para-indent' as string]: settings.paragraphIndent ? '1.6em' : '0px',
    ['--reader-para-gap' as string]: `${READER_PARAGRAPH_SPACING_EM[settings.paragraphSpacing]}em`,
  };
}
