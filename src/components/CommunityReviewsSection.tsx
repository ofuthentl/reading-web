import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  Loader2,
  Lock,
  MessageSquare,
  Send,
  Star,
} from 'lucide-react';
import type { CommunityComment, CommunitySummary, CommunityTargetType } from '@/types';
import { CommunityCommentItem } from '@/components/CommunityCommentItem';
import { isAuthError } from '@/lib/authSession';
import {
  CommunityApiError,
  MAX_COMMUNITY_COMMENT_LENGTH,
  deleteCommunityCommentApi,
  fetchCommunitySummary,
  postCommunityComment,
  saveCommunityRating,
} from '@/lib/communityApi';
import type { ReaderThemePalette } from '@/lib/readerConfig';
import { insertSpoilerSyntax } from '@/lib/spoilerText';
import type { ToastType } from '@/hooks/useToast';

export interface CommunityReviewsSectionProps {
  targetType: CommunityTargetType;
  targetKey: string;
  targetLabel?: string;
  variant?: 'library' | 'reader';
  palette?: ReaderThemePalette;
  lockedMessage?: string | null;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export function CommunityReviewsSection({
  targetType,
  targetKey,
  targetLabel,
  variant = 'library',
  palette,
  lockedMessage = null,
  onApiError,
  onNotify,
}: CommunityReviewsSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [loading, setLoading] = useState(!lockedMessage);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLockedByApi, setIsLockedByApi] = useState(false);

  const [hoverStar, setHoverStar] = useState<number | null>(null);
  const [savingRating, setSavingRating] = useState(false);

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isReader = variant === 'reader' && Boolean(palette);
  const borderClass = isReader && palette ? palette.border : 'border-line';
  const mutedTextClass = isReader && palette ? palette.textSecondary : 'text-ink-muted';
  const cardSurfaceClass = isReader
    ? `rounded-2xl border ${borderClass} bg-black/[0.03] dark:bg-white/[0.03]`
    : 'moonlit-card rounded-2xl border border-line bg-surface shadow-sm dark:border-line-strong/60';
  const inputSurfaceClass = isReader && palette
    ? `border ${palette.border} bg-transparent ${palette.textPrimary}`
    : 'border border-line bg-canvas text-ink placeholder:text-ink-faint';

