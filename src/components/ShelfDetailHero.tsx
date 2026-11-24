import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  Bell, Bookmark, BookOpen, FileText, FolderEdit, Image, Languages, Lock, Plus, Star, Tag, UserRound, Users,
} from 'lucide-react';
import type { Book } from '@/types';
import { formatBytes } from '@/lib/api';
import { pickClothCoverColor } from '@/lib/bookMetadata';
import { useCoverAccentColor } from '@/lib/coverAccentColor';
import type { ShelfSummary } from '@/lib/shelfSummary';
import { handleCoverTiltLeave, handleCoverTiltMove } from '@/hooks/useCardReveal';
import { useCoverUrl } from '@/hooks/useCoverUrl';

export interface ShelfDetailHeroProps {
  summary: ShelfSummary;
  onOpenBook: (book: Book) => void;
  onSelectAuthor?: (authorName: string) => void;
  onSelectTag?: (tagName: string) => void;
  onEditTags?: () => void;
  onRenameShelf?: (shelfName: string) => void;
  onChangeShelfCover?: (summary: ShelfSummary) => void;
  onOpenBatchNotes?: () => void;
  onManageAccess?: () => void;
  onAnnounceDiscord?: () => Promise<void> | void;
  announcingDiscord?: boolean;
  onToggleFavorite?: (shelfName: string, nextFavorite: boolean) => void;
  onTogglePlanToRead?: (shelfName: string, nextPlanToRead: boolean) => void;
}

