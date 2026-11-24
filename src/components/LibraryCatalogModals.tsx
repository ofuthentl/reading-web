import { Suspense, lazy } from 'react';
import type {
  Book,
  CustomCollection,
  ShelfAccessSummary,
  ShelfGroup,
  ShelfRelation,
} from '@/types';
import { ShelfAccessModal } from '@/components/ShelfAccessModal';
import { ShelfBatchNoteModal } from '@/components/ShelfBatchNoteModal';
import { ShelfCoverPickerModal } from '@/components/ShelfCoverPickerModal';
import { ShelfTagsModal } from '@/components/ShelfTagsModal';
import type { ToastType } from '@/hooks/useToast';
import type { ShelfSummary } from '@/lib/shelfSummary';

const LazyCollectionManagerModal = lazy(() =>
  import('@/components/CollectionManagerModal').then((mod) => ({
    default: mod.CollectionManagerModal,
  })),
);

const LazyShelfRelationsModal = lazy(() =>
  import('@/components/ShelfRelationsModal').then((mod) => ({
    default: mod.ShelfRelationsModal,
  })),
);

export interface LibraryCatalogModalsProps {
  allShelves: ShelfGroup[];
  allShelfNames: ReadonlyMap<string, string>;
  collections: readonly CustomCollection[];
  shelfTags?: Readonly<Record<string, string[]>>;
  shelfRelations?: readonly ShelfRelation[];
  pickingSummary: ShelfSummary | null;
  accessTargetShelf: ShelfGroup | null;
  openedShelfSummary: ShelfSummary | null;
  batchNoteOpen: boolean;
  tagsModalOpen: boolean;
  relationsModalOpen: boolean;
  collectionManagerOpen: boolean;
  onCloseCoverPicker: () => void;
  onCloseAccessModal: () => void;
  onCloseBatchNotes: () => void;
  onCloseTagsModal: () => void;
  onCloseRelationsModal: () => void;
  onCloseCollectionManager: () => void;
  onBooksUpdated?: (books: Book[]) => void;
  onShelfCoverChanged?: (shelfName: string, bookId: string | null) => void;
  onShelfAccessChanged?: (shelfName: string, summary: ShelfAccessSummary | null) => void;
  onShelfTagsChanged?: (shelfName: string, tags: string[]) => void;
  onShelfAltTitlesChanged?: (shelfName: string, altTitles: string[]) => void;
  onShelfRelationSaved?: (relation: ShelfRelation) => void;
  onShelfRelationDeleted?: (sourceKey: string, targetKey: string) => void;
  onCollectionSaved?: (collection: CustomCollection) => void;
  onCollectionDeleted?: (collectionId: string) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function LibraryCatalogModals({
  allShelves,
  allShelfNames,
  collections,
  shelfTags,
  shelfRelations = [],
  pickingSummary,
  accessTargetShelf,
  openedShelfSummary,
  batchNoteOpen,
  tagsModalOpen,
  relationsModalOpen,
  collectionManagerOpen,
  onCloseCoverPicker,
  onCloseAccessModal,
  onCloseBatchNotes,
  onCloseTagsModal,
  onCloseRelationsModal,
  onCloseCollectionManager,
  onBooksUpdated,
  onShelfCoverChanged,
  onShelfAccessChanged,
  onShelfTagsChanged,
  onShelfAltTitlesChanged,
  onShelfRelationSaved,
  onShelfRelationDeleted,
  onCollectionSaved,
  onCollectionDeleted,
  onApiError,
  onNotify,
}: LibraryCatalogModalsProps) {
  return (
    <>
      {onShelfCoverChanged && (
        <ShelfCoverPickerModal
          shelf={pickingSummary?.shelf ?? null}
          customCoverBookId={pickingSummary?.customCoverBookId ?? null}
          onClose={onCloseCoverPicker}
          onCoverChanged={onShelfCoverChanged}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}

      {onBooksUpdated && batchNoteOpen && (
        <ShelfBatchNoteModal
          shelf={openedShelfSummary?.shelf ?? null}
          currentAltTitles={openedShelfSummary?.altTitles ?? []}
          currentTags={openedShelfSummary?.tags ?? []}
          onClose={onCloseBatchNotes}
          onBooksUpdated={onBooksUpdated}
          onAltTitlesSaved={onShelfAltTitlesChanged}
          onTagsSaved={onShelfTagsChanged}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}

      {onShelfAccessChanged && accessTargetShelf && (
        <ShelfAccessModal
          shelf={accessTargetShelf}
          allShelfNames={allShelfNames}
          onClose={onCloseAccessModal}
          onAccessSaved={onShelfAccessChanged}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}

      {onShelfTagsChanged && tagsModalOpen && openedShelfSummary && (
        <ShelfTagsModal
          shelf={openedShelfSummary.shelf}
          currentTags={openedShelfSummary.tags}
          currentAltTitles={openedShelfSummary.altTitles}
          allShelfTags={shelfTags}
          onClose={onCloseTagsModal}
          onTagsSaved={onShelfTagsChanged}
          onAltTitlesSaved={onShelfAltTitlesChanged}
          onApiError={onApiError}
          onNotify={onNotify}
        />
      )}

      {onShelfRelationSaved &&
        onShelfRelationDeleted &&
        relationsModalOpen &&
        openedShelfSummary && (
          <Suspense fallback={null}>
            <LazyShelfRelationsModal
              open={relationsModalOpen}
              shelf={openedShelfSummary.shelf}
              allShelves={allShelves}
              shelfRelations={shelfRelations}
              onClose={onCloseRelationsModal}
              onRelationSaved={onShelfRelationSaved}
              onRelationDeleted={onShelfRelationDeleted}
              onApiError={onApiError}
              onNotify={onNotify}
            />
          </Suspense>
        )}

      {onCollectionSaved && onCollectionDeleted && collectionManagerOpen && (
        <Suspense fallback={null}>
          <LazyCollectionManagerModal
            open={collectionManagerOpen}
            collections={collections}
            allShelves={allShelves}
            onClose={onCloseCollectionManager}
            onCollectionSaved={onCollectionSaved}
            onCollectionDeleted={onCollectionDeleted}
            onApiError={onApiError}
            onNotify={onNotify}
          />
        </Suspense>
      )}
    </>
  );
}
