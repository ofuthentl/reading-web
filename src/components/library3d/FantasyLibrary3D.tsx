import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, ReadingProgress, StorageStats, ViewMode } from '@/types';
import type { LibraryViewState } from '@/hooks/useLibraryViewState';
import type { AppTheme } from '@/hooks/useTheme';
import {
  buildTowerWorldLayout3D,
  findJumpTargetForBook,
  findJumpTargetForShelf,
  type PlayerMotionState,
  type WorldNpcSpec3D,
  type WorldStation3D,
  type WorldTelemetryRefs,
} from './floorWorldLayout3d';
import { buildBossRoomFloorLayout, evaluateFloorBossUnlock } from './bossRoomLayout3d';
import { createAmbientAudioEngine, type AmbientAudioEngine } from './ambientAudio';
import { createCoverTextureCache } from './coverTextureCache';
import { clearLocalGlbCache } from './gltfLoader';
import { LibraryCanvas } from './LibraryCanvas';
import { Library3DOverlay } from './Library3DOverlay';
import type { ActiveWorldPrompt, TeleportCommand } from './PlayerRig';

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
 * Full 3D Aincrad Reading Tower experience (lazy chunk isolated from 2D entry):
 * connects active-floor World Biomes, Kirito avatar, patrolling NPCs, and shared-state HUD
 * while guaranteeing full CoverTextureCache & GLB VRAM cleanup on unmount.
 */
