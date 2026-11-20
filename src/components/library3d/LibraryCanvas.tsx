import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useThree, type RootState } from '@react-three/fiber';
import * as THREE from 'three';
import type { Book } from '@/types';
import type { AppTheme } from '@/hooks/useTheme';
import {
  getVisibleShelfWindow,
  LIBRARY_3D_CONSTANTS,
  type LibraryLayout3D,
  type VisibleShelfWindow,
} from './layout3d';
import type { CoverTextureCache } from './coverTextureCache';
import { createLibraryMaterialBundle } from './proceduralMaterials';
import { LibraryRoomMesh } from './LibraryRoomMesh';
import { InstancedBooksMesh } from './InstancedBooksMesh';
import { CameraRig } from './CameraRig';

export interface LibraryCanvasProps {
  layout: LibraryLayout3D;
  theme: AppTheme;
  coverTextureCache: CoverTextureCache;
  focusShelfKey: string | null;
  focusNonce: number;
  hoveredBookId: string | null;
  selectedBookId: string | null;
  selectionMode: boolean;
  selectedIds: ReadonlySet<string>;
  prefersReducedMotion: boolean;
  paused?: boolean;
  dimmed?: boolean;
  onHoverBook: (book: Book | null) => void;
  onSelectBook: (book: Book) => void;
  onClearSelection: () => void;
  onVisibleShelfChange?: (centerShelfKey: string | null) => void;
  onFallbackTo2D: (reason: string) => void;
}

const CONTEXT_LOST_GRACE_MS = 2500;

interface SceneContentProps {
  layout: LibraryLayout3D;
  theme: AppTheme;
  coverTextureCache: CoverTextureCache;
  focusShelfKey: string | null;
  focusNonce: number;
  hoveredBookId: string | null;
  selectedBookId: string | null;
  selectionMode: boolean;
  selectedIds: ReadonlySet<string>;
  prefersReducedMotion: boolean;
  isRenderPaused: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  onHoverBook: (book: Book | null) => void;
  onSelectBook: (book: Book) => void;
  onVisibleShelfChange?: (centerShelfKey: string | null) => void;
}

function LibrarySceneContent({
  layout,
  theme,
  coverTextureCache,
  focusShelfKey,
  focusNonce,
  hoveredBookId,
  selectedBookId,
  selectionMode,
  selectedIds,
  prefersReducedMotion,
  isRenderPaused,
  isDraggingRef,
  onHoverBook,
  onSelectBook,
  onVisibleShelfChange,
}: SceneContentProps) {
  const { invalidate, size } = useThree();
  const pausedRef = useRef(isRenderPaused);
  pausedRef.current = isRenderPaused;

  const lanternLightRef = useRef<THREE.PointLight | null>(null);

  const initialCameraX = layout.shelves[0]?.centerX ?? layout.centerX;
  const [cameraX, setCameraX] = useState(initialCameraX);
  const [visibleShelfKeys, setVisibleShelfKeys] = useState<ReadonlySet<string>>(
    () => getVisibleShelfWindow(initialCameraX, layout.shelves, 2).keySet,
  );

  // Create procedural textures & materials once per mount; switch themes in-place with 0 realloc
  const initialThemeRef = useRef(theme);
  const materialBundle = useMemo(
    () => createLibraryMaterialBundle(initialThemeRef.current),
    [],
  );

  useEffect(() => {
    return () => {
      materialBundle.dispose();
    };
  }, [materialBundle]);

  const requestRender = useCallback(() => {
    if (pausedRef.current) return;
    invalidate();
  }, [invalidate]);

  // Apply theme palette in-place and trigger 1 frame render
  useEffect(() => {
    materialBundle.applyTheme(theme);
    requestRender();
  }, [materialBundle, theme, requestRender]);

  // Render 1 sync frame when returning from paused/hidden state or on viewport resize
  useEffect(() => {
    if (!isRenderPaused) {
      invalidate();
    }
  }, [isRenderPaused, size.width, size.height, invalidate]);

  const handleVisibleWindowChange = useCallback(
    (window: VisibleShelfWindow, nextCameraX: number) => {
      setCameraX(nextCameraX);
      setVisibleShelfKeys(window.keySet);
      const centerShelf =
        window.centerIndex >= 0 ? layout.shelves[window.centerIndex] : undefined;
      onVisibleShelfChange?.(centerShelf?.key ?? null);
    },
    [layout.shelves, onVisibleShelfChange],
  );

  return (
    <>
      <CameraRig
        layout={layout}
        focusShelfKey={focusShelfKey}
        focusNonce={focusNonce}
        prefersReducedMotion={prefersReducedMotion}
        paused={isRenderPaused}
        isDraggingRef={isDraggingRef}
        lanternLightRef={lanternLightRef}
        requestRender={requestRender}
        onVisibleWindowChange={handleVisibleWindowChange}
      />

      <LibraryRoomMesh
        layout={layout}
        theme={theme}
        materialBundle={materialBundle}
        lanternLightRef={lanternLightRef}
      />

      <InstancedBooksMesh
        layout={layout}
        theme={theme}
        materialBundle={materialBundle}
        coverTextureCache={coverTextureCache}
        cameraX={cameraX}
        visibleShelfKeys={visibleShelfKeys}
        hoveredBookId={hoveredBookId}
        selectedBookId={selectedBookId}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        prefersReducedMotion={prefersReducedMotion}
        paused={isRenderPaused}
        isDraggingRef={isDraggingRef}
        requestRender={requestRender}
        onHoverBook={onHoverBook}
        onSelectBook={onSelectBook}
      />
    </>
  );
}

