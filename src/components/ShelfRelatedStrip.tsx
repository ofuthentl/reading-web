import { useState } from 'react';
import { GitBranch, Lock, Sparkles } from 'lucide-react';
import { pickClothCoverColor } from '@/lib/bookMetadata';
import type {
  LinkedShelfDisplayItem,
  RecommendedShelfItem,
} from '@/lib/shelfRecommendations';
import type { ShelfSummary } from '@/lib/shelfSummary';
import { useCardReveal, useHorizontalEdgeFade } from '@/hooks/useCardReveal';
import { useCoverUrl } from '@/hooks/useCoverUrl';

function MiniShelfRelationCard({
  summary,
  badgeLabel,
  badgeTone,
  shouldLoadCover,
  onOpenShelf,
}: {
  summary: ShelfSummary;
  badgeLabel: string;
  badgeTone: 'relation' | 'recommend';
  shouldLoadCover: boolean;
  onOpenShelf: (shelfKey: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const coverKey = summary.coverBook?.cover_key ?? null;
  const coverUrl = useCoverUrl(coverKey, shouldLoadCover);
  const showImage = Boolean(coverUrl && !imgFailed);
  const clothColor = pickClothCoverColor(`${summary.shelf.key}-${summary.shelf.name}`);

  return (
    <button
      type="button"
      onClick={() => onOpenShelf(summary.shelf.key)}
      className="moonlit-card group flex w-60 shrink-0 items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md sm:w-64"
    >
      <div className="relative aspect-[7/10] w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
        {showImage ? (
          <img
            src={coverUrl!}
            alt={summary.shelf.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            style={{ backgroundColor: clothColor }}
            className="flex h-full w-full items-center justify-center p-1.5 text-center font-display text-[9px] font-semibold leading-tight text-[#f6efe2]"
          >
            <span className="line-clamp-3">{summary.shelf.name}</span>
          </div>
        )}
        {summary.isGuestLocked && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-white"
          >
            <Lock className="h-3 w-3" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <span
          className={`inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
            badgeTone === 'relation'
              ? 'border-crimson-accent/35 bg-crimson-accent/10 text-crimson-accent'
              : 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:border-amber-400/35 dark:text-amber-300'
          }`}
        >
          <span className="truncate">{badgeLabel}</span>
        </span>
        <p className="group-hover-crimson line-clamp-1 font-display text-sm font-semibold text-ink transition-colors">
          {summary.shelf.name}
        </p>
        <p className="truncate text-[11px] text-ink-muted">
          {summary.bookCount} tập
          {summary.ratingCount > 0 && summary.ratingAverage !== null
            ? ` · ★ ${summary.ratingAverage.toFixed(1)}`
            : ` · ${summary.authorLabel}`}
        </p>
      </div>
    </button>
  );
}

export function ShelfLinkedUniverseStrip({
  items,
  onOpenShelf,
  onManageRelations,
}: {
  items: readonly LinkedShelfDisplayItem[];
  onOpenShelf: (shelfKey: string) => void;
  onManageRelations?: () => void;
}) {
  const { cardRef, isNearViewport } = useCardReveal<HTMLElement>();
  const { scrollerRef, syncScrollState, edgeFadeClass } = useHorizontalEdgeFade(items.length);

  if (items.length === 0) return null;

  return (
    <section
      ref={cardRef}
      aria-label="Cùng vũ trụ và liên kết bộ truyện"
      className="space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-crimson-accent" />
          <h3 className="font-display text-sm font-semibold text-ink sm:text-base">
            Cùng vũ trụ &amp; Liên kết
          </h3>
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-muted">
            {items.length}
          </span>
        </div>
        {onManageRelations && (
          <button
            type="button"
            onClick={onManageRelations}
            className="text-xs font-medium text-accent hover:underline"
          >
            Chỉnh liên kết
          </button>
        )}
      </div>

      <div
        ref={scrollerRef}
        onScroll={syncScrollState}
        className={`flex gap-3 overflow-x-auto pb-1.5 scrollbar-hover ${edgeFadeClass}`}
      >
        {items.map((item) => (
          <MiniShelfRelationCard
            key={item.summary.shelf.key}
            summary={item.summary}
            badgeLabel={item.badgeLabel}
            badgeTone="relation"
            shouldLoadCover={isNearViewport}
            onOpenShelf={onOpenShelf}
          />
        ))}
      </div>
    </section>
  );
}

export function ShelfSameTasteStrip({
  items,
  onOpenShelf,
}: {
  items: readonly RecommendedShelfItem[];
  onOpenShelf: (shelfKey: string) => void;
}) {
  const { cardRef, isNearViewport } = useCardReveal<HTMLElement>();
  const { scrollerRef, syncScrollState, edgeFadeClass } = useHorizontalEdgeFade(items.length);

  if (items.length === 0) return null;

  return (
    <section
      ref={cardRef}
      aria-label="Bộ truyện cùng gu trong kho"
      className="space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h3 className="font-display text-sm font-semibold text-ink sm:text-base">
          Cùng gu trong kho
        </h3>
      </div>

      <div
        ref={scrollerRef}
        onScroll={syncScrollState}
        className={`flex gap-3 overflow-x-auto pb-1.5 scrollbar-hover ${edgeFadeClass}`}
      >
        {items.map((item) => (
          <MiniShelfRelationCard
            key={item.summary.shelf.key}
            summary={item.summary}
            badgeLabel={item.reasonLabel}
            badgeTone="recommend"
            shouldLoadCover={isNearViewport}
            onOpenShelf={onOpenShelf}
          />
        ))}
      </div>
    </section>
  );
}
