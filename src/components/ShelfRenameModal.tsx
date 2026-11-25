import { useEffect, useRef, useState } from 'react';
import { FolderEdit, Info, Loader2, X } from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';
import { renameShelfAll } from '@/lib/api';
import type { ToastType } from '@/hooks/useToast';

interface ShelfRenameModalProps {
  shelfName: string | null;
  bookCount: number;
  existingShelves: string[];
  onClose: () => void;
  onRenamed: (oldName: string, newName: string) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function ShelfRenameModal({
  shelfName,
  bookCount,
  existingShelves,
  onClose,
  onRenamed,
  onApiError,
  onNotify,
}: ShelfRenameModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [nextName, setNextName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shelfName) return;
    setNextName(shelfName);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [shelfName]);

  if (!shelfName) return null;

  const trimmed = nextName.trim();
  const isUnchanged = trimmed === shelfName;
  const willMergeIntoExisting =
    Boolean(trimmed) &&
    !isUnchanged &&
    existingShelves.some(
      (item) =>
        item !== shelfName &&
        item.toLocaleLowerCase('vi') === trimmed.toLocaleLowerCase('vi'),
    );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !trimmed) return;
    if (isUnchanged) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await renameShelfAll(shelfName, trimmed);
      onRenamed(shelfName, trimmed);
      onNotify(
        willMergeIntoExisting
          ? `Đã gộp ${bookCount} cuốn vào kệ "${trimmed}".`
          : `Đã đổi tên kệ "${shelfName}" thành "${trimmed}".`,
        'success',
      );
      onClose();
    } catch (err) {
      onApiError(err, 'Không thể đổi tên kệ sách.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      closeDisabled={saving}
      ariaLabelledBy="rename-shelf-modal-title"
      zIndexClass="z-50"
      initialFocusRef={inputRef}
      panelClassName="moonlit-card fade-in w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
    >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <FolderEdit className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="rename-shelf-modal-title"
                className="font-display text-lg font-semibold text-ink"
              >
                Đổi tên kệ sách
              </h2>
              <p className="text-xs text-ink-muted">
                Áp dụng hàng loạt cho {bookCount} cuốn trong kệ &ldquo;{shelfName}&rdquo;
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Đóng cửa sổ đổi tên kệ"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-3 px-5 py-5">
            <div className="space-y-1.5">
              <label htmlFor="rename-shelf-input" className="block text-xs font-medium text-ink-muted">
                Tên kệ mới
              </label>
              <input
                ref={inputRef}
                id="rename-shelf-input"
                type="text"
                required
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                disabled={saving}
                placeholder="Nhập tên kệ mới..."
                className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
              />
            </div>

            {willMergeIntoExisting && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-700/30 bg-amber-600/10 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:text-amber-300">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  Kệ <strong>{trimmed}</strong> đã tồn tại — toàn bộ {bookCount} cuốn sẽ được gộp
                  chung vào kệ này.
                </p>
              </div>
            )}
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
              disabled={saving || !trimmed || isUnchanged}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-45 dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang cập nhật...
                </>
              ) : willMergeIntoExisting ? (
                'Gộp kệ'
              ) : (
                'Đổi tên kệ'
              )}
            </button>
          </div>
        </form>
    </ModalShell>
  );
}
