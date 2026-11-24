import { AlertCircle, ArrowLeft, ArrowRight, List, Lock, RefreshCw } from 'lucide-react';
import type { GuestTocItem } from '@/types';
import type { ReaderThemePalette } from '@/lib/readerConfig';

function findNearestUnlockedChapterIndex(
  tocChapters: readonly GuestTocItem[],
  fromIndex: number,
): number | null {
  for (let i = fromIndex + 1; i < tocChapters.length; i += 1) {
    if (!tocChapters[i]?.locked) return i;
  }
  for (let i = fromIndex - 1; i >= 0; i -= 1) {
    if (!tocChapters[i]?.locked) return i;
  }
  return null;
}

export interface GuestChapterFallbackStateProps {
  locked: boolean;
  chapterTitle?: string;
  errorMessage?: string | null;
  tocChapters: readonly GuestTocItem[];
  currentIndex: number;
  palette: ReaderThemePalette;
  onJumpToChapter: (chapterIndex: number) => void;
  onOpenToc: () => void;
  onRetry: () => void;
  onCloseReader: () => void;
}

export function GuestChapterFallbackState({
  locked,
  chapterTitle,
  errorMessage,
  tocChapters,
  currentIndex,
  palette,
  onJumpToChapter,
  onOpenToc,
  onRetry,
  onCloseReader,
}: GuestChapterFallbackStateProps) {
  if (locked) {
    const nearestIdx = findNearestUnlockedChapterIndex(tocChapters, currentIndex);
    const nearestItem = nearestIdx !== null ? tocChapters[nearestIdx] : null;

    return (
      <div className="mx-auto flex flex-1 max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm ${palette.border} ${palette.surfaceSubtle}`}
        >
          <Lock className={`h-5 w-5 ${palette.accentText}`} />
        </div>
        <h2 className="font-display text-base font-bold leading-snug">
          🔒 Chương này chỉ mở cho thành viên Discord được chỉ định
        </h2>
        {chapterTitle && (
          <p className={`text-xs font-medium ${palette.textSecondary}`}>{chapterTitle}</p>
        )}
        <p className={`text-xs leading-relaxed ${palette.textSecondary}`}>
          {nearestItem
            ? 'Bạn vẫn có thể đọc các chương đang mở khác trong tập sách này.'
            : 'Hiện tại toàn bộ các chương trong tập sách này đều đang giới hạn quyền đọc.'}
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {nearestItem && nearestIdx !== null ? (
            <>
              <button
                type="button"
                onClick={() => onJumpToChapter(nearestIdx)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${palette.accentBg} ${palette.accentFg}`}
              >
                <span>Chuyển tới: {nearestItem.title}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </button>
              <button
                type="button"
                onClick={onOpenToc}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${palette.border} ${palette.hover}`}
              >
                <List className="h-3.5 w-3.5" />
                <span>Mở mục lục</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onCloseReader}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition ${palette.border} ${palette.hover}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Quay lại Thư viện</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-1 max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertCircle className="h-8 w-8 text-amber-500" />
      <p className="text-sm font-medium">{errorMessage || 'Không thể tải nội dung chương.'}</p>
      <button
        type="button"
        onClick={onRetry}
        className={`mt-1 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition ${palette.border} ${palette.hover}`}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        <span>Thử tải lại chương</span>
      </button>
    </div>
  );
}
