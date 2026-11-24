import { useMemo } from 'react';
import { FolderKanban, Library, Plus, X } from 'lucide-react';
import type { CustomCollection, ShelfGroup } from '@/types';
import { toShelfPrefKey } from '@/lib/shelfPrefs';

export interface CollectionFilterStripProps {
  collections: readonly CustomCollection[];
  allShelves: readonly ShelfGroup[];
  activeCollectionId: string | null;
  onSelectCollection: (collectionId: string | null) => void;
  onOpenManager?: () => void;
}

export function CollectionFilterStrip({
  collections,
  allShelves,
  activeCollectionId,
  onSelectCollection,
  onOpenManager,
}: CollectionFilterStripProps) {
  const existingKeys = useMemo(
    () => new Set(allShelves.map((s) => s.key)),
    [allShelves],
  );

  const itemsWithCounts = useMemo(
    () =>
      collections.map((col) => {
        let count = 0;
        for (const k of col.shelfKeys) {
          if (existingKeys.has(toShelfPrefKey(k))) count += 1;
        }
        return { collection: col, visibleCount: count };
      }),
    [collections, existingKeys],
  );

  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId) ?? null,
    [activeCollectionId, collections],
  );

  if (collections.length === 0 && !onOpenManager) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface/85 px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Library className="h-3.5 w-3.5 text-crimson-accent" />
            <span>Tuyển tập:</span>
          </span>

          {collections.length === 0 ? (
            <span className="text-xs text-ink-faint">
              Chưa tạo tuyển tập nào — gom các bộ truyện hay thành danh mục chủ đề riêng.
            </span>
          ) : (
            <>
              <button
                type="button"
                aria-pressed={activeCollectionId === null}
                onClick={() => onSelectCollection(null)}
                className={`rounded-xl px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeCollectionId === null
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'border border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                Tất cả kệ
              </button>

              {itemsWithCounts.map(({ collection, visibleCount }) => {
                const isActive = activeCollectionId === collection.id;
                return (
                  <button
                    key={collection.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onSelectCollection(isActive ? null : collection.id)}
                    title={collection.description || collection.name}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-crimson-accent bg-crimson-accent text-white shadow-sm'
                        : 'border-line bg-canvas text-ink hover:border-line-strong hover:bg-subtle'
                    }`}
                  >
                    <span className="max-w-[180px] truncate">{collection.name}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10.5px] tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-subtle text-ink-muted'
                      }`}
                    >
                      {visibleCount}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {onOpenManager && (
          <button
            type="button"
            onClick={onOpenManager}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
          >
            {collections.length === 0 ? (
              <>
                <Plus className="h-3.5 w-3.5 text-accent" />
                <span>Tạo tuyển tập</span>
              </>
            ) : (
              <>
                <FolderKanban className="h-3.5 w-3.5 text-accent" />
                <span>Quản lý tuyển tập</span>
              </>
            )}
          </button>
        )}
      </div>

      {activeCollection && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-crimson-accent/30 bg-crimson-accent/[0.06] px-3.5 py-2.5 text-xs">
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-ink">
              Tuyển tập: <span className="text-crimson-accent">{activeCollection.name}</span>
            </p>
            {activeCollection.description && (
              <p className="leading-relaxed text-ink-muted">{activeCollection.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelectCollection(null)}
            aria-label="Bỏ lọc tuyển tập"
            className="shrink-0 rounded-lg p-1 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
