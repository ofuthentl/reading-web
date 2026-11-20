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
    <div className="min-h-screen bg-[#0d0b1a] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-indigo-400" />
            <span className="font-semibold">Thư Viện Huyền Ảo</span>
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs text-indigo-300">
              {isCloudMode ? 'Cloudflare R2 + D1' : 'Local Dev'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadLibrary()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới
            </button>
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20">
              <LogOut className="h-3.5 w-3.5" /> Đăng xuất
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        {loading && !storage ? (
          <div className="flex items-center justify-center gap-2.5 py-20 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" /> Đang đồng bộ thư viện...
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-300">
            Kết nối thành công · <strong className="text-white">{books.length}</strong> sách · Dung lượng:{' '}
            <strong className="text-white">{storage ? `${formatBytes(storage.usedBytes)} / ${formatBytes(storage.limitBytes)}` : '—'}</strong>
          </div>
        )}
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
