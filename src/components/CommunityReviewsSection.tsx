import { useRef } from 'react';
import {
  EyeOff,
  Loader2,
  Lock,
  MessageSquare,
  Reply,
  Send,
  X,
} from 'lucide-react';
import type { CommunityTargetType } from '@/types';
import { CommunityCommentItem } from '@/components/CommunityCommentItem';
import { HalfStarRatingControl } from '@/components/HalfStarRatingControl';
import { useCommunityReviews } from '@/hooks/useCommunityReviews';
import type { ToastType } from '@/hooks/useToast';
import { MAX_COMMUNITY_COMMENT_LENGTH } from '@/lib/communityApi';
import type { CanonicalChapterOption } from '@/lib/readerChapterNumbers';
import type { ReaderThemePalette } from '@/lib/readerConfig';
import { insertSpoilerSyntax } from '@/lib/spoilerText';

export interface CommunityReviewsSectionProps {
  targetType: CommunityTargetType;
  targetKey: string;
  targetLabel?: string;
  variant?: 'library' | 'reader';
  palette?: ReaderThemePalette;
  lockedMessage?: string | null;
  currentChapterNumber?: number;
  readerMaxChapterNumber?: number;
  totalChapters?: number;
  chapterOptions?: readonly CanonicalChapterOption[];
  onRatingUpdated?: (average: number | null, count: number) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function CommunityReviewsSection({
  targetType,
  targetKey,
  targetLabel,
  variant = 'library',
  palette,
  lockedMessage = null,
  currentChapterNumber,
  readerMaxChapterNumber,
  totalChapters,
  chapterOptions,
  onRatingUpdated,
  onApiError,
  onNotify,
}: CommunityReviewsSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    summary, loading, loadError, isLockedByApi, savingRating,
    draft, setDraft, replyTarget, setReplyTarget, tagChapter, setTagChapter,
    submitting, submitError, setSubmitError,
    confirmDeleteId, setConfirmDeleteId, deletingId, editingBusyId, reactingId,
    roots, repliesMap, loadSummary,
    handleRate, handleSubmitComment, handleEditComment, handleToggleReaction, handleDeleteComment,
  } = useCommunityReviews({
    targetType,
    targetKey,
    lockedMessage,
    currentChapterNumber,
    onRatingUpdated,
    onApiError,
    onNotify,
  });

  const isReader = variant === 'reader' && Boolean(palette);
  const borderClass = isReader && palette ? palette.border : 'border-line';
  const mutedTextClass = isReader && palette ? palette.textSecondary : 'text-ink-muted';
  const cardSurfaceClass =
    isReader && palette
      ? `rounded-2xl border ${borderClass} ${palette.surfaceSubtle}`
      : 'moonlit-card rounded-2xl border border-line bg-surface shadow-sm dark:border-line-strong/60';
  const inputSurfaceClass =
    isReader && palette
      ? `border ${palette.border} bg-transparent ${palette.textPrimary} ${palette.focusBorder}`
      : 'border border-line bg-canvas text-ink placeholder:text-ink-faint focus:border-amber-500/70';
  const selectSurfaceClass =
    isReader && palette
      ? `border ${palette.border} ${palette.panelBg} ${palette.textPrimary} ${palette.focusBorder}`
      : 'border border-line bg-canvas text-ink focus:border-amber-500/70';
  const selectOptionClass =
    isReader && palette ? `${palette.panelBg} ${palette.textPrimary}` : 'bg-canvas text-ink';
  const selectColorScheme = isReader && palette ? (palette.isDark ? 'dark' : 'light') : undefined;
  const effectiveChapterOptions: ReadonlyArray<{ number: number; label: string }> =
    chapterOptions && chapterOptions.length > 0
      ? chapterOptions.map((opt) => ({
          number: opt.number,
          label: `Phần ${opt.number} · ${opt.title.length > 42 ? `${opt.title.slice(0, 41)}…` : opt.title}`,
        }))
      : Array.from({ length: Math.max(0, totalChapters ?? 0) }, (_, i) => ({
          number: i + 1,
          label: `Chương ${i + 1}`,
        }));
  const submitButtonClass =
    isReader && palette
      ? `${palette.accentBg} ${palette.accentFg}`
      : 'bg-accent text-accent-foreground hover:bg-accent-hover';

