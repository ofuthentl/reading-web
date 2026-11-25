import { Suspense, lazy, useMemo } from 'react';
import type { Book, BookAccessSummary, ShelfGroup, StorageStats } from '@/types';
import { BookEditModal } from '@/components/BookEditModal';
import { BulkShelfModal } from '@/components/BulkShelfModal';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { ShelfRenameModal } from '@/components/ShelfRenameModal';
import type { ToastType } from '@/hooks/useToast';

const LazyUploadDropzone = lazy(() =>
  import('@/components/UploadDropzone').then((mod) => ({ default: mod.UploadDropzone })),
);

const LazyAdminProtectionModal = lazy(() =>
  import('@/components/AdminProtectionModal').then((mod) => ({
    default: mod.AdminProtectionModal,
  })),
);

const LazyCacheManagerModal = lazy(() =>
  import('@/components/CacheManagerModal').then((mod) => ({
    default: mod.CacheManagerModal,
  })),
);

const LazyAdminLibraryHealthModal = lazy(() =>
  import('@/components/AdminLibraryHealthModal').then((mod) => ({
    default: mod.AdminLibraryHealthModal,
  })),
);

const LazyBookAccessModal = lazy(() =>
  import('@/components/BookAccessModal').then((mod) => ({
    default: mod.BookAccessModal,
  })),
);

const LazyShelfBatchNoteModal = lazy(() =>
  import('@/components/ShelfBatchNoteModal').then((mod) => ({
    default: mod.ShelfBatchNoteModal,
  })),
);

export type LibraryModalState =
  | { kind: 'none' }
  | { kind: 'upload' }
  | { kind: 'protection'; initialShelfKey?: string; initialBookId?: string }
  | { kind: 'cache-manager' }
  | { kind: 'library-health' }
  | { kind: 'shelf-batch-note'; shelfKey: string; openAniList?: boolean }
  | { kind: 'book-access'; book: Book }
  | { kind: 'edit'; book: Book }
  | { kind: 'rename-shelf'; shelfName: string }
  | { kind: 'bulk-shelf'; books: Book[] }
  | { kind: 'delete'; books: Book[] };

