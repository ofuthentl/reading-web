import { useEffect, useMemo } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Library,
  X,
} from 'lucide-react';
import type { AuthRole, Book, ReadingProgress } from '@/types';
import { getBookSortTitle, getDisplayAuthor } from '@/lib/bookMetadata';
import { computeDetailedLibraryInsights } from '@/lib/readingStats';

export interface ReadingStatsModalProps {
  open: boolean;
  books: Book[];
  progress: Record<string, ReadingProgress>;
  sessionRole?: AuthRole;
  onClose: () => void;
  onOpenBook: (book: Book) => void;
}

function formatRecentReadTime(ts: number): string {
  const diff = Date.now() - ts;
  if (!Number.isFinite(diff) || diff < 60_000) return 'Vừa xong';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

export function ReadingStatsModal({
  open,
  books,
  progress,
  sessionRole,
  onClose,
  onOpenBook,
}: ReadingStatsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const insights = useMemo(
    () => (open ? computeDetailedLibraryInsights(books, progress) : null),
    [books, open, progress],
  );

  if (!open || !insights) return null;

  const { rpg } = insights;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reading-stats-title"
      onClick={onClose}
    >
      <div
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 id="reading-stats-title" className="font-display text-lg font-semibold text-ink">
                Hồ sơ & Thống kê Đọc sách
              </h2>
              <p className="text-xs text-ink-muted">
                {sessionRole === 'guest'
                  ? 'Tiến độ đọc riêng theo tài khoản Discord của bạn'
                  : 'Tổng hợp tiến độ đọc trên toàn bộ kho sách'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng thống kê"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Cấp độ Độc giả */}
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
                  <Award className="h-3.5 w-3.5" />
                  LV.{rpg.level}
                </span>
                <span className="font-display text-sm font-semibold text-ink">
                  Cấp độ Độc giả · {rpg.totalXp.toLocaleString('vi-VN')} XP
                </span>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                {rpg.xpInLevel} / {rpg.xpForNextLevel} XP lên cấp kế
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${Math.max(rpg.xpPercent, rpg.totalXp > 0 ? 5 : 0)}%` }}
              />
            </div>
          </div>

          {/* 4 thẻ số liệu chính */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-canvas p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Đã hoàn thành</span>
              </div>
              <p className="mt-1.5 font-display text-xl font-bold text-ink">
                {rpg.completedBooks}
                <span className="ml-1 font-sans text-xs font-normal text-ink-muted">
                  / {insights.totalBooks} cuốn
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <BookOpen className="h-3.5 w-3.5 text-accent" />
                <span>Đang đọc dở</span>
              </div>
              <p className="mt-1.5 font-display text-xl font-bold text-ink">
                {rpg.inProgressBooks}
                <span className="ml-1 font-sans text-xs font-normal text-ink-muted">cuốn</span>
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Library className="h-3.5 w-3.5 text-accent" />
                <span>Bộ theo dõi</span>
              </div>
              <p className="mt-1.5 font-display text-xl font-bold text-ink">
                {insights.completedShelves + insights.activeShelves}
                <span className="ml-1 font-sans text-xs font-normal text-ink-muted">
                  / {insights.totalShelves} kệ
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Trang đã đọc</span>
              </div>
              <p className="mt-1.5 font-display text-xl font-bold text-ink">
                {rpg.readPages.toLocaleString('vi-VN')}
              </p>
            </div>
          </div>

          {/* Tỉ lệ hoàn thành & phân bố định dạng */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3 text-xs">
            <span className="text-ink-muted">
              Hoàn thành toàn kho:{' '}
              <strong className="text-ink">{insights.completionPercent}%</strong> · Chưa mở:{' '}
              <strong className="text-ink">{insights.unreadBooks}</strong> cuốn
            </span>
            <span className="text-ink-faint">
              EPUB {insights.formatCounts.epub} · PDF {insights.formatCounts.pdf} · DOCX{' '}
              {insights.formatCounts.docx}
            </span>
          </div>

          {/* Nhật ký đọc gần đây */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span>Nhật ký đọc gần đây</span>
            </div>

            {insights.recentBooks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line bg-canvas/70 px-4 py-6 text-center text-xs text-ink-muted">
                Bạn chưa mở cuốn sách nào. Hãy chọn một tập trên kệ để bắt đầu hành trình đọc!
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
                {insights.recentBooks.map(({ book, progress: itemProg, percent }) => (
                  <li key={book.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenBook(book);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-subtle/70"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {getBookSortTitle(book)}
                        </p>
                        <p className="truncate text-xs text-ink-muted">
                          {getDisplayAuthor(book.author)} ·{' '}
                          {itemProg.completed
                            ? 'Hoàn thành'
                            : itemProg.chapterTitle || `Phần ${(itemProg.chapterIndex ?? 0) + 1}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold tabular-nums text-accent">{percent}%</p>
                        <p className="text-[11px] text-ink-faint">
                          {formatRecentReadTime(itemProg.updatedAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
