import { useEffect, useRef, useState } from 'react';
import {
  BookMarked,
  ImagePlus,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { Book, StorageStats } from '@/types';
import { formatBytes, updateBookCover, updateBookMetadata } from '@/lib/api';
import { getBookSortTitle, getDisplayAuthor } from '@/lib/bookMetadata';
import { useCoverUrl } from '@/hooks/useCoverUrl';
import type { ToastType } from '@/hooks/useToast';

const MAX_RAW_COVER_BYTES = 15 * 1024 * 1024;

interface BookEditModalProps {
  book: Book | null;
  existingShelves: string[];
  onClose: () => void;
  onUpdated: (book: Book, storage?: StorageStats) => void;
  onRequestDelete: (book: Book) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function BookEditModal({
  book,
  existingShelves,
  onClose,
  onUpdated,
  onRequestDelete,
  onApiError,
  onNotify,
}: BookEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [shelf, setShelf] = useState('');
  const [description, setDescription] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Đồng bộ form mỗi khi đổi cuốn sách đang sửa
  useEffect(() => {
    if (!book) {
      setCoverFile(null);
      setCoverError(null);
      return;
    }
    setTitle(getBookSortTitle(book));
    setAuthor(getDisplayAuthor(book.author, book.title));
    setShelf(book.shelf);
    setDescription(book.description ?? '');
    setCoverFile(null);
    setCoverError(null);
  }, [book]);

  // Tạo & thu hồi ObjectURL cho ảnh bìa mới chọn từ máy
  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [coverFile]);

  useEffect(() => {
    if (!book) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [book, saving, onClose]);

  const currentCoverUrl = useCoverUrl(book?.cover_key ?? null, Boolean(book && !coverFile));

  if (!book) return null;

  const displayedCoverUrl = coverPreviewUrl || currentCoverUrl;

  const handleSelectCover = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCoverError('Vui lòng chọn tệp hình ảnh (JPG, PNG, WebP...).');
      return;
    }
    if (file.size > MAX_RAW_COVER_BYTES) {
      setCoverError('Ảnh gốc quá lớn (tối đa 15 MB trước khi nén).');
      return;
    }
    setCoverError(null);
    setCoverFile(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const nextTitle = title.trim();
    if (!nextTitle) {
      onNotify('Tên sách không được để trống.', 'warning');
      return;
    }
    const nextAuthor = author.trim() || 'Không rõ tác giả';
    const nextShelf = shelf.trim() || 'Kho chưa phân loại';
    const nextDescription = description.trim() ? description.trim() : null;

    const metadataChanged =
      nextTitle !== book.title ||
      nextAuthor !== book.author ||
      nextShelf !== book.shelf ||
      nextDescription !== (book.description ?? null);

    if (!metadataChanged && !coverFile) {
      onClose();
      return;
    }

    setSaving(true);
    let latestBook = book;
    let updatedStorage: StorageStats | undefined;

    try {
      if (metadataChanged) {
        latestBook = await updateBookMetadata(book.id, {
          title: nextTitle,
          author: nextAuthor,
          shelf: nextShelf,
          description: nextDescription,
        });
      }

      if (coverFile) {
        const coverResult = await updateBookCover(latestBook, coverFile);
        latestBook = coverResult.book;
        updatedStorage = coverResult.storage;
      }

      onUpdated(latestBook, updatedStorage);
      onNotify(
        coverFile && !metadataChanged
          ? `Đã cập nhật ảnh bìa cho "${latestBook.title}".`
          : `Đã lưu thay đổi cho "${latestBook.title}".`,
        'success',
      );
      onClose();
    } catch (err) {
      if (latestBook !== book) {
        onUpdated(latestBook, updatedStorage);
      }
      onApiError(err, 'Không thể cập nhật thông tin sách.');
    } finally {
      setSaving(false);
    }
  };

  const shelfSuggestions = existingShelves.filter(
    (item) => item.toLocaleLowerCase('vi') !== shelf.trim().toLocaleLowerCase('vi'),
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-book-modal-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="moonlit-card fade-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <BookMarked className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="edit-book-modal-title" className="font-display text-lg font-semibold text-ink">
                Chỉnh sửa thông tin sách
              </h2>
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                {book.file_type} · {formatBytes((book.file_size || 0) + (book.cover_size || 0))}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Đóng cửa sổ chỉnh sửa"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
            <div className="grid gap-5 sm:grid-cols-[9.5rem_1fr]">
              {/* Cột ảnh bìa */}
              <div className="flex flex-col items-center gap-2.5">
                <div className="relative aspect-[7/10] w-36 overflow-hidden rounded-xl border border-line bg-subtle shadow-sm sm:w-full">
                  {displayedCoverUrl ? (
                    <img
                      src={displayedCoverUrl}
                      alt={title || book.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      style={{ backgroundColor: book.cover_color }}
                      className="flex h-full w-full flex-col justify-between p-3 text-[#f6efe2]"
                    >
                      <p className="line-clamp-4 font-display text-xs font-semibold leading-snug">
                        {title || book.title}
                      </p>
                      <p className="truncate text-[10px] opacity-85">{author || book.author}</p>
                    </div>
                  )}
                  {coverFile && (
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                      Bìa mới
                    </span>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSelectCover}
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex w-36 items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-50 sm:w-full"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-accent" />
                  Đổi ảnh bìa
                </button>

                {coverFile && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setCoverFile(null);
                      setCoverError(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Dùng lại bìa cũ
                  </button>
                )}

                {coverError && (
                  <p className="text-center text-[11px] text-red-700 dark:text-red-400">
                    {coverError}
                  </p>
                )}
                <p className="text-center text-[11px] text-ink-faint">
                  Tự nén JPEG giữ tỉ lệ gốc (~40 KB)
                </p>
              </div>

              {/* Cột metadata */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="edit-book-title" className="block text-xs font-medium text-ink-muted">
                    Tên sách <span className="text-red-700 dark:text-red-400">*</span>
                  </label>
                  <input
                    id="edit-book-title"
                    type="text"
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    disabled={saving}
                    placeholder="Nhập tên sách..."
                    className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="edit-book-author" className="block text-xs font-medium text-ink-muted">
                      Tác giả
                    </label>
                    {author.trim() && author.trim() !== 'Không rõ tác giả' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setTitle(`${title.trim()} - ${author.trim()}`);
                          setAuthor('Không rõ tác giả');
                        }}
                        className="text-[11px] font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                      >
                        ⇄ Ghép vào sau Tên sách
                      </button>
                    )}
                  </div>
                  <input
                    id="edit-book-author"
                    type="text"
                    value={author}
                    onChange={(event) => setAuthor(event.target.value)}
                    disabled={saving}
                    placeholder="Không rõ tác giả"
                    className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="edit-book-shelf" className="block text-xs font-medium text-ink-muted">
                    Kệ sách
                  </label>
                  <input
                    id="edit-book-shelf"
                    type="text"
                    list="existing-shelves-datalist"
                    value={shelf}
                    onChange={(event) => setShelf(event.target.value)}
                    disabled={saving}
                    placeholder="Kho chưa phân loại"
                    className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
                  />
                  <datalist id="existing-shelves-datalist">
                    {existingShelves.map((shelfOption) => (
                      <option key={shelfOption} value={shelfOption} />
                    ))}
                  </datalist>

                  {shelfSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {shelfSuggestions.slice(0, 6).map((shelfOption) => (
                        <button
                          key={shelfOption}
                          type="button"
                          disabled={saving}
                          onClick={() => setShelf(shelfOption)}
                          className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[11px] text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-50"
                        >
                          {shelfOption}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="edit-book-description"
                    className="block text-xs font-medium text-ink-muted"
                  >
                    Mô tả / Ghi chú
                  </label>
                  <textarea
                    id="edit-book-description"
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={saving}
                    placeholder="Thêm tóm tắt nội dung hoặc ghi chú cá nhân..."
                    className="w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => onRequestDelete(book)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-700/30 bg-red-600/10 px-3 py-2 text-xs font-medium text-red-800 transition-colors hover:bg-red-600/20 disabled:opacity-45 dark:border-red-400/30 dark:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xoá sách
            </button>

            <div className="flex items-center gap-2">
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
                disabled={saving || !title.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-45 dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Lưu thay đổi
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
