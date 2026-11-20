import { Box, LayoutGrid, Library, Sparkles, Upload } from 'lucide-react';
import type { Book, ReadingProgress, StorageStats, ViewMode } from '@/types';
import { LibraryHeader } from '@/components/LibraryHeader';
import type { LibraryViewState } from '@/hooks/useLibraryViewState';
import type { AppTheme } from '@/hooks/useTheme';

export interface FantasyLibrary3DProps {
  books: Book[];
  progress: Record<string, ReadingProgress>;
  storage: StorageStats | null;
  loading: boolean;
  theme: AppTheme;
  viewState: LibraryViewState;
  canUse3D: boolean;
  viewMode: ViewMode;
  prefersReducedMotion: boolean;
  paused?: boolean;
  dimmed?: boolean;
  onCycleTheme: (origin?: { x: number; y: number }) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onFallbackTo2D: (reason: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenBook: (book: Book) => void;
  onUploadClick: () => void;
  onEditBook?: (book: Book) => void;
  onRenameShelf?: (shelfName: string) => void;
  onMoveSelectedToShelf?: (selectedBooks: Book[]) => void;
  onDeleteSelected?: (selectedBooks: Book[]) => void;
}

/**
 * Lightweight lazy shell for Sub-phase 4A.1 (zero Three.js imports yet).
 * Will be replaced by the demand-rendered WebGL scene + HTML overlay in 4A.3–4A.4.
 */
export function FantasyLibrary3D({
  books,
  storage,
  loading,
  theme,
  viewState,
  canUse3D,
  viewMode,
  prefersReducedMotion,
  onCycleTheme,
  onChangeViewMode,
  onRefresh,
  onLogout,
  onOpenBook,
  onUploadClick,
}: FantasyLibrary3DProps) {
  const sampleBooks = viewState.filteredBooks.slice(0, 4);

  return (
    <div className="theme-canvas flex min-h-screen flex-col text-ink transition-colors duration-200">
      <LibraryHeader
        storage={storage}
        bookCount={books.length}
        loading={loading}
        theme={theme}
        selectionMode={viewState.selectionMode}
        selectedCount={viewState.selectedIds.size}
        canUse3D={canUse3D}
        viewMode={viewMode}
        onChangeViewMode={onChangeViewMode}
        onCycleTheme={onCycleTheme}
        onUploadClick={onUploadClick}
        onToggleSelectionMode={viewState.toggleSelectionMode}
        onRefresh={onRefresh}
        onLogout={onLogout}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <section className="moonlit-card fade-in w-full rounded-2xl border border-line bg-surface p-6 text-center shadow-sm sm:p-8 dark:border-line-strong/70">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-subtle text-accent">
            <Box className="h-7 w-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>Sub-phase 4A.1 · Vỏ nạp lười 3D (D-008)</span>
          </div>

          <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
            Không gian Thư viện 3D đã sẵn sàng kết nối
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
            Thiết bị của bạn đã vượt qua đủ 3 điều kiện phần cứng (viewport &ge; 1024px, chuột/touchpad
            chính xác, WebGL tăng tốc phần cứng). Cảnh 3D procedural sẽ được dựng ở Sub-phase 4A.2–4A.4.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="text-xs text-ink-muted">Tổng kho sách</p>
              <p className="mt-1 font-display text-lg font-semibold text-ink">
                {books.length} cuốn · {viewState.allShelves.length} kệ
              </p>
            </div>
            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="text-xs text-ink-muted">Ngữ cảnh dùng chung</p>
              <p className="mt-1 truncate text-sm font-medium text-ink">
                {viewState.isFiltering
                  ? `Đang lọc: ${viewState.filteredBooks.length} cuốn`
                  : 'Hiển thị toàn bộ thư viện'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="text-xs text-ink-muted">Chuyển động</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {prefersReducedMotion ? 'Giảm chuyển động (Reduced)' : 'Tiêu chuẩn'}
              </p>
            </div>
          </div>

          {sampleBooks.length > 0 && (
            <div className="mt-6 rounded-xl border border-line bg-canvas p-4 text-left">
              <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-ink-muted">
                <Library className="h-3.5 w-3.5 text-accent" />
                <span>Mở nhanh sách để kiểm tra luồng đọc &amp; modal trên nền 3D</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sampleBooks.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => onOpenBook(book)}
                    className="max-w-full truncate rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
                  >
                    {book.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onChangeViewMode('2d')}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              <LayoutGrid className="h-4 w-4" />
              Chuyển về Thư viện 2D
            </button>
            <button
              type="button"
              onClick={onUploadClick}
              className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-canvas px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-subtle"
            >
              <Upload className="h-4 w-4" />
              Thử mở modal Tải sách
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
