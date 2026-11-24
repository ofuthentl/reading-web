import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { pickClothCoverColor } from '@/lib/bookMetadata';
import type { ShelfSummary } from '@/lib/shelfSummary';
import { SpineBookshelfSlot } from '@/components/SpineBookshelfSlot';
import '@/styles/bookshelf.css';

const HOVER_INTENT_MS = 40;
const ROW_HORIZONTAL_PADDING = 28;
const OPEN_BOOK_RESERVE_PX = 128;
const SPINE_GAP_PX = 4;

function computeSpineWidth(bookCount: number): number {
  return Math.max(30, Math.min(44, Math.round(26 + bookCount * 0.42)));
}

function packSummariesIntoRows(
  summaries: readonly ShelfSummary[],
  containerWidth: number,
): ShelfSummary[][] {
  if (summaries.length === 0) return [];
  const budget = Math.max(84, containerWidth - ROW_HORIZONTAL_PADDING - OPEN_BOOK_RESERVE_PX);
  const rows: ShelfSummary[][] = [];
  let currentRow: ShelfSummary[] = [];
  let usedPx = 0;

  for (const item of summaries) {
    const w = computeSpineWidth(item.bookCount);
    const needed = currentRow.length === 0 ? w : w + SPINE_GAP_PX;
    if (currentRow.length > 0 && usedPx + needed > budget) {
      rows.push(currentRow);
      currentRow = [item];
      usedPx = w;
    } else {
      currentRow.push(item);
      usedPx += needed;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

interface SpineBookshelfRowProps {
  row: readonly ShelfSummary[];
  activeKey: string | null;
  registerButtonRef: (shelfKey: string, node: HTMLButtonElement | null) => void;
  onHoverIntent: (shelfKey: string) => void;
  onActivatePreview: (shelfKey: string) => void;
  onOpenShelf: (shelfKey: string) => void;
  onStepNeighbor: (currentKey: string, delta: -1 | 1) => void;
}

function SpineBookshelfRow({
  row,
  activeKey,
  registerButtonRef,
  onHoverIntent,
  onActivatePreview,
  onOpenShelf,
  onStepNeighbor,
}: SpineBookshelfRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [isRowVisible, setIsRowVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (isRowVisible) return;
    const node = rowRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsRowVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            setIsRowVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: '360px 0px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [isRowVisible]);

  const hasOpen = row.some((item) => item.shelf.key === activeKey);

  return (
    <div ref={rowRef} className="spine-shelf-row-wrap">
      <div className={`spine-shelf-row ${hasOpen ? 'has-open' : ''}`}>
        {row.map((summary) => (
          <SpineBookshelfSlot
            key={summary.shelf.key}
            summary={summary}
            spineWidth={computeSpineWidth(summary.bookCount)}
            isOpen={summary.shelf.key === activeKey}
            isRowVisible={isRowVisible}
            registerButtonRef={registerButtonRef}
            onHoverIntent={onHoverIntent}
            onActivatePreview={onActivatePreview}
            onOpenShelf={onOpenShelf}
            onStepNeighbor={onStepNeighbor}
          />
        ))}
      </div>
      <div className="spine-shelf-ledge" />
    </div>
  );
}

export interface SpineBookshelfViewProps {
  summaries: readonly ShelfSummary[];
  onOpenShelf: (shelfKey: string) => void;
}

export function SpineBookshelfView({ summaries, onOpenShelf }: SpineBookshelfViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const slotButtonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.min(1180, Math.max(320, window.innerWidth - 32)) : 960,
  );
  const [activeKey, setActiveKey] = useState<string | null>(
    () => summaries[0]?.shelf.key ?? null,
  );

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => {
      const w = node.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  // Giữ Single Active Owner luôn hợp lệ khi lọc/tìm kiếm thay đổi danh sách kệ
  useEffect(() => {
    if (summaries.length === 0) {
      setActiveKey(null);
      return;
    }
    if (!activeKey || !summaries.some((s) => s.shelf.key === activeKey)) {
      setActiveKey(summaries[0].shelf.key);
    }
  }, [summaries, activeKey]);

  const registerButtonRef = useCallback(
    (shelfKey: string, node: HTMLButtonElement | null) => {
      if (node) slotButtonsRef.current.set(shelfKey, node);
      else slotButtonsRef.current.delete(shelfKey);
    },
    [],
  );

  const handleHoverIntent = useCallback((shelfKey: string) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      setActiveKey(shelfKey);
    }, HOVER_INTENT_MS);
  }, []);

  const handleActivatePreview = useCallback((shelfKey: string) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setActiveKey(shelfKey);
  }, []);

  const handleStepNeighbor = useCallback(
    (currentKey: string, delta: -1 | 1) => {
      const idx = summaries.findIndex((s) => s.shelf.key === currentKey);
      if (idx < 0) return;
      const nextIdx = Math.min(summaries.length - 1, Math.max(0, idx + delta));
      if (nextIdx === idx) return;
      const nextKey = summaries[nextIdx].shelf.key;
      setActiveKey(nextKey);
      slotButtonsRef.current.get(nextKey)?.focus();
    },
    [summaries],
  );

  const rows = useMemo(
    () => packSummariesIntoRows(summaries, containerWidth),
    [summaries, containerWidth],
  );

  const activeSummary = useMemo(
    () => summaries.find((s) => s.shelf.key === activeKey) ?? summaries[0] ?? null,
    [summaries, activeKey],
  );

  if (!activeSummary) return null;

  const badgeBg = pickClothCoverColor(
    `${activeSummary.shelf.key}-${activeSummary.shelf.name}`,
  );
  const statusLabel = activeSummary.isGuestLocked
    ? 'Giới hạn'
    : activeSummary.readingStatus === 'completed'
      ? 'Hoàn thành'
      : activeSummary.readingStatus === 'reading'
        ? `${activeSummary.progressPercent ?? 0}%`
        : activeSummary.isPlanToRead
          ? 'Đọc sau'
          : 'Chưa đọc';

  return (
    <div
      ref={stageRef}
      aria-label="Tủ gáy sách Light Novel"
      className="spine-shelf-stage rounded-2xl border pb-3 shadow-sm"
    >
      <div>
        {rows.map((row, rowIdx) => (
          <SpineBookshelfRow
            key={row[0]?.shelf.key ?? `row-${rowIdx}`}
            row={row}
            activeKey={activeSummary.shelf.key}
            registerButtonRef={registerButtonRef}
            onHoverIntent={handleHoverIntent}
            onActivatePreview={handleActivatePreview}
            onOpenShelf={onOpenShelf}
            onStepNeighbor={handleStepNeighbor}
          />
        ))}
      </div>

      {/* Thanh thông tin cố định dưới đáy tủ sách */}
      <div className="spine-shelf-footer sticky bottom-2 z-40 mx-3 mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            style={{ backgroundColor: badgeBg, color: '#f6efe2' }}
            className="shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-bold tabular-nums"
          >
            {activeSummary.bookCount} tập
          </span>
          <span className="truncate font-display text-sm font-semibold">
            {activeSummary.isFavorite ? '★ ' : ''}
            {activeSummary.shelf.name}
          </span>
          <span className="hidden truncate text-[11.5px] opacity-70 sm:inline">
            · {activeSummary.authorLabel}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 text-[11.5px]">
          {activeSummary.ratingCount > 0 && activeSummary.ratingAverage !== null && (
            <span className="font-semibold tabular-nums text-amber-500">
              ★ {activeSummary.ratingAverage.toFixed(1)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 tabular-nums opacity-80">
            {activeSummary.isGuestLocked && <Lock className="h-3 w-3 text-rose-400" />}
            <span>{statusLabel}</span>
          </span>
          <button
            type="button"
            onClick={() => onOpenShelf(activeSummary.shelf.key)}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            <span>Mở kệ</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