export function FantasyLibrary3D({
  books,
  progress,
  storage,
  loading,
  theme,
  viewState,
  canUse3D,
  viewMode,
  prefersReducedMotion,
  paused = false,
  dimmed = false,
  onCycleTheme,
  onChangeViewMode,
  onFallbackTo2D,
  onRefresh,
  onLogout,
  onOpenBook,
  onUploadClick,
  onEditBook,
  onMoveSelectedToShelf,
  onDeleteSelected,
}: FantasyLibrary3DProps) {
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [bossRoomFloorIndex, setBossRoomFloorIndex] = useState<number | null>(null);
  const [bossSealNotice, setBossSealNotice] = useState<string | null>(null);
  const [firstPerson, setFirstPerson] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isDocumentHidden, setIsDocumentHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  const [minimapRedrawSignal, setMinimapRedrawSignal] = useState('');
  const [hoveredBook, setHoveredBook] = useState<Book | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<ActiveWorldPrompt | null>(null);
  const [activeDialogue, setActiveDialogue] = useState<WorldNpcSpec3D | null>(null);
  const [floorFadeLabel, setFloorFadeLabel] = useState<string | null>(null);
  const [teleportCommand, setTeleportCommand] = useState<TeleportCommand | null>(null);

  const coverTextureCache = useMemo(() => createCoverTextureCache(), []);
  const prevCoverKeysRef = useRef<Map<string, string | null>>(new Map());
  const fadeTimerRef = useRef<number | null>(null);
  const teleportNonceRef = useRef(0);
  const ambientAudioRef = useRef<AmbientAudioEngine | null>(null);
  const playerMotionRef = useRef<PlayerMotionState>({
    position: [0, 0, 18],
    yaw: Math.PI,
    cameraYaw: Math.PI,
    speed: 0,
    isRunning: false,
    firstPerson: false,
    interactPulse: 0,
  });
  const npcPositionsRef = useRef<Map<string, [number, number, number]>>(new Map());
  const telemetryRefs = useMemo<WorldTelemetryRefs>(
    () => ({ playerMotionRef, npcPositionsRef }),
    [],
  );

  // Guarantee complete GPU/ImageBitmap AND cached GLB VRAM cleanup when leaving 3D
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
      }
      coverTextureCache.disposeAll();
      clearLocalGlbCache();
    };
  }, [coverTextureCache]);

  // StrictMode-safe procedural Web Audio lifecycle (default OFF; AudioContext.close() on unmount)
  useEffect(() => {
    const engine = createAmbientAudioEngine();
    ambientAudioRef.current = engine;
    return () => {
      engine.dispose();
      ambientAudioRef.current = null;
    };
  }, []);

  // Track browser tab visibility so ambient audio suspends immediately when tab is hidden
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibilityChange = () => {
      setIsDocumentHidden(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Evict stale cover textures if a book's cover_key was updated via BookEditModal
  useEffect(() => {
    const prevMap = prevCoverKeysRef.current;
    const nextMap = new Map<string, string | null>();
    for (let i = 0; i < books.length; i += 1) {
      const book = books[i];
      nextMap.set(book.id, book.cover_key);
      const prevKey = prevMap.get(book.id);
      if (prevKey && prevKey !== book.cover_key) {
        coverTextureCache.evict(prevKey);
      }
    }
    prevCoverKeysRef.current = nextMap;
  }, [books, coverTextureCache]);

  const tower = useMemo(
    () => buildTowerWorldLayout3D(viewState.visibleShelves),
    [viewState.visibleShelves],
  );

  const safeFloorIndex = Math.min(activeFloorIndex, Math.max(0, tower.totalFloors - 1));
  const activeFloor = tower.floors[safeFloorIndex] ?? tower.floors[0];
  const inBossRoom = bossRoomFloorIndex !== null;

  const activeBossUnlock = useMemo(
    () =>
      evaluateFloorBossUnlock(activeFloor.floorNumber, activeFloor.biomeId, books, progress),
    [activeFloor.floorNumber, activeFloor.biomeId, books, progress],
  );

  const renderedFloor = useMemo(() => {
    if (bossRoomFloorIndex === null) return activeFloor;
    const srcFloor = tower.floors[bossRoomFloorIndex] ?? activeFloor;
    return buildBossRoomFloorLayout(srcFloor);
  }, [bossRoomFloorIndex, tower.floors, activeFloor]);

  // Sync biome/day-night/boss-room & pause state into ambient Web Audio engine
  useEffect(() => {
    const engine = ambientAudioRef.current;
    if (!engine) return;
    engine.setEnvironment(renderedFloor.biomeId, theme, inBossRoom);
    engine.setPaused(paused || isDocumentHidden);
    engine.setEnabled(audioEnabled);
  }, [renderedFloor.biomeId, theme, inBossRoom, paused, isDocumentHidden, audioEnabled]);

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      const engine = ambientAudioRef.current;
      if (engine) {
        engine.setEnvironment(renderedFloor.biomeId, theme, inBossRoom);
        engine.setPaused(paused || isDocumentHidden);
        // Trigger inside user click gesture so browser AudioContext autoplay policy passes immediately
        engine.setEnabled(next);
      }
      return next;
    });
  }, [renderedFloor.biomeId, theme, inBossRoom, paused, isDocumentHidden]);

  const handleFootstepTick = useCallback((dt: number, speed: number, isRunning: boolean) => {
    ambientAudioRef.current?.stepFootstep(dt, speed, isRunning);
  }, []);

  useEffect(() => {
    if (safeFloorIndex !== activeFloorIndex) {
      setActiveFloorIndex(safeFloorIndex);
    }
  }, [safeFloorIndex, activeFloorIndex]);

  const selectedBook = useMemo(() => {
    if (!selectedBookId) return null;
    return tower.bookById.get(selectedBookId)?.book ?? null;
  }, [tower.bookById, selectedBookId]);

  useEffect(() => {
    if (selectedBookId && !tower.bookById.has(selectedBookId)) {
      setSelectedBookId(null);
    }
  }, [tower.bookById, selectedBookId]);

  useEffect(() => {
    if (hoveredBook && !tower.bookById.has(hoveredBook.id)) {
      setHoveredBook(null);
    }
  }, [tower.bookById, hoveredBook]);

  const triggerFloorTransition = useCallback(
    (targetIdx: number, pendingTeleport?: Omit<TeleportCommand, 'nonce'>) => {
      const clamped = Math.max(0, Math.min(tower.totalFloors - 1, targetIdx));
      const targetFloor = tower.floors[clamped];
      if (!targetFloor) return;

      setActiveDialogue(null);
      setActivePrompt(null);
      setBossSealNotice(null);
      setBossRoomFloorIndex(null);

      if ((clamped !== safeFloorIndex || inBossRoom) && !prefersReducedMotion) {
        setFloorFadeLabel(targetFloor.title);
        if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = window.setTimeout(() => {
          setFloorFadeLabel(null);
          fadeTimerRef.current = null;
        }, 420);
      }

      setActiveFloorIndex(clamped);
      if (pendingTeleport) {
        teleportNonceRef.current += 1;
        setTeleportCommand({ ...pendingTeleport, nonce: teleportNonceRef.current });
      }
    },
    [tower, safeFloorIndex, inBossRoom, prefersReducedMotion],
  );

  const enterBossRoom = useCallback(() => {
    setActiveDialogue(null);
    setActivePrompt(null);
    setBossSealNotice(null);
    if (!prefersReducedMotion) {
      setFloorFadeLabel(`Phòng Boss Tầng ${activeFloor.floorNumber} — ${activeBossUnlock.bossName}`);
      if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => {
        setFloorFadeLabel(null);
        fadeTimerRef.current = null;
      }, 480);
    }
    setBossRoomFloorIndex(safeFloorIndex);
  }, [activeFloor.floorNumber, activeBossUnlock.bossName, safeFloorIndex, prefersReducedMotion]);

  const exitBossRoom = useCallback(() => {
    const returnIdx = bossRoomFloorIndex ?? safeFloorIndex;
    triggerFloorTransition(returnIdx);
  }, [bossRoomFloorIndex, safeFloorIndex, triggerFloorTransition]);

  const handleJumpToShelf = useCallback(
    (shelfKey: string) => {
      const target = findJumpTargetForShelf(tower, shelfKey);
      if (!target) return;
      triggerFloorTransition(target.floorIndex, {
        position: target.position,
        yaw: target.yaw,
      });
    },
    [tower, triggerFloorTransition],
  );

  const handleJumpToBook = useCallback(
    (book: Book) => {
      const target = findJumpTargetForBook(tower, book.id);
      if (target) {
        triggerFloorTransition(target.floorIndex, {
          position: target.position,
          yaw: target.yaw,
        });
      }
      setSelectedBookId(book.id);
    },
    [tower, triggerFloorTransition],
  );

  // Jump across floors automatically when filtering or typing a search query
  const firstVisibleShelfKey = viewState.visibleShelves[0]?.key ?? null;
  useEffect(() => {
    if (viewState.activeShelfKey) {
      handleJumpToShelf(viewState.activeShelfKey);
    } else if (viewState.searchQuery.trim() && firstVisibleShelfKey) {
      handleJumpToShelf(firstVisibleShelfKey);
    }
  }, [viewState.activeShelfKey, viewState.searchQuery, firstVisibleShelfKey, handleJumpToShelf]);

  // Close pinned BookInspectCard / NPC Dialogue on Escape
  useEffect(() => {
    if ((!selectedBookId && !activeDialogue) || paused) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      setSelectedBookId(null);
      setActiveDialogue(null);
      setBossSealNotice(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBookId, activeDialogue, bossSealNotice, paused]);

  const handleSelectBook = useCallback(
    (book: Book) => {
      if (viewState.selectionMode) {
        viewState.toggleSelectBook(book.id);
        return;
      }
      setSelectedBookId(book.id);
    },
    [viewState],
  );

  const handleInteractStation = useCallback(
    (station: WorldStation3D) => {
      if (station.kind === 'boss_door') {
        if (!activeBossUnlock.unlocked) {
          setBossSealNotice(activeBossUnlock.summaryText);
          return;
        }
        enterBossRoom();
        return;
      }
      if (station.kind === 'boss_exit') {
        exitBossRoom();
        return;
      }
      if (station.kind === 'portal_up' || station.kind === 'portal_down') {
        if (station.targetFloorIndex !== undefined) {
          triggerFloorTransition(station.targetFloorIndex);
        }
        return;
      }
      if (station.kind === 'librarian_desk') {
        onUploadClick();
        return;
      }
      if (station.kind === 'weather_shrine') {
        onCycleTheme();
        return;
      }
      if (station.kind === 'reading_table') {
        const resumeBook = viewState.continueReadingBooks[0] ?? books[0];
        if (resumeBook) onOpenBook(resumeBook);
        else onUploadClick();
      }
    },
    [
      activeBossUnlock,
      enterBossRoom,
      exitBossRoom,
      triggerFloorTransition,
      onUploadClick,
      onCycleTheme,
      viewState.continueReadingBooks,
      books,
      onOpenBook,
    ],
  );

  const handleInteractNpc = useCallback((npc: WorldNpcSpec3D) => {
    setActiveDialogue(npc);
  }, []);

  const handleRefresh = useCallback(() => {
    coverTextureCache.clearFailedCache();
    onRefresh();
  }, [coverTextureCache, onRefresh]);

  const activeStationId =
    activePrompt?.kind === 'station' ? activePrompt.station.id : null;

  return (
    <div className="theme-canvas relative h-screen w-screen overflow-hidden text-ink select-none">
      <LibraryCanvas
        floor={renderedFloor}
        theme={theme}
        coverTextureCache={coverTextureCache}
        firstPerson={firstPerson}
        bossDoorUnlocked={activeBossUnlock.unlocked}
        activeStationId={activeStationId}
        telemetryRefs={telemetryRefs}
        teleportCommand={teleportCommand}
        hoveredBookId={hoveredBook?.id ?? null}
        selectedBookId={selectedBook?.id ?? null}
        selectionMode={viewState.selectionMode}
        selectedIds={viewState.selectedIds}
        prefersReducedMotion={prefersReducedMotion}
        paused={paused}
        dimmed={dimmed}
        onToggleFirstPerson={() => setFirstPerson((prev) => !prev)}
        onInteractStation={handleInteractStation}
        onInteractNpc={handleInteractNpc}
        onActivePromptChange={setActivePrompt}
        onFootstepTick={handleFootstepTick}
        onHoverBook={setHoveredBook}
        onSelectBook={handleSelectBook}
        onPlayerMoveArea={setMinimapRedrawSignal}
        onClearSelection={() => {
          setSelectedBookId(null);
          setActiveDialogue(null);
          setBossSealNotice(null);
        }}
        onFallbackTo2D={onFallbackTo2D}
      />

      {/* Smooth 250ms transition veil when crossing Aincrad floor portals */}
      {floorFadeLabel && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm transition-opacity duration-300">
          <div className="rounded-2xl border border-white/20 bg-surface/95 px-6 py-3 text-center shadow-2xl">
            <p className="text-[11px] font-medium uppercase tracking-widest text-accent">
              Aincrad Reading Tower
            </p>
            <p className="mt-0.5 font-display text-lg font-semibold text-ink">{floorFadeLabel}</p>
          </div>
        </div>
      )}

      <Library3DOverlay
        books={books}
        progress={progress}
        storage={storage}
        loading={loading}
        theme={theme}
        viewState={viewState}
        canUse3D={canUse3D}
        viewMode={viewMode}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
        floors={tower.floors}
        renderedFloor={renderedFloor}
        activeFloorIndex={safeFloorIndex}
        inBossRoom={inBossRoom}
        bossUnlock={activeBossUnlock}
        bossSealNotice={bossSealNotice}
        firstPerson={firstPerson}
        audioEnabled={audioEnabled}
        telemetryRefs={telemetryRefs}
        minimapRedrawSignal={minimapRedrawSignal}
        activePrompt={activePrompt}
        activeDialogue={activeDialogue}
        selectedBook={selectedBook}
        hoveredBook={hoveredBook}
        onSelectFloor={(idx) => triggerFloorTransition(idx)}
        onJumpToBook={handleJumpToBook}
        onExitBossRoom={exitBossRoom}
        onCloseBossNotice={() => setBossSealNotice(null)}
        onToggleAudio={handleToggleAudio}
        onToggleFirstPerson={() => setFirstPerson((prev) => !prev)}
        onTriggerStation={handleInteractStation}
        onTriggerNpc={handleInteractNpc}
        onCloseDialogue={() => setActiveDialogue(null)}
        onClearSelectedBook={() => setSelectedBookId(null)}
        onCycleTheme={onCycleTheme}
        onChangeViewMode={onChangeViewMode}
        onRefresh={handleRefresh}
        onLogout={onLogout}
        onOpenBook={onOpenBook}
        onUploadClick={onUploadClick}
        onEditBook={onEditBook}
        onMoveSelectedToShelf={onMoveSelectedToShelf}
        onDeleteSelected={onDeleteSelected}
      />
    </div>
  );
}
