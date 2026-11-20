import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, LogOut, RefreshCw } from 'lucide-react';
import type { Book, ReadingProgress, StorageStats } from '@/types';
import { fetchLibraryState, formatBytes, isAuthError, isCloudMode, setAuthToken } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import { ToastContainer } from '@/components/ToastContainer';
import { useToast } from '@/hooks/useToast';

export default function App() {
  const { toasts, addToast, dismissToast } = useToast();
  const [authenticated, setAuthenticated] = useState(false);
  const [authReason, setAuthReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [, setProgress] = useState<Record<string, ReadingProgress>>({});
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

  if (!authenticated) {
    return (
      <>
        <AuthGate onAuthenticated={handleAuthenticated} authReason={authReason} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2 text-lg font-semibold text-stone-900">
          <BookOpen className="h-5 w-5 text-stone-500" />
          <span>Ofu&apos;s Library</span>
          {!isCloudMode && (
            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-normal text-stone-600">
              Local Dev
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void loadLibrary()}
            disabled={loading}
            aria-label="Làm mới"
            title="Làm mới"
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        {loading && !storage ? (
          <div className="flex items-center justify-center gap-2.5 py-20 text-stone-500">
            <Loader2 className="h-5 w-5 animate-spin text-stone-700" /> Đang đồng bộ thư viện...
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-sm">
            Kết nối thành công · <strong className="text-stone-900">{books.length}</strong> sách · Dung lượng:{' '}
            <strong className="text-stone-900">
              {storage ? `${formatBytes(storage.usedBytes)} / ${formatBytes(storage.limitBytes)}` : '—'}
            </strong>
          </div>
        )}
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
