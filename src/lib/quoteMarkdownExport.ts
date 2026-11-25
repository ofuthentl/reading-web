import type { LibraryHighlightItem } from '@/types';
import { HIGHLIGHT_COLOR_OPTIONS } from '@/lib/highlightsApi';

export function buildQuotesMarkdown(items: readonly LibraryHighlightItem[]): string {
  const dateStr = new Date().toLocaleDateString('vi-VN');
  const lines: string[] = [
    "# Kho trích dẫn cá nhân — Ofu's Library",
    '',
    `> Xuất ngày ${dateStr} · Tổng cộng **${items.length}** đoạn trích dẫn`,
    '',
  ];

  const byShelf = new Map<string, Map<string, LibraryHighlightItem[]>>();
  for (const item of items) {
    const shelfName = (item.shelf || 'Kho chưa phân loại').trim();
    const bookTitle = (item.bookTitle || 'Tập không rõ tên').trim();
    let bookMap = byShelf.get(shelfName);
    if (!bookMap) {
      bookMap = new Map();
      byShelf.set(shelfName, bookMap);
    }
    const arr = bookMap.get(bookTitle) ?? [];
    arr.push(item);
    bookMap.set(bookTitle, arr);
  }

  for (const [shelfName, bookMap] of byShelf.entries()) {
    lines.push(`## ${shelfName}`, '');
    for (const [bookTitle, bookItems] of bookMap.entries()) {
      lines.push(`### ${bookTitle}`, '');
      const sorted = [...bookItems].sort(
        (a, b) =>
          a.chapterIndex - b.chapterIndex ||
          (a.locator?.scrollRatio ?? 0) - (b.locator?.scrollRatio ?? 0),
      );
      for (const hl of sorted) {
        const chapterLabel = hl.chapterTitle?.trim() || `Phần ${hl.chapterIndex + 1}`;
        const colorLabel =
          HIGHLIGHT_COLOR_OPTIONS.find((c) => c.id === hl.color)?.label || hl.color;
        const quoteLines = hl.quoteText
          .replace(/\r\n/g, '\n')
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n');

        lines.push(`- **${chapterLabel}** · _Màu ${colorLabel}_`);
        lines.push(quoteLines);
        if (hl.note?.trim()) {
          lines.push(`  - **Ghi chú:** ${hl.note.trim()}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function downloadQuotesAsMarkdown(items: readonly LibraryHighlightItem[]): void {
  if (items.length === 0 || typeof document === 'undefined') return;
  const markdown = buildQuotesMarkdown(items);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `ofu-library-quotes-${stamp}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 45_000);
  }
}
