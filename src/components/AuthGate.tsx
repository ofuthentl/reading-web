import {
  Suspense,
  type ClipboardEvent,
  type FormEvent,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
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
import {
  DEFAULT_OWNER_SESSION,
  apiFetch,
  inspectStoredSession,
  isAuthError,
  setAuthToken,
} from '@/lib/authSession';
import {
  type GateRoute,
  buildGateHref,
  getCurrentGateRoute,
  navigateGateRoute,
  replaceGateRoute,
  subscribeGateRoute,
  syncGateDocumentTitle,
} from '@/lib/gateRoutes';
import { ThemeToggle } from '@/components/ThemeToggle';
import { type UiTheme, isDarkTheme } from '@/hooks/useTheme';

const LazyGateBackdropArt = lazy(() =>
  import('@/components/GateBackdropArt').then((mod) => ({ default: mod.GateBackdropArt })),
);

interface AuthGateProps {
  onAuthenticated: (session: AuthSessionInfo) => void;
  authReason?: string | null;
  theme?: UiTheme;
  onCycleTheme?: (origin?: { x: number; y: number }) => void;
}

type GateStatus = 'checking' | 'ready' | 'error';

export function AuthGate({ onAuthenticated, authReason, theme, onCycleTheme }: AuthGateProps) {
  const [route, setRoute] = useState<GateRoute>(getCurrentGateRoute);
  const [status, setStatus] = useState<GateStatus>('checking');
  const [passcode, setPasscode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(authReason ?? null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

      if (!health.authRequired) {
        replaceGateRoute(currentRoute === 'usage' ? 'usage' : 'root');
        onAuthenticated(DEFAULT_OWNER_SESSION);
        return;
      }

      const stored = inspectStoredSession();

      // Stealth /usage (D-035): xác thực token trực tiếp với máy chủ trước khi mở chunk AdminUsageView.
      // Chỉ xoá token Admin khi máy chủ xác nhận 401/403 (không tự đăng xuất oan khi lỗi mạng/5xx).
      if (currentRoute === 'usage') {
        if (stored.status === 'active' && !authReason) {
          if (stored.session.role === 'owner') {
            try {
              const sessionRes = await apiFetch('/api/auth/session');
              const sessionBody = (await sessionRes.json().catch(() => ({}))) as {
                ok?: boolean;
                role?: string;
                expiresAt?: number | null;
              };
              if (sessionRes.ok && sessionBody.ok && sessionBody.role === 'owner') {
                onAuthenticated({
                  role: 'owner',
                  expiresAt:
                    typeof sessionBody.expiresAt === 'number'
                      ? sessionBody.expiresAt
                      : stored.session.expiresAt,
                });
                return;
              }
              if (sessionRes.status >= 500) {
                setErrorMessage('Máy chủ đang tạm bận khi xác thực phiên. Hãy thử kết nối lại.');
                setStatus('error');
                return;
              }
            } catch (sessionErr) {
              if (!isAuthError(sessionErr)) {
                setErrorMessage(
                  sessionErr instanceof Error
                    ? sessionErr.message
                    : 'Không thể kết nối máy chủ để xác thực phiên.',
                );
                setStatus('error');
                return;
              }
            }
            setAuthToken(null);
            replaceGateRoute('locked');
            setRoute('locked');
            setStatus('ready');
            return;
          }
          replaceGateRoute('root');
          onAuthenticated(stored.session);
          return;
        }
        replaceGateRoute('locked');
        setRoute('locked');
        setStatus('ready');
        return;
      }

      // Cho phép tự khôi phục phiên đang hoạt động trên cả '/', '/locked' và '/entrance'
      if (stored.status === 'active' && !authReason) {
        replaceGateRoute('root');
        onAuthenticated(stored.session);
        return;
      }

      if (currentRoute === 'root') {
        if (stored.status === 'expired' && !authReason) {
          setErrorMessage(
            stored.role === 'guest'
              ? 'Phiên đọc sách 24 giờ đã khép lại. Hãy nhận chìa khoá mới từ kênh Discord khi bạn muốn quay lại.'
              : 'Phiên đăng nhập đã hết hạn.',
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

  useEffect(() => {
    if (status === 'ready' && route === 'entrance') {
      inputRef.current?.focus();
    }
  }, [route, status]);

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return;
    const trimmed = pasted.trim();
    const compactCandidate = trimmed.replace(/[\s-]+/g, '');
    const normalized = /^[a-zA-Z0-9]{12}$/.test(compactCandidate) ? compactCandidate : trimmed;
    if (normalized !== pasted) {
      event.preventDefault();
      setPasscode(normalized);
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = passcode.trim();
    if (!trimmed) {
      setErrorMessage('Vui lòng nhập chìa khoá truy cập.');
      inputRef.current?.focus();
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
      setErrorMessage(err instanceof Error ? err.message : 'Chìa khoá không hợp lệ.');
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
  const isDark = Boolean(theme && isDarkTheme(theme));

  return (
    <div className="theme-canvas relative flex min-h-screen flex-col justify-between overflow-hidden text-ink transition-colors duration-200">
      <Suspense fallback={null}>
        <LazyGateBackdropArt isDark={isDark} isEntrance={isEntrance} />
      </Suspense>

      {/* Thanh điều hướng tối giản: lề trái dịch +5%, lề phải khoá thẳng trục ổ khoá */}
      <header className="relative z-10 flex w-full items-center justify-between pl-6 pr-6 pt-6 sm:pl-10 sm:pr-10 md:pl-[calc(3.5rem+3.5%)] md:pr-14 md:pt-8 lg:pl-[calc(5rem+5%)] lg:pr-20">
        <div className="flex items-center gap-2.5 select-none">
          <img
            src={`${import.meta.env.BASE_URL}logo-128.png`}
            alt=""
            width={36}
            height={36}
            decoding="async"
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
            Ofu&apos;s Library
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="hidden rounded-full border border-line bg-surface/60 px-3 py-1.5 text-xs font-medium tracking-wide text-ink-muted backdrop-blur-sm sm:inline-flex">
            {isEntrance ? 'Cổng nhận khoá' : 'Kho lưu trữ riêng'}
          </span>
          {theme && onCycleTheme && <ThemeToggle theme={theme} onCycle={onCycleTheme} showLabel />}
        </div>
      </header>

      {/* Bố cục không gian mở căn trái thoáng đãng (dịch vào 5% tạo khoảng thở cân đối) */}
      <main className="relative z-10 flex w-full flex-1 flex-col justify-center py-12 pl-6 pr-6 sm:pl-10 sm:pr-10 md:pl-[calc(3.5rem+3.5%)] md:pr-14 lg:pl-[calc(5rem+5%)] lg:pr-20">
        {status === 'checking' ? (
          <div className="flex items-center gap-3 text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <span className="text-sm">Đang kiểm tra cổng thư viện...</span>
          </div>
        ) : status === 'error' ? (
          <div className="max-w-md space-y-4">
            <p className="rounded-xl border border-red-700/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:border-red-400/25 dark:text-red-300">
              {errorMessage || 'Không thể kết nối máy chủ thư viện.'}
            </p>
            <button
              type="button"
              onClick={() => void verifyServer()}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              <RefreshCw className="h-4 w-4" />
              Thử kết nối lại
            </button>
          </div>
        ) : (
          <div className="fade-in max-w-xl">
            {/* Huy hiệu trạng thái riêng của Ofu's Library */}
            <div className="mb-6 flex items-center gap-3 select-none">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur-sm ${
                  isEntrance
                    ? 'border-amber-600/35 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300'
                    : 'border-line-strong bg-surface/75 text-ink-muted'
                }`}
              >
                {isEntrance ? <KeyRound className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </div>
              <span aria-hidden="true" className="h-px w-8 bg-line-strong" />
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted">
                {isEntrance ? 'Khoá tạm thời · Hiệu lực 5 phút' : 'Trạng thái · Đang đóng cửa'}
              </span>
            </div>

            {isEntrance ? (
              <>
                <p className="font-display text-xl font-medium tracking-tight text-ink-muted sm:text-2xl">
                  Ofu&apos;s Library
                </p>
                <h1 className="mt-1 font-display text-5xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl md:text-[4.25rem]">
                  Entrance
                </h1>

                <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted sm:text-[15px]">
                  {isLocalDevMode
                    ? 'Chế độ Local Dev — nhập mã bất kỳ để mở thử cổng.'
                    : 'Nhập chìa khoá 12 ký tự nhận từ Bot Discord để mở quyền đọc trong 24 giờ.'}
                </p>

                <form onSubmit={handleSubmit} className="mt-8 max-w-[26rem]">
                  <div className="mb-2.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted">
                    <label htmlFor="entrance-code-input" className="cursor-pointer">
                      Chìa khoá truy cập
                    </label>
                    {passcode.length > 0 && (
                      <span className="font-reader-mono tracking-wider">
                        {passcode.length} ký tự
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      ref={inputRef}
                      id="entrance-code-input"
                      type={showCode ? 'text' : 'password'}
                      value={passcode}
                      onChange={(e) => {
                        setPasscode(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onPaste={handlePaste}
                      placeholder="Nhập chìa khoá truy cập..."
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={submitting}
                      aria-label="Chìa khoá truy cập thư viện"
                      className="h-12 w-full rounded-xl border border-line-strong bg-surface/80 pl-4 pr-11 font-reader-mono text-sm tracking-wider text-ink shadow-sm backdrop-blur-sm transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-faint focus:border-amber-600/75 focus:bg-surface/95 focus:outline-none disabled:opacity-60 dark:focus:border-amber-300/70"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowCode((prev) => !prev);
                        inputRef.current?.focus();
                      }}
                      aria-label={showCode ? 'Ẩn mã truy cập' : 'Hiện mã truy cập'}
                      title={showCode ? 'Ẩn ký tự' : 'Hiện ký tự'}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
                    >
                      {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {errorMessage && (
                    <p
                      role="alert"
                      className="mt-3 rounded-lg border border-red-700/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-800 dark:border-red-400/25 dark:text-red-300"
                    >
                      {errorMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="group mt-6 inline-flex items-center gap-2.5 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-accent-foreground shadow-sm transition-all hover:bg-accent-hover disabled:opacity-50 dark:shadow-[0_0_24px_-6px_rgba(244,244,245,0.28)]"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Đang mở cổng...</span>
                      </>
                    ) : (
                      <>
                        <span>Mở cửa thư viện</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="font-display text-xl font-medium tracking-tight text-ink-muted sm:text-2xl">
                  Ofu&apos;s Library
                </p>
                <h1 className="mt-1 font-display text-5xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl md:text-[4.25rem]">
                  Closed
                </h1>

                <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted sm:text-[15px]">
                  {errorMessage ||
                    'Cánh cửa thư viện hiện đang khép với khách vãng lai. Chỉ thành viên nhận chìa khoá từ Discord mới có thể bước vào.'}
                </p>

                <div className="mt-8">
                  <a
                    href={buildGateHref('entrance')}
                    onClick={(event) => {
                      if (
                        event.button === 0 &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey
                      ) {
                        event.preventDefault();
                        setErrorMessage(null);
                        navigateGateRoute('entrance');
                      }
                    }}
                    className="group inline-flex items-center gap-2.5 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-accent-foreground shadow-sm transition-all hover:bg-accent-hover dark:shadow-[0_0_24px_-6px_rgba(244,244,245,0.28)]"
                  >
                    <KeyRound className="h-4 w-4" />
                    <span>Đến cổng nhập khoá</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </div>

                <div className="mt-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint select-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-faint/60" />
                  <span>Phiên đọc 24 giờ · Chế độ 2D</span>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="relative z-10 w-full pb-6 pl-6 pr-6 text-xs text-ink-faint sm:pl-10 sm:pr-10 md:pb-8 md:pl-[calc(3.5rem+3.5%)] md:pr-14 lg:pl-[calc(5rem+5%)] lg:pr-20">
        <span>Ofu&apos;s Library · Kho sách đồng bộ</span>
      </footer>
    </div>
  );
}
