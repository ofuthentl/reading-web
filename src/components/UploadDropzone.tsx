import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, HardDrive, RotateCcw, Square, Upload, X } from 'lucide-react';
import type { Book, StorageStats } from '@/types';
import {
  HARD_LIMIT_BYTES,
  formatBytes,
  groupBooksIntoShelves,
} from '@/lib/api';
import { bookDuplicateKey } from '@/lib/bookMetadata';
import { inferBatchCommonShelf } from '@/lib/shelfPlacement';
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  createUploadQueueItems,
  executeSequentialUploadBatch,
  triggerDiscordReleaseAnnouncement,
} from '@/lib/uploadBatchHelpers';
import {
  UploadBatchShelfBar,
  UploadDiscordReleaseToggle,
} from '@/components/UploadBatchShelfBar';
import { UploadQueueList, type UploadQueueItem } from '@/components/UploadQueueList';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type { ToastType } from '@/hooks/useToast';

interface UploadDropzoneProps {
  open: boolean;
  books: Book[];
  storage: StorageStats | null;
  onClose: () => void;
  onBookUploaded: (book: Book, storage: StorageStats) => void;
  onBookUpdated: (book: Book, storage?: StorageStats) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function UploadDropzone({
  open,
  books,
  storage,
  onClose,
  onBookUploaded,
  onBookUpdated,
  onApiError,
  onNotify,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stopRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  const userToggledBatchRef = useRef(false);

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [batchShelfEnabled, setBatchShelfEnabled] = useState(false);
  const [batchShelfCustomName, setBatchShelfCustomName] = useState<string | null>(null);
  const [lockedUploadShelf, setLockedUploadShelf] = useState<string | null>(null);
  const [announceDiscord, setAnnounceDiscord] = useState(false);
  const [pendingDiscordIds, setPendingDiscordIds] = useState<string[]>([]);
  const [announcingManual, setAnnouncingManual] = useState(false);
  const [progressState, setProgressState] = useState<{
    completed: number;
    total: number;
    currentTitle: string;
  } | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRequestedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !uploading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, uploading, onClose]);

  const libraryKeys = useMemo(
    () => new Set(books.map((book) => bookDuplicateKey(book.title, book.author))),
    [books],
  );

  const existingShelves = useMemo(
    () => groupBooksIntoShelves(books).map((shelf) => shelf.name),
    [books],
  );

  const activeQueueItems = useMemo(
    () => queue.filter((item) => item.status === 'queued' || item.status === 'uploading'),
    [queue],
  );

  const inferredCommonShelf = useMemo(
    () => inferBatchCommonShelf(activeQueueItems, books),
    [activeQueueItems, books],
  );

  useEffect(() => {
    if (uploading) return;
    if (activeQueueItems.length === 0) {
      userToggledBatchRef.current = false;
      setBatchShelfCustomName(null);
      setBatchShelfEnabled(false);
      setLockedUploadShelf(null);
      return;
    }
    if (!userToggledBatchRef.current) {
      setBatchShelfEnabled(Boolean(inferredCommonShelf));
    }
  }, [activeQueueItems.length, inferredCommonShelf, uploading]);

  const showBatchShelfBar = activeQueueItems.length >= 2 || Boolean(inferredCommonShelf);
  const pillShelfName = (
    batchShelfCustomName ??
    inferredCommonShelf ??
    activeQueueItems[0]?.shelf ??
    'Kho chưa phân loại'
  ).trim();
  const effectiveBatchShelf =
    uploading
      ? lockedUploadShelf
      : showBatchShelfBar && batchShelfEnabled && pillShelfName
        ? pillShelfName
        : null;

  const addFilesToQueue = useCallback(
    (incomingFiles: FileList | File[]) => {
      const files = Array.from(incomingFiles);
      if (files.length > 0) {
        setQueue((prev) => [...prev, ...createUploadQueueItems(files, libraryKeys, prev)]);
      }
    },
    [libraryKeys],
  );

