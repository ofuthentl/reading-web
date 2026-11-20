import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Pencil } from 'lucide-react';
import type { Book, ReadingProgress } from '@/types';
import { useCoverUrl } from '@/hooks/useCoverUrl';

const CLOTH_COVER_PALETTE = [
  '#5a2b27', // Oxblood
  '#2d4337', // Forest Pine
  '#6b492a', // Saddle Bronze
  '#333d45', // Prussian Slate
  '#4f3829', // Walnut Leather
  '#56323c', // Antique Plum
  '#70532c', // Ochre Cloth
  '#3a473d', // Sage Moss
];

function pickClothCoverColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CLOTH_COVER_PALETTE[hash % CLOTH_COVER_PALETTE.length];
}

function getProgressPercent(progress?: ReadingProgress): number | null {
  if (!progress) return null;
  if (progress.completed) return 100;
  const clamped = Math.min(1, Math.max(0, progress.scrollRatio || 0));
  return Math.round(clamped * 100);
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return 'Vừa đọc';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(timestamp).toLocaleDateString('vi-VN');
}

interface BookCardProps {
  book: Book;
  progress?: ReadingProgress;
  selectionMode: boolean;
  selected: boolean;
  layout?: 'vertical' | 'horizontal';
  onOpen: (book: Book) => void;
  onToggleSelect: (bookId: string) => void;
  onEdit?: (book: Book) => void;
}

export function BookCard({
  book,
  progress,
  selectionMode,
  selected,
  layout = 'vertical',
  onOpen,
  onToggleSelect,
  onEdit,
}: BookCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [book.cover_key]);

  useEffect(() => {
    if (isNearViewport) return;
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '280px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isNearViewport]);

  const coverUrl = useCoverUrl(book.cover_key, isNearViewport);
  const showImage = Boolean(coverUrl && !imgFailed);
  const clothColor = pickClothCoverColor(`${book.id}-${book.title}`);
  const percent = getProgressPercent(progress);
  const isCompleted = Boolean(progress?.completed);

  const handleActivate = () => {
    if (selectionMode) {
      onToggleSelect(book.id);
    } else {
      onOpen(book);
    }
  };

  const renderCover = (compact: boolean) => (
    <div
      className={`relative aspect-[3/4] overflow-hidden rounded-lg border border-line bg-subtle shadow-sm transition-all duration-200 ${
        selected
          ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas'
          : 'group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-md dark:group-hover:border-accent/45 dark:group-hover:shadow-[0_14px_28px_-10px_rgba(0,0,0,0.85),0_0_22px_-6px_rgba(216,185,126,0.25)]'
      } ${compact ? 'w-[4.5rem] shrink-0' : 'w-full'}`}
    >
      {showImage ? (
        <img
          src={coverUrl!}
          alt={book.title}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          style={{ backgroundColor: clothColor }}
          className="relative flex h-full w-full flex-col justify-between p-2.5 text-[#f6efe2]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-2 border-r border-black/25 bg-black/15"
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute rounded-[2px] border border-[#f5ead6]/20 ${
              compact ? 'inset-1.5 left-2.5' : 'inset-2.5 left-3.5'
            }`}
          />
          <div className={compact ? 'pl-1.5 pt-1' : 'pl-2.5 pt-2'}>
            <p
              className={`font-display font-semibold leading-snug text-[#f6efe2] ${
                compact ? 'line-clamp-3 text-[10px]' : 'line-clamp-4 text-sm'
              }`}
            >
              {book.title}
            </p>
            {!compact && <span className="mt-2 block h-px w-6 bg-[#e6d5b8]/45" />}
          </div>
          {!compact && (
            <p className="truncate pl-2.5 pb-1 text-[11px] text-[#e6d5b8]/85">{book.author}</p>
          )}
        </div>
      )}

      {/* Badge định dạng */}
      <span
        className={`pointer-events-none absolute right-1.5 top-1.5 rounded border border-[#f3e9d7]/20 bg-[#16120f]/80 font-semibold uppercase tracking-wider text-[#f3e9d7] ${
          compact ? 'px-1 py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[10px]'
        }`}
      >
        {book.file_type}
      </span>

      {/* Checkbox chọn nhiều */}
      {selectionMode && (
        <span
          aria-hidden="true"
          className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
            selected
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-[#f3e9d7]/55 bg-[#16120f]/65 text-transparent'
          }`}
        >
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        </span>
      )}

      {/* Nút chỉnh sửa kín đáo (sẵn sàng cho 3.3) */}
      {!selectionMode && !compact && onEdit && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(book);
          }}
          aria-label={`Chỉnh sửa ${book.title}`}
          title="Chỉnh sửa thông tin"
          className="absolute left-1.5 top-1.5 rounded-md border border-[#f3e9d7]/20 bg-[#16120f]/75 p-1.5 text-[#f3e9d7] opacity-0 transition-opacity hover:bg-[#16120f] focus:opacity-100 group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Thanh tiến độ đọc trên bìa */}
      {percent !== null && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1 bg-black/40"
        >
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${Math.max(percent, isCompleted ? 100 : 6)}%` }}
          />
        </div>
      )}
    </div>
  );

  if (layout === 'horizontal') {
    return (
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-pressed={selectionMode ? selected : undefined}
        onClick={handleActivate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleActivate();
          }
        }}
        className={`moonlit-card group flex w-72 shrink-0 cursor-pointer items-center gap-3.5 rounded-xl border bg-surface p-3 text-left shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-80 ${
          selected
            ? 'border-accent bg-subtle/60'
            : 'border-line hover:border-line-strong dark:hover:border-accent/35'
        }`}
      >
        {renderCover(true)}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-ink transition-colors group-hover:text-accent">
            {book.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{book.author}</p>

          {progress && (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 font-medium text-accent">
                  {isCompleted ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Hoàn thành
                    </>
                  ) : (
                    `Chương ${progress.chapterIndex + 1} · ${percent ?? 0}%`
                  )}
                </span>
                <span className="truncate text-ink-faint">
                  {formatRelativeTime(progress.updatedAt)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.max(percent ?? 0, isCompleted ? 100 : 6)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? selected : undefined}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleActivate();
        }
      }}
      className="group flex cursor-pointer flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-lg"
    >
      {renderCover(false)}

      <div className="mt-2.5 space-y-0.5 px-0.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors group-hover:text-accent">
          {book.title}
        </h3>
        <p className="truncate text-xs text-ink-muted">{book.author}</p>
        {percent !== null && (
          <div className="flex items-center justify-between pt-0.5 text-[11px] font-medium text-accent">
            <span>{isCompleted ? 'Đã đọc xong' : `Ch. ${(progress?.chapterIndex ?? 0) + 1}`}</span>
            <span>{percent}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
