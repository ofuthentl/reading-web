import { type CSSProperties, useEffect, useState } from 'react';
import { GitBranch, Lock } from 'lucide-react';
import { pickClothCoverColor } from '@/lib/bookMetadata';
import type {
  LinkedShelfDisplayItem,
  RecommendedShelfItem,
} from '@/lib/shelfRecommendations';
import type { ShelfSummary } from '@/lib/shelfSummary';
import {
  handleCoverTiltLeave,
  handleCoverTiltMove,
  useCardReveal,
} from '@/hooks/useCardReveal';
import { useCoverUrl } from '@/hooks/useCoverUrl';

function compactRelationBadge(label: string): string {
  if (label === 'Ngoại truyện / Spin-off') return 'Ngoại truyện';
  return label;
}

function EditorialRelatedShelfCard({
  summary,
  badgeLabel,
  badgeTone,
  staggerIndex,
  shouldLoadCover,
  onOpenShelf,
}: {
  summary: ShelfSummary;
  badgeLabel: string;
  badgeTone: 'relation' | 'recommend';
  staggerIndex: number;
  shouldLoadCover: boolean;
  onOpenShelf: (shelfKey: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const coverKey = summary.coverBook?.cover_key ?? null;

  useEffect(() => {
    setImgFailed(false);
  }, [coverKey]);

  const coverUrl = useCoverUrl(coverKey, shouldLoadCover);
  const showImage = Boolean(coverUrl && !imgFailed);
  const clothColor = pickClothCoverColor(`${summary.shelf.key}-${summary.shelf.name}`);
  const staggerDelayMs = (staggerIndex % 4) * 28;
  const hasFoil =
    (summary.isFavorite || summary.readingStatus === 'completed') && !summary.isGuestLocked;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenShelf(summary.shelf.key)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenShelf(summary.shelf.key);
        }
      }}
      style={{ ['--stagger-delay' as string]: `${staggerDelayMs}ms` } as CSSProperties}
      className="group flex cursor-pointer flex-col rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <div
        onPointerMove={handleCoverTiltMove}
        onPointerLeave={handleCoverTiltLeave}
        onPointerCancel={handleCoverTiltLeave}
        className={`tilt-card ${
          hasFoil ? 'cover-foil-card ' : ''
        }relative aspect-[7/10] w-full overflow-hidden rounded-lg border border-line bg-subtle shadow-sm group-hover:border-line-strong group-hover:shadow-[0_16px_32px_-10px_rgba(43,36,29,0.32)] dark:group-hover:border-line-strong dark:group-hover:shadow-[0_20px_38px_-12px_rgba(0,0,0,0.94),0_0_0_1px_rgba(244,244,245,0.16)]`}
      >
        {showImage ? (
          <>
            <img
              src={coverUrl!}
              alt={summary.shelf.name}
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
            />
            <span
              aria-hidden="true"
              className="book-spine-crease pointer-events-none absolute inset-y-0 left-0 w-3.5"
            />
          </>
        ) : (
          <div
            style={{ backgroundColor: clothColor }}
            className="relative flex h-full w-full flex-col justify-between p-2.5 text-[#f6efe2]"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-2 border-r border-black/25 bg-black/15"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-2.5 left-3.5 rounded-[2px] border border-[#f5ead6]/20"
            />
            <div className="pl-2.5 pt-6">
              <p className="line-clamp-4 font-display text-sm font-semibold leading-snug text-[#f6efe2]">
                {summary.shelf.name}
              </p>
              <span className="mt-2 block h-px w-6 bg-[#e6d5b8]/45" />
            </div>
            <p className="truncate pb-5 pl-2.5 text-[11px] text-[#e6d5b8]/85">
              {summary.authorLabel}
            </p>
          </div>
        )}

        {/* Nhãn mối liên hệ / lý do gợi ý ở góc trên-trái */}
        <span
          className={`pointer-events-none absolute left-1.5 top-1.5 max-w-[calc(100%-0.75rem)] truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-tight backdrop-blur-sm ${
            badgeTone === 'relation'
              ? 'border-[#f5b3b3]/35 bg-[#8f1818]/92 text-white'
              : 'border-white/18 bg-[#111113]/82 text-[#f4f4f5]'
          }`}
        >
          {badgeLabel}
        </span>

        {summary.isGuestLocked && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-[#120b0e]/80 text-[#fce7eb] shadow-lg backdrop-blur-md">
              <Lock className="h-4 w-4" />
            </span>
          </span>
        )}

        {/* Điểm đánh giá trung bình góc dưới-trái */}
        {summary.ratingCount > 0 && summary.ratingAverage !== null && (
          <span className="pointer-events-none absolute bottom-2 left-1.5 inline-flex items-center gap-0.5 rounded border border-amber-300/35 bg-[#16120f]/88 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-300 backdrop-blur-sm">
            <span aria-hidden="true">★</span>
            <span>{summary.ratingAverage.toFixed(1)}</span>
          </span>
        )}

        {/* Nhãn tổng số tập góc dưới-phải */}
        <span className="pointer-events-none absolute bottom-2 right-1.5 rounded border border-white/15 bg-[#111113]/85 px-1.5 py-0.5 text-[10px] font-semibold tracking-tight text-[#f1f1f1] backdrop-blur-sm">
          {summary.bookCount} tập
        </span>

        {summary.progressPercent !== null && !summary.isGuestLocked && (
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div
              className="h-full bg-crimson-accent transition-all duration-300"
              style={{
                width: `${Math.max(
                  summary.progressPercent,
                  summary.readingStatus === 'completed' ? 100 : 6,
                )}%`,
              }}
            />
          </div>
        )}
      </div>

      <div className="mt-2.5 space-y-0.5 px-0.5">
        <h4 className="group-hover-crimson line-clamp-2 text-sm font-medium leading-snug text-ink transition-colors duration-200">
          {summary.shelf.name}
        </h4>
        <p className="truncate text-xs text-ink-muted">{summary.authorLabel}</p>
      </div>
    </div>
  );
}

