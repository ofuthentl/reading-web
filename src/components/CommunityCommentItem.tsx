import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Reply,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { CommunityComment, CommunityReactionEmoji } from '@/types';
import { CommunityReactionBar } from '@/components/CommunityReactionBar';
import { MAX_COMMUNITY_COMMENT_LENGTH } from '@/lib/communityApi';
import type { ReaderThemePalette } from '@/lib/readerConfig';
import { parseSpoilerSegments } from '@/lib/spoilerText';

function formatCommentTime(timestampMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  return new Date(timestampMs).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommentSpoilerContent({
  content,
  palette,
}: {
  content: string;
  palette?: ReaderThemePalette;
}) {
  const segments = useMemo(() => parseSpoilerSegments(content), [content]);
  const [revealedSet, setRevealedSet] = useState<ReadonlySet<number>>(() => new Set());

  const toggleSpoiler = (idx: number) => {
    setRevealedSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const hiddenClass = palette
    ? palette.isDark
      ? 'bg-neutral-700 text-neutral-100 hover:bg-neutral-600'
      : 'bg-[#463829] text-[#fcfbf8] hover:bg-[#352a1e]'
    : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700 dark:bg-neutral-700 dark:text-neutral-200';

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {segments.map((seg, idx) => {
        if (seg.type === 'text') return <span key={idx}>{seg.text}</span>;
        const revealed = revealedSet.has(seg.spoilerIndex);
        return (
          <button
            key={idx}
            type="button"
            aria-expanded={revealed}
            aria-label={revealed ? 'Ẩn nội dung spoiler' : 'Hiện nội dung spoiler'}
            title={revealed ? 'Bấm để ẩn lại spoiler' : 'Spoiler — bấm để xem'}
            onClick={() => toggleSpoiler(seg.spoilerIndex)}
            className={`mx-0.5 inline rounded-md px-1.5 py-0.5 text-left align-baseline transition-colors ${
              revealed ? 'bg-amber-500/15 text-current ring-1 ring-amber-500/35' : hiddenClass
            }`}
          >
            {revealed ? (
              <span>{seg.text}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <Eye className="inline h-3 w-3 shrink-0" />
                <span>Spoiler · bấm để xem</span>
              </span>
            )}
          </button>
        );
      })}
    </p>
  );
}

export interface CommunityCommentItemProps {
  comment: CommunityComment;
  replies?: readonly CommunityComment[];
  isReply?: boolean;
  isReader: boolean;
  palette?: ReaderThemePalette;
  borderClass: string;
  mutedTextClass: string;
  readerMaxChapterNumber?: number;
  confirmDeleteId: string | null;
  deletingId: string | null;
  editingBusyId: string | null;
  reactingId: string | null;
  onReplyTo?: (rootComment: CommunityComment) => void;
  onEditSave: (commentId: string, nextContent: string) => Promise<boolean>;
  onToggleReaction: (commentId: string, emoji: CommunityReactionEmoji) => void;
  onRequestDelete: (commentId: string) => void;
  onConfirmDelete: (commentId: string) => void;
  onCancelDelete: () => void;
}

export function CommunityCommentItem({
  comment,
  replies = [],
  isReply = false,
  isReader,
  palette,
  borderClass,
  mutedTextClass,
  readerMaxChapterNumber,
  confirmDeleteId,
  deletingId,
  editingBusyId,
  reactingId,
  onReplyTo,
  onEditSave,
  onToggleReaction,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: CommunityCommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.content);
  const [chapterRevealed, setChapterRevealed] = useState(false);

  useEffect(() => {
    setEditDraft(comment.content);
  }, [comment.content]);

  const isOwnerComment = comment.authorRole === 'owner';
  const canEdit = Boolean(comment.canEdit ?? comment.isMine);
  const isEdited = Boolean(comment.isEdited || comment.updatedAt > comment.createdAt + 1000);
  const confirming = confirmDeleteId === comment.id;
  const deleting = deletingId === comment.id;
  const savingEdit = editingBusyId === comment.id;

  const isAheadOfReaderChapter =
    typeof readerMaxChapterNumber === 'number' &&
    typeof comment.chapterNumber === 'number' &&
    comment.chapterNumber > readerMaxChapterNumber;
  const blurForChapterSpoiler = isAheadOfReaderChapter && !chapterRevealed && !comment.isMine;

  const badgeClass =
    isReader && palette
      ? isOwnerComment
        ? palette.badgeOwner
        : palette.badgeGuest
      : isOwnerComment
        ? 'border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
        : 'border border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300';

  const inputSurfaceClass =
    isReader && palette
      ? `border ${palette.border} bg-transparent ${palette.textPrimary} ${palette.focusBorder}`
      : 'border border-line bg-canvas text-ink focus:border-amber-500/70';

  const handleSaveEdit = async () => {
    const trimmed = editDraft.trim();
    if (!trimmed || savingEdit) return;
    const ok = await onEditSave(comment.id, trimmed);
    if (ok) setEditing(false);
  };

  return (
    <li className="space-y-2">
      <div
        className={`rounded-xl border px-3.5 py-3 ${borderClass} ${
          isReader && palette ? palette.surfaceSubtle : 'bg-canvas/70'
        }`}
      >
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}
            >
              {isOwnerComment ? <Crown className="h-3 w-3 shrink-0" /> : <User className="h-3 w-3 shrink-0" />}
              <span className="max-w-[10.5rem] truncate">{comment.authorName}</span>
            </span>

            {typeof comment.chapterNumber === 'number' && comment.chapterNumber > 0 && (
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${borderClass} ${mutedTextClass}`}
              >
                Chương {comment.chapterNumber}
              </span>
            )}

            <time className={`text-[11px] ${mutedTextClass}`}>
              {formatCommentTime(comment.createdAt)}
            </time>

            {isEdited && (
              <span className={`text-[11px] italic ${mutedTextClass}`}>(đã sửa)</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {canEdit && !editing && !confirming && (
              <button
                type="button"
                aria-label="Sửa bình luận"
                title="Chỉnh sửa bình luận"
                onClick={() => {
                  setEditDraft(comment.content);
                  setEditing(true);
                }}
                className={`rounded-md p-1 transition hover:text-amber-500 ${mutedTextClass}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}

            {comment.canDelete && !editing && (
              confirming ? (
                <>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => onConfirmDelete(comment.id)}
                    className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                  >
                    {deleting ? 'Đang xoá...' : 'Xoá ngay'}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={onCancelDelete}
                    className={`rounded-md border px-2 py-0.5 text-[11px] transition ${borderClass} ${mutedTextClass}`}
                  >
                    Huỷ
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  aria-label="Xoá bình luận"
                  title="Xoá bình luận"
                  onClick={() => onRequestDelete(comment.id)}
                  className={`rounded-md p-1 transition hover:text-red-500 ${mutedTextClass}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editDraft}
              maxLength={MAX_COMMUNITY_COMMENT_LENGTH}
              rows={2}
              disabled={savingEdit}
              onChange={(e) => setEditDraft(e.target.value)}
              aria-label="Chỉnh sửa nội dung bình luận"
              className={`w-full resize-y rounded-xl px-3 py-2 text-sm outline-none ${inputSurfaceClass}`}
            />
            <div className="flex items-center justify-end gap-1.5 text-xs">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setEditing(false)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 transition ${borderClass} ${mutedTextClass}`}
              >
                <X className="h-3 w-3" />
                <span>Huỷ</span>
              </button>
              <button
                type="button"
                disabled={savingEdit || editDraft.trim().length === 0}
                onClick={() => void handleSaveEdit()}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition disabled:opacity-50 ${
                  isReader && palette
                    ? `${palette.accentBg} ${palette.accentFg}`
                    : 'bg-accent text-accent-foreground'
                }`}
              >
                {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                <span>Lưu</span>
              </button>
            </div>
          </div>
        ) : blurForChapterSpoiler ? (
          <button
            type="button"
            onClick={() => setChapterRevealed(true)}
            className={`mt-1 flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${borderClass} ${
              isReader && palette ? `${palette.hover} ${palette.textSecondary}` : 'bg-subtle/70 text-ink-muted hover:text-ink'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <EyeOff className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>
                Bình luận về Chương {comment.chapterNumber}
                {!isReply && replies.length > 0 ? ` (+${replies.length} phản hồi)` : ''} — bấm để xem
              </span>
            </span>
            <span className="text-[11px] font-semibold text-amber-500">Hiện</span>
          </button>
        ) : (
          <CommentSpoilerContent content={comment.content} palette={isReader ? palette : undefined} />
        )}

        {!editing && !blurForChapterSpoiler && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <CommunityReactionBar
              reactions={comment.reactions}
              myReactions={comment.myReactions}
              isReader={isReader}
              palette={palette}
              borderClass={borderClass}
              mutedTextClass={mutedTextClass}
              disabled={reactingId === comment.id}
              onToggleReaction={(emoji) => onToggleReaction(comment.id, emoji)}
            />

            {!isReply && onReplyTo && (
              <button
                type="button"
                onClick={() => onReplyTo(comment)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium transition hover:text-amber-500 ${mutedTextClass}`}
              >
                <Reply className="h-3 w-3" />
                <span>Trả lời</span>
              </button>
            )}
          </div>
        )}
      </div>

      {!isReply && !blurForChapterSpoiler && replies.length > 0 && (
        <ul className={`ml-4 space-y-2 border-l-2 pl-3 sm:ml-6 ${borderClass}`}>
          {replies.map((reply) => (
            <CommunityCommentItem
              key={reply.id}
              comment={reply}
              isReply
              isReader={isReader}
              palette={palette}
              borderClass={borderClass}
              mutedTextClass={mutedTextClass}
              readerMaxChapterNumber={readerMaxChapterNumber}
              confirmDeleteId={confirmDeleteId}
              deletingId={deletingId}
              editingBusyId={editingBusyId}
              reactingId={reactingId}
              onEditSave={onEditSave}
              onToggleReaction={onToggleReaction}
              onRequestDelete={onRequestDelete}
              onConfirmDelete={onConfirmDelete}
              onCancelDelete={onCancelDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
