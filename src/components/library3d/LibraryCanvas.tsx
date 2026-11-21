import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useThree, type RootState } from '@react-three/fiber';
import * as THREE from 'three';
import type { Book } from '@/types';
import type { AppTheme } from '@/hooks/useTheme';
import {
  getFloorActiveLibraryLayout,
  getVisibleFloorBookcases,
  type FloorWorldLayout3D,
  type WorldNpcSpec3D,
  type WorldStation3D,
} from './floorWorldLayout3d';
import type { CoverTextureCache } from './coverTextureCache';
import { createLibraryMaterialBundle } from './proceduralMaterials';
import { createWorldMaterialBundle } from './worldMaterials';
import { WorldBiomeMesh } from './WorldBiomeMesh';
import { BiomePropsMesh } from './BiomePropsMesh';
import { InstancedBooksMesh } from './InstancedBooksMesh';
import { KiritoAvatar, type PlayerMotionState } from './KiritoAvatar';
import { AmbientNpcs } from './AmbientNpcs';
import { InteractiveStations } from './InteractiveStations';
import {
  PlayerRig,
  type ActiveWorldPrompt,
  type TeleportCommand,
} from './PlayerRig';
import type { WorldTelemetryRefs } from './worldTypes';

export interface LibraryCanvasProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  coverTextureCache: CoverTextureCache;
  firstPerson: boolean;
  bossDoorUnlocked?: boolean;
  activeStationId?: string | null;
  telemetryRefs?: WorldTelemetryRefs;
  teleportCommand: TeleportCommand | null;
  hoveredBookId: string | null;
  selectedBookId: string | null;
  selectionMode: boolean;
  selectedIds: ReadonlySet<string>;
  prefersReducedMotion: boolean;
  paused?: boolean;
  dimmed?: boolean;
  onToggleFirstPerson: () => void;
  onInteractStation: (station: WorldStation3D) => void;
  onInteractNpc: (npc: WorldNpcSpec3D) => void;
  onActivePromptChange: (prompt: ActiveWorldPrompt | null) => void;
  onFootstepTick?: (dt: number, speed: number, isRunning: boolean) => void;
  onHoverBook: (book: Book | null) => void;
  onSelectBook: (book: Book) => void;
  onClearSelection: () => void;
  onVisibleShelfChange?: (nearestShelfKey: string | null) => void;
  onPlayerMoveArea?: (signature: string) => void;
  onFallbackTo2D: (reason: string) => void;
}

const CONTEXT_LOST_GRACE_MS = 2500;

interface WorldSceneContentProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  coverTextureCache: CoverTextureCache;
  firstPerson: boolean;
  bossDoorUnlocked?: boolean;
  activeStationId?: string | null;
  telemetryRefs?: WorldTelemetryRefs;
  teleportCommand: TeleportCommand | null;
  hoveredBookId: string | null;
  selectedBookId: string | null;
  selectionMode: boolean;
  selectedIds: ReadonlySet<string>;
  prefersReducedMotion: boolean;
  isRenderPaused: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  onToggleFirstPerson: () => void;
  onInteractStation: (station: WorldStation3D) => void;
  onInteractNpc: (npc: WorldNpcSpec3D) => void;
  onActivePromptChange: (prompt: ActiveWorldPrompt | null) => void;
  onFootstepTick?: (dt: number, speed: number, isRunning: boolean) => void;
  onHoverBook: (book: Book | null) => void;
  onSelectBook: (book: Book) => void;
  onVisibleShelfChange?: (nearestShelfKey: string | null) => void;
  onPlayerMoveArea?: (signature: string) => void;
}

