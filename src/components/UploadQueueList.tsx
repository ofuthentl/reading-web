import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
} from 'lucide-react';
import type { Book, BookFileType } from '@/types';
import { formatBytes } from '@/lib/api';
import { resolvePreviewShelfName } from '@/lib/shelfPlacement';

export type QueueItemStatus = 'queued' | 'skipped' | 'uploading' | 'done' | 'error' | 'invalid';

export interface UploadQueueItem {
  id: string;
  file: File;
  title: string;
  author: string;
  shelf: string;
  extension: BookFileType | null;
  duplicateKey: string;
  duplicateReason: 'library' | 'queue' | null;
  status: QueueItemStatus;
  errorMessage?: string;
}

interface UploadQueueListProps {
  queue: UploadQueueItem[];
  books: Book[];
  uploading: boolean;
  batchShelfOverride?: string | null;
  onToggleSkip: (id: string) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

function QueueItemStatusNote({ item }: { item: UploadQueueItem }) {
  if (item.status === 'uploading') {
    return (
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-accent">
        <Loader2 className="h-3 w-3 animate-spin" /> Đang trích ảnh bìa & tải lên R2...
      </p>
    );
  }
  if (item.status === 'done') {
    return (
      <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Đã lưu vào thư viện
      </p>
    );
  }
  if (item.status === 'skipped') {
    return (
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        Tạm bỏ qua do nghi ngờ trùng lặp.
      </p>
    );
  }
  if ((item.status === 'error' || item.status === 'invalid') && item.errorMessage) {
    return (
      <p className="mt-1 inline-flex items-start gap-1 text-xs text-red-700 dark:text-red-400">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{item.errorMessage}</span>
      </p>
    );
  }
  return null;
}

export function UploadQueueList({
  queue,
  books,
  uploading,
  batchShelfOverride,
  onToggleSkip,
  onRemove,
  onClearAll,
}: UploadQueueListProps) {
  if (queue.length === 0) return null;

  const activePreviewItems = queue.filter(
    (item) => item.status === 'queued' || item.status === 'uploading',
  );
  const trimmedOverride = batchShelfOverride?.trim() || null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>Danh sách tệp ({queue.length})</span>
        {!uploading && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-ink-muted transition-colors hover:text-ink"
          >
            Xoá danh sách
          </button>
        )}
      </div>

      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
        {queue.map((item) => {
          const displayShelf =
            item.status === 'done'
              ? item.shelf
              : trimmedOverride || resolvePreviewShelfName(item, activePreviewItems, books);

          return (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-xs font-semibold uppercase text-ink-muted">
                  {item.extension || <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                    {item.duplicateReason && item.status !== 'done' && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-700/30 bg-amber-600/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-400/30 dark:text-amber-300">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {item.duplicateReason === 'library' ? 'Trùng trong kho' : 'Trùng hàng đợi'}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    {item.author} · Kệ: {displayShelf} · {formatBytes(item.file.size)}
                  </p>
                  <QueueItemStatusNote item={item} />
                </div>
              </div>

              {!uploading && (
                <div className="flex shrink-0 items-center gap-1">
                  {(item.status === 'skipped' ||
                    (item.status === 'queued' && item.duplicateReason)) && (
                    <button
                      type="button"
                      onClick={() => onToggleSkip(item.id)}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
                    >
                      {item.status === 'skipped' ? 'Vẫn tải' : 'Bỏ qua'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label={`Xoá ${item.title} khỏi hàng đợi`}
                    className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
