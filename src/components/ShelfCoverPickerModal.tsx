import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Image, Loader2, Sparkles, X } from 'lucide-react';
import type { Book, ShelfGroup } from '@/types';
import { getBookSortTitle, pickClothCoverColor } from '@/lib/bookMetadata';
import { setShelfCoverBook } from '@/lib/shelfPrefs';
import { pickShelfCoverBook } from '@/lib/shelfSummary';
import { useCoverUrl } from '@/hooks/useCoverUrl';
import type { ToastType } from '@/hooks/useToast';

interface VolumeCoverThumbProps {
  book: Book;
  selected: boolean;
  badgeLabel?: string;
  disabled: boolean;
  onSelect: () => void;
}

function VolumeCoverThumb({
  book,
  selected,
  badgeLabel,
  disabled,
  onSelect,
}: VolumeCoverThumbProps) {
  const coverUrl = useCoverUrl(book.cover_key, true);
  const [imgFailed, setImgFailed] = useState(false);
  const displayTitle = getBookSortTitle(book);
  const clothColor = pickClothCoverColor(`${book.id}-${book.title}`);

  useEffect(() => {
    setImgFailed(false);
  }, [book.cover_key]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`group flex flex-col rounded-xl p-1.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-55 ${
        selected
          ? 'bg-accent/10 ring-2 ring-accent'
          : 'hover:bg-subtle'
      }`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border border-line bg-subtle shadow-sm">
        {coverUrl && !imgFailed ? (
          <img
            src={coverUrl}
            alt={displayTitle}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            style={{ backgroundColor: clothColor }}
            className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] font-semibold text-[#f6efe2]"
          >
            {displayTitle}
          </div>
        )}

        {badgeLabel && (
          <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md border border-white/15 bg-[#111113]/85 px-1.5 py-0.5 text-[10px] font-semibold text-[#f4f4f5]">
            <Sparkles className="h-2.5 w-2.5 text-amber-300" />
            {badgeLabel}
          </span>
        )}

        {selected && (
          <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground shadow">
            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          </span>
        )}
      </div>

      <span className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-ink">
        {displayTitle}
      </span>
    </button>
  );
}

export interface ShelfCoverPickerModalProps {
  shelf: ShelfGroup | null;
  customCoverBookId: string | null;
  onClose: () => void;
  onCoverChanged?: (shelfName: string, bookId: string | null) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function ShelfCoverPickerModal({
  shelf,
  customCoverBookId,
  onClose,
  onCoverChanged,
  onApiError,
  onNotify,
}: ShelfCoverPickerModalProps) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!shelf) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shelf, saving, onClose]);

  const booksWithCover = useMemo(
    () => (shelf ? shelf.books.filter((book) => Boolean(book.cover_key)) : []),
    [shelf],
  );

  const autoCoverBook = useMemo(
    () => (shelf ? pickShelfCoverBook(shelf) : null),
    [shelf],
  );

  if (!shelf) return null;

  const handleChoose = async (book: Book | null) => {
    if (saving) return;
    const nextBookId = book ? book.id : null;
    if (nextBookId === customCoverBookId) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await setShelfCoverBook(shelf.name, nextBookId);
      onCoverChanged?.(shelf.name, nextBookId);
      onNotify?.(
        book
          ? `Đã đặt bìa "${getBookSortTitle(book)}" làm ảnh bìa kệ "${shelf.name}".`
          : `Đã đặt lại ảnh bìa kệ "${shelf.name}" về mặc định (Tập 1).`,
        'success',
      );
      onClose();
    } catch (err) {
      onApiError?.(err, 'Không thể cập nhật ảnh bìa kệ.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 !m-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shelf-cover-picker-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="moonlit-card fade-in flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Image className="h-5 w-5" />}
            </div>
            <div>
              <h2
                id="shelf-cover-picker-title"
                className="font-display text-lg font-semibold text-ink"
              >
                Chọn ảnh bìa kệ
              </h2>
              <p className="text-xs text-ink-muted">
                Chọn bìa của một tập bất kỳ trong kệ <strong className="text-ink">{shelf.name}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Đóng cửa sổ chọn ảnh bìa kệ"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 scrollbar-thin">
          {booksWithCover.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              Chưa có tập nào trong kệ này có ảnh bìa. Hãy cập nhật ảnh bìa cho ít nhất một tập trước nhé.
            </p>
          ) : (
            <div className="space-y-4">
              {autoCoverBook && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink">
                      Tự động lấy Tập 1 (Mặc định)
                    </p>
                    <p className="truncate text-[11px] text-ink-muted">
                      Hiện tại: {getBookSortTitle(autoCoverBook)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving || customCoverBookId === null}
                    onClick={() => void handleChoose(null)}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      customCoverBookId === null
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-line bg-surface text-ink hover:border-line-strong hover:bg-subtle'
                    } disabled:opacity-60`}
                  >
                    {customCoverBookId === null ? 'Đang dùng mặc định' : 'Đặt về mặc định'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {booksWithCover.map((book) => (
                  <VolumeCoverThumb
                    key={book.id}
                    book={book}
                    selected={customCoverBookId === book.id}
                    badgeLabel={autoCoverBook?.id === book.id ? 'Tập 1' : undefined}
                    disabled={saving}
                    onSelect={() => void handleChoose(book)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
