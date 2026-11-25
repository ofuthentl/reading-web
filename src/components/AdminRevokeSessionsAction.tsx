import { useState } from 'react';
import { AlertTriangle, Loader2, LogOut } from 'lucide-react';
import type { AuthSessionInfo } from '@/types';
import { isAuthError, isCloudMode } from '@/lib/authSession';
import { revokeAllAdminSessionsApi } from '@/lib/adminSecurityApi';
import type { ToastType } from '@/hooks/useToast';

export interface AdminRevokeSessionsActionProps {
  compact?: boolean;
  disabled?: boolean;
  onRevokedLogout?: () => void;
  onSessionReissued?: (nextSession: AuthSessionInfo) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function AdminRevokeSessionsAction({
  compact = false,
  disabled = false,
  onRevokedLogout,
  onSessionReissued,
  onApiError,
  onNotify,
}: AdminRevokeSessionsActionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [keepCurrentDevice, setKeepCurrentDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isCloudMode) return null;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await revokeAllAdminSessionsApi(keepCurrentDevice);
      setConfirmOpen(false);
      if (keepCurrentDevice && res.session) {
        onSessionReissued?.(res.session);
        onNotify?.(
          'Đã thu hồi mọi thiết bị Admin khác và cấp lại phiên mới cho thiết bị này.',
          'success',
        );
      } else {
        onNotify?.(
          'Đã thu hồi toàn bộ phiên Admin trên mọi thiết bị. Vui lòng đăng nhập lại.',
          'warning',
        );
        onRevokedLogout?.();
      }
    } catch (err) {
      if (isAuthError(err)) {
        onApiError(err, 'Phiên quản trị đã hết hiệu lực.');
      } else {
        onApiError(err, 'Không thể đăng xuất mọi thiết bị Admin.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!confirmOpen) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setKeepCurrentDevice(false);
          setConfirmOpen(true);
        }}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 font-medium text-rose-700 transition-colors hover:bg-rose-500/20 disabled:opacity-45 dark:border-rose-400/35 dark:text-rose-300 ${
          compact ? 'w-full px-3 py-1.5 text-[11px]' : 'px-3 py-1.5 text-xs'
        }`}
      >
        <LogOut className="h-3.5 w-3.5 shrink-0" />
        <span>Đăng xuất mọi thiết bị Admin</span>
      </button>
    );
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-ink">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-rose-800 dark:text-rose-200">
            Xác nhận thu hồi mọi phiên Admin?
          </p>
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Mọi trình duyệt / điện thoại đang giữ mật mã quản trị sẽ lập tức bị đá về màn hình khoá
            (401) ở yêu cầu kế tiếp. Không ảnh hưởng khách Discord.
          </p>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line/70 bg-surface/80 px-2.5 py-1.5 text-[11px] text-ink">
        <input
          type="checkbox"
          checked={keepCurrentDevice}
          disabled={submitting}
          onChange={(e) => setKeepCurrentDevice(e.target.checked)}
          className="h-3.5 w-3.5 rounded accent-current"
        />
        <span>Giữ thiết bị này đăng nhập (tự cấp lại phiên mới sau khi thu hồi thiết bị khác)</span>
      </label>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => setConfirmOpen(false)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-45"
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleConfirm()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          <span>{submitting ? 'Đang thu hồi...' : 'Xác nhận thu hồi tất cả'}</span>
        </button>
      </div>
    </div>
  );
}
