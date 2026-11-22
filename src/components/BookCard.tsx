import { type CSSProperties, useEffect, useState } from 'react';
import { Check, CheckCircle2, Info, Lock, Pencil, X } from 'lucide-react';
import type { AuthRole, Book, ReadingProgress } from '@/types';
import { formatBytes } from '@/lib/api';
import {
  getBookSortTitle,
  getDisplayAuthor,
  getGuestLockLabel,
  isRecentBookUpload,
  pickClothCoverColor,
} from '@/lib/bookMetadata';
import {
  handleCoverTiltLeave,
  handleCoverTiltMove,
  useCardReveal,
} from '@/hooks/useCardReveal';
import { useCoverUrl } from '@/hooks/useCoverUrl';
import { computeBookProgressPercent } from '@/hooks/useLibraryViewState';

function getProgressChapterLabel(book: Book, progress?: ReadingProgress): string {
  if (!progress) return '';
  if (progress.chapterTitle?.trim()) return progress.chapterTitle.trim();
  const num = (progress.chapterIndex ?? 0) + 1;
  return book.file_type === 'pdf' ? `Trang ${num}` : `Phần ${num}`;
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
  sessionRole?: AuthRole;
  layout?: 'vertical' | 'horizontal';
  staggerIndex?: number;
  onOpen: (book: Book) => void;
  onToggleSelect: (bookId: string) => void;
  onEdit?: (book: Book) => void;
  onInspect?: (book: Book) => void;
  onDismissContinue?: (book: Book) => void;
}

