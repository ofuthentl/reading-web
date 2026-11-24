import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasColumnPage } from '@/lib/guestCanvasPages';

const FOCUSABLE_BLOCK_SELECTOR = 'p, blockquote, li, h1, h2, h3, h4, table, figure';

interface DomColumnFragment {
  col: 0 | 1;
  block: HTMLElement;
  top: number;
  bottom: number;
  left: number;
}

/**
 * Thanh Dẫn Mắt chuyên biệt cho chế độ Lật trang 1–2 cột (`ReaderPaginatedView` DOM):
 * - Khoá tiêu điểm theo **từng cột độc lập** (Cột trái từ trên xuống dưới -> Cột phải từ trên xuống dưới),
 *   không cắt ngang dòng bằng khung viền ngang cố định và không sáng đồng thời cả 2 cột.
 * - Di chuyển mượt bằng: rê chuột trên cột, phím `↑` / `↓` (tự chuyển cột & sang trang mới khi hết cột phải),
 *   hoặc vuốt dọc nhẹ trong cột trên màn hình cảm ứng.
 * - Mọi thao tác cập nhật trực tiếp class/style qua `ref` (0 React re-render khi rê chuột 120Hz, 0 lệch bố cục).
 */
export function useDomPaginatedReadingRuler(options: {
  enabled: boolean;
  columns: number;
  pageIndex: number;
  chapterId: string;
  layoutDepsKey: string;
  stageRef: React.RefObject<HTMLDivElement | null>;
  clipRef: React.RefObject<HTMLDivElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLElement | null>;
  indicatorRef: React.RefObject<HTMLSpanElement | null>;
  onStepPrevPage: () => void;
  onStepNextPage: () => void;
}) {
  const {
    enabled, columns, pageIndex, chapterId, layoutDepsKey,
    stageRef, clipRef, trackRef, headerRef, indicatorRef,
    onStepPrevPage, onStepNextPage,
  } = options;

  const fragmentsRef = useRef<DomColumnFragment[]>([]);
  const activeIdxRef = useRef(0);
  const pendingEdgeRef = useRef<'first' | 'last'>('first');
  const prevPageKeyRef = useRef(`${chapterId}:${pageIndex}`);

  const hideIndicator = useCallback(() => {
    const ind = indicatorRef.current;
    if (ind) ind.style.opacity = '0';
  }, [indicatorRef]);

  const applyActiveIndex = useCallback(
    (nextIdx: number) => {
      const track = trackRef.current;
      const stage = stageRef.current;
      const contentRoot = track?.querySelector<HTMLElement>('.reading-content');
      const list = fragmentsRef.current;
      if (!enabled || !contentRoot || !stage || list.length === 0) {
        contentRoot?.classList.remove('reader-ruler-active');
        headerRef.current?.classList.remove('reader-ruler-header-dim');
        hideIndicator();
        return;
      }

      const clamped = Math.max(0, Math.min(list.length - 1, nextIdx));
      activeIdxRef.current = clamped;
      const chosen = list[clamped];

      contentRoot.classList.add('reader-ruler-active');
      const allFocused = contentRoot.querySelectorAll<HTMLElement>('.reader-ruler-focus');
      allFocused.forEach((el) => {
        if (el !== chosen.block) el.classList.remove('reader-ruler-focus');
      });
      chosen.block.classList.add('reader-ruler-focus');

      if (headerRef.current) {
        if (pageIndex === 0 && clamped === 0 && chosen.col === 0) {
          headerRef.current.classList.remove('reader-ruler-header-dim');
        } else {
          headerRef.current.classList.add('reader-ruler-header-dim');
        }
      }

      const ind = indicatorRef.current;
      if (ind) {
        const stageRect = stage.getBoundingClientRect();
        const x = Math.max(4, Math.round(chosen.left - stageRect.left - 10));
        const y = Math.round(chosen.top - stageRect.top + 2);
        const h = Math.max(14, Math.round(chosen.bottom - chosen.top - 4));
        ind.style.opacity = '1';
        ind.style.height = `${h}px`;
        ind.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    },
    [enabled, headerRef, hideIndicator, indicatorRef, pageIndex, stageRef, trackRef],
  );

  const collectVisibleFragments = useCallback(
    (commitPageEdge = true) => {
      const clip = clipRef.current;
      const track = trackRef.current;
      const contentRoot = track?.querySelector<HTMLElement>('.reading-content');
      if (!enabled || !clip || !contentRoot) {
        fragmentsRef.current = [];
        contentRoot?.classList.remove('reader-ruler-active');
        headerRef.current?.classList.remove('reader-ruler-header-dim');
        hideIndicator();
        return;
      }

      const clipRect = clip.getBoundingClientRect();
      if (clipRect.width < 40 || clipRect.height < 40) return;
      const midX = clipRect.left + clipRect.width / 2;

      const blocks = Array.from(contentRoot.querySelectorAll<HTMLElement>(FOCUSABLE_BLOCK_SELECTOR));
      const col0: DomColumnFragment[] = [];
      const col1: DomColumnFragment[] = [];

      for (const block of blocks) {
        if (block.parentElement?.closest(FOCUSABLE_BLOCK_SELECTOR)) {
          block.classList.remove('reader-ruler-focus');
          continue;
        }
        const clientRects = Array.from(block.getClientRects());
        const byCol = new Map<0 | 1, { top: number; bottom: number; left: number }>();

        for (const r of clientRects) {
          if (r.width < 6 || r.height < 6) continue;
          if (r.right <= clipRect.left + 6 || r.left >= clipRect.right - 6) continue;
          if (r.bottom <= clipRect.top + 4 || r.top >= clipRect.bottom - 4) continue;
          const clampedTop = Math.max(clipRect.top, r.top);
          const clampedBottom = Math.min(clipRect.bottom, r.bottom);
          const clampedLeft = Math.max(clipRect.left, r.left);
          if (clampedBottom - clampedTop < 6) continue;
          const col: 0 | 1 = columns === 2 && (r.left + r.right) / 2 >= midX ? 1 : 0;
          const prev = byCol.get(col);
          if (!prev) {
            byCol.set(col, { top: clampedTop, bottom: clampedBottom, left: clampedLeft });
          } else {
            prev.top = Math.min(prev.top, clampedTop);
            prev.bottom = Math.max(prev.bottom, clampedBottom);
            prev.left = Math.min(prev.left, clampedLeft);
          }
        }

        for (const [col, box] of byCol.entries()) {
          const frag: DomColumnFragment = { col, block, ...box };
          if (col === 0) col0.push(frag);
          else col1.push(frag);
        }
      }

      col0.sort((a, b) => a.top - b.top);
      col1.sort((a, b) => a.top - b.top);
      const merged = [...col0, ...col1];
      fragmentsRef.current = merged;

      if (merged.length === 0) {
        hideIndicator();
        return;
      }

      const pageKey = `${chapterId}:${pageIndex}`;
      let targetIdx = activeIdxRef.current;
      if (prevPageKeyRef.current !== pageKey) {
        if (!commitPageEdge) {
          hideIndicator();
          return;
        }
        prevPageKeyRef.current = pageKey;
        targetIdx = pendingEdgeRef.current === 'last' ? merged.length - 1 : 0;
        pendingEdgeRef.current = 'first';
      } else {
        targetIdx = Math.min(merged.length - 1, Math.max(0, targetIdx));
      }
      applyActiveIndex(targetIdx);
    },
    [applyActiveIndex, chapterId, clipRef, columns, enabled, headerRef, hideIndicator, pageIndex, trackRef],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!enabled) {
      const contentRoot = track?.querySelector<HTMLElement>('.reading-content');
      if (contentRoot) {
        contentRoot.classList.remove('reader-ruler-active');
        contentRoot.querySelectorAll('.reader-ruler-focus').forEach((el) => el.classList.remove('reader-ruler-focus'));
      }
      headerRef.current?.classList.remove('reader-ruler-header-dim');
      hideIndicator();
      return;
    }

    const pageKey = `${chapterId}:${pageIndex}`;
    const pageChanged = prevPageKeyRef.current !== pageKey;
    const isTransitioning =
      pageChanged &&
      Boolean(track) &&
      track!.style.transition !== '' &&
      track!.style.transition !== 'none';

    let settled = false;
    const commitSettled = () => {
      if (settled) return;
      settled = true;
      collectVisibleFragments(true);
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === track && event.propertyName === 'transform') {
        commitSettled();
      }
    };

    if (isTransitioning) {
      hideIndicator();
      track?.addEventListener('transitionend', onTransitionEnd);
    }

    // Nếu không trượt (resize / đổi font / nhảy chương tức thì) đo ngay ở frame đầu;
    // nếu đang trượt 220ms chỉ chốt prevPageKeyRef & pendingEdgeRef sau khi transitionend hoặc timer 245ms.
    const raf = window.requestAnimationFrame(() => {
      if (!isTransitioning) commitSettled();
    });
    const settleTimer = window.setTimeout(commitSettled, 245);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
      track?.removeEventListener('transitionend', onTransitionEnd);
    };
  }, [chapterId, collectVisibleFragments, enabled, headerRef, hideIndicator, layoutDepsKey, pageIndex, trackRef]);

  const updateFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return;
      const clip = clipRef.current;
      const list = fragmentsRef.current;
      if (!clip || list.length === 0) return;

      const clipRect = clip.getBoundingClientRect();
      if (
        clientX < clipRect.left - 24 ||
        clientX > clipRect.right + 24 ||
        clientY < clipRect.top - 8 ||
        clientY > clipRect.bottom + 8
      ) {
        return;
      }

      const targetCol: 0 | 1 =
        columns === 2 && clientX >= clipRect.left + clipRect.width / 2 ? 1 : 0;

      let bestIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < list.length; i += 1) {
        const f = list[i];
        if (f.col !== targetCol) continue;
        if (clientY >= f.top - 4 && clientY <= f.bottom + 4) {
          bestIdx = i;
          break;
        }
        const dist = clientY < f.top ? f.top - clientY : clientY - f.bottom;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0 && bestIdx !== activeIdxRef.current) {
        applyActiveIndex(bestIdx);
      }
    },
    [applyActiveIndex, clipRef, columns, enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const list = fragmentsRef.current;
      if (list.length === 0) return;

      e.preventDefault();
      if (e.key === 'ArrowDown') {
        if (activeIdxRef.current < list.length - 1) {
          applyActiveIndex(activeIdxRef.current + 1);
        } else {
          pendingEdgeRef.current = 'first';
          onStepNextPage();
        }
      } else if (activeIdxRef.current > 0) {
        applyActiveIndex(activeIdxRef.current - 1);
      } else {
        pendingEdgeRef.current = 'last';
        onStepPrevPage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyActiveIndex, enabled, onStepNextPage, onStepPrevPage]);

  return { updateFromClientPoint };
}

