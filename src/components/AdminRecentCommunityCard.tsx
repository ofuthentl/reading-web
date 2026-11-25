import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { isAuthError, isCloudMode } from '@/lib/authSession';
import { deleteCommunityCommentApi } from '@/lib/communityApi';
import {
  type AdminRecentCommunityReport,
  fetchAdminRecentCommunity,
} from '@/lib/discordPresetsApi';
import { normalizeSearchText } from '@/lib/libraryFiltering';
import type { ToastType } from '@/hooks/useToast';

export interface AdminRecentCommunityCardProps {
  formatRelativeTime: (timestampMs: number | null) => string;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function AdminRecentCommunityCard({
  formatRelativeTime,
  onApiError,
  onNotify,
}: AdminRecentCommunityCardProps) {
  const [tab, setTab] = useState<'comments' | 'ratings'>('comments');
  const [report, setReport] = useState<AdminRecentCommunityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    if (!isCloudMode) {
      setReport({ generatedAt: Date.now(), comments: [], ratings: [] });
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const next = await fetchAdminRecentCommunity(30, controller.signal);
      if (!controller.signal.aborted) setReport(next);
    } catch (err) {
      if (controller.signal.aborted) return;
      onApiError(err, 'Không thể tải bình luận và đánh giá mới nhất.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [onApiError]);

  useEffect(() => {
    void loadData();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [loadData]);

  const normalizedQuery = useMemo(() => normalizeSearchText(query), [query]);

  const filteredComments = useMemo(() => {
    const items = report?.comments ?? [];
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      normalizeSearchText(
        `${item.authorName} ${item.targetLabel} ${item.shelfName ?? ''} ${item.content}`,
      ).includes(normalizedQuery),
    );
  }, [normalizedQuery, report?.comments]);

  const filteredRatings = useMemo(() => {
    const items = report?.ratings ?? [];
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      normalizeSearchText(
        `${item.authorName} ${item.targetLabel} ${item.shelfName ?? ''}`,
      ).includes(normalizedQuery),
    );
  }, [normalizedQuery, report?.ratings]);

  const handleDeleteComment = async (commentId: string) => {
    if (deletingId) return;
    setDeletingId(commentId);
    try {
      await deleteCommunityCommentApi(commentId);
      setReport((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.filter((c) => c.id !== commentId && c.parentId !== commentId),
            }
          : prev,
      );
      setConfirmDeleteId(null);
      onNotify?.('Đã xoá bình luận (và phản hồi con nếu có).', 'success');
    } catch (err) {
      if (isAuthError(err)) onApiError(err, 'Phiên quản trị đã hết hạn.');
      else onApiError(err, 'Không thể xoá bình luận.');
    } finally {
      setDeletingId(null);
    }
  };

  const commentsCount = report?.comments.length ?? 0;
  const ratingsCount = report?.ratings.length ?? 0;

  return (
    <section className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
            <MessageSquare className="h-4 w-4 text-crimson-accent" />
            <span>Bình luận &amp; Đánh giá mới nhất</span>
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Kiểm duyệt và xoá nhanh bình luận vi phạm ngay tại trang quản trị
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-canvas p-1 text-xs">
            <button
              type="button"
              onClick={() => setTab('comments')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                tab === 'comments'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Bình luận ({commentsCount})
            </button>
            <button
              type="button"
              onClick={() => setTab('ratings')}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                tab === 'ratings'
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Đánh giá ({ratingsCount})
            </button>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadData()}
            aria-label="Làm mới bình luận mới nhất"
            className="rounded-xl border border-line bg-canvas p-2 text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Lọc theo người viết, tên bộ/tập hoặc nội dung..."
          className="w-full rounded-xl border border-line bg-canvas py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
        />
      </div>

      {loading && !report ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <span>Đang tải hoạt động cộng đồng gần đây...</span>
        </div>
      ) : tab === 'comments' ? (
        filteredComments.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted">
            {commentsCount === 0
              ? 'Chưa có bình luận nào trong thư viện.'
              : 'Không có bình luận nào khớp từ khoá lọc.'}
          </p>
        ) : (
          <div className="mt-3 max-h-96 divide-y divide-line/70 overflow-y-auto pr-1 scrollbar-thin">
            {filteredComments.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 py-3 text-xs">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">{item.authorName}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.authorRole === 'owner'
                          ? 'bg-accent/15 text-accent'
                          : 'bg-subtle text-ink-muted'
                      }`}
                    >
                      {item.authorRole === 'owner' ? 'Admin' : 'Khách'}
                    </span>
                    <span className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] text-ink-muted">
                      {item.targetType === 'book' ? 'Tập' : 'Bộ'}: {item.targetLabel}
                    </span>
                    {item.chapterNumber !== null && (
                      <span className="rounded bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        Ch. {item.chapterNumber}
                      </span>
                    )}
                    {item.parentId && (
                      <span className="text-[10px] italic text-ink-faint">↳ Trả lời</span>
                    )}
                    <span className="text-[10px] text-ink-faint">
                      · {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-line break-words text-xs leading-relaxed text-ink/90">
                    {item.content}
                  </p>
                </div>

                <div className="shrink-0">
                  {confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={deletingId === item.id}
                        onClick={() => void handleDeleteComment(item.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {deletingId === item.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        <span>Xoá</span>
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === item.id}
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-line bg-canvas px-2 py-1 text-[11px] text-ink-muted hover:text-ink"
                      >
                        Huỷ
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.id)}
                      aria-label="Xoá bình luận"
                      title="Xoá bình luận này"
                      className="rounded-lg border border-line bg-canvas p-1.5 text-ink-muted transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredRatings.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-muted">
          {ratingsCount === 0
            ? 'Chưa có lượt chấm sao nào trong thư viện.'
            : 'Không có lượt chấm sao nào khớp từ khoá lọc.'}
        </p>
      ) : (
        <div className="mt-3 max-h-96 divide-y divide-line/70 overflow-y-auto pr-1 scrollbar-thin">
          {filteredRatings.map((item) => (
            <div
              key={`${item.targetType}:${item.targetKey}:${item.userScope}`}
              className="flex items-center justify-between gap-3 py-2.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-ink">{item.authorName}</span>
                  <span className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] text-ink-muted">
                    {item.targetType === 'book' ? 'Tập' : 'Bộ'}: {item.targetLabel}
                  </span>
                </div>
                {item.targetType === 'book' && item.shelfName && (
                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                    Kệ: {item.shelfName}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                  <Star className="h-3 w-3 fill-current" />
                  <span>{item.rating.toFixed(1)}</span>
                </span>
                <p className="mt-0.5 text-[10px] text-ink-faint">
                  {formatRelativeTime(item.updatedAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