  const handleInsertSpoiler = () => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const { nextValue, nextSelectionStart, nextSelectionEnd } = insertSpoilerSyntax(draft, start, end);
    const clampedValue = nextValue.slice(0, MAX_COMMUNITY_COMMENT_LENGTH);
    setDraft(clampedValue);
    setSubmitError(null);
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        Math.min(nextSelectionStart, clampedValue.length),
        Math.min(nextSelectionEnd, clampedValue.length),
      );
    });
  };

  const effectiveLocked = lockedMessage || (isLockedByApi ? loadError : null);
  const headingTitle = targetType === 'shelf' ? 'Đánh giá & Bình luận bộ truyện' : 'Bình luận';

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
            <HalfStarRatingControl
              value={summary?.myRating ?? null}
              disabled={savingRating || loading}
              mutedTextClass={mutedTextClass}
              onChange={(score) => void handleRate(score)}
            />

            <span className={`tabular-nums ${mutedTextClass}`}>
              {summary && summary.ratingCount > 0 && summary.averageRating !== null ? (
                <>
                  <strong className="font-semibold text-amber-500">{summary.averageRating.toFixed(1)}</strong>
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
            {replyTarget && (
              <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs ${borderClass} ${mutedTextClass}`}>
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                  <Reply className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span className="truncate">
                    Đang trả lời <strong>{replyTarget.authorName}</strong>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  aria-label="Huỷ trả lời"
                  className="rounded p-0.5 hover:text-amber-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

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
              placeholder={
                replyTarget
                  ? `Viết phản hồi tới ${replyTarget.authorName}...`
                  : 'Viết cảm nhận của bạn... Dùng ||nội dung ẩn|| để che spoiler.'
              }
              aria-label="Nội dung bình luận"
              className={`w-full resize-y rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors ${inputSurfaceClass}`}
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

                {targetType === 'book' && effectiveChapterOptions.length > 1 && (
                  <select
                    aria-label="Gắn nhãn chương cho bình luận"
                    value={tagChapter ?? ''}
                    onChange={(e) => setTagChapter(e.target.value ? Number(e.target.value) : null)}
                    style={selectColorScheme ? { colorScheme: selectColorScheme } : undefined}
                    className={`max-w-[14rem] rounded-lg px-2 py-1 text-xs outline-none ${selectSurfaceClass}`}
                  >
                    <option value="" className={selectOptionClass}>
                      Chung cả tập
                    </option>
                    {effectiveChapterOptions.map((opt) => (
                      <option key={opt.number} value={opt.number} className={selectOptionClass}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                <span className={`tabular-nums ${mutedTextClass}`}>
                  {draft.length}/{MAX_COMMUNITY_COMMENT_LENGTH}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting || draft.trim().length === 0}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${submitButtonClass}`}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>{replyTarget ? 'Gửi trả lời' : 'Gửi bình luận'}</span>
              </button>
            </div>

            {submitError && (
              <p role="alert" className="text-xs text-red-500">
                {submitError}
              </p>
            )}
          </form>

          {roots.length === 0 ? (
            <p className={`py-3 text-center text-xs ${mutedTextClass}`}>
              Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận!
            </p>
          ) : (
            <ul className={`space-y-2.5 ${isReader ? 'max-h-[26rem] overflow-y-auto pr-1 scrollbar-thin' : ''}`}>
              {roots.map((comment) => (
                <CommunityCommentItem
                  key={comment.id}
                  comment={comment}
                  replies={repliesMap.get(comment.id)}
                  isReader={isReader}
                  palette={palette}
                  borderClass={borderClass}
                  mutedTextClass={mutedTextClass}
                  readerMaxChapterNumber={readerMaxChapterNumber}
                  confirmDeleteId={confirmDeleteId}
                  deletingId={deletingId}
                  editingBusyId={editingBusyId}
                  reactingId={reactingId}
                  onReplyTo={(root) => {
                    setReplyTarget(root);
                    textareaRef.current?.focus();
                  }}
                  onEditSave={handleEditComment}
                  onToggleReaction={(id, emoji) => void handleToggleReaction(id, emoji)}
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
