import { useEffect } from 'react';
import {
  BookOpen, Calendar, CheckCircle2, HardDrive, Library, Lock, Pencil, RotateCcw, UserRound, X,
} from 'lucide-react';
import type { AuthRole, Book, ReadingProgress } from '@/types';
import { formatBytes } from '@/lib/api';
import {
  computeBookProgressPercent,
  getBookSortTitle,
  getDisplayAuthor,
  getGuestLockLabel,
  isVolumeOrSubtitleSegment,
  pickClothCoverColor,
} from '@/lib/bookMetadata';
import { isKnownAuthor } from '@/lib/shelfPlacement';
import { useCoverUrl } from '@/hooks/useCoverUrl';

export interface BookInfoModalProps {
  book: Book | null;
  progress?: ReadingProgress;
  sessionRole?: AuthRole;
  onClose: () => void;
  onOpenBook: (book: Book) => void;
  onJumpToShelf: (shelfKey: string) => void;
  onSelectAuthor?: (authorName: string) => void;
  onMarkCompleted: (book: Book) => void;
  onResetProgress: (book: Book) => void;
  onEditBook?: (book: Book) => void;
}

export function BookInfoModal({
  book,
  progress,
  sessionRole,
  onClose,
  onOpenBook,
  onJumpToShelf,
  onSelectAuthor,
  onMarkCompleted,
  onResetProgress,
  onEditBook,
}: BookInfoModalProps) {
  useEffect(() => {
    if (!book) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [book, onClose]);

  const coverUrl = useCoverUrl(book?.cover_key ?? null, Boolean(book));

  if (!book) return null;

  const displayTitle = getBookSortTitle(book);
  const displayAuthor = getDisplayAuthor(book.author, book.title);
  const clothColor = pickClothCoverColor(`${book.id}-${book.title}`);
  const percent = computeBookProgressPercent(book, progress);
  const isCompleted = Boolean(progress?.completed);
  const isMemberLocked = sessionRole === 'guest' && Boolean(book.guest_locked);
  const isGuestUnready = sessionRole === 'guest' && !isMemberLocked && book.guest_ready === false;
  const guestLockLabel = getGuestLockLabel(book, sessionRole);
  const shelfName = (book.shelf || 'Kho chưa phân loại').trim();
  const shelfKey = shelfName.toLocaleLowerCase('vi');
  const createdDate = Number.isFinite(Date.parse(book.created_at))
    ? new Date(book.created_at).toLocaleDateString('vi-VN')
    : null;
  const descriptionText = book.description?.trim() || null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-info-modal-title"
      onClick={onClose}
    >
      <div
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
            <button
              type="button"
              onClick={() => {
                onClose();
                onJumpToShelf(shelfKey);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 font-medium text-ink transition-colors hover:border-line-strong hover:text-accent"
            >
              <Library className="h-3.5 w-3.5 text-accent" />
              <span className="max-w-[14rem] truncate">{shelfName}</span>
            </button>
            <span className="rounded border border-line bg-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink">
              {book.file_type}
            </span>
            {guestLockLabel && (
              <span
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
                  isMemberLocked
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                }`}
              >
                {isMemberLocked && <Lock className="h-3 w-3" />}
                <span>{guestLockLabel}</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng thông tin sách"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-5 sm:grid-cols-[9.25rem_1fr]">
            <div className="relative mx-auto aspect-[7/10] w-36 overflow-hidden rounded-xl border border-line bg-subtle shadow-sm sm:mx-0 sm:w-full">
              {coverUrl ? (
                <img src={coverUrl} alt={book.title} className="h-full w-full object-cover" />
              ) : (
                <div
                  style={{ backgroundColor: clothColor }}
                  className="flex h-full w-full flex-col justify-between p-3 text-[#f6efe2]"
                >
                  <p className="line-clamp-4 font-display text-xs font-semibold leading-snug">
                    {displayTitle}
                  </p>
                  <p className="truncate text-[10px] opacity-85">{displayAuthor}</p>
                </div>
              )}
              {isMemberLocked && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#120b0e]/80 text-[#fce7eb] shadow-lg backdrop-blur-md"
                >
                  <Lock className="h-4 w-4" />
                </span>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              <div>
                <h2
                  id="book-info-modal-title"
                  className="font-display text-xl font-semibold leading-snug text-ink sm:text-2xl"
                >
                  {displayTitle}
                </h2>
                {onSelectAuthor &&
                isKnownAuthor(displayAuthor) &&
                !isVolumeOrSubtitleSegment(displayAuthor) ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectAuthor(displayAuthor);
                    }}
                    title={`Xem tất cả bộ truyện của ${displayAuthor}`}
                    className="mt-1 inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-muted underline-offset-4 transition-colors hover:text-crimson-accent hover:underline"
                  >
                    <UserRound className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    <span>{displayAuthor}</span>
                  </button>
                ) : (
                  <p className="mt-1 text-sm text-ink-muted">{displayAuthor}</p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3.5 w-3.5" />
                    {formatBytes((book.file_size || 0) + (book.cover_size || 0))}
                  </span>
                  {createdDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Lên kệ {createdDate}
                    </span>
                  )}
                </div>
              </div>

              {progress && (
                <div className="rounded-xl border border-line bg-canvas p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-ink">
                      {isCompleted
                        ? 'Đã hoàn thành cuốn sách này'
                        : progress.chapterTitle || `Phần ${(progress.chapterIndex ?? 0) + 1}`}
                    </span>
                    <span className="font-semibold text-accent">{percent ?? 0}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-crimson-accent transition-all"
                      style={{ width: `${Math.max(percent ?? 0, isCompleted ? 100 : 6)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Giới thiệu nội dung
                </h3>
                {descriptionText ? (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                    {descriptionText}
                  </p>
                ) : (
                  <div className="rounded-xl border border-dashed border-line bg-canvas/70 px-3.5 py-3 text-xs text-ink-muted">
                    <span>Cuốn sách này hiện chưa có phần giới thiệu nội dung.</span>
                    {onEditBook && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onEditBook(book);
                        }}
                        className="ml-2 inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline"
                      >
                        <Pencil className="h-3 w-3" />
                        Thêm giới thiệu
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {!isMemberLocked && !isGuestUnready && !isCompleted && (
              <button
                type="button"
                onClick={() => onMarkCompleted(book)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/35 bg-emerald-600/10 px-3 py-2 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-600/20 dark:border-emerald-400/35 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Đánh dấu đã đọc xong
              </button>
            )}

            {progress && (
              <button
                type="button"
                onClick={() => onResetProgress(book)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Đặt lại tiến độ
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onEditBook && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditBook(book);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
              >
                <Pencil className="h-3.5 w-3.5" />
                Sửa
              </button>
            )}

            {isMemberLocked ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBook(book);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-600/35 bg-rose-600/10 px-4 py-2 text-xs font-medium text-rose-800 transition-colors hover:bg-rose-600/15 dark:border-rose-400/35 dark:text-rose-200"
              >
                <Lock className="h-3.5 w-3.5" />
                Chỉ dành cho thành viên được cấp quyền
              </button>
            ) : isGuestUnready ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                <Lock className="h-3.5 w-3.5" />
                Chưa bật gói bảo mật khách
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBook(book);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
              >
                <BookOpen className="h-4 w-4" />
                {progress && !isCompleted ? 'Đọc tiếp' : 'Đọc sách'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
