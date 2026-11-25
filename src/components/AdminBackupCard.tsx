import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileJson,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { isCloudMode } from '@/lib/api';
import {
  type OwnerBackupImportMode,
  type OwnerBackupImportResult,
  type OwnerBackupPayload,
  type OwnerBackupSummary,
  downloadOwnerBackupJson,
  exportOwnerBackupApi,
  importOwnerBackupApi,
  parseAndSummarizeBackupJson,
} from '@/lib/backupApi';
import type { ToastType } from '@/hooks/useToast';

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export interface AdminBackupCardProps {
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
  onImported?: () => void;
}

export function AdminBackupCard({ onApiError, onNotify, onImported }: AdminBackupCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<OwnerBackupImportMode>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [stagedFileName, setStagedFileName] = useState<string | null>(null);
  const [stagedPayload, setStagedPayload] = useState<OwnerBackupPayload | null>(null);
  const [stagedSummary, setStagedSummary] = useState<OwnerBackupSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<OwnerBackupImportResult | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleExport = async () => {
    if (exporting || importing) return;
    setExporting(true);
    try {
      const payload = await exportOwnerBackupApi();
      if (!mountedRef.current) return;
      const fileName = downloadOwnerBackupJson(payload);
      onNotify?.(`Đã xuất bản sao lưu JSON: ${fileName}`, 'success');
    } catch (err) {
      if (mountedRef.current) onApiError(err, 'Không thể xuất bản sao lưu JSON.');
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  };

  const handleSelectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setParseError(null);
    setConfirmReplace(false);
    setLastResult(null);

    if (file.size <= 0 || file.size > MAX_IMPORT_FILE_BYTES) {
      setStagedFileName(null);
      setStagedPayload(null);
      setStagedSummary(null);
      setParseError('Tệp JSON phải có dung lượng từ 1 byte đến tối đa 5 MB.');
      return;
    }

    try {
      const rawText = await file.text();
      if (!mountedRef.current) return;
      const { payload, summary } = parseAndSummarizeBackupJson(rawText);
      setStagedFileName(file.name);
      setStagedPayload(payload);
      setStagedSummary(summary);
    } catch (err) {
      if (!mountedRef.current) return;
      setStagedFileName(null);
      setStagedPayload(null);
      setStagedSummary(null);
      setParseError(err instanceof Error ? err.message : 'Tệp sao lưu JSON không hợp lệ.');
    }
  };

  const handleImport = async () => {
    if (!stagedPayload || importing || exporting) return;
    if (mode === 'replace' && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setImporting(true);
    setConfirmReplace(false);
    try {
      const result = await importOwnerBackupApi(stagedPayload, mode);
      if (!mountedRef.current) return;
      setLastResult(result);
      setStagedFileName(null);
      setStagedPayload(null);
      setStagedSummary(null);
      onNotify?.(
        result.skippedMissingBooks > 0
          ? `Đã khôi phục sao lưu Owner (${mode === 'replace' ? 'ghi đè' : 'gộp'}) — bỏ qua ${result.skippedMissingBooks} mục của sách không còn trong kho.`
          : `Đã khôi phục toàn bộ dữ liệu Owner (${mode === 'replace' ? 'ghi đè' : 'gộp'}) thành công!`,
        result.skippedMissingBooks > 0 ? 'warning' : 'success',
      );
      onImported?.();
    } catch (err) {
      if (mountedRef.current) onApiError(err, 'Không thể khôi phục bản sao lưu JSON.');
    } finally {
      if (mountedRef.current) setImporting(false);
    }
  };

  return (
    <section className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
            <DatabaseBackup className="h-4 w-4 text-accent" />
            <span>Sao lưu &amp; Khôi phục dữ liệu Owner (JSON)</span>
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Chỉ lưu dữ liệu JSON của Admin (tiến độ, dấu trang, highlight, tuỳ chọn kệ, tag, tên
            khác, liên kết, đọc sau, tuyển tập &amp; luật phân quyền) · 0 byte R2.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting || importing}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>{exporting ? 'Đang xuất...' : 'Xuất JSON sao lưu'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleSelectFile(e)}
            className="hidden"
          />
          <button
            type="button"
            disabled={exporting || importing || !isCloudMode}
            onClick={() => fileInputRef.current?.click()}
            title={!isCloudMode ? 'Chỉ khả dụng khi kết nối Cloudflare Worker' : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-45"
          >
            <Upload className="h-3.5 w-3.5 text-accent" />
            <span>Nhập tệp JSON</span>
          </button>
        </div>
      </div>

      {parseError && (
        <p className="mt-3 rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-2 text-xs text-red-700 dark:text-red-300">
          {parseError}
        </p>
      )}

      {stagedPayload && stagedSummary && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-canvas p-4 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 shrink-0 text-accent" />
              <div>
                <p className="font-semibold text-ink">{stagedFileName}</p>
                <p className="text-[11px] text-ink-muted">
                  {stagedSummary.exportedAt
                    ? `Xuất lúc ${new Date(stagedSummary.exportedAt).toLocaleString('vi-VN')}`
                    : 'Bản sao lưu hợp lệ (schema v1)'}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={importing}
              onClick={() => {
                setStagedFileName(null);
                setStagedPayload(null);
                setStagedSummary(null);
                setConfirmReplace(false);
              }}
              aria-label="Huỷ tệp sao lưu đã chọn"
              className="rounded-lg p-1 text-ink-muted hover:bg-subtle hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Tiến độ đọc', stagedSummary.progressCount],
              ['Dấu trang', stagedSummary.bookmarksCount],
              ['Highlight', stagedSummary.highlightsCount],
              ['Tuỳ chọn kệ', stagedSummary.shelfPrefsCount],
              ['Liên kết bộ', stagedSummary.shelfRelationsCount],
              ['Đọc sau', stagedSummary.planToReadCount],
              ['Tuyển tập', stagedSummary.collectionsCount],
              ['Luật phân quyền', stagedSummary.accessRulesCount],
            ].map(([label, count]) => (
              <div key={String(label)} className="rounded-lg border border-line/80 bg-surface px-2.5 py-1.5">
                <p className="text-[10px] text-ink-faint">{label}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{count}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink">
                <input
                  type="radio"
                  name="backup-import-mode"
                  checked={mode === 'merge'}
                  disabled={importing}
                  onChange={() => {
                    setMode('merge');
                    setConfirmReplace(false);
                  }}
                  className="accent-accent"
                />
                <span>Gộp thêm (Merge · an toàn)</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink">
                <input
                  type="radio"
                  name="backup-import-mode"
                  checked={mode === 'replace'}
                  disabled={importing}
                  onChange={() => {
                    setMode('replace');
                    setConfirmReplace(false);
                  }}
                  className="accent-accent"
                />
                <span>Ghi đè toàn bộ dữ liệu Owner (Replace)</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              {confirmReplace && (
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => setConfirmReplace(false)}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
                >
                  Huỷ
                </button>
              )}
              <button
                type="button"
                disabled={importing}
                onClick={() => void handleImport()}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                  confirmReplace
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-accent text-accent-foreground hover:bg-accent-hover'
                }`}
              >
                {importing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : confirmReplace ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                <span>
                  {importing
                    ? 'Đang khôi phục...'
                    : confirmReplace
                      ? 'Xác nhận ghi đè dữ liệu Owner'
                      : 'Khôi phục ngay'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {lastResult && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Đã khôi phục: {lastResult.restored.progress} tiến độ · {lastResult.restored.bookmarks}{' '}
            dấu trang · {lastResult.restored.highlights} highlight ·{' '}
            {lastResult.restored.shelfPrefs} kệ · {lastResult.restored.collections} tuyển tập ·{' '}
            {lastResult.restored.shelfAccessRules +
              lastResult.restored.bookAccessRules +
              lastResult.restored.chapterAccessRules}{' '}
            luật phân quyền
            {lastResult.skippedMissingBooks > 0
              ? ` (bỏ qua ${lastResult.skippedMissingBooks} mục của sách đã xoá)`
              : ''}
            .
          </span>
        </div>
      )}
    </section>
  );
}
