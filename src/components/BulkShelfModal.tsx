import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderInput, Loader2, X } from 'lucide-react';
import type { Book } from '@/types';
import { ModalShell } from '@/components/ModalShell';
import { MAX_SHELF_NAME_LENGTH, bulkUpdateBooksShelf } from '@/lib/api';
import { inferBatchCommonShelf } from '@/lib/shelfUploadPlanner';
import type { ToastType } from '@/hooks/useToast';

interface BulkShelfModalProps {
  books: Book[];
  existingShelves: string[];
  onClose: () => void;
  onMoved: (bookIds: string[], targetShelf: string) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

function matchExistingShelfCase(candidate: string, existingShelves: string[]): string {
  const trimmed = candidate.trim();
  if (!trimmed) return '';
  const key = trimmed.toLocaleLowerCase('vi');
  return existingShelves.find((shelf) => shelf.toLocaleLowerCase('vi') === key) || trimmed;
}

export function BulkShelfModal({
  books,
  existingShelves,
  onClose,
  onMoved,
  onApiError,
  onNotify,
}: BulkShelfModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [targetShelf, setTargetShelf] = useState('');
  const [saving, setSaving] = useState(false);

  const open = books.length > 0;

  const suggestedShelf = useMemo(() => {
    if (books.length === 0) return '';
    // Tạo danh sách tham chiếu gồm cả các kệ hiện có trong toàn thư viện để giữ đúng hoa/thường
    const shelfStubs: Book[] = existingShelves.map((shelf, index) => ({
      id: `shelf-stub-${index}`,
      title: shelf,
      author: 'Không rõ tác giả',
      shelf,
      description: null,
      cover_color: '#4f46e5',
      cover_key: null,
      file_key: '',
      file_type: 'epub',
      file_size: 0,
      cover_size: 0,
      created_at: '',
    }));

    const common = inferBatchCommonShelf(books, [...books, ...shelfStubs]);
    if (common) {
      return matchExistingShelfCase(common, existingShelves);
    }
    return matchExistingShelfCase(books[0]?.shelf || '', existingShelves);
  }, [books, existingShelves]);

  useEffect(() => {
    if (!open) return;
    setTargetShelf(suggestedShelf);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, suggestedShelf]);

  if (!open) return null;

  const trimmed = targetShelf.trim();
  const previewBooks = books.slice(0, 5);
  const remainingCount = Math.max(0, books.length - previewBooks.length);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !trimmed) return;

    const finalShelf = matchExistingShelfCase(trimmed, existingShelves).slice(
      0,
      MAX_SHELF_NAME_LENGTH,
    );
    const ids = books.map((book) => book.id);

    setSaving(true);
    try {
      await bulkUpdateBooksShelf(ids, finalShelf);
      onMoved(ids, finalShelf);
      onNotify(`Đã chuyển ${books.length} cuốn vào kệ "${finalShelf}".`, 'success');
      onClose();
    } catch (err) {
      onApiError(err, 'Không thể chuyển kệ cho các sách đã chọn.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      closeDisabled={saving}
      ariaLabelledBy="bulk-shelf-modal-title"
      zIndexClass="z-50"
      initialFocusRef={inputRef}
      panelClassName="moonlit-card fade-in w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
    >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <FolderInput className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="bulk-shelf-modal-title"
                className="font-display text-lg font-semibold text-ink"
              >
                Chuyển kệ hàng loạt
              </h2>
              <p className="text-xs text-ink-muted">
                Gom {books.length} cuốn sách đã chọn vào chung một kệ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Đóng cửa sổ chuyển kệ"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-4 px-5 py-5">
            <div className="space-y-1.5">
              <label htmlFor="bulk-shelf-input" className="block text-xs font-medium text-ink-muted">
                Tên kệ đích
              </label>
              <input
                ref={inputRef}
                id="bulk-shelf-input"
                type="text"
                required
                maxLength={MAX_SHELF_NAME_LENGTH}
                list="bulk-shelf-options-datalist"
                value={targetShelf}
                onChange={(event) => setTargetShelf(event.target.value)}
                disabled={saving}
                placeholder="Nhập tên kệ mới hoặc chọn bên dưới..."
                className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
              />
              <datalist id="bulk-shelf-options-datalist">
                {existingShelves.map((shelf) => (
                  <option key={shelf} value={shelf} />
                ))}
              </datalist>
            </div>

            {existingShelves.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-ink-muted">
                  Chọn nhanh kệ đang có ({existingShelves.length})
                </p>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-1 scrollbar-thin">
                  {existingShelves.map((shelfOption) => {
                    const isSelected =
                      trimmed.toLocaleLowerCase('vi') === shelfOption.toLocaleLowerCase('vi');
                    return (
                      <button
                        key={shelfOption}
                        type="button"
                        disabled={saving}
                        onClick={() => setTargetShelf(shelfOption)}
                        className={`max-w-[14rem] truncate rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          isSelected
                            ? 'border-accent bg-accent text-accent-foreground'
                            : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
                        }`}
                        title={shelfOption}
                      >
                        {shelfOption}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs">
              <p className="font-medium text-ink">Sách được chọn ({books.length} cuốn):</p>
              <ul className="mt-1.5 space-y-1 text-ink-muted">
                {previewBooks.map((book) => (
                  <li key={book.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-ink">{book.title}</span>
                    <span className="shrink-0 text-[11px] text-ink-faint">Kệ cũ: {book.shelf}</span>
                  </li>
                ))}
                {remainingCount > 0 && (
                  <li className="pt-0.5 text-[11px] italic text-ink-faint">
                    ...và {remainingCount} cuốn khác
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-45"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={saving || !trimmed}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-45 dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang chuyển kệ...
                </>
              ) : (
                <>
                  <FolderInput className="h-4 w-4" />
                  Chuyển vào kệ ({books.length})
                </>
              )}
            </button>
          </div>
        </form>
    </ModalShell>
  );
}
