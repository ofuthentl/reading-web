import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import type { Book, StorageStats } from '@/types';
import { deleteBooks, formatBytes } from '@/lib/api';
import type { ToastType } from '@/hooks/useToast';

interface DeleteConfirmModalProps {
  books: Book[];
  onClose: () => void;
  onDeleted: (deletedIds: string[], storage: StorageStats) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function DeleteConfirmModal({
  books,
  onClose,
  onDeleted,
  onApiError,
  onNotify,
}: DeleteConfirmModalProps) {
  const [deleting, setDeleting] = useState(false);

  const isOpen = books.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, deleting, onClose]);

  const totalBytes = useMemo(
    () => books.reduce((sum, book) => sum + (book.file_size || 0) + (book.cover_size || 0), 0),
    [books],
  );

  if (!isOpen) return null;

  const isSingle = books.length === 1;

  const handleConfirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const nextStorage = await deleteBooks(books);
      const deletedIds = books.map((book) => book.id);
      onDeleted(deletedIds, nextStorage);
      onNotify(
        isSingle
          ? `Đã xoá "${books[0].title}" (giải phóng ${formatBytes(totalBytes)}).`
          : `Đã xoá ${books.length} cuốn sách (giải phóng ${formatBytes(totalBytes)}).`,
        'success',
      );
      onClose();
    } catch (err) {
      onApiError(
        err,
        isSingle ? 'Không thể xoá cuốn sách này.' : 'Không thể xoá các cuốn sách đã chọn.',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-modal-title"
      onClick={() => {
        if (!deleting) onClose();
      }}
    >
      <div
        className="moonlit-card fade-in w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-700/30 bg-red-600/10 text-red-700 dark:border-red-400/30 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="delete-confirm-modal-title"
                className="font-display text-lg font-semibold text-ink"
              >
                {isSingle ? 'Xoá cuốn sách này?' : `Xoá ${books.length} cuốn sách đã chọn?`}
              </h2>
              <p className="text-xs text-ink-muted">
                Giải phóng <strong className="text-ink">{formatBytes(totalBytes)}</strong> dung lượng
                lưu trữ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            aria-label="Đóng hộp thoại xác nhận xoá"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <p className="text-sm leading-relaxed text-ink-muted">
            Thao tác này sẽ xoá vĩnh viễn tệp sách, ảnh bìa trên bộ nhớ đám mây, bản cache cục bộ
            và tiến độ đọc liên quan. Không thể hoàn tác sau khi xoá.
          </p>

          <ul className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-canvas p-2.5 scrollbar-thin">
            {books.map((book) => (
              <li
                key={book.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{book.title}</p>
                  <p className="truncate text-ink-muted">
                    {book.author} · {book.shelf}
                  </p>
                </div>
                <span className="shrink-0 font-medium text-ink-muted">
                  {formatBytes((book.file_size || 0) + (book.cover_size || 0))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-45"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleConfirmDelete()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-700/40 bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50 dark:border-red-500/40 dark:bg-red-600 dark:hover:bg-red-500"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang xoá...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Xoá vĩnh viễn
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
