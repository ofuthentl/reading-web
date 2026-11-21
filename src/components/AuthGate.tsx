import {
  type ClipboardEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  AlertTriangle,
  BookOpen,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import type { AuthSessionInfo } from '@/types';
import {
  checkHealth,
  isLocalDevMode,
  isMissingProductionApi,
  loginWithPasscode,
} from '@/lib/api';
import { DEFAULT_OWNER_SESSION, inspectStoredSession } from '@/lib/authSession';
import {
  type GateRoute,
  getCurrentGateRoute,
  replaceGateRoute,
  subscribeGateRoute,
  syncGateDocumentTitle,
} from '@/lib/gateRoutes';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { AppTheme } from '@/hooks/useTheme';

interface AuthGateProps {
  onAuthenticated: (session: AuthSessionInfo) => void;
  authReason?: string | null;
  theme?: AppTheme;
  onCycleTheme?: (origin?: { x: number; y: number }) => void;
}

type GateStatus = 'checking' | 'ready' | 'error';

export function AuthGate({ onAuthenticated, authReason, theme, onCycleTheme }: AuthGateProps) {
  const [route, setRoute] = useState<GateRoute>(getCurrentGateRoute);
  const [status, setStatus] = useState<GateStatus>('checking');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(authReason ?? null);

  useEffect(() => subscribeGateRoute(() => setRoute(getCurrentGateRoute())), []);

  useEffect(() => {
    syncGateDocumentTitle(route, false);
  }, [route]);

  useEffect(() => {
    if (authReason) {
      setErrorMessage(authReason);
    }
  }, [authReason]);

  const verifyServer = useCallback(async () => {
    if (isMissingProductionApi) return;

    const currentRoute = getCurrentGateRoute();
    setStatus('checking');
    setErrorMessage(authReason ?? null);

    try {
      const health = await checkHealth();

      if (!health.authRequired && currentRoute === 'root') {
        onAuthenticated(DEFAULT_OWNER_SESSION);
        return;
      }

      const stored = inspectStoredSession();

      if (currentRoute === 'root') {
        if (stored.status === 'active' && !authReason) {
          onAuthenticated(stored.session);
          return;
        }
        if (stored.status === 'expired' && !authReason) {
          setErrorMessage(
            stored.role === 'guest'
              ? 'Phiên truy cập 24 giờ đã hết hạn. Hãy lấy chìa khoá mới trên Discord để vào lại.'
              : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          );
        }
        replaceGateRoute('locked');
        setRoute('locked');
        setStatus('ready');
        return;
      }

      setStatus('ready');
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

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return;
    const trimmed = pasted.trim();
    if (trimmed !== pasted) {
      event.preventDefault();
      setPasscode(trimmed);
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = passcode.trim();
    if (!trimmed) {
      setErrorMessage('Vui lòng nhập chìa khoá truy cập hoặc mật mã.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const session = await loginWithPasscode(trimmed);
      setPasscode('');
      replaceGateRoute('root');
      onAuthenticated(session);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isMissingProductionApi) {
    return (
      <div className="theme-canvas flex min-h-screen items-center justify-center px-6 py-16 text-ink transition-colors duration-200">
        <div className="moonlit-card w-full max-w-md rounded-2xl border border-amber-700/30 bg-surface p-6 shadow-sm dark:border-amber-400/25">
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
        </div>
      </div>
    );
  }

  const isEntrance = route === 'entrance';

  return (
    <div className="theme-canvas relative flex min-h-screen items-center justify-center px-6 py-16 text-ink transition-colors duration-200">
      {theme && onCycleTheme && (
        <div className="fixed right-4 top-4">
          <ThemeToggle theme={theme} onCycle={onCycleTheme} showLabel />
        </div>
      )}

      <div className="moonlit-card w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-sm dark:border-line-strong/60">
        <div className="mb-6 flex items-center gap-3 border-b border-line pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
            {isEntrance ? <BookOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-semibold tracking-tight text-ink sm:text-xl">
              {isEntrance ? "Ofu's Library Entrance" : "Ofu's Library Closed"}
            </h1>
            <p className="text-xs text-ink-muted">
              {isEntrance ? 'Cổng mở kho sách trực tuyến' : 'Thư viện hiện đang khép cửa'}
            </p>
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

        {status === 'ready' && isEntrance && (
          <form onSubmit={handleSubmit}>
            <h2 className="mb-1 text-base font-semibold text-ink">Mở kho sách</h2>
            <p className="mb-5 text-sm text-ink-muted">
              {isLocalDevMode
                ? 'Chế độ Local Dev (IndexedDB).'
                : 'Nhập chìa khoá nhận từ Discord (hạn 5 phút) hoặc mật mã quản trị.'}
            </p>

            <label htmlFor="passcode-input" className="mb-4 block text-sm font-medium text-ink">
              Chìa khoá truy cập
              <div className="relative mt-1.5">
                <input
                  id="passcode-input"
                  type={showPasscode ? 'text' : 'password'}
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onPaste={handlePaste}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  disabled={submitting}
                  placeholder="Nhập mã khoá hoặc mật mã..."
                  className="w-full rounded-xl border border-line-strong bg-canvas py-2.5 pl-3.5 pr-10 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label={showPasscode ? 'Ẩn mã truy cập' : 'Hiện mã truy cập'}
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-50 dark:shadow-[0_0_22px_-6px_rgba(244,244,245,0.28)]"
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

        {status === 'ready' && !isEntrance && (
          <div className="space-y-3 py-2">
            <p className="text-sm leading-relaxed text-ink-muted">
              {errorMessage ||
                'Cánh cửa thư viện chỉ mở cho người có chìa khoá hợp lệ từ máy chủ Discord.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