function WorldSceneContent({
  floor,
  theme,
  coverTextureCache,
  firstPerson,
  bossDoorUnlocked = false,
  activeStationId = null,
  telemetryRefs,
  teleportCommand,
  hoveredBookId,
  selectedBookId,
  selectionMode,
  selectedIds,
  prefersReducedMotion,
  isRenderPaused,
  isDraggingRef,
  onToggleFirstPerson,
  onInteractStation,
  onInteractNpc,
  onActivePromptChange,
  onFootstepTick,
  onHoverBook,
  onSelectBook,
  onVisibleShelfChange,
  onPlayerMoveArea,
}: WorldSceneContentProps) {
  const { gl, invalidate, size } = useThree();
  const pausedRef = useRef(isRenderPaused);
  pausedRef.current = isRenderPaused;

  const fallbackMotionRef = useRef<PlayerMotionState>({
    position: [...floor.spawnPoint],
    yaw: floor.spawnYaw,
    cameraYaw: floor.spawnYaw,
    speed: 0,
    isRunning: false,
    firstPerson,
    interactPulse: 0,
  });
  const fallbackNpcPositionsRef = useRef<Map<string, [number, number, number]>>(new Map());
  const playerMotionRef = telemetryRefs?.playerMotionRef ?? fallbackMotionRef;
  const npcPositionsRef = telemetryRefs?.npcPositionsRef ?? fallbackNpcPositionsRef;

  const [playerArea, setPlayerArea] = useState<{
    x: number;
    z: number;
    visibleShelfKeys: ReadonlySet<string>;
  }>(() => ({
    x: floor.spawnPoint[0],
    z: floor.spawnPoint[2],
    visibleShelfKeys: new Set(
      getVisibleFloorBookcases(floor, floor.spawnPoint[0], floor.spawnPoint[2]).map(
        (bc) => bc.shelfKey,
      ),
    ),
  }));

  // Create reusable procedural material bundles once per mount; update in-place across themes/biomes
  const initialThemeRef = useRef(theme);
  const initialBiomeRef = useRef(floor.biomeId);
  const libraryMaterials = useMemo(
    () => createLibraryMaterialBundle(initialThemeRef.current),
    [],
  );
  const worldMaterials = useMemo(
    () => createWorldMaterialBundle(initialBiomeRef.current, initialThemeRef.current),
    [],
  );

  useEffect(() => {
    return () => {
      libraryMaterials.dispose();
      worldMaterials.dispose();
    };
  }, [libraryMaterials, worldMaterials]);

  const requestRender = useCallback(() => {
    if (pausedRef.current) return;
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    libraryMaterials.applyTheme(theme);
    gl.toneMappingExposure = theme === 'light' ? 1.08 : theme === 'dim' ? 1.02 : 0.98;
    requestRender();
  }, [gl, libraryMaterials, theme, requestRender]);

  // Sync 1 frame when unpausing, returning to tab, or resizing viewport
  useEffect(() => {
    if (!isRenderPaused) {
      invalidate();
    }
  }, [isRenderPaused, size.width, size.height, invalidate]);

  const activeFloorLayout = useMemo(() => getFloorActiveLibraryLayout(floor), [floor]);

  const handlePlayerAreaChange = useCallback(
    (
      px: number,
      pz: number,
      visibleShelfKeys: ReadonlySet<string>,
      nearestShelfKey: string | null,
    ) => {
      setPlayerArea({ x: px, z: pz, visibleShelfKeys });
      onVisibleShelfChange?.(nearestShelfKey);
      onPlayerMoveArea?.(`${floor.floorIndex}:${px.toFixed(1)},${pz.toFixed(1)}`);
    },
    [floor.floorIndex, onVisibleShelfChange, onPlayerMoveArea],
  );

  const handleSelectBookWithPulse = useCallback(
    (book: Book) => {
      playerMotionRef.current.interactPulse = 1;
      onSelectBook(book);
    },
    [onSelectBook, playerMotionRef],
  );

  return (
    <>
      <PlayerRig
        floor={floor}
        motionRef={playerMotionRef}
        npcPositionsRef={npcPositionsRef}
        firstPerson={firstPerson}
        teleportCommand={teleportCommand}
        paused={isRenderPaused}
        prefersReducedMotion={prefersReducedMotion}
        isDraggingRef={isDraggingRef}
        requestRender={requestRender}
        onToggleFirstPerson={onToggleFirstPerson}
        onInteractStation={onInteractStation}
        onInteractNpc={onInteractNpc}
        onActivePromptChange={onActivePromptChange}
        onFootstepTick={onFootstepTick}
        onPlayerAreaChange={handlePlayerAreaChange}
      />

      <WorldBiomeMesh
        floor={floor}
        theme={theme}
        libraryMaterials={libraryMaterials}
        worldMaterials={worldMaterials}
        playerMotionRef={playerMotionRef}
        paused={isRenderPaused}
        prefersReducedMotion={prefersReducedMotion}
        requestRender={requestRender}
      />

      {!floor.isBossRoom && (
        <BiomePropsMesh
          floor={floor}
          theme={theme}
          libraryMaterials={libraryMaterials}
          worldMaterials={worldMaterials}
          bossDoorUnlocked={bossDoorUnlocked}
          paused={isRenderPaused}
          prefersReducedMotion={prefersReducedMotion}
          requestRender={requestRender}
        />
      )}

      <InteractiveStations
        floor={floor}
        theme={theme}
        playerMotionRef={playerMotionRef}
        bossDoorUnlocked={bossDoorUnlocked}
        activeStationId={activeStationId}
        paused={isRenderPaused}
        prefersReducedMotion={prefersReducedMotion}
        isDraggingRef={isDraggingRef}
        onInteractStation={onInteractStation}
      />

      <KiritoAvatar
        motionRef={playerMotionRef}
        paused={isRenderPaused}
        prefersReducedMotion={prefersReducedMotion}
      />

      {!floor.isBossRoom && (
        <AmbientNpcs
          floor={floor}
          playerMotionRef={playerMotionRef}
          npcPositionsRef={npcPositionsRef}
          paused={isRenderPaused}
          prefersReducedMotion={prefersReducedMotion}
          isDraggingRef={isDraggingRef}
          onSelectNpc={onInteractNpc}
        />
      )}

      {!floor.isBossRoom && (
        <InstancedBooksMesh
          layout={activeFloorLayout}
          theme={theme}
          materialBundle={libraryMaterials}
          coverTextureCache={coverTextureCache}
          cameraX={playerArea.x}
          cameraZ={playerArea.z}
          activeFloorIndex={floor.floorIndex}
          visibleShelfKeys={playerArea.visibleShelfKeys}
          hoveredBookId={hoveredBookId}
          selectedBookId={selectedBookId}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          prefersReducedMotion={prefersReducedMotion}
          paused={isRenderPaused}
          isDraggingRef={isDraggingRef}
          requestRender={requestRender}
          onHoverBook={onHoverBook}
          onSelectBook={handleSelectBookWithPulse}
        />
      )}
    </>
  );
}

