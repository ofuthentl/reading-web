import {
  type ClipboardEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
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
import { DEFAULT_OWNER_SESSION, inspectStoredSession } from '@/lib/authSession';
import {
  type GateRoute,
  getCurrentGateRoute,
  replaceGateRoute,
  subscribeGateRoute,
  syncGateDocumentTitle,
} from '@/lib/gateRoutes';
import { GateBackdropArt } from '@/components/GateBackdropArt';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { AppTheme } from '@/hooks/useTheme';

interface AuthGateProps {
  onAuthenticated: (session: AuthSessionInfo) => void;
  authReason?: string | null;
  theme?: AppTheme;
  onCycleTheme?: (origin?: { x: number; y: number }) => void;
}

type GateStatus = 'checking' | 'ready' | 'error';

const KEY_SLOT_COUNT = 12;
const KEY_GROUPS = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
] as const;

export function AuthGate({ onAuthenticated, authReason, theme, onCycleTheme }: AuthGateProps) {
  const [route, setRoute] = useState<GateRoute>(getCurrentGateRoute);
  const [status, setStatus] = useState<GateStatus>('checking');
  const [passcode, setPasscode] = useState('');
  const [showCode, setShowCode] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);
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
  const isDark = Boolean(theme && theme !== 'light');
  const isSlotMode = passcode.length <= KEY_SLOT_COUNT;
  const activeSlotIndex = Math.min(passcode.length, KEY_SLOT_COUNT - 1);

  return (
    <div className="theme-canvas relative flex min-h-screen flex-col justify-between overflow-hidden text-ink transition-colors duration-200">
      <GateBackdropArt isDark={isDark} isEntrance={isEntrance} />

      {/* Thanh điều hướng tối giản góc trên */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6 sm:px-12 sm:pt-8">
        <div className="flex items-center gap-2.5 select-none">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong/70 bg-surface/70 text-accent backdrop-blur-sm">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
            Ofu&apos;s Library
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-line bg-surface/60 px-3 py-1 text-[11px] font-medium tracking-wide text-ink-muted backdrop-blur-sm sm:inline-flex">
            {isEntrance ? 'Cổng nhận khoá' : 'Kho lưu trữ riêng'}
          </span>
          {theme && onCycleTheme && <ThemeToggle theme={theme} onCycle={onCycleTheme} showLabel />}
        </div>
      </header>

      {/* Bố cục không gian mở căn trái — thoáng đãng, không đóng khung hộp cứng nhắc */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-12 sm:px-12">
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

                <form onSubmit={handleSubmit} className="mt-8 max-w-[29rem]">
                  <div className="mb-2.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted">
                    <label htmlFor="entrance-code-input" className="cursor-pointer">
                      Chìa khoá truy cập
                    </label>
                    <div className="flex items-center gap-2 font-reader-mono tracking-wider">
                      <span>
                        {isSlotMode
                          ? `${passcode.length}/${KEY_SLOT_COUNT}`
                          : `${passcode.length} ký tự`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCode((prev) => !prev);
                          inputRef.current?.focus();
                        }}
                        aria-label={showCode ? 'Ẩn mã truy cập' : 'Hiện mã truy cập'}
                        title={showCode ? 'Ẩn ký tự' : 'Hiện ký tự'}
                        className="rounded-md p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
                      >
                        {showCode ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Dải 3 cụm × 4 ô dễ nhìn (tự gộp mượt thành 1 thanh khi nhập mật mã Admin > 12 ký tự) */}
                  <div
                    onClick={() => inputRef.current?.focus()}
                    className="relative cursor-text"
                  >
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
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      disabled={submitting}
                      aria-label="Chìa khoá truy cập thư viện"
                      className={
                        isSlotMode
                          ? 'absolute inset-0 z-10 h-full w-full cursor-text opacity-0'
                          : 'relative z-10 h-12 w-full rounded-xl border border-accent bg-surface/85 px-4 font-reader-mono text-sm tracking-widest text-ink shadow-sm backdrop-blur-sm outline-none'
                      }
                    />

                    {isSlotMode && (
                      <div
                        aria-hidden="true"
                        className="flex items-center gap-2 sm:gap-3"
                      >
                        {KEY_GROUPS.map((group, groupIdx) => (
                          <div key={groupIdx} className="flex flex-1 items-center gap-1 sm:gap-1.5">
                            {group.map((slotIndex) => {
                              const ch = passcode[slotIndex] ?? '';
                              const isCaret =
                                inputFocused && !submitting && slotIndex === activeSlotIndex;
                              const displayChar = ch
                                ? showCode
                                  ? ch.toUpperCase()
                                  : '•'
                                : '';
                              return (
                                <div
                                  key={slotIndex}
                                  className={`relative flex h-11 flex-1 items-center justify-center rounded-lg border font-reader-mono text-sm font-semibold backdrop-blur-sm transition-all sm:h-12 sm:text-base ${
                                    isCaret
                                      ? 'border-amber-600/75 bg-amber-500/[0.08] text-ink shadow-sm dark:border-amber-300/70 dark:bg-amber-400/[0.08]'
                                      : ch
                                        ? 'border-line-strong bg-surface/90 text-ink'
                                        : 'border-line bg-surface/55 text-ink-muted hover:border-line-strong'
                                  }`}
                                >
                                  <span>{displayChar}</span>
                                  {isCaret && !ch && (
                                    <span className="absolute bottom-2 h-0.5 w-3.5 animate-pulse rounded-full bg-amber-600 dark:bg-amber-300" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
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
              /* Trang /locked: không gian tĩnh lặng, không có ô nhập mã và không có nút sang /entrance */
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

                <div className="mt-8 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint select-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-faint/60" />
                  <span>Phiên đọc 24 giờ · Chế độ 2D</span>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-6 text-xs text-ink-faint sm:px-12 sm:pb-8">
        <span>Ofu&apos;s Library · Kho sách đồng bộ</span>
      </footer>
    </div>
  );
}
