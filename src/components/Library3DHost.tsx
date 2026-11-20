import { Suspense, lazy, type ComponentType, type LazyExoticComponent, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Library2DView } from '@/components/Library2DView';
import { LibraryHeader } from '@/components/LibraryHeader';
import type { FantasyLibrary3DProps } from '@/components/library3d/FantasyLibrary3D';

let cachedLazyKey = -1;
let cachedLazy3D: LazyExoticComponent<ComponentType<FantasyLibrary3DProps>> | null = null;

function getLazyFantasyLibrary3D(
  retryKey: number,
): LazyExoticComponent<ComponentType<FantasyLibrary3DProps>> {
  if (!cachedLazy3D || cachedLazyKey !== retryKey) {
    cachedLazyKey = retryKey;
    cachedLazy3D = lazy(() =>
      import('@/components/library3d/FantasyLibrary3D').then((mod) => ({
        default: mod.FantasyLibrary3D,
      })),
    );
  }
  return cachedLazy3D;
}

interface Library3DHostProps extends FantasyLibrary3DProps {
  retryKey: number;
}

interface FallbackBridgeProps {
  props: FantasyLibrary3DProps;
  reason: string;
}

function Library3DFallbackBridge({ props, reason }: FallbackBridgeProps) {
  const notifiedRef = useRef(false);
  const { onFallbackTo2D } = props;

  useEffect(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    onFallbackTo2D(reason);
  }, [onFallbackTo2D, reason]);

  return (
    <Library2DView
      books={props.books}
      progress={props.progress}
      storage={props.storage}
      loading={props.loading}
      theme={props.theme}
      viewState={props.viewState}
      canUse3D={props.canUse3D}
      viewMode="2d"
      onChangeViewMode={props.onChangeViewMode}
      onCycleTheme={props.onCycleTheme}
      onRefresh={props.onRefresh}
      onLogout={props.onLogout}
      onOpenBook={props.onOpenBook}
      onUploadClick={props.onUploadClick}
      onEditBook={props.onEditBook}
      onRenameShelf={props.onRenameShelf}
      onMoveSelectedToShelf={props.onMoveSelectedToShelf}
      onDeleteSelected={props.onDeleteSelected}
    />
  );
}

export function Library3DHost({ retryKey, ...libraryProps }: Library3DHostProps) {
  const LazyFantasyLibrary3D = getLazyFantasyLibrary3D(retryKey);

  return (
    <ErrorBoundary
      key={retryKey}
      fallback={() => (
        <Library3DFallbackBridge
          props={libraryProps}
          reason="Không thể tải không gian Thư viện 3D, đã tự động chuyển về chế độ 2D."
        />
      )}
    >
      <Suspense
        fallback={
          <div className="theme-canvas flex min-h-screen flex-col text-ink transition-colors duration-200">
            <LibraryHeader
              storage={libraryProps.storage}
              bookCount={libraryProps.books.length}
              loading={libraryProps.loading}
              theme={libraryProps.theme}
              selectionMode={libraryProps.viewState.selectionMode}
              selectedCount={libraryProps.viewState.selectedIds.size}
              canUse3D={libraryProps.canUse3D}
              viewMode={libraryProps.viewMode}
              onChangeViewMode={libraryProps.onChangeViewMode}
              onCycleTheme={libraryProps.onCycleTheme}
              onUploadClick={libraryProps.onUploadClick}
              onToggleSelectionMode={libraryProps.viewState.toggleSelectionMode}
              onRefresh={libraryProps.onRefresh}
              onLogout={libraryProps.onLogout}
            />
            <div
              className="flex flex-1 flex-col items-center justify-center px-4 text-center"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
              <p className="mt-3 font-display text-base font-semibold text-ink">
                Đang khởi tạo Thư viện 3D...
              </p>
              <button
                type="button"
                onClick={() => libraryProps.onChangeViewMode('2d')}
                className="mt-4 rounded-xl border border-line bg-surface px-4 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
              >
                Chuyển về 2D
              </button>
            </div>
          </div>
        }
      >
        <LazyFantasyLibrary3D {...libraryProps} />
      </Suspense>
    </ErrorBoundary>
  );
}
