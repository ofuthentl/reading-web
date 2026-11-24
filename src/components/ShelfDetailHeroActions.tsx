import { useState } from 'react';
import {
  Bell,
  Bookmark,
  BookOpen,
  FileText,
  FolderEdit,
  GitBranch,
  Image,
  Lock,
  Star,
  Tag,
  Users,
} from 'lucide-react';
import type { Book } from '@/types';
import type { ShelfSummary } from '@/lib/shelfSummary';

export interface ShelfDetailHeroActionsProps {
  summary: ShelfSummary;
  missingNoteCount: number;
  relationCount?: number;
  announcingDiscord?: boolean;
  onOpenBook: (book: Book) => void;
  onEditTags?: () => void;
  onRenameShelf?: (shelfName: string) => void;
  onChangeShelfCover?: (summary: ShelfSummary) => void;
  onOpenBatchNotes?: () => void;
  onManageAccess?: () => void;
  onManageRelations?: () => void;
  onAnnounceDiscord?: () => Promise<void> | void;
  onToggleFavorite?: (shelfName: string, nextFavorite: boolean) => void;
  onTogglePlanToRead?: (shelfName: string, nextPlanToRead: boolean) => void;
}

export function ShelfDetailHeroActions({
  summary,
  missingNoteCount,
  relationCount = 0,
  announcingDiscord = false,
  onOpenBook,
  onEditTags,
  onRenameShelf,
  onChangeShelfCover,
  onOpenBatchNotes,
  onManageAccess,
  onManageRelations,
  onAnnounceDiscord,
  onToggleFavorite,
  onTogglePlanToRead,
}: ShelfDetailHeroActionsProps) {
  const [popKind, setPopKind] = useState<'fav' | 'ptr' | null>(null);
  const {
    shelf,
    isFavorite,
    isPlanToRead,
    tags,
    resumeBook,
    resumeActionLabel,
    isGuestLocked,
    accessSummary,
  } = summary;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {resumeBook &&
        (isGuestLocked ? (
          <button
            type="button"
            onClick={() => onOpenBook(resumeBook)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-600/35 bg-rose-600/10 px-4 py-2 text-sm font-medium text-rose-800 transition-colors hover:bg-rose-600/15 dark:border-rose-400/35 dark:text-rose-200"
          >
            <Lock className="h-4 w-4" />
            <span>Cần cấp quyền đọc</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenBook(resumeBook)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
          >
            <BookOpen className="h-4 w-4" />
            <span>{resumeActionLabel}</span>
          </button>
        ))}

      {!isGuestLocked && onTogglePlanToRead && (
        <button
          type="button"
          onClick={() => {
            setPopKind('ptr');
            onTogglePlanToRead(shelf.name, !isPlanToRead);
          }}
          onAnimationEnd={() => {
            if (popKind === 'ptr') setPopKind(null);
          }}
          aria-pressed={isPlanToRead}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
            popKind === 'ptr' ? 'micro-pop' : ''
          } ${
            isPlanToRead
              ? 'border-sky-500/45 bg-sky-500/12 text-sky-700 hover:bg-sky-500/20 dark:border-sky-400/40 dark:text-sky-300'
              : 'border-line bg-canvas text-ink hover:border-line-strong hover:bg-subtle'
          }`}
        >
          <Bookmark
            className={`h-4 w-4 ${
              isPlanToRead
                ? 'fill-sky-500 text-sky-500 dark:fill-sky-400 dark:text-sky-400'
                : 'text-ink-muted'
            }`}
          />
          <span>{isPlanToRead ? 'Đã lưu Đọc sau' : 'Đọc sau'}</span>
        </button>
      )}

      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => {
            setPopKind('fav');
            onToggleFavorite(shelf.name, !isFavorite);
          }}
          onAnimationEnd={() => {
            if (popKind === 'fav') setPopKind(null);
          }}
          aria-pressed={isFavorite}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
            popKind === 'fav' ? 'micro-pop' : ''
          } ${
            isFavorite
              ? 'border-amber-500/45 bg-amber-500/12 text-amber-700 hover:bg-amber-500/20 dark:border-amber-400/40 dark:text-amber-300'
              : 'border-line bg-canvas text-ink hover:border-line-strong hover:bg-subtle'
          }`}
        >
          <Star
            className={`h-4 w-4 ${
              isFavorite
                ? 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400'
                : 'text-ink-muted'
            }`}
          />
          <span>{isFavorite ? 'Đã yêu thích' : 'Yêu thích'}</span>
        </button>
      )}

      {onEditTags && (
        <button
          type="button"
          onClick={onEditTags}
          title="Gắn hoặc chỉnh sửa thể loại cho bộ truyện này"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
        >
          <Tag className="h-4 w-4 text-ink-muted" />
          <span>Thể loại</span>
          {tags.length > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-line bg-subtle px-1.5 text-[11px] font-medium leading-none tabular-nums text-ink">
              {tags.length}
            </span>
          )}
        </button>
      )}

      {onManageRelations && (
        <button
          type="button"
          onClick={onManageRelations}
          title="Liên kết phần tiếp theo, ngoại truyện hoặc cùng vũ trụ"
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
        >
          <GitBranch className="h-4 w-4 text-ink-muted" />
          <span>Liên kết</span>
          {relationCount > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-line bg-subtle px-1.5 text-[11px] font-medium leading-none tabular-nums text-ink">
              {relationCount}
            </span>
          )}
        </button>
      )}

      {onRenameShelf && (
        <button
          type="button"
          onClick={() => onRenameShelf(shelf.name)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
        >
          <FolderEdit className="h-4 w-4 text-ink-muted" />
          <span>Đổi tên kệ</span>
        </button>
      )}

      {onChangeShelfCover && shelf.books.some((b) => Boolean(b.cover_key)) && (
        <button
          type="button"
          onClick={() => onChangeShelfCover(summary)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
        >
          <Image className="h-4 w-4 text-ink-muted" />
          <span>Đổi ảnh bìa kệ</span>
        </button>
      )}

      {onOpenBatchNotes && (
        <button
          type="button"
          onClick={onOpenBatchNotes}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
          title="Thêm ghi chú, tác giả, tên gọi khác hoặc lấy gợi ý từ AniList"
        >
          <FileText className="h-4 w-4 text-ink-muted" />
          <span>{missingNoteCount > 0 ? 'Thêm ghi chú' : 'Thông tin & AniList'}</span>
          {missingNoteCount > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-line bg-subtle px-1.5 text-[11px] font-medium leading-none tabular-nums text-ink">
              {missingNoteCount}
            </span>
          )}
        </button>
      )}

      {onManageAccess && (
        <button
          type="button"
          onClick={onManageAccess}
          title="Chọn thành viên Discord được phép đọc bộ truyện này"
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
            accessSummary?.mode === 'restricted'
              ? 'border-crimson-accent/45 bg-crimson-accent/10 text-crimson-accent hover:bg-crimson-accent/15'
              : 'border-line bg-canvas text-ink hover:border-line-strong hover:bg-subtle'
          }`}
        >
          {accessSummary?.mode === 'restricted' ? (
            <Lock className="h-4 w-4" />
          ) : (
            <Users className="h-4 w-4 text-ink-muted" />
          )}
          <span>
            {accessSummary?.mode === 'restricted'
              ? accessSummary.allowedCount > 0
                ? `Giới hạn (${accessSummary.allowedCount} người)`
                : 'Giới hạn (Chỉ Admin)'
              : 'Phân quyền'}
          </span>
        </button>
      )}

      {onAnnounceDiscord && (
        <button
          type="button"
          disabled={announcingDiscord}
          onClick={() => void onAnnounceDiscord()}
          title="Đăng thông báo bộ truyện này lên kênh Discord"
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-55 dark:border-amber-400/35 dark:text-amber-300"
        >
          <Bell className="h-4 w-4" />
          <span>{announcingDiscord ? 'Đang gửi Discord...' : 'Thông báo Discord'}</span>
        </button>
      )}
    </div>
  );
}