export function ShelfLinkedUniverseStrip({
  sectionIndex = 2,
  items,
  onOpenShelf,
  onManageRelations,
}: {
  sectionIndex?: number;
  items: readonly LinkedShelfDisplayItem[];
  onOpenShelf: (shelfKey: string) => void;
  onManageRelations?: () => void;
}) {
  const { cardRef, isNearViewport } = useCardReveal<HTMLElement>();

  if (items.length === 0) return null;
  const indexLabel = String(sectionIndex).padStart(2, '0');

  return (
    <section
      ref={cardRef}
      aria-label="Cùng vũ trụ và liên kết bộ truyện"
      className="space-y-5 pt-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-strong/70 pb-3">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
            <span className="font-mono text-crimson-accent">{indexLabel}</span>
            <span> · CÙNG VŨ TRỤ &amp; LIÊN KẾT</span>
          </p>
          <h3 className="font-display text-[1.75rem] font-normal leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.15rem]">
            <span>Cùng </span>
            <span className="italic text-crimson-accent">vũ trụ</span>
          </h3>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-muted">
            {items.length} bộ
          </span>
          {onManageRelations && (
            <button
              type="button"
              onClick={onManageRelations}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
            >
              <GitBranch className="h-3.5 w-3.5 text-crimson-accent" />
              <span>Chỉnh liên kết</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item, idx) => (
          <EditorialRelatedShelfCard
            key={item.summary.shelf.key}
            summary={item.summary}
            badgeLabel={compactRelationBadge(item.badgeLabel)}
            badgeTone="relation"
            staggerIndex={idx}
            shouldLoadCover={isNearViewport}
            onOpenShelf={onOpenShelf}
          />
        ))}
      </div>
    </section>
  );
}

export function ShelfSameTasteStrip({
  sectionIndex = 2,
  items,
  onOpenShelf,
}: {
  sectionIndex?: number;
  items: readonly RecommendedShelfItem[];
  onOpenShelf: (shelfKey: string) => void;
}) {
  const { cardRef, isNearViewport } = useCardReveal<HTMLElement>();

  if (items.length === 0) return null;
  const indexLabel = String(sectionIndex).padStart(2, '0');
  const allSameAuthor = items.every((item) => item.reasonLabel.startsWith('Cùng tác giả'));

  return (
    <section
      ref={cardRef}
      aria-label={allSameAuthor ? 'Tác phẩm cùng tác giả' : 'Bộ truyện cùng gu trong kho'}
      className="space-y-5 pt-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-strong/70 pb-3">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-muted">
            <span className="font-mono text-crimson-accent">{indexLabel}</span>
            <span>
              {allSameAuthor ? ' · TÁC PHẨM CÙNG TÁC GIẢ' : ' · GỢI Ý CÙNG GU TRONG KHO'}
            </span>
          </p>
          <h3 className="font-display text-[1.75rem] font-normal leading-[1.08] tracking-[-0.015em] text-ink sm:text-[2.15rem]">
            <span>Cùng </span>
            <span className="italic text-crimson-accent">
              {allSameAuthor ? 'tác giả' : 'gu đọc'}
            </span>
          </h3>
        </div>

        <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-muted">
          {items.length} bộ
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item, idx) => (
          <EditorialRelatedShelfCard
            key={item.summary.shelf.key}
            summary={item.summary}
            badgeLabel={item.reasonLabel}
            badgeTone="recommend"
            staggerIndex={idx}
            shouldLoadCover={isNearViewport}
            onOpenShelf={onOpenShelf}
          />
        ))}
      </div>
    </section>
  );
}