export interface CanvasPaginatedRulerTarget {
  col: 0 | 1;
  blockIndex: number;
}

interface CanvasSpreadBlockEntry {
  col: 0 | 1;
  blockIndex: number;
  minY: number;
  maxY: number;
}

function extractColumnBlocks(page: CanvasColumnPage | null, col: 0 | 1): CanvasSpreadBlockEntry[] {
  if (!page) return [];
  const map = new Map<number, CanvasSpreadBlockEntry>();
  for (const item of page.items) {
    if (item.kind !== 'text-line' || item.blockIndex === undefined) continue;
    const localTop = item.y - page.startY + 8;
    const localBottom = localTop + item.height;
    const existing = map.get(item.blockIndex);
    if (!existing) {
      map.set(item.blockIndex, { col, blockIndex: item.blockIndex, minY: localTop, maxY: localBottom });
    } else {
      existing.minY = Math.min(existing.minY, localTop);
      existing.maxY = Math.max(existing.maxY, localBottom);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.minY - b.minY);
}

/**
 * Thanh Dẫn Mắt cho chế độ Lật trang trên `<canvas>` bảo mật (`GuestCanvasPaginatedView`, bảo toàn `D-028`).
 */
export function useCanvasPaginatedReadingRuler(options: {
  enabled: boolean;
  columns: 1 | 2;
  spreadIndex: number;
  chapterId: string;
  leftPage: CanvasColumnPage | null;
  rightPage: CanvasColumnPage | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onStepPrevSpread: () => void;
  onStepNextSpread: () => void;
}) {
  const {
    enabled, columns, spreadIndex, chapterId, leftPage, rightPage,
    canvasRef, onStepPrevSpread, onStepNextSpread,
  } = options;

  const [target, setTarget] = useState<CanvasPaginatedRulerTarget | null>(null);
  const blocksRef = useRef<CanvasSpreadBlockEntry[]>([]);
  const activeIdxRef = useRef(0);
  const pendingEdgeRef = useRef<'first' | 'last'>('first');
  const prevSpreadKeyRef = useRef('');

  useEffect(() => {
    if (!enabled) {
      blocksRef.current = [];
      setTarget(null);
      return;
    }
    const merged = [
      ...extractColumnBlocks(leftPage, 0),
      ...(columns === 2 ? extractColumnBlocks(rightPage, 1) : []),
    ];
    blocksRef.current = merged;
    if (merged.length === 0) {
      setTarget(null);
      return;
    }
    const key = `${chapterId}:${spreadIndex}`;
    let idx = activeIdxRef.current;
    if (prevSpreadKeyRef.current !== key) {
      prevSpreadKeyRef.current = key;
      idx = pendingEdgeRef.current === 'last' ? merged.length - 1 : 0;
      pendingEdgeRef.current = 'first';
    } else {
      idx = Math.min(merged.length - 1, Math.max(0, idx));
    }
    activeIdxRef.current = idx;
    const chosen = merged[idx];
    setTarget((prev) =>
      prev && prev.col === chosen.col && prev.blockIndex === chosen.blockIndex
        ? prev
        : { col: chosen.col, blockIndex: chosen.blockIndex },
    );
  }, [chapterId, columns, enabled, leftPage, rightPage, spreadIndex]);

  const updateFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled || !canvasRef.current) return;
      const list = blocksRef.current;
      if (list.length === 0) return;
      const rect = canvasRef.current.getBoundingClientRect();
      if (
        clientX < rect.left - 20 ||
        clientX > rect.right + 20 ||
        clientY < rect.top - 8 ||
        clientY > rect.bottom + 8
      ) {
        return;
      }
      const targetCol: 0 | 1 = columns === 2 && clientX >= rect.left + rect.width / 2 ? 1 : 0;
      const localY = clientY - rect.top;

      let bestIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i];
        if (entry.col !== targetCol) continue;
        if (localY >= entry.minY - 4 && localY <= entry.maxY + 4) {
          bestIdx = i;
          break;
        }
        const dist = localY < entry.minY ? entry.minY - localY : localY - entry.maxY;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestIdx !== activeIdxRef.current) {
        activeIdxRef.current = bestIdx;
        const chosen = list[bestIdx];
        setTarget({ col: chosen.col, blockIndex: chosen.blockIndex });
      }
    },
    [canvasRef, columns, enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const list = blocksRef.current;
      if (list.length === 0) return;

      e.preventDefault();
      if (e.key === 'ArrowDown') {
        if (activeIdxRef.current < list.length - 1) {
          activeIdxRef.current += 1;
          const chosen = list[activeIdxRef.current];
          setTarget({ col: chosen.col, blockIndex: chosen.blockIndex });
        } else {
          pendingEdgeRef.current = 'first';
          onStepNextSpread();
        }
      } else if (activeIdxRef.current > 0) {
        activeIdxRef.current -= 1;
        const chosen = list[activeIdxRef.current];
        setTarget({ col: chosen.col, blockIndex: chosen.blockIndex });
      } else {
        pendingEdgeRef.current = 'last';
        onStepPrevSpread();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onStepNextSpread, onStepPrevSpread]);

  return { focusedTarget: enabled ? target : null, updateFromClientPoint };
}
