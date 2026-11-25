import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { Book, StorageStats } from '@/types';
import { formatBytes } from '@/lib/api';
import { type ReplaceBookFileResult, replaceBookFile } from '@/lib/apiAdminMutations';
import type { ToastType } from '@/hooks/useToast';

const MAX_REPLACE_FILE_BYTES = 350 * 1024 * 1024;
const ACCEPTED_EXT_RE = /\.(epub|docx)$/i;

export interface BookReplaceFileSectionProps {
  book: Book;
  hasManualCoverSelected: boolean;
  disabled: boolean;
  onReplacingChange: (replacing: boolean) => void;
  onReplaced: (book: Book, storage: StorageStats) => void;
  onRegisterPendingRunner?: (
    runner: ((targetBook: Book) => Promise<ReplaceBookFileResult | null>) | null,
  ) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function BookReplaceFileSection({
  book,
  hasManualCoverSelected,
  disabled,
  onReplacingChange,
  onReplaced,
  onRegisterPendingRunner,
  onApiError,
  onNotify,
}: BookReplaceFileSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [updateCoverFromFile, setUpdateCoverFromFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [stageLabel, setStageLabel] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setSelectedFile(null);
    setUpdateCoverFromFile(false);
    setFileError(null);
    setStageLabel(null);
  }, [book.id]);

  const executeReplace = useCallback(
    async (targetBook: Book): Promise<ReplaceBookFileResult | null> => {
      if (!selectedFile) return null;
      setReplacing(true);
      onReplacingChange(true);
      setFileError(null);
      try {
        const result = await replaceBookFile(targetBook, selectedFile, {
          updateCoverFromFile: updateCoverFromFile && !hasManualCoverSelected,
          onStageChange: (stage) => {
            if (mountedRef.current) setStageLabel(stage);
          },
        });
        if (!mountedRef.current) return null;
        setSelectedFile(null);
        setUpdateCoverFromFile(false);
        setStageLabel(null);
        return result;
      } catch (err) {
        if (mountedRef.current) setStageLabel(null);
        throw err;
      } finally {
        if (mountedRef.current) {
          setReplacing(false);
          onReplacingChange(false);
        }
      }
    },
    [hasManualCoverSelected, onReplacingChange, selectedFile, updateCoverFromFile],
  );

  useEffect(() => {
    if (!onRegisterPendingRunner) return;
    onRegisterPendingRunner(selectedFile ? executeReplace : null);
    return () => onRegisterPendingRunner(null);
  }, [executeReplace, onRegisterPendingRunner, selectedFile]);

  const handleReplaceNow = async () => {
    if (!selectedFile || disabled || replacing) return;
    try {
      const result = await executeReplace(book);
      if (!result || !mountedRef.current) return;
      onReplaced(result.book, result.storage);
      if (result.warnings && result.warnings.length > 0) {
        onNotify(
          `Đã thay tệp cho "${result.book.title}" (lưu ý: ${result.warnings.join('; ')}).`,
          'warning',
        );
      } else {
        onNotify(
          `Đã thay tệp ${result.book.file_type.toUpperCase()} cho "${result.book.title}" — giữ nguyên tiến độ, bình luận & phân quyền.`,
          'success',
        );
      }
    } catch (err) {
      onApiError(err, 'Không thể thay tệp sách mới.');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_EXT_RE.test(file.name)) {
      setSelectedFile(null);
      setFileError('Chỉ hỗ trợ tệp định dạng .epub hoặc .docx.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_REPLACE_FILE_BYTES) {
      setSelectedFile(null);
      setFileError('Kích thước tệp phải nằm trong khoảng 1 byte đến 350 MB.');
      return;
    }
    setFileError(null);
    setSelectedFile(file);
  };

  const busy = disabled || replacing;
  const sizeDiff = selectedFile ? selectedFile.size - (book.file_size || 0) : 0;
  const nextExt = selectedFile
    ? selectedFile.name.toLowerCase().endsWith('.docx')
      ? 'DOCX'
      : 'EPUB'
    : null;

  return (
    <section className="mt-5 rounded-xl border border-line bg-canvas/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <RefreshCw className="h-3.5 w-3.5 text-accent" />
            <span>Thay tệp sách (giữ nguyên tiến độ, bình luận &amp; phân quyền)</span>
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
            Tải bản EPUB/DOCX đã sửa lỗi chính tả hoặc bản đẹp hơn. Giữ trọn 100% tiến độ đọc
            (Admin &amp; Khách), dấu trang, highlight, đánh giá, bình luận, quyền truy cập và tự
            cập nhật gói bảo mật khách.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium uppercase text-ink-muted">
          <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          <span>
            {book.file_type} · {formatBytes(book.file_size || 0)}
          </span>
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".epub,.docx,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-50"
        >
          <FileUp className="h-3.5 w-3.5 text-accent" />
          <span>{selectedFile ? 'Chọn tệp khác' : 'Chọn tệp EPUB / DOCX mới'}</span>
        </button>

        {selectedFile && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleReplaceNow()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {replacing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Đang thay tệp...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Thay tệp ngay</span>
                </>
              )}
            </button>
            {!busy && (
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setUpdateCoverFromFile(false);
                  setFileError(null);
                }}
                aria-label="Huỷ chọn tệp thay thế"
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {selectedFile && (
        <div className="mt-2.5 space-y-2 rounded-lg border border-line/80 bg-surface px-3 py-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="truncate font-medium text-ink" title={selectedFile.name}>
              {selectedFile.name}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
              {nextExt} · {formatBytes(selectedFile.size)} (
              {sizeDiff >= 0 ? `+${formatBytes(sizeDiff)}` : `-${formatBytes(Math.abs(sizeDiff))}`}
              )
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted select-none">
            <input
              type="checkbox"
              checked={updateCoverFromFile}
              disabled={busy || hasManualCoverSelected}
              onChange={(event) => setUpdateCoverFromFile(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-accent"
            />
            <span>
              Cập nhật ảnh bìa từ tệp mới
              {hasManualCoverSelected
                ? ' (đang ưu tiên ảnh bìa tải riêng ở cột trái)'
                : ' (mặc định tắt để giữ bìa hiện tại)'}
            </span>
          </label>
        </div>
      )}

      {stageLabel && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-accent">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{stageLabel}</span>
        </p>
      )}

      {fileError && (
        <p className="mt-2 text-[11px] text-red-700 dark:text-red-400">{fileError}</p>
      )}
    </section>
  );
}
