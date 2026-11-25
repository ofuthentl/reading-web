import { HardDrive, SearchCheck, ShieldAlert } from 'lucide-react';
import type { AuthSessionInfo } from '@/types';
import { AdminRevokeSessionsAction } from '@/components/AdminRevokeSessionsAction';
import { formatBytes } from '@/lib/api';
import type { AdminUsageReport } from '@/lib/usageApi';
import type { ToastType } from '@/hooks/useToast';

export interface StorageAndSecurityPanelProps
  extends Pick<AdminUsageReport, 'storage' | 'security' | 'overview'> {
  onOpenReconcile?: () => void;
  onRevokedLogout?: () => void;
  onSessionReissued?: (nextSession: AuthSessionInfo) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function StorageAndSecurityPanel({
  storage,
  security,
  overview,
  onOpenReconcile,
  onRevokedLogout,
  onSessionReissued,
  onApiError,
  onNotify,
}: StorageAndSecurityPanelProps) {
  const limit = Math.max(1, storage.limitBytes);
  const usedPct = Math.min(100, (storage.usedBytes / limit) * 100);
  const filePct = (storage.fileBytes / limit) * 100;
  const packPct = (storage.packBytes / limit) * 100;
  const coverPct = (storage.coverBytes / limit) * 100;
  const guestPackRatio =
    overview.totalBooks > 0
      ? Math.round((overview.guestReadyBooks / overview.totalBooks) * 100)
      : 100;

  return (
    <section className="moonlit-card flex flex-col justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
            <HardDrive className="h-4 w-4 text-accent" />
            <span>Phân bổ R2 Free Tier</span>
          </h2>
          <span className="text-xs font-semibold tabular-nums text-ink">
            {usedPct.toFixed(1)}%
          </span>
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-subtle">
          <div
            className="h-full bg-crimson-accent transition-all"
            style={{ width: `${Math.min(100, filePct)}%` }}
            title={`File sách gốc: ${formatBytes(storage.fileBytes)}`}
          />
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${Math.min(100 - filePct, packPct)}%` }}
            title={`Gói bảo mật guest-packs: ${formatBytes(storage.packBytes)}`}
          />
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100 - filePct - packPct, coverPct)}%` }}
            title={`Ảnh bìa: ${formatBytes(storage.coverBytes)}`}
          />
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-crimson-accent" />
              File sách gốc ({overview.epubCount} EPUB · {overview.docxCount} DOCX)
            </span>
            <span className="font-medium tabular-nums text-ink">
              {formatBytes(storage.fileBytes)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Gói bảo mật khách ({guestPackRatio}%)
            </span>
            <span className="font-medium tabular-nums text-ink">
              {formatBytes(storage.packBytes)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Ảnh bìa nén
            </span>
            <span className="font-medium tabular-nums text-ink">
              {formatBytes(storage.coverBytes)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-line/70 pt-1.5">
            <span className="text-ink-muted">Còn trống / Hạn mức an toàn</span>
            <span className="font-semibold tabular-nums text-ink">
              {formatBytes(storage.remainingBytes)} / {formatBytes(storage.limitBytes)}
            </span>
          </div>
          {onOpenReconcile && (
            <button
              type="button"
              onClick={onOpenReconcile}
              className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
            >
              <SearchCheck className="h-3.5 w-3.5 text-accent" />
              <span>Đối soát kho R2 thực tế</span>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-line/80 bg-canvas/80 p-3 text-xs">
        <p className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span>An toàn &amp; Chống lạm dụng</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5">
            <p className="text-ink-faint">Chạm giới hạn 429</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {security.recentRateLimitHits}
            </p>
          </div>
          <div className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5">
            <p className="text-ink-faint">Sai mật mã / key</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {security.recentLoginFailures}
            </p>
          </div>
          <div className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5">
            <p className="text-ink-faint">IP khoá tạm / Strikes</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {security.activeLockedIps} / {security.totalStrikes}
            </p>
          </div>
          <div className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5">
            <p className="text-ink-faint">Tài khoản bị khoá</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {security.bannedGuests}
            </p>
          </div>
        </div>
        {onApiError && (
          <div className="mt-2.5 border-t border-line/70 pt-2.5">
            <AdminRevokeSessionsAction
              compact
              onRevokedLogout={onRevokedLogout}
              onSessionReissued={onSessionReissued}
              onApiError={onApiError}
              onNotify={onNotify}
            />
          </div>
        )}
      </div>
    </section>
  );
}
