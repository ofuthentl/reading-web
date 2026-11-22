import { FolderInput, Trash2 } from 'lucide-react';
import type { Book } from '@/types';

export interface BulkSelectionBarProps {
  selectedCount: number;
  totalVisibleCount: number;
  unitLabel?: string;
  allSelected: boolean;
  selectedBooks: Book[];
  onToggleSelectAll: () => void;
  onMoveSelected?: (books: Book[]) => void;
  onDeleteSelected?: (books: Book[]) => void;
  onDone: () => void;
}

export function BulkSelectionBar({
  selectedCount,
  totalVisibleCount,
  unitLabel = 'cuốn sách',
  allSelected,
  selectedBooks,
  onToggleSelectAll,
  onMoveSelected,
  onDeleteSelected,
  onDone,
}: BulkSelectionBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 shadow-sm">
      <p className="text-sm text-ink">
        Đã chọn <strong className="text-accent">{selectedCount}</strong> / {totalVisibleCount}{' '}
        {unitLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleSelectAll}
          disabled={totalVisibleCount === 0}
          className="rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-50"
        >
          {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
        </button>

        {onMoveSelected && (
          <button
            type="button"
            disabled={selectedBooks.length === 0}
            onClick={() => onMoveSelected(selectedBooks)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
          >
            <FolderInput className="h-3.5 w-3.5" />
            Chuyển kệ ({selectedBooks.length})
          </button>
        )}

        {onDeleteSelected && (
          <button
            type="button"
            disabled={selectedBooks.length === 0}
            onClick={() => onDeleteSelected(selectedBooks)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/30 bg-red-600/10 px-3 py-1.5 text-xs font-medium text-red-800 transition-colors hover:bg-red-600/20 disabled:opacity-45 dark:border-red-400/30 dark:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xoá đã chọn ({selectedBooks.length})
          </button>
        )}

        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Xong
        </button>
      </div>
    </div>
  );
}
