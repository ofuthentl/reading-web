import { type CSSProperties, useEffect, useState } from 'react';
import { Bookmark, FolderEdit, Image, Lock, Star } from 'lucide-react';
import { pickClothCoverColor } from '@/lib/bookMetadata';
import type { ShelfSummary } from '@/lib/shelfSummary';
import { ShelfFanStack } from '@/components/ShelfFanStack';
import {
  handleCoverTiltLeave,
  handleCoverTiltMove,
  useCardReveal,
} from '@/hooks/useCardReveal';
import { useCoverUrl } from '@/hooks/useCoverUrl';

interface ShelfCoverCardProps {
  summary: ShelfSummary;
  staggerIndex?: number;
  onOpenShelf: (shelfKey: string) => void;
  onRenameShelf?: (shelfName: string) => void;
  onChangeShelfCover?: (summary: ShelfSummary) => void;
  onManageAccess?: (summary: ShelfSummary) => void;
  onToggleFavorite?: (shelfName: string, nextFavorite: boolean) => void;
  onTogglePlanToRead?: (shelfName: string, nextPlanToRead: boolean) => void;
}

export function ShelfCoverCard({
  summary,
  staggerIndex = 0,
  onOpenShelf,
  onRenameShelf,
  onChangeShelfCover,
  onManageAccess,
  onToggleFavorite,
  onTogglePlanToRead,
}: ShelfCoverCardProps) {
  const {
    shelf,
    coverBook,
    isFavorite,
    isPlanToRead,
    authorLabel,
    bookCount,
    completedCount,
    readingStatus,
    progressPercent,
    isGuestLocked,
    accessSummary,
    ratingAverage,
    ratingCount,
  } = summary;

  const { cardRef, isNearViewport, isRevealed } = useCardReveal<HTMLDivElement>();
  const [imgFailed, setImgFailed] = useState(false);
  const [popKind, setPopKind] = useState<'fav' | 'ptr' | null>(null);

  const coverKey = coverBook?.cover_key ?? null;
  const staggerDelayMs = (staggerIndex % 4) * 28;

  useEffect(() => {
    setImgFailed(false);
  }, [coverKey]);

  const coverUrl = useCoverUrl(coverKey, isNearViewport);
  const showImage = Boolean(coverUrl && !imgFailed);
  const clothColor = pickClothCoverColor(`${shelf.key}-${shelf.name}`);

  const statusMeta = isGuestLocked
    ? {
        dotClass: 'bg-crimson-accent',
        textClass: 'text-crimson-accent',
        label: 'Giới hạn quyền đọc',
      }
    : readingStatus === 'completed'
      ? {
          dotClass: 'bg-emerald-600 dark:bg-emerald-400',
          textClass: 'text-emerald-700 dark:text-emerald-400',
          label: 'Hoàn thành',
        }
      : readingStatus === 'reading'
        ? {
            dotClass: 'bg-crimson-accent',
            textClass: 'text-crimson-accent',
            label:
              bookCount > 1
                ? `Đang đọc · ${completedCount}/${bookCount}`
                : `Đang đọc · ${progressPercent ?? 0}%`,
          }
        : isPlanToRead
          ? {
              dotClass: 'bg-sky-600 dark:bg-sky-400',
              textClass: 'text-sky-700 dark:text-sky-400',
              label: 'Để dành đọc sau',
            }
          : {
              dotClass: 'bg-ink-faint/60',
              textClass: 'text-ink-faint',
              label: 'Chưa đọc',
            };

  const canShowPtr = Boolean(onTogglePlanToRead && !isGuestLocked);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={() => onOpenShelf(shelf.key)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenShelf(shelf.key);
        }
      }}
      style={{ ['--stagger-delay' as string]: `${staggerDelayMs}ms` } as CSSProperties}
      className={`card-scroll-reveal shelf-fan-card group relative flex cursor-pointer flex-col rounded-xl text-left hover:z-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
        isRevealed ? 'is-revealed' : ''
      }`}
    >
      <div className="relative w-full">
        <ShelfFanStack shelf={shelf} coverBook={coverBook} isNearViewport={isNearViewport} />
        <div
          onPointerMove={handleCoverTiltMove}
          onPointerLeave={handleCoverTiltLeave}
          onPointerCancel={handleCoverTiltLeave}
          className="shelf-fan-main tilt-card relative z-10 aspect-[7/10] w-full overflow-hidden rounded-xl border border-line bg-subtle shadow-sm group-hover:border-line-strong group-hover:shadow-[0_16px_32px_-10px_rgba(43,36,29,0.34)] dark:group-hover:border-line-strong dark:group-hover:shadow-[0_20px_38px_-12px_rgba(0,0,0,0.94),0_0_0_1px_rgba(244,244,245,0.16)]"
        >
        {showImage ? (
          <>
            <img
              src={coverUrl!}
              alt={shelf.name}
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 via-black/15 to-transparent"
            />
          </>
        ) : (
          <div
            style={{ backgroundColor: clothColor }}
            className="relative flex h-full w-full flex-col justify-between p-3 text-[#f6efe2]"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-2 border-r border-black/25 bg-black/15"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-2.5 left-3.5 rounded-[2px] border border-[#f5ead6]/20"
            />
            <div className="pl-2.5 pt-2">
              <p className="line-clamp-4 font-display text-sm font-semibold leading-snug text-[#f6efe2]">
                {shelf.name}
              </p>
              <span className="mt-2 block h-px w-6 bg-[#e6d5b8]/45" />
            </div>
            <p className="truncate pb-6 pl-2.5 text-[11px] text-[#e6d5b8]/85">{authorLabel}</p>
          </div>
        )}

        {/* Nhóm nút thao tác kệ kín đáo khi hover */}
        {(onRenameShelf || onChangeShelfCover || onManageAccess) && (
          <div className="touch-action-visible absolute left-2 top-2 flex items-center gap-1 opacity-85 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0">
            {onRenameShelf && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRenameShelf(shelf.name);
                }}
                aria-label={`Đổi tên kệ ${shelf.name}`}
                title="Đổi tên kệ"
                className="rounded-lg border border-[#f3e9d7]/20 bg-[#16120f]/75 p-1.5 text-[#f3e9d7] transition-colors hover:bg-[#16120f]"
              >
                <FolderEdit className="h-3.5 w-3.5" />
              </button>
            )}
            {onChangeShelfCover && shelf.books.some((b) => Boolean(b.cover_key)) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChangeShelfCover(summary);
                }}
                aria-label={`Chọn ảnh bìa cho kệ ${shelf.name}`}
                title="Chọn ảnh bìa kệ"
                className="rounded-lg border border-[#f3e9d7]/20 bg-[#16120f]/75 p-1.5 text-[#f3e9d7] transition-colors hover:bg-[#16120f]"
              >
                <Image className="h-3.5 w-3.5" />
              </button>
            )}
            {onManageAccess && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onManageAccess(summary);
                }}
                aria-label={`Phân quyền đọc kệ ${shelf.name}`}
                title="Phân quyền thành viên Discord"
                className="rounded-lg border border-[#f3e9d7]/20 bg-[#16120f]/75 p-1.5 text-[#f3e9d7] transition-colors hover:bg-[#16120f]"
              >
                <Lock className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Cụm nút Đọc sau & Yêu thích góc trên-phải */}
        {(canShowPtr || onToggleFavorite) && (
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {canShowPtr && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPopKind('ptr');
                  onTogglePlanToRead!(shelf.name, !isPlanToRead);
                }}
                onAnimationEnd={() => {
                  if (popKind === 'ptr') setPopKind(null);
                }}
                aria-label={
                  isPlanToRead
                    ? `Bỏ Đọc sau bộ ${shelf.name}`
                    : `Lưu Đọc sau bộ ${shelf.name}`
                }
                aria-pressed={isPlanToRead}
                title={isPlanToRead ? 'Gỡ khỏi danh sách Đọc sau' : 'Để dành đọc sau'}
                className={`rounded-lg border p-1.5 transition-all ${
                  popKind === 'ptr' ? 'micro-pop' : ''
                } ${
                  isPlanToRead
                    ? 'border-sky-400/55 bg-[#16120f]/88 text-sky-300 opacity-100 shadow-sm hover:bg-[#16120f]'
                    : 'touch-action-visible border-[#f3e9d7]/20 bg-[#16120f]/75 text-[#f3e9d7] opacity-85 hover:bg-[#16120f] focus:opacity-100 group-hover:opacity-100 sm:opacity-0'
                }`}
              >
                <Bookmark className={`h-3.5 w-3.5 ${isPlanToRead ? 'fill-sky-300' : ''}`} />
              </button>
            )}

            {onToggleFavorite && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPopKind('fav');
                  onToggleFavorite(shelf.name, !isFavorite);
                }}
                onAnimationEnd={() => {
                  if (popKind === 'fav') setPopKind(null);
                }}
                aria-label={isFavorite ? `Bỏ yêu thích kệ ${shelf.name}` : `Yêu thích kệ ${shelf.name}`}
                aria-pressed={isFavorite}
                title={isFavorite ? 'Bỏ yêu thích kệ' : 'Ghim kệ yêu thích lên đầu'}
                className={`rounded-lg border p-1.5 transition-all ${
                  popKind === 'fav' ? 'micro-pop' : ''
                } ${
                  isFavorite
                    ? 'border-amber-400/50 bg-[#16120f]/85 text-amber-400 opacity-100 shadow-sm hover:bg-[#16120f]'
                    : 'touch-action-visible border-[#f3e9d7]/20 bg-[#16120f]/75 text-[#f3e9d7] opacity-85 hover:bg-[#16120f] focus:opacity-100 group-hover:opacity-100 sm:opacity-0'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-400' : ''}`} />
              </button>
            )}
          </div>
        )}

        {/* Huy hiệu ổ khoá khi bộ sách bị giới hạn cho khách hoặc nhãn quản trị cho Admin */}
        {isGuestLocked && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-black/15 transition-colors duration-300 group-hover:bg-black/28"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#120b0e]/78 text-[#fce7eb] shadow-lg backdrop-blur-md transition-transform duration-300 group-hover:scale-105"
            >
              <Lock className="h-4 w-4" />
            </span>
            <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md border border-rose-300/40 bg-[#140b0e]/88 px-2 py-0.5 text-[10.5px] font-semibold tracking-tight text-rose-100 backdrop-blur-sm">
              <Lock className="h-2.5 w-2.5 shrink-0" />
              <span>Giới hạn</span>
            </span>
          </>
        )}

        {!isGuestLocked && accessSummary?.mode === 'restricted' && (
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md border border-rose-300/35 bg-[#140b0e]/85 px-2 py-0.5 text-[10.5px] font-medium tracking-tight text-rose-100 backdrop-blur-sm">
            <Lock className="h-2.5 w-2.5 shrink-0" />
            <span>
              {accessSummary.allowedCount > 0
                ? `${accessSummary.allowedCount} người`
                : 'Chỉ Admin'}
            </span>
          </span>
        )}

        {/* Huy hiệu điểm đánh giá trung bình ★ (QĐ-3 = 3B) */}
        {ratingCount > 0 && ratingAverage !== null && (
          <span
            aria-label={`Đánh giá ${ratingAverage.toFixed(1)} sao (${ratingCount} lượt)`}
            className={`pointer-events-none absolute left-2 ${
              isGuestLocked || accessSummary?.mode === 'restricted' ? 'bottom-8' : 'bottom-2'
            } inline-flex items-center gap-0.5 rounded-md border border-amber-300/35 bg-[#16120f]/88 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-300 backdrop-blur-sm`}
          >
            <span aria-hidden="true">★</span>
            <span>{ratingAverage.toFixed(1)}</span>
          </span>
        )}

        {/* Badge số tập góc dưới-phải */}
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-md border border-white/15 bg-[#111113]/85 px-2 py-0.5 text-[11px] font-semibold tracking-tight text-[#f4f4f5] backdrop-blur-sm">
          {bookCount} tập
        </span>

        {/* Nếp gấp gáy sách mép trái */}
        <span
          aria-hidden="true"
          className="book-spine-crease pointer-events-none absolute inset-y-0 left-0 w-2.5"
        />

        {/* Thanh tiến độ đọc toàn kệ */}
        {progressPercent !== null && (
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div
              className="h-full bg-crimson-accent transition-all duration-300"
              style={{
                width: `${Math.max(progressPercent, readingStatus === 'completed' ? 100 : 6)}%`,
              }}
            />
          </div>
        )}
        </div>
      </div>

      <div className="mt-2.5 space-y-0.5 px-0.5">
        <h3 className="group-hover-crimson line-clamp-2 text-sm font-semibold leading-snug text-ink transition-colors duration-200">
          {shelf.name}
        </h3>
        <p className="truncate text-xs text-ink-muted">{authorLabel}</p>
        <div className={`flex items-center gap-1.5 pt-0.5 text-[11px] font-medium ${statusMeta.textClass}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusMeta.dotClass}`} />
          <span className="truncate">{statusMeta.label}</span>
        </div>
      </div>
    </div>
  );
}
