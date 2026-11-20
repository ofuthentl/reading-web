import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react';
import {
  checkHealth,
  getAuthToken,
  isLocalDevMode,
  isMissingProductionApi,
  loginWithPasscode,
} from '@/lib/api';

interface AuthGateProps {
  onAuthenticated: () => void;
  authReason?: string | null;
}

type GateStatus = 'checking' | 'login' | 'error';

export function AuthGate({ onAuthenticated, authReason }: AuthGateProps) {
  const [status, setStatus] = useState<GateStatus>('checking');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(authReason ?? null);

  useEffect(() => {
    if (authReason) {
      setErrorMessage(authReason);
    }
  }, [authReason]);

  const verifyServer = useCallback(async () => {
    if (isMissingProductionApi) return;

    setStatus('checking');
    setErrorMessage(authReason ?? null);
    try {
      const health = await checkHealth();
      if (!health.authRequired) {
        onAuthenticated();
        return;
      }
      if (getAuthToken() && !authReason) {
        onAuthenticated();
        return;
      }
      setStatus('login');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể kết nối máy chủ thư viện.',
      );
      setStatus('error');
    }
  }, [authReason, onAuthenticated]);

  useEffect(() => {
    void verifyServer();
  }, [verifyServer]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = passcode.trim();
    if (!trimmed) {
      setErrorMessage('Vui lòng nhập mật mã thư viện.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await loginWithPasscode(trimmed);
      setPasscode('');
      onAuthenticated();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isMissingProductionApi) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-800 px-6 py-16">
        <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-stone-900">
                Thiếu cấu hình máy chủ (VITE_API_URL)
              </h1>
              <p className="text-xs text-stone-500">Bảo vệ dữ liệu bản Production (D-005)</p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-stone-600">
            Ứng dụng đang chạy ở chế độ production nhưng chưa có biến môi trường{' '}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-900">VITE_API_URL</code>.
            Chế độ lưu cục bộ (Local-First) bị tắt trên production để tránh lưu nhầm vào trình duyệt.
          </p>

          <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
            Cách khắc phục: cấu hình GitHub Actions Secret{' '}
            <code className="font-medium text-stone-900">VITE_API_URL</code> trỏ về Cloudflare Worker rồi deploy lại.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 px-6 py-16 text-stone-800">
      <div className="mx-auto max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-stone-600" />
          <h1 className="text-xl font-semibold text-stone-900">Ofu&apos;s Library</h1>
        </div>

        {status === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-8 text-stone-500">
            <Loader2 className="h-5 w-5 animate-spin text-stone-700" />
            <p className="text-sm">Đang kết nối tới thư viện...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {errorMessage || 'Không thể kết nối máy chủ thư viện.'}
            </p>
            <button
              type="button"
              onClick={() => void verifyServer()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Thử kết nối lại
            </button>
          </div>
        )}

        {status === 'login' && (
          <form onSubmit={handleSubmit}>
            <h2 className="mb-1 text-lg font-semibold text-stone-900">Đăng nhập</h2>
            <p className="mb-5 text-sm text-stone-500">
              {isLocalDevMode
                ? 'Chế độ Local Dev (IndexedDB).'
                : 'Nhập mật mã để mở kho sách đồng bộ của bạn.'}
            </p>

            <label htmlFor="passcode-input" className="mb-4 block text-sm text-stone-700">
              Mật mã thư viện
              <div className="relative mt-1">
                <input
                  id="passcode-input"
                  type={showPasscode ? 'text' : 'password'}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  disabled={submitting}
                  placeholder="Nhập mật mã..."
                  className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-3 pr-10 text-sm text-stone-900 outline-none focus:border-stone-500 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label={showPasscode ? 'Ẩn mật mã' : 'Hiện mật mã'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                >
                  {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {errorMessage && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                'Mở thư viện'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