export function BookCard({
  book,
  progress,
  selectionMode,
  selected,
  sessionRole,
  layout = 'vertical',
  staggerIndex = 0,
  onOpen,
  onToggleSelect,
  onEdit,
  onInspect,
  onDismissContinue,
}: BookCardProps) {
  const { cardRef, isNearViewport, isRevealed } = useCardReveal<HTMLDivElement>();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [book.cover_key]);

  const coverUrl = useCoverUrl(book.cover_key, isNearViewport);
  const showImage = Boolean(coverUrl && !imgFailed);
  const displayTitle = getBookSortTitle(book);
  const displayAuthor = getDisplayAuthor(book.author, book.title);
  const clothColor = pickClothCoverColor(`${book.id}-${book.title}`);
  const percent = computeBookProgressPercent(book, progress);
  const chapterLabel = getProgressChapterLabel(book, progress);
  const isCompleted = Boolean(progress?.completed);
  const isMemberLocked = sessionRole === 'guest' && Boolean(book.guest_locked);
  const guestLockLabel = getGuestLockLabel(book, sessionRole);
  const isNew = !guestLockLabel && isRecentBookUpload(book.created_at);
  const staggerDelayMs = (staggerIndex % 6) * 48;

  const handleActivate = () => {
    if (selectionMode) {
      onToggleSelect(book.id);
    } else {
      onOpen(book);
    }
  };

  const renderCover = (compact: boolean) => (
    <div
      onPointerMove={compact ? undefined : handleCoverTiltMove}
      onPointerLeave={compact ? undefined : handleCoverTiltLeave}
      onPointerCancel={compact ? undefined : handleCoverTiltLeave}
      className={`relative aspect-[7/10] overflow-hidden rounded-lg border border-line bg-subtle shadow-sm ${
        compact
          ? 'w-[4.5rem] shrink-0 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-line-strong group-hover:shadow-md'
          : 'tilt-card w-full group-hover:border-line-strong group-hover:shadow-[0_16px_32px_-10px_rgba(43,36,29,0.32)] dark:group-hover:border-line-strong dark:group-hover:shadow-[0_20px_38px_-12px_rgba(0,0,0,0.94),0_0_0_1px_rgba(244,244,245,0.16)]'
      } ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas' : ''}`}
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
              {displayTitle}
            </p>
            {!compact && <span className="mt-2 block h-px w-6 bg-[#e6d5b8]/45" />}
          </div>
          {!compact && (
            <p className="truncate pl-2.5 pb-1 text-[11px] text-[#e6d5b8]/85">{displayAuthor}</p>
          )}
        </div>
      )}

      {/* Badge định dạng */}
      <span
        className={`pointer-events-none absolute right-1.5 top-1.5 rounded border border-white/15 bg-[#111113]/85 font-semibold uppercase tracking-wider text-[#f1f1f1] ${
          compact ? 'px-1 py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[10px]'
        }`}
      >
        {book.file_type}
      </span>

      {/* Huy hiệu ổ khoá cho tập bị giới hạn quyền đọc (vẫn giữ nguyên ảnh bìa) */}
      {isMemberLocked && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-black/15 transition-colors duration-300 group-hover:bg-black/28"
          />
          {compact ? (
            <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center justify-center rounded border border-rose-300/40 bg-[#140b0e]/85 p-1 text-rose-200 backdrop-blur-sm">
              <Lock className="h-2.5 w-2.5" />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#120b0e]/78 text-[#fce7eb] shadow-lg backdrop-blur-md transition-transform duration-300 group-hover:scale-105"
            >
              <Lock className="h-4 w-4" />
            </span>
          )}
        </>
      )}

      {/* Nhãn MỚI hoặc trạng thái gói bảo mật / giới hạn khách */}
      {!compact && (guestLockLabel || isNew) && (
        <span
          className={`pointer-events-none absolute bottom-2 left-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide ${
            isMemberLocked
              ? 'border-rose-300/40 bg-[#140b0e]/92 text-rose-100'
              : guestLockLabel
                ? 'border-amber-300/35 bg-black/88 text-amber-200'
                : 'border-[#f5b3b3]/35 bg-[#8f1818]/95 text-white'
          }`}
        >
          {isMemberLocked && <Lock className="h-2.5 w-2.5 shrink-0" />}
          <span>{guestLockLabel || 'MỚI'}</span>
        </span>
      )}

      {/* Nhãn dung lượng lướt hiện khi hover trên bìa */}
      {!compact && book.file_size > 0 && (
        <span
          className={`pointer-events-none absolute bottom-2 ${
            guestLockLabel || isNew ? 'right-1.5' : 'left-1.5'
          } translate-y-1 rounded border border-white/15 bg-[#111113]/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[#f4f4f5] opacity-0 transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100`}
        >
          {formatBytes(book.file_size)}
        </span>
      )}

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

      {/* Cụm nút Xem giới thiệu & Chỉnh sửa kín đáo */}
      {!selectionMode && !compact && (onInspect || onEdit) && (
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1 opacity-85 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0">
          {onInspect && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onInspect(book);
              }}
              aria-label={`Xem giới thiệu ${book.title}`}
              title="Xem giới thiệu & tiến độ"
              className="rounded-md border border-[#f3e9d7]/20 bg-[#16120f]/75 p-1.5 text-[#f3e9d7] transition-colors hover:bg-[#16120f]"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(book);
              }}
              aria-label={`Chỉnh sửa ${book.title}`}
              title="Chỉnh sửa thông tin"
              className="rounded-md border border-[#f3e9d7]/20 bg-[#16120f]/75 p-1.5 text-[#f3e9d7] transition-colors hover:bg-[#16120f]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Thanh tiến độ đọc trên bìa */}
      {percent !== null && (
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <div
            className="h-full bg-crimson-accent transition-all duration-300"
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
        className={`moonlit-card group relative flex w-72 shrink-0 cursor-pointer items-center gap-3.5 rounded-xl border bg-surface p-3 text-left shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-80 ${
          selected ? 'border-accent bg-subtle/60' : 'border-line hover:border-line-strong'
        }`}
      >
        {renderCover(true)}
        <div className="min-w-0 flex-1 pr-5">
          <h3 className="group-hover-crimson line-clamp-2 font-display text-sm font-semibold leading-snug text-ink transition-colors duration-200">
            {displayTitle}
          </h3>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{displayAuthor}</p>

          {progress && (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex min-w-0 items-center gap-1 font-medium text-crimson-accent">
                  {isCompleted ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">Hoàn thành</span>
                    </>
                  ) : (
                    <>
                      <span className="truncate">{chapterLabel}</span>
                      <span className="shrink-0">· {percent ?? 0}%</span>
                    </>
                  )}
                </span>
                <span className="shrink-0 text-ink-faint">
                  {formatRelativeTime(progress.updatedAt)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-crimson-accent transition-all duration-300"
                  style={{ width: `${Math.max(percent ?? 0, isCompleted ? 100 : 6)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {!selectionMode && (onDismissContinue || onInspect) && (
          <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-80 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0">
            {onInspect && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onInspect(book);
                }}
                aria-label={`Xem giới thiệu ${book.title}`}
                title="Xem giới thiệu sách"
                className="rounded-md p-1 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            )}
            {onDismissContinue && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismissContinue(book);
                }}
                aria-label={`Bỏ ${book.title} khỏi Tiếp tục đọc`}
                title="Bỏ khỏi Tiếp tục đọc"
                className="rounded-md p-1 text-ink-muted transition-colors hover:bg-subtle hover:text-red-700 dark:hover:text-red-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
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
      style={{ ['--stagger-delay' as string]: `${staggerDelayMs}ms` } as CSSProperties}
      className={`card-scroll-reveal group flex cursor-pointer flex-col rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
        isRevealed ? 'is-revealed' : ''
      }`}
    >
      {renderCover(false)}

      <div className="mt-2.5 space-y-0.5 px-0.5">
        <h3 className="group-hover-crimson line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors duration-200">
          {displayTitle}
        </h3>
        <p className="truncate text-xs text-ink-muted">{displayAuthor}</p>
        {percent !== null && (
          <div className="flex items-center justify-between gap-1.5 pt-0.5 text-[11px] font-medium text-crimson-accent">
            <span className="truncate">{isCompleted ? 'Đã đọc xong' : chapterLabel}</span>
            <span className="shrink-0">{percent}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
