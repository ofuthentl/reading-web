import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-[#0d0b1a] text-slate-100 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-amber-500/35 bg-slate-900/90 p-6 shadow-2xl">
          <div className="flex items-center gap-3 text-amber-400">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-100">
                Thiếu cấu hình máy chủ (VITE_API_URL)
              </h1>
              <p className="text-xs text-slate-400">Bảo vệ dữ liệu bản Production (D-005)</p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Ứng dụng đang chạy ở chế độ production nhưng chưa được cấu hình biến môi trường{' '}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-amber-300">VITE_API_URL</code>.
            Chế độ lưu cục bộ (Local-First) bị tắt trên production để tránh việc bạn tưởng đang lưu lên
            Cloudflare nhưng sách lại chỉ nằm trong trình duyệt.
          </p>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs leading-relaxed text-slate-400">
            Cách khắc phục: cấu hình GitHub Actions Secret{' '}
            <code className="text-slate-200">VITE_API_URL</code> trỏ tới URL Cloudflare Worker của bạn
            rồi chạy lại quy trình deploy.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0c0a1a] via-[#131029] to-[#0b1020] text-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-indigo-500/20 bg-slate-900/80 p-7 shadow-2xl backdrop-blur">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-white">
            Thư Viện Huyền Ảo
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {isLocalDevMode
              ? 'Chế độ Local Dev (IndexedDB)'
              : 'Nhập mật mã để mở kho sách cá nhân trên Cloudflare'}
          </p>
        </div>

        {status === 'checking' && (
          <div className="mt-8 flex flex-col items-center gap-3 py-4 text-slate-300">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <p className="text-sm">Đang kết nối tới máy chủ thư viện...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage || 'Không thể kết nối máy chủ thư viện.'}
            </div>
            <button
              type="button"
              onClick={() => void verifyServer()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Thử kết nối lại
            </button>
          </div>
        )}

        {status === 'login' && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="passcode-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                Mật mã thư viện
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="passcode-input"
                  type={showPasscode ? 'text' : 'password'}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  disabled={submitting}
                  placeholder="Nhập mật mã..."
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/70 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label={showPasscode ? 'Ẩn mật mã' : 'Hiện mật mã'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang xác thực...
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
