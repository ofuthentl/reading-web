import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Eye, EyeOff, Loader2, Moon, RefreshCw, Sun } from 'lucide-react';
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
  isDark?: boolean;
  onToggleTheme?: () => void;
}

type GateStatus = 'checking' | 'login' | 'error';

export function AuthGate({ onAuthenticated, authReason, isDark, onToggleTheme }: AuthGateProps) {
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
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16 text-ink transition-colors duration-200">
        <div className="w-full max-w-md rounded-2xl border border-amber-700/30 bg-surface p-6 shadow-sm dark:border-amber-400/25">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600/10 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-base font-semibold text-ink">
                Thiếu cấu hình máy chủ (VITE_API_URL)
              </h1>
              <p className="text-xs text-ink-muted">Bảo vệ dữ liệu bản Production (D-005)</p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Ứng dụng đang chạy ở chế độ production nhưng chưa có biến môi trường{' '}
            <code className="rounded bg-subtle px-1.5 py-0.5 text-ink">VITE_API_URL</code>. Chế độ
            lưu cục bộ (Local-First) bị tắt trên production để tránh lưu nhầm vào trình duyệt.
          </p>

          <div className="mt-4 rounded-xl border border-line bg-subtle p-3 text-xs leading-relaxed text-ink-muted">
            Cách khắc phục: cấu hình GitHub Actions Secret{' '}
            <code className="font-medium text-ink">VITE_API_URL</code> trỏ về Cloudflare Worker rồi
            deploy lại.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-6 py-16 text-ink transition-colors duration-200">
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
          title={isDark ? 'Chế độ sáng (Giấy ấm)' : 'Chế độ tối (Thư viện đêm)'}
          className="fixed right-4 top-4 inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-muted shadow-sm transition-colors hover:border-line-strong hover:text-ink"
        >
          {isDark ? <Sun className="h-4 w-4 text-accent" /> : <Moon className="h-4 w-4 text-accent" />}
          <span className="hidden sm:inline">{isDark ? 'Chế độ sáng' : 'Thư viện đêm'}</span>
        </button>
      )}

      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5 border-b border-line pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
              Ofu&apos;s Library
            </h1>
            <p className="text-xs text-ink-muted">Thư viện đọc sách cá nhân</p>
          </div>
        </div>

        {status === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-8 text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <p className="text-sm">Đang kết nối tới thư viện...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <p className="rounded-xl border border-red-700/25 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-400/25 dark:text-red-300">
              {errorMessage || 'Không thể kết nối máy chủ thư viện.'}
            </p>
            <button
              type="button"
              onClick={() => void verifyServer()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              <RefreshCw className="h-4 w-4" />
              Thử kết nối lại
            </button>
          </div>
        )}

        {status === 'login' && (
          <form onSubmit={handleSubmit}>
            <h2 className="mb-1 text-base font-semibold text-ink">Mở kho sách</h2>
            <p className="mb-5 text-sm text-ink-muted">
              {isLocalDevMode
                ? 'Chế độ Local Dev (IndexedDB).'
                : 'Nhập mật mã để truy cập thư viện đồng bộ của bạn.'}
            </p>

            <label htmlFor="passcode-input" className="mb-4 block text-sm font-medium text-ink">
              Mật mã thư viện
              <div className="relative mt-1.5">
                <input
                  id="passcode-input"
                  type={showPasscode ? 'text' : 'password'}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  disabled={submitting}
                  placeholder="Nhập mật mã..."
                  className="w-full rounded-xl border border-line-strong bg-canvas py-2.5 pl-3.5 pr-10 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label={showPasscode ? 'Ẩn mật mã' : 'Hiện mật mã'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
                >
                  {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {errorMessage && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-700/20 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:border-red-400/25 dark:text-red-300"
              >
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang mở cửa...
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
