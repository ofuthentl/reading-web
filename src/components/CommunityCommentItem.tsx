import { useMemo, useState } from 'react';
import { Crown, Eye, Trash2, User } from 'lucide-react';
import type { CommunityComment } from '@/types';
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

function CommentSpoilerContent({ content }: { content: string }) {
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

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <span key={idx}>{seg.text}</span>;
        }
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
              revealed
                ? 'bg-amber-500/15 text-current ring-1 ring-amber-500/35'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
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
  isReader: boolean;
  borderClass: string;
  mutedTextClass: string;
  confirming: boolean;
  deleting: boolean;
  onRequestDelete: (commentId: string) => void;
  onConfirmDelete: (commentId: string) => void;
  onCancelDelete: () => void;
}

export function CommunityCommentItem({
  comment,
  isReader,
  borderClass,
  mutedTextClass,
  confirming,
  deleting,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: CommunityCommentItemProps) {
  const isOwnerComment = comment.authorRole === 'owner';

  return (
    <li
      className={`rounded-xl border px-3.5 py-3 ${borderClass} ${
        isReader ? 'bg-black/[0.02] dark:bg-white/[0.02]' : 'bg-canvas/70'
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isOwnerComment
                ? 'border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'border border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
            }`}
          >
            {isOwnerComment ? (
              <Crown className="h-3 w-3 shrink-0" />
            ) : (
              <User className="h-3 w-3 shrink-0" />
            )}
            <span className="max-w-[11rem] truncate">{comment.authorName}</span>
          </span>
          <time className={`text-[11px] ${mutedTextClass}`}>
            {formatCommentTime(comment.createdAt)}
          </time>
        </div>

        {comment.canDelete && (
          <div className="flex items-center gap-1">
            {confirming ? (
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
            )}
          </div>
        )}
      </div>

      <CommentSpoilerContent content={comment.content} />
    </li>
  );
}
