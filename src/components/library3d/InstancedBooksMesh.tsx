import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Book } from '@/types';
import type { AppTheme } from '@/hooks/useTheme';
import { mergeSimpleGeometries } from './geometryUtils';
import {
  DEFAULT_FEATURED_COVER_SLOTS,
  LIBRARY_3D_CONSTANTS,
  selectFeaturedCoverSlots,
  type BookSlot3D,
  type LibraryLayout3D,
} from './layout3d';
import type { CoverTextureCache } from './coverTextureCache';
import type { LibraryMaterialBundle } from './proceduralMaterials';

export const MAX_BOOK_INSTANCES = 2000;

interface InstancedBooksMeshProps {
  layout: LibraryLayout3D;
  theme: AppTheme;
  materialBundle: LibraryMaterialBundle;
  coverTextureCache: CoverTextureCache;
  cameraX: number;
  cameraZ?: number;
  activeFloorIndex?: number;
  visibleShelfKeys: ReadonlySet<string>;
  hoveredBookId: string | null;
  selectedBookId: string | null;
  selectionMode: boolean;
  selectedIds: ReadonlySet<string>;
  prefersReducedMotion: boolean;
  paused: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  requestRender: () => void;
  onHoverBook: (book: Book | null) => void;
  onSelectBook: (book: Book) => void;
}

const PULL_EPSILON = 1e-3;
const PULL_SPEED = 14;

function buildSpineTrimGeometry(): THREE.BufferGeometry {
  // 2 raised gilded spine ribs + 2 fine head/tail spine fillets merged into 1 draw call
  const bandSpecs: Array<[number, number, number]> = [
    [0.28, 0.042, 0.032],
    [-0.28, 0.042, 0.032],
    [0.435, 0.024, 0.026],
    [-0.435, 0.024, 0.026],
  ];
  const parts = bandSpecs.map(([y, h, d]) => {
    const geom = new THREE.BoxGeometry(1.03, h, d);
    geom.translate(0, y, 0.5 - d * 0.35);
    return geom;
  });
  return mergeSimpleGeometries(parts);
}

/**
 * Renders all books in constant 3 `InstancedMesh` draw calls (binding, pages, gilded spine bands)
 * plus a strictly bounded pool of `<= 20–24` featured `CoverPlane` meshes (D-013 / D-014).
 */
