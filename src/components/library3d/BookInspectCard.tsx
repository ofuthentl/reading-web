import { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Pencil,
  Square,
  X,
} from 'lucide-react';
import type { Book, ReadingProgress } from '@/types';
import { formatBytes } from '@/lib/api';
import { pickCoverColor } from '@/lib/bookMetadata';
import { useCoverUrl } from '@/hooks/useCoverUrl';
import { computeBookProgressPercent } from '@/hooks/useLibraryViewState';

function getChapterCaption(book: Book, progress?: ReadingProgress): string {
  if (!progress) return '';
  if (progress.completed) return 'Đã đọc xong';
  if (progress.chapterTitle?.trim()) return progress.chapterTitle.trim();
  const num = (progress.chapterIndex ?? 0) + 1;
  return book.file_type === 'pdf' ? `Trang ${num}` : `Chương ${num}`;
}

interface BookInspectCardProps {
  book: Book;
  progress?: ReadingProgress;
  /** True when user clicked to lock selection; false for lightweight hover preview */
  pinned: boolean;
  selectionMode: boolean;
  selected: boolean;
  onOpenBook: (book: Book) => void;
  onToggleSelect: (bookId: string) => void;
  onEditBook?: (book: Book) => void;
  onClose: () => void;
}

/**
 * Interactive HTML card showing full-resolution cover (`useCoverUrl`), metadata,
 * reading progress, and direct actions for the hovered or selected 3D book.
 */
export function BookInspectCard({
  book,
  progress,
  pinned,
  selectionMode,
  selected,
  onOpenBook,
  onToggleSelect,
  onEditBook,
  onClose,
}: BookInspectCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const coverUrl = useCoverUrl(book.cover_key, true);

  useEffect(() => {
    setImgFailed(false);
  }, [book.cover_key]);

  const showCover = Boolean(coverUrl && !imgFailed);
  const fallbackColor = book.cover_color || pickCoverColor(book.id);
  const percent = computeBookProgressPercent(book, progress);
  const chapterCaption = getChapterCaption(book, progress);
  const isCompleted = Boolean(progress?.completed);

  return (
    <aside
      aria-label={`Thông tin sách ${book.title}`}
      className="pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line-strong/80 bg-surface/95 p-3.5 text-ink shadow-2xl backdrop-blur-md transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Ảnh bìa gốc sắc nét từ IndexedDB / R2 qua useCoverUrl */}
        <div
          className="relative h-28 w-[76px] shrink-0 overflow-hidden rounded-lg border border-line shadow-sm"
          style={{ backgroundColor: showCover ? undefined : fallbackColor }}
        >
          {showCover && coverUrl ? (
            <img
              src={coverUrl}
              alt={book.title}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col justify-between p-2 text-white/90">
              <span className="h-0.5 w-6 rounded bg-amber-300/70" />
              <p className="line-clamp-3 font-display text-[10px] font-semibold leading-tight">
                {book.title}
              </p>
              <span className="h-0.5 w-full rounded bg-amber-300/40" />
            </div>
          )}
          <span className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            {book.file_type}
          </span>
        </div>

        {/* Metadata & tiến độ */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-ink">
              {book.title}
            </h3>
            {pinned && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng thẻ thông tin sách"
                title="Đóng (Esc)"
                className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <p className="mt-0.5 truncate text-xs text-ink-muted">{book.author}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
            <span className="max-w-[145px] truncate rounded-md border border-line bg-canvas px-1.5 py-0.5 text-ink-muted">
              {book.shelf}
            </span>
            <span>· {formatBytes(book.file_size)}</span>
          </div>

          {percent !== null && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex min-w-0 items-center gap-1 truncate text-ink-muted">
                  {isCompleted && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                  <span className="truncate">{chapterCaption}</span>
                </span>
                <span className="shrink-0 font-semibold text-accent">{percent}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className={`h-full rounded-full transition-all ${
                    isCompleted ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-accent'
                  }`}
                  style={{ width: `${Math.max(4, percent)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {pinned && book.description?.trim() && (
        <p className="mt-2.5 line-clamp-2 border-t border-line/70 pt-2 text-xs leading-relaxed text-ink-muted">
          {book.description.trim()}
        </p>
      )}

      {/* Nút hành động khi đã chọn sách, hoặc gợi ý nhỏ khi chỉ đang di chuột */}
      {pinned ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2.5">
          <button
            type="button"
            onClick={() => onOpenBook(book)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {percent !== null && percent > 0 && !isCompleted ? 'Đọc tiếp' : 'Đọc sách'}
          </button>

          {selectionMode && (
            <button
              type="button"
              onClick={() => onToggleSelect(book.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                selected
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-canvas text-ink hover:border-line-strong'
              }`}
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {selected ? 'Đã chọn' : 'Chọn'}
            </button>
          )}

          {onEditBook && (
            <button
              type="button"
              onClick={() => onEditBook(book)}
              className="inline-flex items-center gap-1 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
              title="Sửa thông tin & ảnh bìa"
            >
              <Pencil className="h-3.5 w-3.5" />
              Sửa
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 border-t border-line/60 pt-1.5 text-[11px] text-ink-faint">
          {selectionMode ? 'Nhấn cuốn sách để chọn / bỏ chọn' : 'Nhấn cuốn sách để xem chi tiết & mở đọc'}
        </p>
      )}
    </aside>
  );
}
