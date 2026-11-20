import { useCallback, useEffect, useState } from 'react';
import type { Book, ReadingProgress, StorageStats } from '@/types';
import { fetchLibraryState, isAuthError, setAuthToken } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import { Library2DView } from '@/components/Library2DView';
import { ToastContainer } from '@/components/ToastContainer';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const { toasts, addToast, dismissToast } = useToast();
  const [authenticated, setAuthenticated] = useState(false);
  const [authReason, setAuthReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [storage, setStorage] = useState<StorageStats | null>(null);

  const handleApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      const message = err instanceof Error ? err.message : fallbackMessage;
      if (isAuthError(err)) {
        setAuthToken(null);
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

  const handleAuthenticated = useCallback(() => {
    setAuthReason(null);
    setAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthToken(null);
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

  const handleUploadClick = useCallback(() => {
    addToast('Tính năng tải sách lên đang được hoàn thiện ở Sub-phase 3.3.', 'info');
  }, [addToast]);

  const handleDeleteSelected = useCallback(
    (selectedBooks: Book[]) => {
      addToast(
        `Đã chọn ${selectedBooks.length} cuốn. Thao tác xoá hàng loạt sẽ được nối ở Sub-phase 3.3.`,
        'info',
      );
    },
    [addToast],
  );

  if (!authenticated) {
    return (
      <>
        <AuthGate
          onAuthenticated={handleAuthenticated}
          authReason={authReason}
          isDark={isDark}
          onToggleTheme={toggleTheme}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <Library2DView
        books={books}
        progress={progress}
        storage={storage}
        loading={loading}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onRefresh={() => void loadLibrary()}
        onLogout={handleLogout}
        onOpenBook={handleOpenBook}
        onUploadClick={handleUploadClick}
        onDeleteSelected={handleDeleteSelected}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
