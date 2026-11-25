import { type CSSProperties, useState } from 'react';
import {
  Bookmark, BookOpen, Calendar, CheckCircle2, HardDrive, Library, Lock, Pencil, RotateCcw, UserRound, X,
} from 'lucide-react';
import type { AuthRole, Book, ReadingProgress } from '@/types';
import { ModalShell } from '@/components/ModalShell';
import { formatBytes } from '@/lib/api';
import {
  computeBookProgressPercent,
  getBookSortTitle,
  getDisplayAuthor,
  getGuestLockLabel,
  isVolumeOrSubtitleSegment,
  pickClothCoverColor,
} from '@/lib/bookMetadata';
import { useCoverAccentColor } from '@/lib/coverAccentColor';
import { isKnownAuthor } from '@/lib/shelfPlacement';
import type { BookOpenJumpTarget } from '@/hooks/useBookReader';
import { useCoverUrl } from '@/hooks/useCoverUrl';

export interface BookInfoModalProps {
  book: Book | null;
  progress?: ReadingProgress;
  isPlanToRead?: boolean;
  sessionRole?: AuthRole;
  onClose: () => void;
  onOpenBook: (book: Book, jumpTarget?: BookOpenJumpTarget) => void;
  onJumpToShelf: (shelfKey: string) => void;
  onSelectAuthor?: (authorName: string) => void;
  onMarkCompleted: (book: Book) => void;
  onStartReread?: (book: Book) => void;
  onResetProgress: (book: Book) => void;
  onTogglePlanToRead?: (book: Book, nextPlanToRead: boolean) => void;
  onEditBook?: (book: Book) => void;
  onManageBookAccess?: (book: Book) => void;
}

export function BookInfoModal({
  book,
  progress,
  isPlanToRead = false,
  sessionRole,
  onClose,
  onOpenBook,
  onJumpToShelf,
  onSelectAuthor,
  onMarkCompleted,
  onStartReread,
  onResetProgress,
  onTogglePlanToRead,
  onEditBook,
  onManageBookAccess,
}: BookInfoModalProps) {
  const [ptrPop, setPtrPop] = useState(false);
  const coverUrl = useCoverUrl(book?.cover_key ?? null, Boolean(book));
  const accentRgb = useCoverAccentColor(book?.cover_key ?? null, coverUrl);

  if (!book) return null;

  const displayTitle = getBookSortTitle(book);
  const displayAuthor = getDisplayAuthor(book.author, book.title);
  const clothColor = pickClothCoverColor(`${book.id}-${book.title}`);
  const percent = computeBookProgressPercent(book, progress);
  const isCompleted = Boolean(progress?.completed);
  const rereadCount = Math.max(0, Math.floor(progress?.rereadCount ?? 0));
  const isMemberLocked = sessionRole === 'guest' && Boolean(book.guest_locked);
  const isGuestUnready = sessionRole === 'guest' && !isMemberLocked && book.guest_ready === false;
  const guestLockLabel = getGuestLockLabel(book, sessionRole);
  const shelfName = (book.shelf || 'Kho chưa phân loại').normalize('NFC').trim();
  const shelfKey = shelfName.toLocaleLowerCase('vi');
  const createdDate = Number.isFinite(Date.parse(book.created_at))
    ? new Date(book.created_at).toLocaleDateString('vi-VN')
    : null;
  const descriptionText = book.description?.trim() || null;

  const modalCardStyle: CSSProperties | undefined = accentRgb
    ? ({
        ['--cover-accent' as string]: accentRgb,
        borderColor: 'rgb(var(--cover-accent) / 0.36)',
      } as CSSProperties)
    : undefined;

  return (
    <ModalShell
      open
      onClose={onClose}
      ariaLabelledBy="book-info-modal-title"
      zIndexClass="z-50"
      panelStyle={modalCardStyle}
      panelClassName="moonlit-card fade-in relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
    >
        {coverUrl && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 select-none overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.48)_55%,transparent_100%)]"
          >
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full scale-125 object-cover opacity-[0.15] blur-[48px] saturate-[1.3] dark:opacity-[0.2]"
            />
          </div>
        )}

        <div className="relative z-10 flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
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

        <div className="scrollbar-thin relative z-10 flex-1 overflow-y-auto px-5 py-5">
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
                      {rereadCount > 0 ? ` · ↻ Đọc lại ×${rereadCount}` : ''}
                    </span>
                    <span className="font-semibold text-accent">{percent ?? 0}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-crimson-accent transition-all"
                      style={{
                        width: `${Math.max(percent ?? 0, isCompleted ? 100 : 6)}%`,
                        ...(accentRgb ? { backgroundColor: 'rgb(var(--cover-accent))' } : {}),
                      }}
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

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {!isMemberLocked && onTogglePlanToRead && (
              <button
                type="button"
                aria-pressed={isPlanToRead}
                onClick={() => {
                  setPtrPop(true);
                  onTogglePlanToRead(book, !isPlanToRead);
                }}
                onAnimationEnd={() => setPtrPop(false)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  ptrPop ? 'micro-pop' : ''
                } ${
                  isPlanToRead
                    ? 'border-sky-500/45 bg-sky-500/12 text-sky-700 hover:bg-sky-500/20 dark:border-sky-400/40 dark:text-sky-300'
                    : 'border-line bg-surface text-ink hover:border-line-strong hover:bg-subtle'
                }`}
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${
                    isPlanToRead
                      ? 'fill-sky-500 text-sky-500 dark:fill-sky-400 dark:text-sky-400'
                      : 'text-ink-muted'
                  }`}
                />
                <span>{isPlanToRead ? 'Đã lưu Đọc sau' : 'Đọc sau'}</span>
              </button>
            )}

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

            {!isMemberLocked && !isGuestUnready && isCompleted && onStartReread && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartReread(book);
                  onOpenBook(book, { chapterIndex: 0, scrollRatio: 0 });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Đọc lại từ đầu
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
            {sessionRole === 'owner' && onManageBookAccess && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onManageBookAccess(book);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
              >
                <Lock className="h-3.5 w-3.5 text-crimson-accent" />
                <span>Khoá Tập/Ch.</span>
              </button>
            )}

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
    </ModalShell>
  );
}