  const loadSummary = useCallback(
    async (signal?: AbortSignal) => {
      if (lockedMessage) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      setIsLockedByApi(false);
      try {
        const data = await fetchCommunitySummary(targetType, targetKey, signal);
        if (signal?.aborted) return;
        setSummary(data);
      } catch (err) {
        if (signal?.aborted) return;
        if (isAuthError(err)) {
          onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
          return;
        }
        if (err instanceof CommunityApiError && err.status === 403) {
          setIsLockedByApi(true);
          setLoadError(err.message);
        } else {
          setLoadError(
            err instanceof Error ? err.message : 'Không thể tải đánh giá và bình luận.',
          );
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [lockedMessage, onApiError, targetKey, targetType],
  );

  useEffect(() => {
    setDraft('');
    setSubmitError(null);
    setConfirmDeleteId(null);
    const controller = new AbortController();
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary]);

  const handleRate = async (star: number) => {
    if (savingRating) return;
    setHoverStar(null);
    const nextRating = summary?.myRating === star ? null : star;
    setSavingRating(true);
    try {
      const updated = await saveCommunityRating(targetType, targetKey, nextRating);
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              averageRating: updated.averageRating,
              ratingCount: updated.ratingCount,
              myRating: updated.myRating,
            }
          : {
              targetType,
              targetKey,
              ...updated,
              comments: [],
              totalComments: 0,
            },
      );
      onNotify?.(
        nextRating ? `Đã chấm ${nextRating}/5 sao.` : 'Đã gỡ điểm đánh giá của bạn.',
        'success',
      );
    } catch (err) {
      if (isAuthError(err)) {
        onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Không thể lưu điểm đánh giá.';
      setSubmitError(msg);
      onNotify?.(msg, 'error');
    } finally {
      setSavingRating(false);
    }
  };

  const handleInsertSpoiler = () => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const { nextValue, nextSelectionStart, nextSelectionEnd } = insertSpoilerSyntax(
      draft,
      start,
      end,
    );
    setDraft(nextValue.slice(0, MAX_COMMUNITY_COMMENT_LENGTH));
    setSubmitError(null);
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  };

  const handleSubmitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created: CommunityComment = await postCommunityComment(targetType, targetKey, trimmed);
      setDraft('');
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              comments: [created, ...prev.comments],
              totalComments: prev.totalComments + 1,
            }
          : {
              targetType,
              targetKey,
              averageRating: null,
              ratingCount: 0,
              myRating: null,
              comments: [created],
              totalComments: 1,
            },
      );
      onNotify?.('Đã đăng bình luận của bạn.', 'success');
    } catch (err) {
      if (isAuthError(err)) {
        onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Không thể gửi bình luận.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (deletingId) return;
    setDeletingId(commentId);
    try {
      await deleteCommunityCommentApi(commentId);
      setConfirmDeleteId(null);
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.filter((c) => c.id !== commentId),
              totalComments: Math.max(0, prev.totalComments - 1),
            }
          : prev,
      );
      onNotify?.('Đã xoá bình luận.', 'info');
    } catch (err) {
      if (isAuthError(err)) {
        onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Không thể xoá bình luận.';
      setSubmitError(msg);
      onNotify?.(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const effectiveLocked = lockedMessage || (isLockedByApi ? loadError : null);
  const headingTitle =
    targetType === 'shelf' ? 'Đánh giá & Bình luận bộ truyện' : 'Bình luận';
  const activeStars = hoverStar ?? summary?.myRating ?? 0;

  return (
    <section
      data-community-section="true"
      aria-label={targetLabel ? `${headingTitle} — ${targetLabel}` : headingTitle}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={`${cardSurfaceClass} p-4 sm:p-5 ${isReader ? 'mt-6 select-text' : ''}`}
    >
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-3.5 ${borderClass}`}>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-amber-500" />
          <h3 className="font-display text-base font-semibold">{headingTitle}</h3>
          {summary && summary.totalComments > 0 && (
            <span className={`rounded-full border px-2 py-0.5 text-xs ${borderClass} ${mutedTextClass}`}>
              {summary.totalComments}
            </span>
          )}
        </div>

        {!effectiveLocked && (
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div
              className="inline-flex items-center gap-0.5"
              role="group"
              aria-label="Chấm điểm 1 đến 5 sao"
              onMouseLeave={() => setHoverStar(null)}
            >
              {STAR_VALUES.map((star) => {
                const filled = star <= activeStars;
                return (
                  <button
                    key={star}
                    type="button"
                    disabled={savingRating || loading}
                    aria-label={`Chấm ${star} sao`}
                    aria-pressed={summary?.myRating === star}
                    title={
                      summary?.myRating === star
                        ? `Bạn đã chấm ${star} sao (bấm lại để gỡ)`
                        : `Chấm ${star} sao`
                    }
                    onMouseEnter={() => setHoverStar(star)}
                    onClick={() => void handleRate(star)}
                    className="rounded-md p-1 transition-transform hover:scale-110 disabled:opacity-50"
                  >
                    <Star
                      fill={filled ? 'currentColor' : 'none'}
                      className={`h-4 w-4 ${
                        filled
                          ? 'fill-amber-400 text-amber-400'
                          : `${mutedTextClass} opacity-55 hover:opacity-100`
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <span className={`tabular-nums ${mutedTextClass}`}>
              {summary && summary.ratingCount > 0 && summary.averageRating !== null ? (
                <>
                  <strong className="font-semibold text-amber-500">
                    {summary.averageRating.toFixed(1)}
                  </strong>
                  <span> / 5 ({summary.ratingCount})</span>
                </>
              ) : (
                'Chưa có sao'
              )}
            </span>
          </div>
        )}
      </div>

      {effectiveLocked ? (
        <div className={`flex items-center gap-2.5 py-5 text-xs ${mutedTextClass}`}>
          <Lock className="h-4 w-4 shrink-0 text-amber-500" />
          <p>{effectiveLocked}</p>
        </div>
      ) : loading ? (
        <div className={`flex items-center justify-center gap-2 py-6 text-xs ${mutedTextClass}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Đang tải đánh giá &amp; bình luận...</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 py-4 text-xs">
          <span className="text-red-500">{loadError}</span>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className={`rounded-lg border px-3 py-1.5 font-medium transition ${borderClass}`}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <form onSubmit={(event) => void handleSubmitComment(event)} className="space-y-2">
            <textarea
              ref={textareaRef}
              value={draft}
              maxLength={MAX_COMMUNITY_COMMENT_LENGTH}
              rows={isReader ? 2 : 3}
              disabled={submitting}
              onChange={(event) => {
                setDraft(event.target.value);
                if (submitError) setSubmitError(null);
              }}
              placeholder="Viết cảm nhận của bạn... Dùng ||nội dung ẩn|| để che spoiler."
              aria-label="Nội dung bình luận"
              className={`w-full resize-y rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-amber-500/70 ${inputSurfaceClass}`}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleInsertSpoiler}
                  title="Bọc đoạn chữ đang chọn hoặc chèn cú pháp ||Spoiler||"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition ${borderClass} ${mutedTextClass} hover:border-amber-500/50 hover:text-amber-500 disabled:opacity-50`}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  <span>||Spoiler||</span>
                </button>
                <span className={`tabular-nums ${mutedTextClass}`}>
                  {draft.length}/{MAX_COMMUNITY_COMMENT_LENGTH}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting || draft.trim().length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>Gửi bình luận</span>
              </button>
            </div>

            {submitError && (
              <p role="alert" className="text-xs text-red-500">
                {submitError}
              </p>
            )}
          </form>

          {!summary || summary.comments.length === 0 ? (
            <p className={`py-3 text-center text-xs ${mutedTextClass}`}>
              Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận!
            </p>
          ) : (
            <ul
              className={`space-y-2.5 ${
                isReader ? 'max-h-[24rem] overflow-y-auto pr-1 scrollbar-thin' : ''
              }`}
            >
              {summary.comments.map((comment) => (
                <CommunityCommentItem
                  key={comment.id}
                  comment={comment}
                  isReader={isReader}
                  borderClass={borderClass}
                  mutedTextClass={mutedTextClass}
                  confirming={confirmDeleteId === comment.id}
                  deleting={deletingId === comment.id}
                  onRequestDelete={setConfirmDeleteId}
                  onConfirmDelete={(id) => void handleDeleteComment(id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