export function ShelfDetailHero({
  summary,
  onOpenBook,
  onSelectAuthor,
  onSelectTag,
  onEditTags,
  onRenameShelf,
  onChangeShelfCover,
  onOpenBatchNotes,
  onManageAccess,
  onAnnounceDiscord,
  announcingDiscord = false,
  onToggleFavorite,
  onTogglePlanToRead,
}: ShelfDetailHeroProps) {
  const {
    shelf, coverBook, isFavorite, isPlanToRead, authorLabel, authors, tags, altTitles,
    bookCount, completedCount, readingStatus, progressPercent, totalBytes,
    resumeBook, resumeActionLabel, isGuestLocked, accessSummary, ratingAverage, ratingCount,
  } = summary;

  const [imgFailed, setImgFailed] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [altExpanded, setAltExpanded] = useState(false);
  const [popKind, setPopKind] = useState<'fav' | 'ptr' | null>(null);

  const coverKey = coverBook?.cover_key ?? null;
  const coverUrl = useCoverUrl(coverKey, true);
  const showImage = Boolean(coverUrl && !imgFailed);
  const accentRgb = useCoverAccentColor(showImage ? coverKey : null, showImage ? coverUrl : null);
  const clothColor = pickClothCoverColor(`${shelf.key}-${shelf.name}`);

  const missingNoteCount = useMemo(
    () => shelf.books.filter((b) => !b.description?.trim()).length,
    [shelf.books],
  );

  const shelfDescription = useMemo(() => {
    const fromCover = coverBook?.description?.trim();
    if (fromCover) return fromCover;
    for (const b of shelf.books) {
      const text = b.description?.trim();
      if (text) return text;
    }
    return null;
  }, [coverBook, shelf.books]);

  useEffect(() => {
    setDescExpanded(false);
    setAltExpanded(false);
  }, [shelf.key]);

  useEffect(() => {
    setImgFailed(false);
  }, [coverKey]);

  const statusBadge = isGuestLocked
    ? {
        className:
          'border-rose-600/35 bg-rose-600/10 text-rose-700 dark:border-rose-400/35 dark:text-rose-300',
        label: '🔒 Giới hạn quyền đọc',
      }
    : readingStatus === 'completed'
      ? {
          className:
            'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300',
          label: `Hoàn thành (${completedCount}/${bookCount})`,
        }
      : readingStatus === 'reading'
        ? {
            className: 'border-accent/35 bg-accent/10 text-accent',
            label:
              bookCount > 1
                ? `Đang đọc · ${completedCount}/${bookCount} tập (${progressPercent ?? 0}%)`
                : `Đang đọc · ${progressPercent ?? 0}%`,
          }
        : isPlanToRead
          ? {
              className:
                'border-sky-600/35 bg-sky-600/10 text-sky-700 dark:border-sky-400/35 dark:text-sky-300',
              label: 'Để dành đọc sau',
            }
          : {
              className: 'border-line bg-canvas text-ink-muted',
              label: 'Chưa đọc',
            };

  const displayedAltTitles = altExpanded ? altTitles : altTitles.slice(0, 3);

  const heroStyle: CSSProperties | undefined = accentRgb
    ? ({
        ['--cover-accent' as string]: accentRgb,
        borderColor: 'rgb(var(--cover-accent) / 0.34)',
      } as CSSProperties)
    : undefined;

  return (
    <section
      style={heroStyle}
      className="moonlit-card relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-sm sm:flex-row sm:items-start sm:p-5 dark:border-line-strong/60"
    >
      {showImage && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 select-none overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.52)_58%,transparent_100%)]"
        >
          <img
            src={coverUrl!}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-[0.16] blur-[48px] saturate-[1.3] dark:opacity-[0.21]"
          />
        </div>
      )}

      <div
        onPointerMove={handleCoverTiltMove}
        onPointerLeave={handleCoverTiltLeave}
        onPointerCancel={handleCoverTiltLeave}
        className="tilt-card group relative z-10 aspect-[7/10] w-28 shrink-0 self-center overflow-hidden rounded-xl border border-line bg-subtle shadow-sm sm:w-32 sm:self-start"
      >
        {showImage ? (
          <img
            src={coverUrl!}
            alt={shelf.name}
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            style={{ backgroundColor: clothColor }}
            className="relative flex h-full w-full flex-col justify-between p-2.5 text-[#f6efe2]"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-2 border-r border-black/25 bg-black/15"
            />
            <p className="line-clamp-4 pl-2 pt-1 font-display text-xs font-semibold leading-snug">
              {shelf.name}
            </p>
            <p className="truncate pl-2 text-[10px] text-[#e6d5b8]/85">{authorLabel}</p>
          </div>
        )}

        {isGuestLocked && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#120b0e]/80 text-[#fce7eb] shadow-lg backdrop-blur-md"
          >
            <Lock className="h-4 w-4" />
          </span>
        )}

        {onChangeShelfCover && shelf.books.some((b) => Boolean(b.cover_key)) && (
          <button
            type="button"
            onClick={() => onChangeShelfCover(summary)}
            aria-label="Chọn ảnh bìa kệ"
            title="Chọn ảnh bìa từ một tập trong kệ"
            className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center justify-center gap-1 rounded-lg border border-white/20 bg-black/75 px-2 py-1 text-[11px] font-medium text-white opacity-90 backdrop-blur-sm transition-opacity hover:bg-black/90 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          >
            <Image className="h-3 w-3 shrink-0" />
            <span>Đổi bìa</span>
          </button>
        )}
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
            <span className="rounded-full border border-line bg-canvas/85 px-2.5 py-0.5 text-[11px] text-ink-muted">
              {bookCount} tập · {formatBytes(totalBytes)}
            </span>
            {ratingCount > 0 && ratingAverage !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/12 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:border-amber-400/35 dark:text-amber-300">
                <span aria-hidden="true">★</span>
                <span>{ratingAverage.toFixed(1)}</span>
                <span className="font-normal opacity-80">({ratingCount})</span>
              </span>
            )}
          </div>

          <h2 className="font-display text-xl font-semibold leading-tight text-ink sm:text-2xl">
            {shelf.name}
          </h2>

          {altTitles.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-muted">
              <Languages className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <span className="font-medium text-ink-faint">Tên khác:</span>
              <span>{displayedAltTitles.join(' · ')}</span>
              {altTitles.length > 3 && (
                <button
                  type="button"
                  onClick={() => setAltExpanded((v) => !v)}
                  className="font-medium text-accent hover:underline"
                >
                  {altExpanded ? 'Thu gọn' : `+${altTitles.length - 3} tên khác`}
                </button>
              )}
            </div>
          )}

          {authors.length > 0 && onSelectAuthor ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-muted">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              {authors.map((author, idx) => (
                <span key={author} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => onSelectAuthor(author)}
                    title={`Xem tất cả bộ truyện của ${author}`}
                    className="rounded text-left font-medium text-ink-muted underline-offset-4 transition-colors hover:text-crimson-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {author}
                  </button>
                  {idx < authors.length - 1 && <span className="text-ink-faint">,</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{authorLabel}</p>
          )}

          {(tags.length > 0 || onEditTags) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {tags.map((tag) =>
                onSelectTag ? (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onSelectTag(tag)}
                    title={`Xem các bộ truyện thể loại ${tag}`}
                    className="inline-flex items-center rounded-lg border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:border-crimson-accent/45 hover:bg-crimson-accent/10 hover:text-crimson-accent"
                  >
                    {tag}
                  </button>
                ) : (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-lg border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-muted"
                  >
                    {tag}
                  </span>
                ),
              )}
              {onEditTags && tags.length === 0 && (
                <button
                  type="button"
                  onClick={onEditTags}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong/80 bg-canvas/60 px-2.5 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent hover:text-accent"
                >
                  <Plus className="h-3 w-3" />
                  <span>Gắn thể loại</span>
                </button>
              )}
            </div>
          )}

          {shelfDescription && (
            <div className="max-w-2xl pt-1">
              <p
                className={`whitespace-pre-line text-xs leading-relaxed text-ink-muted sm:text-sm ${
                  descExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {shelfDescription}
              </p>
              {shelfDescription.length > 180 && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  className="mt-1 text-xs font-medium text-accent hover:underline"
                >
                  {descExpanded ? 'Thu gọn' : 'Xem đầy đủ'}
                </button>
              )}
            </div>
          )}

          {progressPercent !== null && (
            <div className="max-w-md pt-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-crimson-accent transition-all duration-300"
                  style={{
                    width: `${Math.max(progressPercent, readingStatus === 'completed' ? 100 : 6)}%`,
                    ...(accentRgb ? { backgroundColor: 'rgb(var(--cover-accent))' } : {}),
                  }}
                />
              </div>
            </div>
          )}
        </div>

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
      </div>
    </section>
  );
}
