import { BookOpen, Bookmark, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { formatReadingDuration } from '@/lib/readingStreak';
import type { AdminGuestUsageDetail } from '@/lib/usageApi';

export interface AdminUsageGuestDetailPanelProps {
  discordUsername: string;
  tagTail: string;
  detail: AdminGuestUsageDetail | undefined;
  loading: boolean;
  error: string | null;
  formatRelativeTime: (timestampMs: number | null) => string;
  onRefresh: () => void;
}

export function AdminUsageGuestDetailPanel({
  discordUsername,
  tagTail,
  detail,
  loading,
  error,
  formatRelativeTime,
  onRefresh,
}: AdminUsageGuestDetailPanelProps) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <BookOpen className="h-3.5 w-3.5 text-accent" />
          <span className="font-semibold text-ink">
            Tủ sách đã mở của {discordUsername}{' '}
            <span className="font-normal text-ink-faint">#{tagTail}</span>
          </span>
          {detail && (
            <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] tabular-nums text-ink-muted">
              {detail.books.length} tập · Tổng giờ đọc:{' '}
              <strong className="text-ink">
                {formatReadingDuration(detail.readingSecondsTotal, true)}
              </strong>{' '}
              (7N: {formatReadingDuration(detail.readingSeconds7d, true)} · 30N:{' '}
              {formatReadingDuration(detail.readingSeconds30d, true)})
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {loading && !detail ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <span>Đang tải danh sách tập đã đọc...</span>
        </div>
      ) : error ? (
        <p className="py-5 text-center text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : !detail || detail.books.length === 0 ? (
        <p className="py-5 text-center text-xs text-ink-muted">
          Thành viên này chưa lưu tiến độ đọc cuốn sách nào.
        </p>
      ) : (
        <div className="mt-2.5 max-h-80 divide-y divide-line/60 overflow-y-auto pr-1 scrollbar-thin">
          {detail.books.map((book) => {
            const chapterLabel =
              book.chapterTitle ||
              (book.totalChapters
                ? `Chương ${book.chapterIndex + 1} / ${book.totalChapters}`
                : `Chương ${book.chapterIndex + 1}`);
            return (
              <div
                key={book.bookId}
                className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-xs font-semibold text-ink">{book.title}</p>
                    {book.completed ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Đã xong
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded-md bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                        Đang đọc
                      </span>
                    )}
                    {book.bookmarkCount > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-ink-faint">
                        <Bookmark className="h-2.5 w-2.5" />
                        {book.bookmarkCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                    <span className="font-medium text-ink/80">{book.shelf}</span> · {chapterLabel}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3 sm:justify-end">
                  <div className="w-28">
                    <div className="flex items-center justify-between text-[10px] tabular-nums">
                      <span className="font-semibold text-ink">{book.percent}%</span>
                      <span className="inline-flex items-center gap-0.5 text-ink-muted">
                        <Clock className="h-2.5 w-2.5" />
                        {formatReadingDuration(book.readingSeconds, true)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                      <div
                        className={`h-full rounded-full transition-all ${
                          book.completed ? 'bg-emerald-500' : 'bg-crimson-accent'
                        }`}
                        style={{ width: `${Math.max(book.percent, book.percent > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-20 text-right text-[10px] text-ink-faint">
                    {formatRelativeTime(book.lastReadAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
