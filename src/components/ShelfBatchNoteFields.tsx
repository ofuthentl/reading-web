import type { Book } from '@/types';
import { getBookSortTitle } from '@/lib/bookMetadata';

export type ShelfBatchMode = 'shared' | 'per-volume' | 'author';

export interface ShelfBatchNoteFieldsProps {
  mode: ShelfBatchMode;
  shelfName: string;
  totalBooksCount: number;
  missingBooksCount: number;
  missingAuthorCount: number;
  targetAuthorCount: number;
  knownAuthorsInShelf: string[];
  listedVolumes: Book[];
  sharedText: string;
  overwriteExisting: boolean;
  showAllVolumes: boolean;
  draftById: Record<string, string>;
  authorInput: string;
  onlyMissingAuthor: boolean;
  disabled: boolean;
  onChangeSharedText: (value: string) => void;
  onChangeOverwriteExisting: (next: boolean) => void;
  onChangeShowAllVolumes: (next: boolean) => void;
  onChangeVolumeDraft: (bookId: string, value: string) => void;
  onChangeAuthorInput: (value: string) => void;
  onChangeOnlyMissingAuthor: (next: boolean) => void;
}

export function ShelfBatchNoteFields({
  mode,
  shelfName,
  totalBooksCount,
  missingBooksCount,
  missingAuthorCount,
  targetAuthorCount,
  knownAuthorsInShelf,
  listedVolumes,
  sharedText,
  overwriteExisting,
  showAllVolumes,
  draftById,
  authorInput,
  onlyMissingAuthor,
  disabled,
  onChangeSharedText,
  onChangeOverwriteExisting,
  onChangeShowAllVolumes,
  onChangeVolumeDraft,
  onChangeAuthorInput,
  onChangeOnlyMissingAuthor,
}: ShelfBatchNoteFieldsProps) {
  if (mode === 'author') {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="shelf-batch-author-input"
            className="block text-xs font-medium text-ink-muted"
          >
            Tên tác giả đồng bộ cho bộ truyện
          </label>
          <input
            id="shelf-batch-author-input"
            type="text"
            value={authorInput}
            onChange={(e) => onChangeAuthorInput(e.target.value)}
            disabled={disabled}
            placeholder="Ví dụ: Wataru Watari, Honobu Yonezawa..."
            className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
          />

          {knownAuthorsInShelf.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-ink-faint">Đã có trong kệ:</span>
              {knownAuthorsInShelf.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChangeAuthorInput(name)}
                  className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[11px] text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-50"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {missingAuthorCount > 0 && missingAuthorCount < totalBooksCount && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-canvas/70 px-3.5 py-2.5 text-xs text-ink">
            <input
              type="checkbox"
              checked={onlyMissingAuthor}
              disabled={disabled}
              onChange={(e) => onChangeOnlyMissingAuthor(e.target.checked)}
              className="h-4 w-4 rounded accent-current"
            />
            <span>
              Chỉ điền cho <strong>{missingAuthorCount} tập chưa rõ tác giả</strong> (bỏ chọn để
              đồng bộ toàn bộ {totalBooksCount} tập)
            </span>
          </label>
        )}

        <p className="text-xs leading-relaxed text-ink-muted">
          Sẽ cập nhật tên tác giả cho <strong className="text-ink">{targetAuthorCount}</strong> /{' '}
          {totalBooksCount} tập trong kệ <strong>{shelfName}</strong> (giữ nguyên toàn bộ tên tập và
          số tập của từng cuốn).
        </p>
      </div>
    );
  }

  if (mode === 'shared') {
    return (
      <>
        <div className="space-y-1.5">
          <label htmlFor="shared-shelf-note" className="block text-xs font-medium text-ink-muted">
            Nội dung giới thiệu / ghi chú áp dụng cho bộ truyện
          </label>
          <textarea
            id="shared-shelf-note"
            rows={6}
            value={sharedText}
            onChange={(e) => onChangeSharedText(e.target.value)}
            disabled={disabled}
            placeholder="Dán tóm tắt cốt truyện hoặc ghi chú chung cho các tập chưa có trong bộ này..."
            className="w-full resize-y rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-canvas/70 px-3.5 py-2.5 text-xs text-ink">
          <input
            type="checkbox"
            checked={!overwriteExisting}
            disabled={disabled || missingBooksCount === 0}
            onChange={(e) => onChangeOverwriteExisting(!e.target.checked)}
            className="h-4 w-4 rounded accent-current"
          />
          <span>
            Chỉ điền vào <strong>{missingBooksCount} tập chưa có ghi chú</strong> (giữ nguyên các
            tập đã viết riêng)
          </span>
        </label>
      </>
    );
  }

  return (
    <div className="space-y-3.5">
      {missingBooksCount < totalBooksCount && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={showAllVolumes}
            disabled={disabled}
            onChange={(e) => onChangeShowAllVolumes(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-current"
          />
          <span>Hiện cả các tập đã có ghi chú ({totalBooksCount} tập)</span>
        </label>
      )}

      {listedVolumes.length === 0 ? (
        <p className="rounded-xl border border-line bg-canvas px-4 py-6 text-center text-xs text-ink-muted">
          Tất cả các tập trong kệ này đều đã có ghi chú. Tick tuỳ chọn bên trên nếu bạn muốn chỉnh
          sửa lại.
        </p>
      ) : (
        listedVolumes.map((book) => (
          <div key={book.id} className="space-y-1.5 rounded-xl border border-line bg-canvas/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`vol-note-${book.id}`}
                className="truncate text-xs font-semibold text-ink"
              >
                {getBookSortTitle(book)}
              </label>
              <span className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] uppercase text-ink-muted">
                {book.file_type}
              </span>
            </div>
            <textarea
              id={`vol-note-${book.id}`}
              rows={2}
              value={draftById[book.id] ?? ''}
              onChange={(e) => onChangeVolumeDraft(book.id, e.target.value)}
              disabled={disabled}
              placeholder="Nhập ghi chú / tóm tắt cho tập này..."
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent disabled:opacity-60"
            />
          </div>
        ))
      )}
    </div>
  );
}