/**
 * Demand-rendered WebGL Canvas container (`frameloop="demand"`) with WebGL context-loss
 * recovery/fallback, tab-visibility & pause gating, and deterministic GPU cleanup.
 */
export function LibraryCanvas({
  layout,
  theme,
  coverTextureCache,
  focusShelfKey,
  focusNonce,
  hoveredBookId,
  selectedBookId,
  selectionMode,
  selectedIds,
  prefersReducedMotion,
  paused = false,
  dimmed = false,
  onHoverBook,
  onSelectBook,
  onClearSelection,
  onVisibleShelfChange,
  onFallbackTo2D,
}: LibraryCanvasProps) {
  const [isDocumentHidden, setIsDocumentHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );

  const canvasCleanupRef = useRef<(() => void) | null>(null);
  const contextLossCountRef = useRef(0);
  const isDraggingRef = useRef(false);
  const onFallbackRef = useRef(onFallbackTo2D);
  onFallbackRef.current = onFallbackTo2D;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibility = () => {
      setIsDocumentHidden(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    return () => {
      canvasCleanupRef.current?.();
      canvasCleanupRef.current = null;
    };
  }, []);

  const handleCanvasCreated = useCallback((state: RootState) => {
    canvasCleanupRef.current?.();

    const { gl, invalidate } = state;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;

    const domElement = gl.domElement;
    let restoreTimer: number | null = null;

    const clearRestoreTimer = () => {
      if (restoreTimer !== null) {
        window.clearTimeout(restoreTimer);
        restoreTimer = null;
      }
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLossCountRef.current += 1;
      clearRestoreTimer();

      if (contextLossCountRef.current >= 2) {
        onFallbackRef.current(
          'Ngữ cảnh đồ họa WebGL bị gián đoạn nhiều lần, đã chuyển về chế độ 2D.',
        );
        return;
      }

      restoreTimer = window.setTimeout(() => {
        restoreTimer = null;
        onFallbackRef.current(
          'Ngữ cảnh đồ họa WebGL bị gián đoạn, đã chuyển về chế độ 2D.',
        );
      }, CONTEXT_LOST_GRACE_MS);
    };

    const handleContextRestored = () => {
      clearRestoreTimer();
      invalidate();
    };

    domElement.addEventListener('webglcontextlost', handleContextLost, false);
    domElement.addEventListener('webglcontextrestored', handleContextRestored, false);

    canvasCleanupRef.current = () => {
      clearRestoreTimer();
      domElement.removeEventListener('webglcontextlost', handleContextLost, false);
      domElement.removeEventListener('webglcontextrestored', handleContextRestored, false);
    };
  }, []);

  const isRenderPaused = paused || isDocumentHidden;
  const initialCameraX = layout.shelves[0]?.centerX ?? layout.centerX;

  return (
    <div
      className={`absolute inset-0 z-0 transition-[filter] duration-200 ${
        paused ? 'pointer-events-none' : 'pointer-events-auto'
      } ${dimmed ? 'blur-[6px] brightness-[0.65]' : ''}`}
      aria-label="Không gian Thư viện 3D"
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        shadows={false}
        camera={{
          fov: 46,
          near: 0.1,
          far: 60,
          position: [
            initialCameraX,
            LIBRARY_3D_CONSTANTS.EYE_LEVEL_Y,
            LIBRARY_3D_CONSTANTS.CAMERA_Z,
          ],
        }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: true,
          alpha: false,
        }}
        onCreated={handleCanvasCreated}
        onPointerMissed={() => {
          if (!isDraggingRef.current) onClearSelection();
        }}
      >
        <LibrarySceneContent
          layout={layout}
          theme={theme}
          coverTextureCache={coverTextureCache}
          focusShelfKey={focusShelfKey}
          focusNonce={focusNonce}
          hoveredBookId={hoveredBookId}
          selectedBookId={selectedBookId}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          prefersReducedMotion={prefersReducedMotion}
          isRenderPaused={isRenderPaused}
          isDraggingRef={isDraggingRef}
          onHoverBook={onHoverBook}
          onSelectBook={onSelectBook}
          onVisibleShelfChange={onVisibleShelfChange}
        />
      </Canvas>
    </div>
  );
}
