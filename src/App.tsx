import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Book, ReadingProgress, StorageStats } from '@/types';
import { fetchLibraryState, groupBooksIntoShelves, isAuthError, setAuthToken, sortBooksByTitle } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import { BookEditModal } from '@/components/BookEditModal';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { Library2DView } from '@/components/Library2DView';
import { ShelfRenameModal } from '@/components/ShelfRenameModal';
import { ToastContainer } from '@/components/ToastContainer';
import { UploadDropzone } from '@/components/UploadDropzone';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';

type LibraryModalState =
  | { kind: 'none' }
  | { kind: 'upload' }
  | { kind: 'edit'; book: Book }
  | { kind: 'rename-shelf'; shelfName: string }
  | { kind: 'delete'; books: Book[] };

export default function App() {
  const { theme, cycleTheme } = useTheme();
  const { toasts, addToast, dismissToast } = useToast();
  const [authenticated, setAuthenticated] = useState(false);
  const [authReason, setAuthReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [modal, setModal] = useState<LibraryModalState>({ kind: 'none' });

  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);

  const handleApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      const message = err instanceof Error ? err.message : fallbackMessage;
      if (isAuthError(err)) {
        setAuthToken(null);
        setModal({ kind: 'none' });
        setAuthenticated(false);
        setAuthReason(message);
        addToast(message, 'warning');
        return;
      }
      addToast(message, 'error');
    },
    [addToast],
  );

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const state = await fetchLibraryState();
      setBooks(state.books);
      setProgress(state.progress);
      setStorage(state.storage);
    } catch (err) {
      handleApiError(err, 'Không thể tải dữ liệu thư viện.');
    } finally {
      setLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    if (authenticated) void loadLibrary();
  }, [authenticated, loadLibrary]);

  const existingShelves = useMemo(
    () => groupBooksIntoShelves(books).map((shelf) => shelf.name),
    [books],
  );

  const handleAuthenticated = useCallback(() => {
    setAuthReason(null);
    setAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    setModal({ kind: 'none' });
    setBooks([]);
    setProgress({});
    setStorage(null);
    setAuthenticated(false);
    setAuthReason(null);
    addToast('Đã đăng xuất khỏi thư viện.', 'info');
  }, [addToast]);

  const handleOpenBook = useCallback(
    (book: Book) => {
      addToast(`Đã chọn "${book.title}". Trình đọc sẽ được nối ở Sub-phase 3.4.`, 'info');
    },
    [addToast],
  );

  const handleBookUploaded = useCallback((book: Book, nextStorage: StorageStats) => {
    setBooks((prev) => sortBooksByTitle([...prev.filter((item) => item.id !== book.id), book]));
    setStorage(nextStorage);
  }, []);

  const handleBookUpdated = useCallback((updatedBook: Book, nextStorage?: StorageStats) => {
    setBooks((prev) =>
      sortBooksByTitle(prev.map((item) => (item.id === updatedBook.id ? updatedBook : item))),
    );
    if (nextStorage) setStorage(nextStorage);
  }, []);

  const handleShelfRenamed = useCallback((oldName: string, newName: string) => {
    setBooks((prev) =>
      prev.map((item) => (item.shelf === oldName ? { ...item, shelf: newName } : item)),
    );
  }, []);

  const handleBooksDeleted = useCallback((deletedIds: string[], nextStorage: StorageStats) => {
    const idSet = new Set(deletedIds);
    setBooks((prev) => prev.filter((item) => !idSet.has(item.id)));
    setProgress((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => !idSet.has(id))),
    );
    setStorage(nextStorage);
  }, []);

  if (!authenticated) {
    return (
      <>
        <AuthGate
          onAuthenticated={handleAuthenticated}
          authReason={authReason}
          theme={theme}
          onCycleTheme={cycleTheme}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const renamingShelfName = modal.kind === 'rename-shelf' ? modal.shelfName : null;
  const renamingShelfCount = renamingShelfName
    ? books.filter((book) => book.shelf === renamingShelfName).length
    : 0;

  return (
    <>
      <Library2DView
        books={books}
        progress={progress}
        storage={storage}
        loading={loading}
        theme={theme}
        onCycleTheme={cycleTheme}
        onRefresh={() => void loadLibrary()}
        onLogout={handleLogout}
        onOpenBook={handleOpenBook}
        onUploadClick={() => setModal({ kind: 'upload' })}
        onEditBook={(book) => setModal({ kind: 'edit', book })}
        onRenameShelf={(shelfName) => setModal({ kind: 'rename-shelf', shelfName })}
        onDeleteSelected={(selectedBooks) => setModal({ kind: 'delete', books: selectedBooks })}
      />
      {modal.kind === 'upload' && (
        <UploadDropzone
          open
          books={books}
          storage={storage}
          onClose={closeModal}
          onBookUploaded={handleBookUploaded}
          onBookUpdated={handleBookUpdated}
          onApiError={handleApiError}
          onNotify={addToast}
        />
      )}
      <BookEditModal
        book={modal.kind === 'edit' ? modal.book : null}
        existingShelves={existingShelves}
        onClose={closeModal}
        onUpdated={handleBookUpdated}
        onRequestDelete={(book) => setModal({ kind: 'delete', books: [book] })}
        onApiError={handleApiError}
        onNotify={addToast}
      />
      <ShelfRenameModal
        shelfName={renamingShelfName}
        bookCount={renamingShelfCount}
        existingShelves={existingShelves}
        onClose={closeModal}
        onRenamed={handleShelfRenamed}
        onApiError={handleApiError}
        onNotify={addToast}
      />
      <DeleteConfirmModal
        books={modal.kind === 'delete' ? modal.books : []}
        onClose={closeModal}
        onDeleted={handleBooksDeleted}
        onApiError={handleApiError}
        onNotify={addToast}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