/**
 * Aincrad Reading Tower WebGL Canvas container with smart `frameloop` gating:
 * - `'always'` when exploring actively so water, sakura petals, fireflies, Stone Golem,
 *   Kirito, and patrolling NPCs animate smoothly;
 * - `'demand'` when `prefers-reduced-motion` is enabled;
 * - `'never'` (strictly **0 FPS**) the instant `paused` (reading/modal) or tab hidden.
 */
export function LibraryCanvas({
  floor,
  theme,
  coverTextureCache,
  firstPerson,
  bossDoorUnlocked = false,
  activeStationId = null,
  telemetryRefs,
  teleportCommand,
  hoveredBookId,
  selectedBookId,
  selectionMode,
  selectedIds,
  prefersReducedMotion,
  paused = false,
  dimmed = false,
  onToggleFirstPerson,
  onInteractStation,
  onInteractNpc,
  onActivePromptChange,
  onFootstepTick,
  onHoverBook,
  onSelectBook,
  onClearSelection,
  onVisibleShelfChange,
  onPlayerMoveArea,
  onFallbackTo2D,
}: LibraryCanvasProps) {
  const [isDocumentHidden, setIsDocumentHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  const [contextLost, setContextLost] = useState(false);

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
    gl.toneMappingExposure = 1.06;

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
      setContextLost(true);
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
      setContextLost(false);
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

  const isRenderPaused = paused || isDocumentHidden || contextLost;
  const frameloopMode: 'always' | 'demand' | 'never' = isRenderPaused
    ? 'never'
    : prefersReducedMotion
      ? 'demand'
      : 'always';

  return (
    <div
      className={`absolute inset-0 z-0 transition-[filter] duration-200 ${
        paused ? 'pointer-events-none' : 'pointer-events-auto'
      } ${dimmed ? 'blur-[6px] brightness-[0.65]' : ''}`}
      aria-label="Không gian Aincrad Reading Tower 3D"
    >
      <Canvas
        frameloop={frameloopMode}
        dpr={[1, 2]}
        shadows={!prefersReducedMotion}
        camera={{
          fov: 50,
          near: 0.1,
          far: 560,
          position: [floor.spawnPoint[0], 2.9, floor.spawnPoint[2] + 4.8],
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
        <WorldSceneContent
          floor={floor}
          theme={theme}
          coverTextureCache={coverTextureCache}
          firstPerson={firstPerson}
          bossDoorUnlocked={bossDoorUnlocked}
          activeStationId={activeStationId}
          telemetryRefs={telemetryRefs}
          teleportCommand={teleportCommand}
          hoveredBookId={hoveredBookId}
          selectedBookId={selectedBookId}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          prefersReducedMotion={prefersReducedMotion}
          isRenderPaused={isRenderPaused}
          isDraggingRef={isDraggingRef}
          onToggleFirstPerson={onToggleFirstPerson}
          onInteractStation={onInteractStation}
          onInteractNpc={onInteractNpc}
          onActivePromptChange={onActivePromptChange}
          onFootstepTick={onFootstepTick}
          onHoverBook={onHoverBook}
          onSelectBook={onSelectBook}
          onVisibleShelfChange={onVisibleShelfChange}
          onPlayerMoveArea={onPlayerMoveArea}
        />
      </Canvas>
    </div>
  );
}