  const updateItem = (id: string, patch: Partial<UploadQueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleToggleSkip = (id: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (item.status === 'skipped') return { ...item, status: 'queued', errorMessage: undefined };
        if (item.status === 'queued') return { ...item, status: 'skipped' };
        return item;
      }),
    );
  };

  const handleStartUpload = async () => {
    const targets = queue.filter((item) => item.status === 'queued');
    if (targets.length === 0 || uploading) return;

    const batchShelfForRun =
      showBatchShelfBar && batchShelfEnabled && pillShelfName ? pillShelfName : null;

    stopRequestedRef.current = false;
    setStopRequested(false);
    setPendingDiscordIds([]);
    setLockedUploadShelf(batchShelfForRun);
    setUploading(true);
    setProgressState({ completed: 0, total: targets.length, currentTitle: targets[0].title });

    const shouldAnnounceDiscord = announceDiscord;
    const { successCount, failCount, authFailed, uploadedBookIds } =
      await executeSequentialUploadBatch({
        targets,
        existingBooks: books,
        batchShelfForRun,
        isStopped: () => stopRequestedRef.current,
        isMounted: () => mountedRef.current,
        onProgress: setProgressState,
        onItemPatch: updateItem,
        onBookUploaded,
        onBookUpdated,
        onApiError,
      });

    if (!mountedRef.current) return;

    if (authFailed) {
      setUploading(false);
      setStopRequested(false);
      setLockedUploadShelf(null);
      onClose();
      return;
    }

    if (stopRequestedRef.current) {
      onNotify(
        successCount > 0
          ? `Đã dừng tải lên sau khi hoàn tất ${successCount} cuốn.`
          : 'Đã dừng hàng đợi tải lên.',
        'info',
      );
    } else if (successCount > 0 && failCount === 0) {
      onNotify(`Đã tải lên thành công ${successCount} cuốn sách.`, 'success');
    } else if (successCount > 0 && failCount > 0) {
      onNotify(`Đã tải lên ${successCount} cuốn, ${failCount} tệp gặp lỗi.`, 'warning');
    } else if (failCount > 0) {
      onNotify(`Không thể tải lên ${failCount} tệp. Vui lòng xem chi tiết lỗi.`, 'error');
    }

    if (shouldAnnounceDiscord && uploadedBookIds.length > 0 && mountedRef.current) {
      if (!stopRequestedRef.current && failCount === 0) {
        await triggerDiscordReleaseAnnouncement(uploadedBookIds, onNotify, onApiError);
      } else {
        setPendingDiscordIds(uploadedBookIds);
        onNotify(
          'Tạm hoãn tự gửi thông báo Discord do lô dừng giữa chừng hoặc có tệp lỗi. Bạn có thể bấm gửi thủ công ở góc dưới.',
          'info',
        );
      }
    }

    if (!mountedRef.current) return;
    setUploading(false);
    setStopRequested(false);
    setLockedUploadShelf(null);
  };

  if (!open) return null;

  const limitBytes = storage?.limitBytes || HARD_LIMIT_BYTES;
  const remainingBytes = Math.max(0, storage?.remainingBytes ?? limitBytes - (storage?.usedBytes ?? 0));
  const queuedItems = queue.filter((item) => item.status === 'queued');
  const errorCount = queue.filter((item) => item.status === 'error').length;
  const queuedBytes = queuedItems.reduce((sum, item) => sum + item.file.size, 0);
  const exceedsQuota = queuedBytes > remainingBytes;
  const progressPercent = progressState
    ? Math.round((progressState.completed / Math.max(1, progressState.total)) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      onClick={() => !uploading && onClose()}
    >
      <div
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 id="upload-modal-title" className="font-display text-lg font-semibold text-ink">
                Tải sách vào thư viện
              </h2>
              <p className="text-xs text-ink-muted">
                Hỗ trợ EPUB, DOCX · Tối đa 350 MB/tệp · Tải tuần tự từng cuốn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Đóng cửa sổ tải sách"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scrollbar-thin">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <HardDrive className="h-3.5 w-3.5 text-accent" />
              Còn trống: <strong className="text-ink">{formatBytes(remainingBytes)}</strong> /{' '}
              {formatBytes(limitBytes)}
            </span>
            {queuedItems.length > 0 && (
              <span className="text-ink-muted">
                Chờ tải:{' '}
                <strong className={exceedsQuota ? 'text-red-700 dark:text-red-400' : 'text-ink'}>
                  {queuedItems.length} tệp ({formatBytes(queuedBytes)})
                </strong>
              </span>
            )}
          </div>

          {exceedsQuota && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-800/30 bg-red-600/10 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-400/30 dark:text-red-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Tổng dung lượng chờ tải ({formatBytes(queuedBytes)}) vượt hạn mức an toàn 9.0 GB
                (còn trống {formatBytes(remainingBytes)}). Hãy bỏ bớt tệp hoặc xoá sách cũ trước khi
                tải lên.
              </p>
            </div>
          )}

          <div
            role="button"
            tabIndex={uploading ? -1 : 0}
            onClick={() => !uploading && inputRef.current?.click()}
            onKeyDown={(event) => {
              if (!uploading && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!uploading) setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (!uploading && event.dataTransfer.files?.length) {
                addFilesToQueue(event.dataTransfer.files);
              }
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
              uploading
                ? 'cursor-not-allowed border-line bg-canvas/40 opacity-60'
                : isDragging
                  ? 'border-accent bg-accent/10'
                  : 'border-line-strong bg-canvas/70 hover:border-accent/60 hover:bg-subtle/60'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_UPLOAD_EXTENSIONS}
              onChange={(event) => {
                if (event.target.files) {
                  addFilesToQueue(event.target.files);
                  event.target.value = '';
                }
              }}
              className="hidden"
            />
            <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-accent">
              <Upload className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-ink">
              {isDragging ? 'Thả tệp sách vào đây' : 'Kéo-thả sách vào đây hoặc bấm để chọn tệp'}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Chọn nhiều cuốn cùng lúc · Ảnh bìa nhẹ được tự động trích xuất khi tải lên
            </p>
          </div>

          {progressState && (uploading || progressState.completed > 0) && (
            <div className="space-y-2 rounded-xl border border-line bg-canvas px-3.5 py-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-ink">
                  {uploading
                    ? `Đang xử lý (${Math.min(progressState.completed + 1, progressState.total)}/${progressState.total}): ${progressState.currentTitle}`
                    : `Đã xử lý ${progressState.completed}/${progressState.total} tệp`}
                </span>
                <span className="shrink-0 font-medium text-accent">{progressPercent}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          <UploadDiscordReleaseToggle
            checked={announceDiscord}
            disabled={uploading}
            onChange={setAnnounceDiscord}
          />

          <UploadQueueList
            queue={queue}
            books={books}
            uploading={uploading}
            batchShelfOverride={effectiveBatchShelf}
            onToggleSkip={handleToggleSkip}
            onRemove={(id) => setQueue((prev) => prev.filter((item) => item.id !== id))}
            onClearAll={() => {
              setQueue([]);
              setProgressState(null);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <UploadBatchShelfBar
              visible={showBatchShelfBar}
              enabled={batchShelfEnabled}
              shelfName={pillShelfName}
              existingShelves={existingShelves}
              disabled={uploading}
              onToggle={(nextEnabled) => {
                userToggledBatchRef.current = true;
                setBatchShelfEnabled(nextEnabled);
              }}
              onChangeShelfName={(nextName) => {
                userToggledBatchRef.current = true;
                setBatchShelfCustomName(nextName);
                setBatchShelfEnabled(true);
              }}
            />
            {!uploading && errorCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setQueue((prev) =>
                    prev.map((item) =>
                      item.status === 'error'
                        ? { ...item, status: 'queued', errorMessage: undefined }
                        : item,
                    ),
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Thử lại {errorCount} tệp lỗi
              </button>
            )}
            {!uploading && pendingDiscordIds.length > 0 && (
              <button
                type="button"
                disabled={announcingManual}
                onClick={async () => {
                  setAnnouncingManual(true);
                  const sent = await triggerDiscordReleaseAnnouncement(
                    pendingDiscordIds,
                    onNotify,
                    onApiError,
                  );
                  if (mountedRef.current) {
                    if (sent) setPendingDiscordIds([]);
                    setAnnouncingManual(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-500/20 disabled:opacity-50 dark:text-indigo-300"
              >
                {announcingManual ? 'Đang báo Discord...' : `Báo Discord (${pendingDiscordIds.length} tập đã lên)`}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {uploading ? (
              <button
                type="button"
                disabled={stopRequested}
                onClick={() => {
                  stopRequestedRef.current = true;
                  setStopRequested(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5" />
                {stopRequested ? 'Đang dừng sau tệp này...' : 'Dừng tải lên'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={queuedItems.length === 0 || exceedsQuota}
                  onClick={() => void handleStartUpload()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-45 dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
                >
                  <Upload className="h-4 w-4" />
                  Tải lên {queuedItems.length > 0 ? `(${queuedItems.length})` : ''}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