export function InstancedBooksMesh({
  layout,
  theme,
  materialBundle,
  coverTextureCache,
  cameraX,
  cameraZ,
  activeFloorIndex,
  visibleShelfKeys,
  hoveredBookId,
  selectedBookId,
  selectionMode,
  selectedIds,
  prefersReducedMotion,
  paused,
  isDraggingRef,
  requestRender,
  onHoverBook,
  onSelectBook,
}: InstancedBooksMeshProps) {
  const bodyMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const pagesMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const trimMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const coverMeshRefs = useRef<Map<string, THREE.Mesh>>(new Map());

  const dummyRef = useRef(new THREE.Object3D());
  const tmpColorRef = useRef(new THREE.Color());
  const tintColorRef = useRef(new THREE.Color());

  const pullValuesRef = useRef<Float32Array>(new Float32Array(0));
  const animatingIndicesRef = useRef<Set<number>>(new Set());
  const trackedActiveRef = useRef<Set<number>>(new Set());

  const [loadedCovers, setLoadedCovers] = useState<Map<string, THREE.Texture>>(() => new Map());

  const capacity = useMemo(() => {
    const needed = Math.min(MAX_BOOK_INSTANCES, layout.books.length);
    return Math.min(MAX_BOOK_INSTANCES, Math.max(64, Math.ceil(needed / 64) * 64));
  }, [layout.books.length]);

  const visibleCount = Math.min(layout.books.length, capacity);

  const geometries = useMemo(() => {
    const body = new THREE.BoxGeometry(1, 1, 1);
    const pages = new THREE.BoxGeometry(0.84, 0.945, 0.935);
    pages.translate(0, 0, -0.045);
    const trim = buildSpineTrimGeometry();
    const coverPlane = new THREE.PlaneGeometry(1, 1);
    return { body, pages, trim, coverPlane };
  }, []);

  useEffect(() => {
    return () => {
      geometries.body.dispose();
      geometries.pages.dispose();
      geometries.trim.dispose();
      geometries.coverPlane.dispose();
    };
  }, [geometries]);

  const getTargetPull = useCallback(
    (slot: BookSlot3D): number => {
      if (slot.bookId === selectedBookId || selectedIds.has(slot.bookId)) return 1;
      if (slot.bookId === hoveredBookId) return 0.72;
      return 0;
    },
    [hoveredBookId, selectedBookId, selectedIds],
  );

  const applySlotTransform = useCallback((slot: BookSlot3D, pullRatio: number) => {
    const body = bodyMeshRef.current;
    const pages = pagesMeshRef.current;
    const trim = trimMeshRef.current;
    if (!body || !pages || !trim || slot.instanceIndex >= MAX_BOOK_INSTANCES) return;

    const pullDist = pullRatio * LIBRARY_3D_CONSTANTS.BOOK_PULLOUT_Z;
    const [dx, dy, dz] = slot.pullDirection;
    const dummy = dummyRef.current;
    dummy.position.set(
      slot.position[0] + dx * pullDist,
      slot.position[1] + dy * pullDist,
      slot.position[2] + dz * pullDist,
    );
    dummy.rotation.set(slot.rotation[0], slot.rotation[1], slot.rotation[2]);
    dummy.scale.set(slot.dimensions.thickness, slot.dimensions.height, slot.dimensions.depth);
    dummy.updateMatrix();

    body.setMatrixAt(slot.instanceIndex, dummy.matrix);
    pages.setMatrixAt(slot.instanceIndex, dummy.matrix);
    trim.setMatrixAt(slot.instanceIndex, dummy.matrix);

    const coverMesh = coverMeshRefs.current.get(slot.bookId);
    if (coverMesh) {
      coverMesh.position.set(
        slot.coverPlane.position[0] + dx * pullDist,
        slot.coverPlane.position[1] + dy * pullDist,
        slot.coverPlane.position[2] + dz * pullDist,
      );
    }
  }, []);

  // Initialize / rebuild all instance matrices whenever layout or allocated capacity changes
  useEffect(() => {
    const body = bodyMeshRef.current;
    const pages = pagesMeshRef.current;
    const trim = trimMeshRef.current;
    if (!body || !pages || !trim) return;

    const nextPulls = new Float32Array(visibleCount);
    pullValuesRef.current = nextPulls;
    animatingIndicesRef.current.clear();
    trackedActiveRef.current.clear();

    body.count = visibleCount;
    pages.count = visibleCount;
    trim.count = visibleCount;

    for (let i = 0; i < visibleCount; i += 1) {
      const slot = layout.books[i];
      const target = getTargetPull(slot);
      nextPulls[i] = target;
      if (target > 0) trackedActiveRef.current.add(i);
      applySlotTransform(slot, target);
    }

    body.instanceMatrix.needsUpdate = true;
    pages.instanceMatrix.needsUpdate = true;
    trim.instanceMatrix.needsUpdate = true;
    requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, capacity, visibleCount, applySlotTransform, requestRender]);

  // Update per-instance binding colors & schedule pull-out animation for hovered/selected books
  useEffect(() => {
    const body = bodyMeshRef.current;
    const pages = pagesMeshRef.current;
    const trim = trimMeshRef.current;
    if (!body || !pages || !trim) return;

    const palette = materialBundle.palette;
    const baseColor = tmpColorRef.current;
    const tintColor = tintColorRef.current;
    const pulls = pullValuesRef.current;
    const nextActive = new Set<number>();

    for (let i = 0; i < visibleCount; i += 1) {
      const slot = layout.books[i];
      const isSelected = slot.bookId === selectedBookId || selectedIds.has(slot.bookId);
      const isHovered = slot.bookId === hoveredBookId;

      baseColor.set(slot.colorHex);
      if (isSelected) {
        tintColor.set(palette.book.selectedTint);
        baseColor.lerp(tintColor, 0.36);
      } else if (isHovered) {
        tintColor.set(palette.book.hoveredTint);
        baseColor.lerp(tintColor, 0.24);
      } else if (selectionMode && selectedIds.size > 0) {
        baseColor.multiplyScalar(0.56);
      }
      body.setColorAt(i, baseColor);

      const target = getTargetPull(slot);
      if (target > 0) nextActive.add(i);
      const current = pulls[i] ?? 0;

      if (Math.abs(target - current) > PULL_EPSILON) {
        if (prefersReducedMotion) {
          pulls[i] = target;
          applySlotTransform(slot, target);
        } else {
          animatingIndicesRef.current.add(i);
        }
      }
    }

    // Ensure previously hovered/selected books smoothly slide back in
    for (const prevIdx of trackedActiveRef.current) {
      if (!nextActive.has(prevIdx) && prevIdx < visibleCount) {
        if (prefersReducedMotion) {
          pulls[prevIdx] = 0;
          applySlotTransform(layout.books[prevIdx], 0);
        } else {
          animatingIndicesRef.current.add(prevIdx);
        }
      }
    }
    trackedActiveRef.current = nextActive;

    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (prefersReducedMotion) {
      body.instanceMatrix.needsUpdate = true;
      pages.instanceMatrix.needsUpdate = true;
      trim.instanceMatrix.needsUpdate = true;
    }
    requestRender();
  }, [
    layout,
    theme,
    visibleCount,
    materialBundle,
    hoveredBookId,
    selectedBookId,
    selectionMode,
    selectedIds,
    prefersReducedMotion,
    getTargetPull,
    applySlotTransform,
    requestRender,
  ]);

  // Demand-driven per-book pull-out loop: strictly 0 invalidate() when nothing animates
  useFrame((_, delta) => {
    if (paused || animatingIndicesRef.current.size === 0) return;

    const body = bodyMeshRef.current;
    const pages = pagesMeshRef.current;
    const trim = trimMeshRef.current;
    if (!body || !pages || !trim) return;

    const pulls = pullValuesRef.current;
    const step = 1 - Math.exp(-Math.min(delta, 0.1) * PULL_SPEED);
    let touched = false;

    for (const idx of Array.from(animatingIndicesRef.current)) {
      if (idx >= visibleCount) {
        animatingIndicesRef.current.delete(idx);
        continue;
      }
      const slot = layout.books[idx];
      const target = getTargetPull(slot);
      const current = pulls[idx] ?? 0;
      const next = current + (target - current) * step;

      if (Math.abs(target - next) < PULL_EPSILON) {
        pulls[idx] = target;
        applySlotTransform(slot, target);
        animatingIndicesRef.current.delete(idx);
      } else {
        pulls[idx] = next;
        applySlotTransform(slot, next);
      }
      touched = true;
    }

    if (touched) {
      body.instanceMatrix.needsUpdate = true;
      pages.instanceMatrix.needsUpdate = true;
      trim.instanceMatrix.needsUpdate = true;
    }

    if (animatingIndicesRef.current.size > 0) {
      requestRender();
    }
  });

  // Strictly bounded featured CoverPlane slots (<= 20 default, hard-capped <= 24 per D-013)
  const featuredSlots = useMemo(
    () =>
      selectFeaturedCoverSlots(layout, {
        cameraX,
        cameraZ,
        activeFloorIndex,
        visibleShelfKeys,
        hoveredBookId,
        selectedBookId,
        maxSlots: DEFAULT_FEATURED_COVER_SLOTS,
      }),
    [layout, cameraX, cameraZ, activeFloorIndex, visibleShelfKeys, hoveredBookId, selectedBookId],
  );

  // Sync LRU pinned keys, cancel off-window loads, and subscribe to active CoverPlane textures
  useEffect(() => {
    const pinnedKeys = new Set<string>();
    for (let i = 0; i < featuredSlots.length; i += 1) {
      const key = featuredSlots[i].book.cover_key;
      if (key) pinnedKeys.add(key);
    }

    coverTextureCache.setPinnedKeys(pinnedKeys);
    coverTextureCache.pruneOutsideShelves(visibleShelfKeys, pinnedKeys);

    const immediate = new Map<string, THREE.Texture>();
    const unsubscribes: Array<() => void> = [];

    for (let i = 0; i < featuredSlots.length; i += 1) {
      const slot = featuredSlots[i];
      const coverKey = slot.book.cover_key;
      if (!coverKey) continue;

      const cached = coverTextureCache.getCached(coverKey);
      if (cached) {
        immediate.set(coverKey, cached);
        continue;
      }

      const dist =
        cameraZ === undefined
          ? Math.abs(slot.position[0] - cameraX)
          : Math.hypot(slot.position[0] - cameraX, slot.position[2] - cameraZ);
      const priority =
        slot.bookId === selectedBookId || slot.bookId === hoveredBookId ? 0 : dist + 1;

      const cancel = coverTextureCache.request(coverKey, {
        shelfKey: slot.shelfKey,
        priority,
        onReady: (texture) => {
          if (!texture) return;
          setLoadedCovers((prev) => {
            if (prev.get(coverKey) === texture) return prev;
            const next = new Map(prev);
            next.set(coverKey, texture);
            return next;
          });
          requestRender();
        },
      });
      unsubscribes.push(cancel);
    }

    setLoadedCovers((prev) => {
      if (prev.size === immediate.size) {
        let same = true;
        for (const [k, tex] of immediate) {
          if (prev.get(k) !== tex) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return immediate;
    });

    if (immediate.size > 0) {
      requestRender();
    }

    return () => {
      for (let i = 0; i < unsubscribes.length; i += 1) {
        unsubscribes[i]();
      }
    };
  }, [
    featuredSlots,
    visibleShelfKeys,
    coverTextureCache,
    cameraX,
    cameraZ,
    hoveredBookId,
    selectedBookId,
    requestRender,
  ]);

  // Pointer cursor feedback on hover
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (hoveredBookId && !isDraggingRef.current) {
      document.body.style.cursor = 'pointer';
      return () => {
        document.body.style.cursor = '';
      };
    }
    return undefined;
  }, [hoveredBookId, isDraggingRef]);

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (paused || isDraggingRef.current) return;
      event.stopPropagation();
      const idx = event.instanceId;
      if (idx === undefined || idx < 0 || idx >= visibleCount) return;
      const book = layout.books[idx].book;
      if (book.id !== hoveredBookId) {
        onHoverBook(book);
      }
    },
    [paused, isDraggingRef, visibleCount, layout.books, hoveredBookId, onHoverBook],
  );

  const handlePointerOut = useCallback(() => {
    if (hoveredBookId !== null) {
      onHoverBook(null);
    }
  }, [hoveredBookId, onHoverBook]);

  const handleBookClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (paused || isDraggingRef.current) return;
      event.stopPropagation();
      const idx = event.instanceId;
      if (idx === undefined || idx < 0 || idx >= visibleCount) return;
      onSelectBook(layout.books[idx].book);
    },
    [paused, isDraggingRef, visibleCount, layout.books, onSelectBook],
  );

  const setCoverMeshRef = useCallback((bookId: string, mesh: THREE.Mesh | null) => {
    if (mesh) coverMeshRefs.current.set(bookId, mesh);
    else coverMeshRefs.current.delete(bookId);
  }, []);

  const { materials } = materialBundle;

  return (
    <group name="instanced-library-books">
      {/* 3 Fixed InstancedMesh Draw Calls for up to 2,000 books (D-013 / D-014) */}
      <instancedMesh
        key={`body-${capacity}`}
        ref={bodyMeshRef}
        args={[geometries.body, materials.bookBody, capacity]}
        frustumCulled={false}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleBookClick}
      />
      <instancedMesh
        key={`pages-${capacity}`}
        ref={pagesMeshRef}
        args={[geometries.pages, materials.bookPages, capacity]}
        frustumCulled={false}
      />
      <instancedMesh
        key={`trim-${capacity}`}
        ref={trimMeshRef}
        args={[geometries.trim, materials.brassTrim, capacity]}
        frustumCulled={false}
      />

      {/* Hard-capped <= 20–24 Featured CoverPlanes */}
      {featuredSlots.map((slot) => {
        const coverKey = slot.book.cover_key;
        if (!coverKey) return null;
        const texture = loadedCovers.get(coverKey);
        if (!texture) return null;

        const pullDist =
          (pullValuesRef.current[slot.instanceIndex] ?? 0) * LIBRARY_3D_CONSTANTS.BOOK_PULLOUT_Z;
        const [pdx, pdy, pdz] = slot.pullDirection;
        return (
          <mesh
            key={slot.bookId}
            ref={(mesh) => setCoverMeshRef(slot.bookId, mesh)}
            geometry={geometries.coverPlane}
            position={[
              slot.coverPlane.position[0] + pdx * pullDist,
              slot.coverPlane.position[1] + pdy * pullDist,
              slot.coverPlane.position[2] + pdz * pullDist,
            ]}
            rotation={slot.coverPlane.rotation}
            scale={[slot.coverPlane.width, slot.coverPlane.height, 1]}
            onPointerMove={(e) => {
              if (paused || isDraggingRef.current) return;
              e.stopPropagation();
              if (slot.bookId !== hoveredBookId) onHoverBook(slot.book);
            }}
            onPointerOut={handlePointerOut}
            onClick={(e) => {
              if (paused || isDraggingRef.current) return;
              e.stopPropagation();
              onSelectBook(slot.book);
            }}
          >
            <meshStandardMaterial
              map={texture}
              roughness={0.52}
              metalness={0.04}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        );
      })}
    </group>
  );
}
