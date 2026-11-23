import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, Check, ChevronLeft, ChevronRight, Info, Lock } from 'lucide-react';
import type { AuthRole, Book, ReadingProgress } from '@/types';
import {
  computeBookProgressPercent,
  getBookSortTitle,
  getDisplayAuthor,
  getGuestLockLabel,
  pickClothCoverColor,
} from '@/lib/bookMetadata';
import { useCardReveal } from '@/hooks/useCardReveal';
import { useCoverUrl } from '@/hooks/useCoverUrl';

interface EditorialCardProps {
  book: Book;
  rankNumber: number;
  shouldLoadCover: boolean;
  progress?: ReadingProgress;
  isPlanToRead?: boolean;
  selectionMode: boolean;
  selected: boolean;
  sessionRole?: AuthRole;
  onOpenBook: (book: Book) => void;
  onToggleSelect: (bookId: string) => void;
  onInspectBook?: (book: Book) => void;
  onTogglePlanToReadBook?: (book: Book, nextPlanToRead: boolean) => void;
}

function EditorialRankedCard({
  book,
  rankNumber,
  shouldLoadCover,
  progress,
  isPlanToRead = false,
  selectionMode,
  selected,
  sessionRole,
  onOpenBook,
  onToggleSelect,
  onInspectBook,
  onTogglePlanToReadBook,
}: EditorialCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [book.cover_key]);

  const coverUrl = useCoverUrl(book.cover_key, shouldLoadCover);
  const showImage = Boolean(coverUrl && !imgFailed);
  const displayTitle = getBookSortTitle(book);
  const displayAuthor = getDisplayAuthor(book.author, book.title);
  const clothColor = pickClothCoverColor(`${book.id}-${book.title}`);
  const percent = computeBookProgressPercent(book, progress);
  const isCompleted = Boolean(progress?.completed);
  const isMemberLocked = sessionRole === 'guest' && Boolean(book.guest_locked);
  const guestLockLabel = getGuestLockLabel(book, sessionRole);
  const rankText = String(rankNumber).padStart(2, '0');

  const handleActivate = () => {
    if (selectionMode) {
      onToggleSelect(book.id);
    } else {
      onOpenBook(book);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? selected : undefined}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleActivate();
        }
      }}
      className={`group relative aspect-[7/10] w-[9.5rem] shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-subtle text-left transition-[border-color,box-shadow] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-[11rem] md:w-[11.75rem] ${
        selected
          ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-canvas'
          : 'border-line hover:border-line-strong hover:shadow-[0_14px_28px_-12px_rgba(43,36,29,0.34)] dark:hover:border-line-strong dark:hover:shadow-[0_16px_30px_-12px_rgba(0,0,0,0.88)]'
      }`}
    >
        {showImage ? (
          <img
            src={coverUrl!}
            alt={book.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
          />
        ) : (
        <div
          style={{ backgroundColor: clothColor }}
          className="relative flex h-full w-full flex-col justify-between p-3.5 text-[#f6efe2]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-2 border-r border-black/25 bg-black/15"
          />
          <p className="line-clamp-3 pl-2 pt-1 font-display text-xs font-semibold leading-snug text-[#f6efe2]/90">
            {displayTitle}
          </p>
        </div>
      )}

      {/* Lớp shader phủ tối đa tầng + hiệu ứng khối gáy sách giúp số & chữ luôn nổi rõ trên mọi bìa sáng */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to top, rgba(6,7,10,0.97) 0%, rgba(8,9,13,0.92) 24%, rgba(10,11,16,0.74) 48%, rgba(10,12,18,0.34) 70%, rgba(10,12,18,0.08) 88%, rgba(0,0,0,0.14) 100%)',
          boxShadow:
            'inset 6px 0 12px -6px rgba(0,0,0,0.5), inset -4px 0 10px -6px rgba(0,0,0,0.4)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 115% 85% at 32% 100%, rgba(4,5,8,0.72) 0%, rgba(4,5,8,0.32) 55%, transparent 100%)',
        }}
      />

      {guestLockLabel && (
        <span
          className={`pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm ${
            isMemberLocked
              ? 'border-rose-300/40 bg-[#140b0e]/88 text-rose-100'
              : 'border-amber-300/35 bg-black/80 text-amber-200'
          }`}
        >
          {isMemberLocked && <Lock className="h-2.5 w-2.5 shrink-0" />}
          <span>{guestLockLabel}</span>
        </span>
      )}

      {selectionMode ? (
        <span
          aria-hidden="true"
          className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
            selected
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-[#f3e9d7]/55 bg-[#16120f]/70 text-transparent'
          }`}
        >
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        </span>
      ) : (
        (onInspectBook || (!isMemberLocked && onTogglePlanToReadBook)) && (
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {!isMemberLocked && onTogglePlanToReadBook && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePlanToReadBook(book, !isPlanToRead);
                }}
                aria-label={isPlanToRead ? `Bỏ Đọc sau ${book.title}` : `Lưu Đọc sau ${book.title}`}
                aria-pressed={isPlanToRead}
                title={isPlanToRead ? 'Gỡ tập này khỏi Đọc sau' : 'Lưu tập này vào Đọc sau'}
                className={`rounded-md border p-1.5 backdrop-blur-sm transition-all ${
                  isPlanToRead
                    ? 'border-sky-400/55 bg-black/80 text-sky-300 opacity-100 hover:bg-black/95'
                    : 'touch-action-visible border-white/20 bg-black/65 text-white/90 opacity-85 hover:bg-black/90 focus:opacity-100 group-hover:opacity-100 sm:opacity-0'
                }`}
              >
                <Bookmark className={`h-3.5 w-3.5 ${isPlanToRead ? 'fill-sky-300' : ''}`} />
              </button>
            )}
            {onInspectBook && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onInspectBook(book);
                }}
                aria-label={`Xem giới thiệu ${book.title}`}
                title="Xem giới thiệu & tuỳ chọn"
                className="touch-action-visible rounded-md border border-white/20 bg-black/65 p-1.5 text-white/90 opacity-85 backdrop-blur-sm transition-opacity hover:bg-black/90 focus:opacity-100 group-hover:opacity-100 sm:opacity-0"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      )}

      {/* Số thứ tự viền mảnh nghệ thuật + Vạch nhấn + Tiêu đề & Tác giả độ tương phản cao */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end px-3 pt-6 sm:px-3.5 ${
          percent !== null ? 'pb-4' : 'pb-3.5'
        }`}
      >
        <span
          aria-hidden="true"
          className="editorial-rank-num select-none font-display text-[2.75rem] font-normal italic leading-[0.86] tracking-[-0.03em] sm:text-[3.2rem]"
        >
          {rankText}
        </span>
        <span
          aria-hidden="true"
          className="my-2 block h-[2px] w-6 rounded-full bg-[#B22222] shadow-[0_1px_4px_rgba(0,0,0,0.75)] transition-[width,background-color] duration-300 ease-out group-hover:w-10 group-hover:bg-[#d62828]"
        />
        <h3 className="line-clamp-2 text-[12.5px] font-semibold leading-snug tracking-tight text-white transition-colors duration-200 group-hover:text-[#ffd6d6] [text-shadow:0_1px_4px_rgba(0,0,0,0.92)] sm:text-[13.5px]">
          {displayTitle}
        </h3>
        <p className="mt-0.5 truncate text-[10.5px] font-medium text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] sm:text-[11px]">
          {displayAuthor}
        </p>
      </div>

      {percent !== null && (
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
          <div
            className="h-full bg-crimson-accent transition-all duration-300"
            style={{ width: `${Math.max(percent, isCompleted ? 100 : 6)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export interface EditorialBookStripProps {
  eyebrow: string;
  leadTitle: string;
  accentTitle: string;
  books: Book[];
  progress: Record<string, ReadingProgress>;
  planToReadBookIds?: ReadonlySet<string>;
  selectionMode: boolean;
  selectedIds: Set<string>;
  sessionRole?: AuthRole;
  isDark: boolean;
  onOpenBook: (book: Book) => void;
  onToggleSelect: (bookId: string) => void;
  onInspectBook?: (book: Book) => void;
  onTogglePlanToReadBook?: (book: Book, nextPlanToRead: boolean) => void;
}

/**
 * Dải thẻ sách biên tập ngang (D-029 PA-1A, tuân thủ D-027 100% nguyên bản Ofu's Library)
 * dùng chung cho cả "Thịnh hành tuần này" và "Mới cập nhật gần đây".
 */
export function EditorialBookStrip({
  eyebrow,
  leadTitle,
  accentTitle,
  books,
  progress,
  planToReadBookIds,
  selectionMode,
  selectedIds,
  sessionRole,
  isDark,
  onOpenBook,
  onToggleSelect,
  onInspectBook,
  onTogglePlanToReadBook,
}: EditorialBookStripProps) {
  const { cardRef: sectionRef, isNearViewport } = useCardReveal<HTMLElement>();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    syncScrollState();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [books.length, syncScrollState]);

  const scrollByStep = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(280, Math.round(el.clientWidth * 0.72));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  if (books.length === 0) return null;

  return (
    <section ref={sectionRef} aria-label={`${leadTitle} ${accentTitle}`} className="space-y-4">
      <div className="flex items-end justify-between gap-4 border-b border-line-strong/70 pb-3">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-crimson-accent">
            {eyebrow}
          </p>
          <h2 className="font-display text-[1.75rem] font-normal leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.15rem]">
            <span>{leadTitle} </span>
            <span className="italic text-crimson-accent">{accentTitle}</span>
          </h2>
        </div>

        {(canScrollLeft || canScrollRight) && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => scrollByStep(-1)}
              disabled={!canScrollLeft}
              aria-label="Cuộn sang trái"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByStep(1)}
              disabled={!canScrollRight}
              aria-label="Cuộn sang phải"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        onScroll={syncScrollState}
        className={`-mx-1 flex gap-3.5 overflow-x-auto overscroll-x-contain px-1 py-1.5 scrollbar-hover sm:gap-4 ${
          isDark ? 'scrollbar-hover-dark' : ''
        }`}
      >
        {books.map((book, index) => (
          <EditorialRankedCard
            key={book.id}
            book={book}
            rankNumber={index + 1}
            shouldLoadCover={isNearViewport}
            progress={progress[book.id]}
            isPlanToRead={Boolean(planToReadBookIds?.has(book.id))}
            selectionMode={selectionMode}
            selected={selectedIds.has(book.id)}
            sessionRole={sessionRole}
            onOpenBook={onOpenBook}
            onToggleSelect={onToggleSelect}
            onInspectBook={onInspectBook}
            onTogglePlanToReadBook={onTogglePlanToReadBook}
          />
        ))}
      </div>
    </section>
  );
}
