import {
  type ClipboardEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, ArrowRight, Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react';
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

const KEY_SLOT_COUNT = 12;

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

      // Local dev (no auth required): auto-enter on '/', but allow previewing '/entrance' & '/locked'
      if (!health.authRequired && currentRoute === 'root') {
        onAuthenticated(DEFAULT_OWNER_SESSION);
        return;
      }

      const stored = inspectStoredSession();

      // Visiting '/' directly: enter library if token is active, otherwise redirect to '/locked'
      if (currentRoute === 'root') {
        if (stored.status === 'active' && !authReason) {
          onAuthenticated(stored.session);
          return;
        }
        if (stored.status === 'expired' && !authReason) {
          setErrorMessage(
            stored.role === 'guest'
              ? 'Phiên truy cập 24 giờ đã hết hạn.'
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
  const isDark = theme && theme !== 'light';
  const isTwelveSlotMode = passcode.length <= KEY_SLOT_COUNT;
  const activeSlotIndex = Math.min(passcode.length, KEY_SLOT_COUNT - 1);

  return (
    <div className="theme-canvas relative flex min-h-screen flex-col justify-between overflow-hidden text-ink transition-colors duration-200">
      {/* Lớp kẻ sọc dọc giấy cổ (tategaki) + quầng sáng ấm trung tâm */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(ellipse 48% 52% at 54% 52%, rgba(208, 86, 62, 0.085), transparent 72%), repeating-linear-gradient(90deg, transparent 0, transparent 55px, rgba(255, 255, 255, 0.038) 55px, rgba(255, 255, 255, 0.038) 56px)'
            : 'radial-gradient(ellipse 48% 52% at 54% 52%, rgba(214, 132, 104, 0.16), transparent 72%), repeating-linear-gradient(90deg, transparent 0, transparent 55px, rgba(92, 76, 58, 0.075) 55px, rgba(92, 76, 58, 0.075) 56px)',
        }}
      />

      {/* Chữ chìm 書庫 khổ lớn bên mép phải */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-[-1.25rem] top-1/2 hidden -translate-y-1/2 select-none text-ink opacity-[0.085] sm:block dark:opacity-[0.07]"
      >
        <svg
          width="300"
          height="580"
          viewBox="0 0 300 580"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-[74vh] max-h-[620px] w-auto"
        >
          <rect x="20" y="20" width="260" height="260" stroke="currentColor" strokeWidth="1" />
          <line x1="150" y1="20" x2="150" y2="280" stroke="currentColor" strokeWidth="0.75" strokeDasharray="4 4" />
          <line x1="20" y1="150" x2="280" y2="150" stroke="currentColor" strokeWidth="0.75" strokeDasharray="4 4" />
          <text
            x="150"
            y="222"
            textAnchor="middle"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            fontSize="210"
            fontFamily="serif"
          >
            書
          </text>

          <rect x="20" y="300" width="260" height="260" stroke="currentColor" strokeWidth="1" />
          <line x1="150" y1="300" x2="150" y2="560" stroke="currentColor" strokeWidth="0.75" strokeDasharray="4 4" />
          <line x1="20" y1="430" x2="280" y2="430" stroke="currentColor" strokeWidth="0.75" strokeDasharray="4 4" />
          <text
            x="150"
            y="502"
            textAnchor="middle"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            fontSize="210"
            fontFamily="serif"
          >
            庫
          </text>
        </svg>
      </div>

      {/* Thanh tiêu đề mảnh phía trên */}
      <header className="relative z-10 flex w-full items-center justify-between px-6 pt-6 sm:px-12 sm:pt-8">
        <div className="flex items-baseline gap-2 select-none">
          <span className="font-display text-lg italic tracking-tight text-ink sm:text-xl">
            Ofu&apos;s Library.
          </span>
          <span className="text-[11px] tracking-[0.22em] text-ink-muted">書庫</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-[10px] font-medium uppercase tracking-[0.26em] text-ink-muted sm:inline">
            MEMBERS&apos; LIBRARY
          </span>
          {theme && onCycleTheme && <ThemeToggle theme={theme} onCycle={onCycleTheme} />}
        </div>
      </header>

      {/* Nội dung chính căn trái kiểu TMW */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-12 sm:px-12">
        {status === 'checking' ? (
          <div className="flex items-center gap-3 text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-[#c94127]" />
            <span className="text-xs tracking-[0.14em] uppercase">Checking gate...</span>
          </div>
        ) : status === 'error' ? (
          <div className="max-w-md space-y-4">
            <p className="rounded-xl border border-red-700/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:border-red-400/25 dark:text-red-300">
              {errorMessage || 'Không thể kết nối máy chủ thư viện.'}
            </p>
            <button
              type="button"
              onClick={() => void verifyServer()}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-canvas transition-opacity hover:opacity-85"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Thử kết nối lại
            </button>
          </div>
        ) : (
          <div className="fade-in max-w-2xl">
            {/* Dấu triện đỏ 書庫 + nhãn OFU'S LIBRARY */}
            <div className="mb-6 flex items-center gap-3.5 select-none">
              <div
                aria-hidden="true"
                className="flex h-9 w-9 -rotate-[4deg] items-center justify-center rounded-[5px] bg-[#c94127] p-[2.5px] text-[#fbf6ee] shadow-sm"
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-[3px] border border-[#fbf6ee]/65 text-[10px] font-semibold leading-[1.06]">
                  <span>書</span>
                  <span>庫</span>
                </div>
              </div>
              <span aria-hidden="true" className="h-px w-8 bg-line-strong" />
              <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-ink-muted">
                OFU&apos;S LIBRARY
              </span>
            </div>

            {isEntrance ? (
              <>
                <h1 className="font-display text-5xl font-normal italic leading-[1.04] tracking-[-0.025em] text-ink sm:text-6xl md:text-7xl">
                  Ofu&apos;s Library Entrance<span className="not-italic text-[#c94127]">.</span>
                </h1>

                <p className="mt-5 text-sm text-ink-muted">
                  {isLocalDevMode
                    ? 'Chế độ Local Dev — nhập mã bất kỳ để mở thử cổng.'
                    : 'Đưa chiếc chìa khoá Thủ thư vừa trao riêng cho bạn.'}
                </p>

                <form onSubmit={handleSubmit} className="mt-7 max-w-[26rem]">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.2em] text-ink-muted">
                    <label htmlFor="entrance-code-input" className="cursor-pointer">
                      ACCESS CODE
                    </label>
                    <div className="flex items-center gap-2 font-reader-mono tracking-[0.12em]">
                      <span>
                        {isTwelveSlotMode
                          ? `${passcode.length}/${KEY_SLOT_COUNT}`
                          : `${passcode.length}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCode((prev) => !prev);
                          inputRef.current?.focus();
                        }}
                        aria-label={showCode ? 'Ẩn mã truy cập' : 'Hiện mã truy cập'}
                        title={showCode ? 'Ẩn ký tự' : 'Hiện ký tự'}
                        className="rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
                      >
                        {showCode ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Khung đôi 12 ô chuẩn TMW (tự mở liền mạch nếu nhập passcode Admin > 12 ký tự) */}
                  <div
                    onClick={() => inputRef.current?.focus()}
                    className={`relative cursor-text border p-[3px] transition-colors ${
                      inputFocused
                        ? 'border-ink/75 bg-surface/75 dark:border-ink/65'
                        : 'border-ink/45 bg-surface/45 hover:border-ink/60 dark:border-ink/35'
                    }`}
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
                        isTwelveSlotMode
                          ? 'absolute inset-0 z-10 h-full w-full cursor-text opacity-0'
                          : 'relative z-10 h-11 w-full border border-ink/25 bg-transparent px-3.5 font-reader-mono text-sm tracking-widest text-ink outline-none sm:h-12'
                      }
                    />

                    {isTwelveSlotMode && (
                      <div
                        aria-hidden="true"
                        className="grid grid-cols-12 border border-ink/25 dark:border-ink/20"
                      >
                        {Array.from({ length: KEY_SLOT_COUNT }).map((_, index) => {
                          const ch = passcode[index] ?? '';
                          const isCaretCell =
                            inputFocused && !submitting && index === activeSlotIndex;
                          const displayChar = ch
                            ? showCode
                              ? ch.toUpperCase()
                              : '•'
                            : '';
                          return (
                            <div
                              key={index}
                              className={`relative flex h-11 items-center justify-center border-r border-ink/15 font-reader-mono text-sm font-medium text-ink transition-colors last:border-r-0 sm:h-12 sm:text-base dark:border-ink/15 ${
                                isCaretCell ? 'bg-ink/[0.055] dark:bg-white/[0.06]' : ''
                              }`}
                            >
                              <span>{displayChar}</span>
                              {isCaretCell && !ch && (
                                <span className="absolute bottom-2 h-[1.5px] w-3.5 animate-pulse bg-[#c94127]" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {errorMessage && (
                    <p
                      role="alert"
                      className="mt-3 text-xs font-medium text-[#b93820] dark:text-[#f0755e]"
                    >
                      {errorMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className={`mt-5 inline-flex items-center gap-2.5 rounded-full px-6 py-2.5 text-xs font-medium tracking-wide transition-all disabled:opacity-55 ${
                      passcode.trim().length > 0
                        ? 'bg-ink text-canvas shadow-sm hover:opacity-90'
                        : 'bg-ink/55 text-canvas hover:bg-ink/75 dark:bg-ink/35 dark:text-ink dark:hover:bg-ink/50'
                    }`}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Opening...</span>
                      </>
                    ) : (
                      <>
                        <span>Enter the library</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              /* Trang /locked: hoàn toàn KHÔNG có ô nhập và KHÔNG có nút sang /entrance */
              <>
                <h1 className="font-display text-5xl font-normal italic leading-[1.04] tracking-[-0.025em] text-ink sm:text-6xl md:text-7xl">
                  Ofu&apos;s Library Closed<span className="not-italic text-[#c94127]">.</span>
                </h1>

                {errorMessage && (
                  <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-muted">
                    {errorMessage}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="relative z-10 px-6 pb-6 sm:px-12 sm:pb-8">
        <span className="sr-only">Ofu&apos;s Library Gate</span>
      </footer>
    </div>
  );
}
