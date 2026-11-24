import { useCallback, useEffect } from 'react';

const FOCUSABLE_BLOCK_SELECTOR = 'p, blockquote, li, h1, h2, h3, h4, table, figure';

/**
 * Thanh Dẫn Mắt (Reading Ruler / Focus Paragraph) cho trình đọc DOM (`ReaderView`):
 * - Làm dịu các đoạn nằm ngoài dải đọc trung tâm xuống ~38% opacity (`.reader-ruler-dim`).
 * - Tự mở dải tiêu điểm lên đầu/cuối trang khi cuộn sát đỉnh hoặc đáy chương để đọc trọn mọi đoạn.
 */
export function useDomReadingRuler(options: {
  enabled: boolean;
  isPaginated: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  chapterId: string | undefined;
}) {
  const { enabled, isPaginated, scrollContainerRef, chapterId } = options;

  const updateDomFocus = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const contentRoot = container.querySelector('.reading-content');
    if (!contentRoot) return;

    const blocks = Array.from(contentRoot.querySelectorAll<HTMLElement>(FOCUSABLE_BLOCK_SELECTOR));
    if (!enabled || isPaginated || blocks.length === 0) {
      contentRoot.classList.remove('reader-ruler-active');
      for (const b of blocks) b.classList.remove('reader-ruler-focus');
      return;
    }

    contentRoot.classList.add('reader-ruler-active');
    const rect = container.getBoundingClientRect();
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const nearTop = container.scrollTop <= 48;
    const nearBottom = maxScroll > 0 && container.scrollTop >= maxScroll - 64;

    const bandTop = nearTop ? rect.top : rect.top + rect.height * 0.28;
    const bandBottom = nearBottom ? rect.bottom : rect.top + rect.height * 0.62;

    let anyMatched = false;
    let closestBlock: HTMLElement | null = null;
    let closestDist = Number.POSITIVE_INFINITY;
    const midY = (bandTop + bandBottom) / 2;

    for (const block of blocks) {
      // Bỏ qua thẻ con nếu thẻ cha (VD blockquote > p) cũng nằm trong danh sách
      if (block.parentElement?.closest(FOCUSABLE_BLOCK_SELECTOR)) {
        block.classList.remove('reader-ruler-focus');
        continue;
      }
      const bRect = block.getBoundingClientRect();
      const overlaps = bRect.bottom >= bandTop && bRect.top <= bandBottom;
      if (overlaps) {
        block.classList.add('reader-ruler-focus');
        anyMatched = true;
      } else {
        block.classList.remove('reader-ruler-focus');
        const center = (bRect.top + bRect.bottom) / 2;
        const dist = Math.abs(center - midY);
        if (dist < closestDist) {
          closestDist = dist;
          closestBlock = block;
        }
      }
    }

    if (!anyMatched && closestBlock) {
      closestBlock.classList.add('reader-ruler-focus');
    }
  }, [enabled, isPaginated, scrollContainerRef]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    const raf = window.requestAnimationFrame(updateDomFocus);
    if (!el || !enabled || isPaginated) {
      return () => window.cancelAnimationFrame(raf);
    }

    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        updateDomFocus();
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      if (scrollRaf) window.cancelAnimationFrame(scrollRaf);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      const contentRoot = el.querySelector('.reading-content');
      contentRoot?.classList.remove('reader-ruler-active');
    };
  }, [chapterId, enabled, isPaginated, scrollContainerRef, updateDomFocus]);
}
