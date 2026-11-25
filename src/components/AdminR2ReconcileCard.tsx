import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HardDrive,
  Loader2,
  RefreshCw,
  SearchCheck,
  Trash2,
} from 'lucide-react';
import { formatBytes, isCloudMode } from '@/lib/api';
import {
  type StorageObjectKind,
  type StorageReconcileReport,
  cleanupOrphanStorageKeys,
  fetchStorageReconcileReport,
} from '@/lib/storageReconcileApi';
import type { ToastType } from '@/hooks/useToast';

const ORPHAN_PAGE_SIZE = 25;

const KIND_LABELS: Record<StorageObjectKind, string> = {
  book: 'Sách gốc',
  cover: 'Ảnh bìa',
  'guest-pack': 'Gói khách',
  other: 'Khác',
};

export interface AdminR2ReconcileCardProps {
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
  onCleanedUp?: () => void;
}

export function AdminR2ReconcileCard({
  onApiError,
  onNotify,
  onCleanedUp,
}: AdminR2ReconcileCardProps) {
  const [report, setReport] = useState<StorageReconcileReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [visibleLimit, setVisibleLimit] = useState(ORPHAN_PAGE_SIZE);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const runScan = async (cursor?: string | null) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    setConfirmCleanup(false);
    try {
      const next = await fetchStorageReconcileReport({ cursor, signal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      setReport(next);
      setVisibleLimit(ORPHAN_PAGE_SIZE);
      setSelectedKeys(new Set(next.orphans.filter((item) => item.safeToDelete).map((item) => item.key)));
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      onApiError(err, 'Không thể đối soát kho R2 thực tế.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted && mountedRef.current) setScanning(false);
    }
  };

  const safeOrphans = useMemo(
    () => (report ? report.orphans.filter((item) => item.safeToDelete) : []),
    [report],
  );

  const selectedBytes = useMemo(() => {
    if (!report) return 0;
    let total = 0;
    for (const item of report.orphans) {
      if (item.safeToDelete && selectedKeys.has(item.key)) total += item.size;
    }
    return total;
  }, [report, selectedKeys]);

  const toggleKey = (key: string) => {
    setConfirmCleanup(false);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllSafe = () => {
    setConfirmCleanup(false);
    if (selectedKeys.size === safeOrphans.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(safeOrphans.map((item) => item.key)));
    }
  };

  const handleCleanup = async () => {
    const keys = Array.from(selectedKeys);
    if (keys.length === 0 || cleaning) return;
    if (!confirmCleanup) {
      setConfirmCleanup(true);
      return;
    }
    setCleaning(true);
    setConfirmCleanup(false);
    try {
      const res = await cleanupOrphanStorageKeys(keys);
      if (!mountedRef.current) return;
      if (res.deletedCount > 0) {
        onNotify?.(
          `Đã dọn ${res.deletedCount} tệp mồ côi trên R2, giải phóng ${formatBytes(res.reclaimedBytes)}.`,
          'success',
        );
        onCleanedUp?.();
      } else {
        onNotify?.(
          'Không có tệp nào đủ điều kiện xoá (đều đang được D1 dùng hoặc mới dưới 24 giờ).',
          'info',
        );
      }
      await runScan();
    } catch (err) {
      if (mountedRef.current) onApiError(err, 'Không thể dọn tệp rác mồ côi trên R2.');
    } finally {
      if (mountedRef.current) setCleaning(false);
    }
  };

  const diffSign = report && report.diffBytes > 0 ? '+' : report && report.diffBytes < 0 ? '-' : '';

  return (
    <section
      id="r2-storage-reconcile"
      className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
            <SearchCheck className="h-4 w-4 text-accent" />
            <span>Đối soát kho R2 thực tế</span>
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Quét danh sách object thật trên Cloudflare R2, đối chiếu với D1 (sách, bìa, gói khách)
            và chỉ cho phép dọn tệp mồ côi cũ hơn 24 giờ.
          </p>
        </div>

        <button
          type="button"
          disabled={scanning || cleaning}
          onClick={() => void runScan()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {scanning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Đang quét R2...</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{report ? 'Quét đối soát lại' : 'Quét đối soát R2'}</span>
            </>
          )}
        </button>
      </div>

      {!report ? (
        <p className="mt-3 rounded-xl border border-dashed border-line bg-canvas/60 px-4 py-3 text-xs text-ink-muted">
          Bấm <strong>Quét đối soát R2</strong> khi cần kiểm tra dung lượng thực trên bucket R2 so
          với D1 (không tự quét khi mở trang để tiết kiệm lượt đọc R2 Free Tier).
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {!isCloudMode && (
            <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
              Đang ở Local Dev nên chỉ mô phỏng kết quả đối soát trên dữ liệu cục bộ.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-line bg-canvas p-3">
              <p className="flex items-center gap-1 text-[11px] text-ink-muted">
                <HardDrive className="h-3 w-3 text-accent" />
                <span>R2 thực tế</span>
              </p>
              <p className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">
                {formatBytes(report.r2.totalBytes)}
              </p>
              <p className="text-[11px] text-ink-faint">
                {report.r2.objectCount} tệp ({report.scannedPages} trang list)
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3">
              <p className="text-[11px] text-ink-muted">D1 đang tham chiếu</p>
              <p className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">
                {formatBytes(report.d1.totalBytes)}
              </p>
              <p className="text-[11px] text-ink-faint">
                {report.d1.objectCount} tệp · {report.d1.bookCount} sách
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3">
              <p className="text-[11px] text-ink-muted">Chênh lệch R2 − D1</p>
              <p className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">
                {diffSign}
                {formatBytes(Math.abs(report.diffBytes))}
              </p>
              <p className="text-[11px] text-ink-faint">
                {report.missingInR2Count > 0
                  ? `Thiếu ${report.missingInR2Count} khoá D1 trên R2`
                  : 'Đủ tệp D1 trên R2'}
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-3">
              <p className="text-[11px] text-ink-muted">Tệp rác mồ côi</p>
              <p className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">
                {report.r2.orphanCount}
                <span className="ml-1 text-xs font-normal text-ink-muted">
                  ({formatBytes(report.r2.orphanBytes)})
                </span>
              </p>
              <p className="text-[11px] text-ink-faint">
                An toàn (&gt;24h): {report.r2.safeOrphanCount} · Mới (&le;24h):{' '}
                {report.r2.recentOrphanCount}
              </p>
            </div>
          </div>

          {report.truncated && report.nextCursor && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-800 dark:text-amber-200">
              <span>
                Bucket R2 vượt quá một lượt quét ({report.scannedPages} trang). Có thể quét tiếp
                trang kế tiếp.
              </span>
              <button
                type="button"
                disabled={scanning || cleaning}
                onClick={() => void runScan(report.nextCursor)}
                className="rounded-lg border border-amber-600/40 bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-subtle disabled:opacity-50"
              >
                Quét trang tiếp theo
              </button>
            </div>
          )}

          {report.missingInR2Count > 0 && (
            <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200">
              <p className="inline-flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>
                  Phát hiện {report.missingInR2Count} khoá trong D1 không tồn tại trên R2:
                </span>
              </p>
              <p className="mt-1 break-all font-mono text-[11px] opacity-90">
                {report.missingInR2Sample.slice(0, 5).join(', ')}
                {report.missingInR2Count > 5 ? ' …' : ''}
              </p>
            </div>
          )}

          {report.orphans.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Kho R2 hoàn toàn sạch, không có tệp rác mồ côi nào.</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  {safeOrphans.length > 0 && (
                    <button
                      type="button"
                      disabled={cleaning}
                      onClick={toggleAllSafe}
                      className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-line-strong hover:bg-subtle"
                    >
                      {selectedKeys.size === safeOrphans.length
                        ? 'Bỏ chọn tất cả'
                        : `Chọn hết tệp > 24h (${safeOrphans.length})`}
                    </button>
                  )}
                  <span className="text-[11px] text-ink-muted">
                    Đang chọn {selectedKeys.size} tệp ({formatBytes(selectedBytes)})
                  </span>
                </div>

                {safeOrphans.length > 0 && (
                  <div className="flex items-center gap-2">
                    {confirmCleanup && (
                      <button
                        type="button"
                        disabled={cleaning}
                        onClick={() => setConfirmCleanup(false)}
                        className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
                      >
                        Huỷ
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={cleaning || selectedKeys.size === 0}
                      onClick={() => void handleCleanup()}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-45 ${
                        confirmCleanup
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'border border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300'
                      }`}
                    >
                      {cleaning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {confirmCleanup
                          ? `Xác nhận xoá ${selectedKeys.size} tệp (${formatBytes(selectedBytes)})`
                          : `Dọn ${selectedKeys.size} tệp mồ côi (> 24h)`}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas text-xs">
                {report.orphans.slice(0, visibleLimit).map((item) => {
                  const checked = item.safeToDelete && selectedKeys.has(item.key);
                  return (
                    <li
                      key={item.key}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!item.safeToDelete || cleaning}
                          onChange={() => toggleKey(item.key)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-line accent-accent disabled:opacity-40"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[11px] text-ink" title={item.key}>
                            {item.key}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-muted">
                            <span className="rounded bg-subtle px-1.5 py-0.5 font-medium">
                              {KIND_LABELS[item.kind]}
                            </span>
                            <span>{formatBytes(item.size)}</span>
                            <span>·</span>
                            <span>{item.ageHours} giờ trước</span>
                          </p>
                        </div>
                      </label>
                      {item.safeToDelete ? (
                        <span className="shrink-0 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                          An toàn xoá
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                          <Clock className="h-2.5 w-2.5" />
                          <span>Bảo vệ &le; 24h</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {report.orphans.length > visibleLimit && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + ORPHAN_PAGE_SIZE)}
                    className="rounded-xl border border-line bg-canvas px-4 py-1.5 text-xs font-medium text-ink transition hover:border-line-strong hover:bg-subtle"
                  >
                    Xem thêm ({report.orphans.length - visibleLimit} tệp còn lại)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
