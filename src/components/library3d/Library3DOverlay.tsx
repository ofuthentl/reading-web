import { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  FolderInput,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Book, ReadingProgress, StorageStats, ViewMode } from '@/types';
import { pickCoverColor } from '@/lib/bookMetadata';
import { LibraryHeader } from '@/components/LibraryHeader';
import { useCoverUrl } from '@/hooks/useCoverUrl';
import {
  computeBookProgressPercent,
  type LibraryViewState,
} from '@/hooks/useLibraryViewState';
import type { AppTheme } from '@/hooks/useTheme';
import { BookInspectCard } from './BookInspectCard';
import type { FloorWorldLayout3D, WorldNpcSpec3D, WorldStation3D } from './worldTypes';
import type { ActiveWorldPrompt } from './PlayerRig';
import { WorldInteractToast, WorldQuickBar } from './WorldQuickBar';

interface ContinueReadingRowProps {
  book: Book;
  progress?: ReadingProgress;
  onOpen: (book: Book) => void;
}

function ContinueReadingRow({ book, progress, onOpen }: ContinueReadingRowProps) {
  const coverUrl = useCoverUrl(book.cover_key, true);
  const percent = computeBookProgressPercent(book, progress);
  const fallbackColor = book.cover_color || pickCoverColor(book.id);

  return (
    <button
      type="button"
      onClick={() => onOpen(book)}
      className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-left transition-colors hover:border-line hover:bg-subtle"
    >
      <div
        className="h-10 w-7 shrink-0 overflow-hidden rounded border border-line"
        style={{ backgroundColor: coverUrl ? undefined : fallbackColor }}
      >
        {coverUrl && (
          <img src={coverUrl} alt={book.title} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink">{book.title}</p>
        <p className="truncate text-[11px] text-ink-muted">
          {book.shelf}
          {percent !== null ? ` · ${percent}%` : ''}
        </p>
      </div>
    </button>
  );
}

export interface Library3DOverlayProps {
  books: Book[];
  progress: Record<string, ReadingProgress>;
  storage: StorageStats | null;
  loading: boolean;
  theme: AppTheme;
  viewState: LibraryViewState;
  canUse3D: boolean;
  viewMode: ViewMode;
  paused: boolean;
  floors: readonly FloorWorldLayout3D[];
  activeFloorIndex: number;
  firstPerson: boolean;
  activePrompt: ActiveWorldPrompt | null;
  activeDialogue: WorldNpcSpec3D | null;
  selectedBook: Book | null;
  hoveredBook: Book | null;
  onSelectFloor: (floorIndex: number) => void;
  onToggleFirstPerson: () => void;
  onTriggerStation: (station: WorldStation3D) => void;
  onTriggerNpc: (npc: WorldNpcSpec3D) => void;
  onCloseDialogue: () => void;
  onClearSelectedBook: () => void;
  onCycleTheme: (origin?: { x: number; y: number }) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenBook: (book: Book) => void;
  onUploadClick: () => void;
  onEditBook?: (book: Book) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
}

/**
 * Complete HTML HUD overlay for FantasyLibrary3D (Header z-30, controls & cards strictly <= z-20
 * so all 5 App modals at z-40 and ToastContainer at z-50 stay cleanly on top).
 */
export function Library3DOverlay({
  books,
  progress,
  storage,
  loading,
  theme,
  viewState,
  canUse3D,
  viewMode,
  paused,
  floors,
  activeFloorIndex,
  firstPerson,
  activePrompt,
  activeDialogue,
  selectedBook,
  hoveredBook,
  onSelectFloor,
  onToggleFirstPerson,
  onTriggerStation,
  onTriggerNpc,
  onCloseDialogue,
  onClearSelectedBook,
  onCycleTheme,
  onChangeViewMode,
  onRefresh,
  onLogout,
  onOpenBook,
  onUploadClick,
  onEditBook,
  onMoveSelectedToShelf,
  onDeleteSelected,
}: Library3DOverlayProps) {
  const [continueOpen, setContinueOpen] = useState(false);

  const {
    selectionMode,
    selectedIds,
    continueReadingBooks,
    filteredBooks,
    selectedBooks,
    toggleSelectionMode,
    toggleSelectBook,
    selectAllVisible,
    clearSelection,
    clearFilters,
  } = viewState;

  const activeFocusBook = selectedBook ?? hoveredBook;
  const allVisibleSelected =
    filteredBooks.length > 0 && selectedIds.size === filteredBooks.length;

  return (
    <>
      <LibraryHeader
        storage={storage}
        bookCount={books.length}
        loading={loading}
        theme={theme}
        selectionMode={selectionMode}
        selectedCount={selectedIds.size}
        canUse3D={canUse3D}
        viewMode={viewMode}
        onChangeViewMode={onChangeViewMode}
        onCycleTheme={onCycleTheme}
        onUploadClick={onUploadClick}
        onToggleSelectionMode={toggleSelectionMode}
        onRefresh={onRefresh}
        onLogout={onLogout}
      />

      {!paused && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 top-16 z-20 flex flex-col justify-between p-4 sm:px-6">
          {/* Top floating controls: compact floor switcher only (keeps 3D world view wide open) */}
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2">
            <WorldQuickBar
              floors={floors}
              activeFloorIndex={activeFloorIndex}
              firstPerson={firstPerson}
              onSelectFloor={onSelectFloor}
              onToggleFirstPerson={onToggleFirstPerson}
            />

            {/* Thanh thao tác chọn nhiều (dùng chung BulkShelfModal & DeleteConfirmModal) */}
            {selectionMode && (
              <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent/50 bg-surface/95 px-3.5 py-2 shadow-md backdrop-blur-md">
                <p className="text-xs text-ink sm:text-sm">
                  Đã chọn <strong className="text-accent">{selectedIds.size}</strong> /{' '}
                  {filteredBooks.length} cuốn sách
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={filteredBooks.length === 0}
                    onClick={allVisibleSelected ? clearSelection : selectAllVisible}
                    className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-50"
                  >
                    {allVisibleSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                  {onMoveSelectedToShelf && (
                    <button
                      type="button"
                      disabled={selectedBooks.length === 0}
                      onClick={() => onMoveSelectedToShelf(selectedBooks)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/30 bg-red-600/10 px-2.5 py-1.5 text-xs font-medium text-red-800 transition-colors hover:bg-red-600/20 disabled:opacity-45 dark:border-red-400/30 dark:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xoá đã chọn ({selectedBooks.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleSelectionMode}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                  >
                    Xong
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Center status states: initial loading, empty library, or empty filter */}
          <div className="flex flex-1 items-center justify-center">
            {loading && books.length === 0 ? (
              <div
                role="status"
                aria-live="polite"
                className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl border border-line-strong/80 bg-surface/95 px-4 py-2.5 text-xs font-medium text-ink shadow-lg backdrop-blur-md"
              >
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span>Đang tải kho sách vào đại sảnh...</span>
              </div>
            ) : books.length === 0 ? (
              <section className="pointer-events-auto flex max-w-sm flex-col items-center rounded-2xl border border-line-strong/80 bg-surface/95 px-6 py-8 text-center shadow-xl backdrop-blur-md">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-subtle text-accent">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h2 className="font-display text-lg font-semibold text-ink">
                  Đại sảnh sách còn trống
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                  Tải lên sách EPUB, PDF hoặc DOCX để bày lên các kệ gỗ cổ điển của bạn.
                </p>
                <button
                  type="button"
                  onClick={onUploadClick}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Tải sách đầu tiên
                </button>
              </section>
            ) : filteredBooks.length === 0 ? (
              <section className="pointer-events-auto flex max-w-sm flex-col items-center rounded-2xl border border-line-strong/80 bg-surface/95 px-6 py-6 text-center shadow-xl backdrop-blur-md">
                <p className="font-display text-base font-semibold text-ink">
                  Không tìm thấy cuốn sách phù hợp
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Thử xoá bộ lọc hoặc nhập từ khoá khác để xem lại toàn bộ kệ.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3.5 rounded-xl bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  Xoá lọc
                </button>
              </section>
            ) : null}
          </div>

          {/* Bottom dock: Collapsible Continue Reading (left) · Hint (center) · BookInspectCard (right) */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col items-start gap-2">
              {continueReadingBooks.length > 0 && (
                <div className="pointer-events-auto w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line-strong/80 bg-surface/95 shadow-xl backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setContinueOpen((prev) => !prev)}
                    aria-expanded={continueOpen}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-subtle"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-accent" />
                      Tiếp tục đọc ({continueReadingBooks.length})
                    </span>
                    {continueOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
                    ) : (
                      <ChevronUp className="h-3.5 w-3.5 text-ink-muted" />
                    )}
                  </button>
                  {continueOpen && (
                    <div className="max-h-56 space-y-1 overflow-y-auto border-t border-line/70 p-1.5">
                      {continueReadingBooks.slice(0, 6).map((book) => (
                        <ContinueReadingRow
                          key={book.id}
                          book={book}
                          progress={progress[book.id]}
                          onOpen={onOpenBook}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-2">
              <WorldInteractToast
                prompt={activePrompt}
                activeDialogue={activeDialogue}
                onTriggerStation={onTriggerStation}
                onTriggerNpc={onTriggerNpc}
                onCloseDialogue={onCloseDialogue}
              />
              <p className="hidden rounded-full border border-line-strong/70 bg-surface/90 px-3.5 py-1 text-[11px] font-medium text-ink-muted shadow-sm backdrop-blur-sm xl:block">
                WASD đi dạo · Shift chạy · Kéo chuột xoay 360° · Cuộn zoom · V góc nhìn · E tương tác
              </p>
            </div>

            <div className="flex justify-end">
              {activeFocusBook && (
                <BookInspectCard
                  book={activeFocusBook}
                  progress={progress[activeFocusBook.id]}
                  pinned={selectedBook !== null}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(activeFocusBook.id)}
                  onOpenBook={onOpenBook}
                  onToggleSelect={toggleSelectBook}
                  onEditBook={onEditBook}
                  onClose={onClearSelectedBook}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