interface AdminModalsHostProps {
  modal: LibraryModalState;
  books: Book[];
  shelves: readonly ShelfGroup[];
  shelfTags?: Readonly<Record<string, string[]>>;
  shelfAltTitles?: Readonly<Record<string, string[]>>;
  storage: StorageStats | null;
  existingShelves: string[];
  renamingShelfName: string | null;
  renamingShelfCount: number;
  onClose: () => void;
  onSwitchModal: (nextModal: LibraryModalState) => void;
  onJumpToShelf: (shelfKey: string) => void;
  onRequestDelete: (book: Book) => void;
  onBookUploaded: (book: Book, storage: StorageStats) => void;
  onBookUpdated: (book: Book, storage?: StorageStats) => void;
  onBooksUpdated?: (books: Book[]) => void;
  onShelfAltTitlesChanged?: (shelfName: string, altTitles: string[]) => void;
  onShelfTagsChanged?: (shelfName: string, tags: string[]) => void;
  onStorageSynced?: (storage: StorageStats) => void;
  onBookPackSynced: (bookId: string, storage?: StorageStats) => void;
  onBookAccessSaved: (bookId: string, summary: BookAccessSummary | null) => void;
  onShelfRenamed: (oldName: string, newName: string) => void;
  onBooksShelfMoved: (bookIds: string[], targetShelf: string) => void;
  onBooksDeleted: (deletedIds: string[], nextStorage: StorageStats) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function AdminModalsHost({
  modal,
  books,
  shelves,
  shelfTags,
  shelfAltTitles,
  storage,
  existingShelves,
  renamingShelfName,
  renamingShelfCount,
  onClose,
  onSwitchModal,
  onJumpToShelf,
  onRequestDelete,
  onBookUploaded,
  onBookUpdated,
  onBooksUpdated,
  onShelfAltTitlesChanged,
  onShelfTagsChanged,
  onStorageSynced,
  onBookPackSynced,
  onBookAccessSaved,
  onShelfRenamed,
  onBooksShelfMoved,
  onBooksDeleted,
  onApiError,
  onNotify,
}: AdminModalsHostProps) {
  const allShelfNames = useMemo(
    () => new Map(shelves.map((s) => [s.key, s.name])),
    [shelves],
  );
  const batchNoteTargetShelf = useMemo(
    () =>
      modal.kind === 'shelf-batch-note'
        ? (shelves.find((s) => s.key === modal.shelfKey) ?? null)
        : null,
    [modal, shelves],
  );

  return (
    <>
      {modal.kind === 'upload' && (
        <Suspense fallback={null}>
          <LazyUploadDropzone
            open
            books={books}
            storage={storage}
            onClose={onClose}
            onBookUploaded={onBookUploaded}
            onBookUpdated={onBookUpdated}
            onStorageSynced={onStorageSynced}
            onApiError={onApiError}
            onNotify={onNotify}
          />
        </Suspense>
      )}
      {modal.kind === 'protection' && (
        <Suspense fallback={null}>
          <LazyAdminProtectionModal
            open
            books={books}
            initialShelfKey={modal.initialShelfKey}
            initialBookId={modal.initialBookId}
            onClose={onClose}
            onBookPackSynced={onBookPackSynced}
            onStorageSynced={onStorageSynced}
            onApiError={onApiError}
            onNotify={onNotify}
          />
        </Suspense>
      )}
      {modal.kind === 'cache-manager' && (
        <Suspense fallback={null}>
          <LazyCacheManagerModal
            open
            books={books}
            onClose={onClose}
            onNotify={onNotify}
          />
        </Suspense>
      )}
      {modal.kind === 'library-health' && (
        <Suspense fallback={null}>
          <LazyAdminLibraryHealthModal
            open
            books={books}
            shelfTags={shelfTags}
            onClose={onClose}
            onEditBook={(book) => onSwitchModal({ kind: 'edit', book })}
            onOpenShelfMetadata={(shelfKey, openAniList) =>
              onSwitchModal({ kind: 'shelf-batch-note', shelfKey, openAniList })
            }
            onRenameShelf={(shelfName) => onSwitchModal({ kind: 'rename-shelf', shelfName })}
            onOpenProtection={(options) =>
              onSwitchModal({
                kind: 'protection',
                ...(options?.initialShelfKey ? { initialShelfKey: options.initialShelfKey } : {}),
                ...(options?.initialBookId ? { initialBookId: options.initialBookId } : {}),
              })
            }
            onJumpToShelf={onJumpToShelf}
          />
        </Suspense>
      )}
      {modal.kind === 'shelf-batch-note' && batchNoteTargetShelf && (
        <Suspense fallback={null}>
          <LazyShelfBatchNoteModal
            shelf={batchNoteTargetShelf}
            currentAltTitles={shelfAltTitles?.[batchNoteTargetShelf.key]}
            currentTags={shelfTags?.[batchNoteTargetShelf.key]}
            initialAniListOpen={Boolean(modal.openAniList)}
            onClose={onClose}
            onBooksUpdated={(updatedBooks) => onBooksUpdated?.(updatedBooks)}
            onAltTitlesSaved={onShelfAltTitlesChanged}
            onTagsSaved={onShelfTagsChanged}
            onApiError={onApiError}
            onNotify={onNotify}
          />
        </Suspense>
      )}
      {modal.kind === 'book-access' && (
        <Suspense fallback={null}>
          <LazyBookAccessModal
            book={modal.book}
            allShelfNames={allShelfNames}
            onClose={onClose}
            onBookAccessSaved={onBookAccessSaved}
            onOpenProtection={() => onSwitchModal({ kind: 'protection' })}
            onApiError={onApiError}
            onNotify={onNotify}
          />
        </Suspense>
      )}
      <BookEditModal
        book={
          modal.kind === 'edit'
            ? (books.find((item) => item.id === modal.book.id) ?? modal.book)
            : null
        }
        existingShelves={existingShelves}
        onClose={onClose}
        onUpdated={onBookUpdated}
        onRequestDelete={onRequestDelete}
        onApiError={onApiError}
        onNotify={onNotify}
      />
      <ShelfRenameModal
        shelfName={renamingShelfName}
        bookCount={renamingShelfCount}
        existingShelves={existingShelves}
        onClose={onClose}
        onRenamed={onShelfRenamed}
        onApiError={onApiError}
        onNotify={onNotify}
      />
      <BulkShelfModal
        books={modal.kind === 'bulk-shelf' ? modal.books : []}
        existingShelves={existingShelves}
        onClose={onClose}
        onMoved={onBooksShelfMoved}
        onApiError={onApiError}
        onNotify={onNotify}
      />
      <DeleteConfirmModal
        books={modal.kind === 'delete' ? modal.books : []}
        onClose={onClose}
        onDeleted={onBooksDeleted}
        onApiError={onApiError}
        onNotify={onNotify}
      />
    </>
  );
}
