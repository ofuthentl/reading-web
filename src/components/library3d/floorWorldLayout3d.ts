import type { ShelfGroup } from '@/types';
import {
  buildCabinetBookSlots,
  computeCabinetWidth,
  computeTierPlankYs,
  DEFAULT_FEATURED_COVER_SLOTS,
  LIBRARY_3D_CONSTANTS,
  MAX_FEATURED_COVER_SLOTS,
  packShelfGroupIntoRows,
  transformCabinetLocalPoint,
  type BookSlot3D,
  type PreparedBook,
} from './bookPacking3d';
import type { LibraryLayout3D, ShelfLayout3D } from './layout3d';
import { BIOME_CATALOG, BIOME_SEQUENCE, getBiomeForFloorIndex } from './biomeBlueprints';
import type {
  ActiveFloorCoverOptions,
  BuildTowerOptions,
  FloorWorldLayout3D,
  JumpTarget3D,
  TowerWorldLayout3D,
  WorldBookcase3D,
  WorldCollider3D,
  WorldNpcSpec3D,
  WorldStation3D,
} from './worldTypes';

export { BIOME_CATALOG, BIOME_SEQUENCE, getBiomeForFloorIndex };
export type * from './worldTypes';

export const WORLD_LAYOUT_CONSTANTS = {
  DEFAULT_MIN_FLOORS: 4,
  MAX_BAYS_PER_CABINET: 2,
  DEFAULT_SHELF_VIEW_RADIUS: 24,
  BOOKCASE_STANDOFF_DIST: 2.15,
} as const;

interface ShelfSegmentPlan {
  shelfKey: string;
  shelfName: string;
  shelfIndex: number;
  segmentIndex: number;
  segmentCount: number;
  bayCount: number;
  bayOffset: number;
  rows: PreparedBook[][];
}

function splitShelfIntoCabinetSegments(
  group: ShelfGroup,
  shelfIndex: number,
): ShelfSegmentPlan[] {
  const packed = packShelfGroupIntoRows(group);
  const maxBays = WORLD_LAYOUT_CONSTANTS.MAX_BAYS_PER_CABINET;
  const rowsPerCabinet = maxBays * LIBRARY_3D_CONSTANTS.TIERS_PER_BAY;

  if (packed.bayCount <= maxBays) {
    return [
      {
        shelfKey: group.key,
        shelfName: group.name,
        shelfIndex,
        segmentIndex: 0,
        segmentCount: 1,
        bayCount: packed.bayCount,
        bayOffset: 0,
        rows: packed.rows,
      },
    ];
  }

  const segmentCount = Math.ceil(packed.bayCount / maxBays);
  const segments: ShelfSegmentPlan[] = [];
  for (let seg = 0; seg < segmentCount; seg += 1) {
    const startRow = seg * rowsPerCabinet;
    const sliceRows = packed.rows.slice(startRow, startRow + rowsPerCabinet);
    const bayCount = Math.max(1, Math.ceil(sliceRows.length / LIBRARY_3D_CONSTANTS.TIERS_PER_BAY));
    segments.push({
      shelfKey: group.key,
      shelfName: group.name,
      shelfIndex,
      segmentIndex: seg,
      segmentCount,
      bayCount,
      bayOffset: seg * maxBays,
      rows: sliceRows,
    });
  }
  return segments;
}

function partitionSegmentsIntoFloors(
  shelfGroups: readonly ShelfGroup[],
  minFloors: number,
): ShelfSegmentPlan[][] {
  const floorBuckets: ShelfSegmentPlan[][] = [];
  let currentFloorIndex = 0;

  const ensureBucket = (idx: number): ShelfSegmentPlan[] => {
    while (floorBuckets.length <= idx) floorBuckets.push([]);
    return floorBuckets[idx];
  };

  for (let shelfIndex = 0; shelfIndex < shelfGroups.length; shelfIndex += 1) {
    const segments = splitShelfIntoCabinetSegments(shelfGroups[shelfIndex], shelfIndex);
    let segCursor = 0;

    while (segCursor < segments.length) {
      const { blueprint } = getBiomeForFloorIndex(currentFloorIndex);
      const capacity = blueprint.bookcaseAnchors.length;
      const bucket = ensureBucket(currentFloorIndex);
      const remaining = capacity - bucket.length;
      const needed = segments.length - segCursor;

      // Keep multi-cabinet shelves together on the same floor whenever they fit cleanly
      if (needed > remaining && bucket.length > 0 && needed <= capacity) {
        currentFloorIndex += 1;
        continue;
      }
      if (remaining <= 0) {
        currentFloorIndex += 1;
        continue;
      }

      const take = Math.min(remaining, needed);
      for (let k = 0; k < take; k += 1) bucket.push(segments[segCursor + k]);
      segCursor += take;
    }
  }

  const targetFloorCount = Math.max(minFloors, floorBuckets.length, 1);
  ensureBucket(targetFloorCount - 1);
  return floorBuckets;
}

function formatRomanSuffix(variant: number): string {
  if (variant <= 0) return '';
  const romans = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
  return romans[variant] ?? ` #${variant + 1}`;
}

function buildFloorWorld(
  floorIndex: number,
  totalFloors: number,
  assignedSegments: readonly ShelfSegmentPlan[],
  tierYs: number[],
): FloorWorldLayout3D {
  const { biomeId, biomeVariant, blueprint } = getBiomeForFloorIndex(floorIndex);
  const floorNumber = floorIndex + 1;
  const hasPrevFloor = floorIndex > 0;
  const hasNextFloor = floorIndex + 1 < totalFloors;
  const title = `Tầng ${floorNumber} · ${blueprint.meta.label}${formatRomanSuffix(biomeVariant)}`;

  const { SHELF_TOTAL_HEIGHT, SHELF_DEPTH, CROWN_HEIGHT } = LIBRARY_3D_CONSTANTS;
  const bookcases: WorldBookcase3D[] = [];
  const floorBooks: BookSlot3D[] = [];
  const bookById = new Map<string, BookSlot3D>();
  const bookcasesByShelfKey = new Map<string, WorldBookcase3D[]>();
  const shelfKeySet = new Set<string>();
  const colliders: WorldCollider3D[] = [...blueprint.colliders];

  for (let i = 0; i < assignedSegments.length; i += 1) {
    const anchor = blueprint.bookcaseAnchors[i];
    if (!anchor) break;
    const seg = assignedSegments[i];
    const width = computeCabinetWidth(seg.bayCount);

    const slots = buildCabinetBookSlots({
      rows: seg.rows,
      bayCount: seg.bayCount,
      bayOffset: seg.bayOffset,
      shelfKey: seg.shelfKey,
      shelfIndex: seg.shelfIndex,
      floorIndex,
      startInstanceIndex: floorBooks.length,
      centerX: anchor.x,
      baseY: anchor.baseY,
      centerZ: anchor.z,
      facingYaw: anchor.facingYaw,
    });

    const bookIndices: number[] = [];
    for (let s = 0; s < slots.length; s += 1) {
      const slot = slots[s];
      floorBooks.push(slot);
      bookIndices.push(slot.instanceIndex);
      bookById.set(slot.bookId, slot);
    }

    const nameplateCenter = transformCabinetLocalPoint(
      0,
      SHELF_TOTAL_HEIGHT - CROWN_HEIGHT + 0.17,
      SHELF_DEPTH * 0.5 + 0.032,
      anchor.x,
      anchor.baseY,
      anchor.z,
      anchor.facingYaw,
    );
    const interactPoint = transformCabinetLocalPoint(
      0,
      0,
      SHELF_DEPTH * 0.5 + WORLD_LAYOUT_CONSTANTS.BOOKCASE_STANDOFF_DIST,
      anchor.x,
      anchor.baseY,
      anchor.z,
      anchor.facingYaw,
    );

    const displayLabel =
      seg.segmentCount > 1
        ? `${seg.shelfName} (${seg.segmentIndex + 1}/${seg.segmentCount})`
        : seg.shelfName;

    const cabinetId = `f${floorNumber}-bc-${anchor.id}`;
    const bookcase: WorldBookcase3D = {
      id: cabinetId,
      shelfKey: seg.shelfKey,
      shelfName: seg.shelfName,
      displayLabel,
      shelfIndex: seg.shelfIndex,
      segmentIndex: seg.segmentIndex,
      segmentCount: seg.segmentCount,
      floorIndex,
      bayCount: seg.bayCount,
      width,
      height: SHELF_TOTAL_HEIGHT,
      depth: SHELF_DEPTH,
      position: [anchor.x, anchor.baseY, anchor.z],
      facingYaw: anchor.facingYaw,
      nameplateCenter,
      nameplateYaw: anchor.facingYaw,
      interactPoint,
      interactYaw: anchor.facingYaw + Math.PI,
      tierYs,
      books: slots,
      bookIndices,
      bookCount: slots.length,
    };

    bookcases.push(bookcase);
    shelfKeySet.add(seg.shelfKey);
    const existing = bookcasesByShelfKey.get(seg.shelfKey);
    if (existing) existing.push(bookcase);
    else bookcasesByShelfKey.set(seg.shelfKey, [bookcase]);

    colliders.push({
      kind: 'box',
      id: `col-${cabinetId}`,
      tag: 'bookcase',
      centerX: anchor.x,
      centerZ: anchor.z,
      halfWidth: width * 0.5,
      halfDepth: SHELF_DEPTH * 0.5,
      yaw: anchor.facingYaw,
      minY: anchor.baseY,
      maxY: anchor.baseY + SHELF_TOTAL_HEIGHT,
      blocksCamera: true,
    });
  }

  const stations: WorldStation3D[] = blueprint.stations.map((st) => {
    if (st.kind !== 'portal_up') return { ...st };
    if (hasNextFloor) {
      const nextFloorNum = floorNumber + 1;
      const nextMeta = getBiomeForFloorIndex(floorIndex + 1).blueprint.meta;
      return {
        ...st,
        label: `Cổng lên Tầng ${nextFloorNum}`,
        prompt: `Bước sang Tầng ${nextFloorNum} · ${nextMeta.label}`,
        targetFloorIndex: floorIndex + 1,
      };
    }
    return {
      ...st,
      label: 'Đài Cổng Đỉnh Tháp',
      prompt: 'Quay về Tầng 1 · Thị trấn Khởi Đầu',
      targetFloorIndex: 0,
    };
  });

  if (hasPrevFloor) {
    const prevFloorNum = floorNumber - 1;
    const prevMeta = getBiomeForFloorIndex(floorIndex - 1).blueprint.meta;
    stations.push({
      id: `f${floorNumber}-portal-down`,
      kind: 'portal_down',
      label: `Cổng xuống Tầng ${prevFloorNum}`,
      prompt: `Quay lại Tầng ${prevFloorNum} · ${prevMeta.label}`,
      position: [...blueprint.portalDownAnchor],
      facingYaw: Math.PI,
      interactRadius: 2.8,
      targetFloorIndex: floorIndex - 1,
    });
  }

  const npcs: WorldNpcSpec3D[] = blueprint.npcs.map((spec) => ({
    ...spec,
    id: `f${floorNumber}-${spec.id}`,
    floorIndex,
    spawn: [...spec.spawn],
    waypoints: spec.waypoints.map((wp) => ({ ...wp })),
  }));

  return {
    floorIndex,
    floorNumber,
    title,
    biomeId,
    biomeVariant,
    biomeMeta: blueprint.meta,
    bounds: { ...blueprint.bounds },
    spawnPoint: [...blueprint.spawnPoint],
    spawnYaw: blueprint.spawnYaw,
    bossAnchor: [...blueprint.bossAnchor],
    bossYaw: blueprint.bossYaw,
    bookcases,
    shelfKeys: Array.from(shelfKeySet),
    books: floorBooks,
    bookById,
    bookcasesByShelfKey,
    stations,
    surfaces: blueprint.surfaces.map((s) => ({ ...s })),
    colliders,
    npcs,
    props: blueprint.props.map((p) => ({ ...p, position: [...p.position] })),
    walkCheckpoints: blueprint.walkCheckpoints.map(([x, z]) => [x, z]),
    hasPrevFloor,
    hasNextFloor,
  };
}

/**
 * Pure deterministic Aincrad Reading Tower world generator (`D-017`):
 * partitions grouped shelves across biome floors, computes exact rotated bookcase &
 * book transforms, generates dynamic bookcase colliders, and builds O(1) jump maps.
 */
export function buildTowerWorldLayout3D(
  shelfGroups: readonly ShelfGroup[],
  options?: BuildTowerOptions,
): TowerWorldLayout3D {
  const minFloors = Math.max(
    1,
    Math.floor(options?.minFloors ?? WORLD_LAYOUT_CONSTANTS.DEFAULT_MIN_FLOORS),
  );
  const buckets = partitionSegmentsIntoFloors(shelfGroups, minFloors);
  const tierYs = computeTierPlankYs();
  const totalFloors = buckets.length;

  const floors: FloorWorldLayout3D[] = [];
  const floorIndexByShelfKey = new Map<string, number>();
  const floorIndexByBookId = new Map<string, number>();
  const bookById = new Map<string, BookSlot3D>();
  let totalBooks = 0;

  for (let f = 0; f < totalFloors; f += 1) {
    const floor = buildFloorWorld(f, totalFloors, buckets[f], tierYs);
    floors.push(floor);
    totalBooks += floor.books.length;

    for (let k = 0; k < floor.shelfKeys.length; k += 1) {
      const key = floor.shelfKeys[k];
      if (!floorIndexByShelfKey.has(key)) floorIndexByShelfKey.set(key, f);
    }
    for (let b = 0; b < floor.books.length; b += 1) {
      const slot = floor.books[b];
      floorIndexByBookId.set(slot.bookId, f);
      bookById.set(slot.bookId, slot);
    }
  }

  return {
    floors,
    totalFloors,
    totalBooks,
    floorIndexByShelfKey,
    floorIndexByBookId,
    bookById,
  };
}

/**
 * Adapts a single active floor into the `LibraryLayout3D` interface consumed by
 * `InstancedBooksMesh.tsx` so only `activeFloorIndex` books are rendered (`D-017`).
 */
export function getFloorActiveLibraryLayout(floor: FloorWorldLayout3D): LibraryLayout3D {
  const shelves: ShelfLayout3D[] = [];
  const shelfByKey = new Map<string, ShelfLayout3D>();

  for (let i = 0; i < floor.bookcases.length; i += 1) {
    const bc = floor.bookcases[i];
    const halfW = bc.width * 0.5;
    const halfD = bc.depth * 0.5;
    const shelfLayout: ShelfLayout3D = {
      key: bc.shelfKey,
      name: bc.displayLabel,
      shelfIndex: i,
      floorIndex: floor.floorIndex,
      bookCount: bc.bookCount,
      bayCount: bc.bayCount,
      centerX: bc.position[0],
      centerZ: bc.position[2],
      facingYaw: bc.facingYaw,
      minX: bc.position[0] - halfW,
      maxX: bc.position[0] + halfW,
      width: bc.width,
      height: bc.height,
      depth: bc.depth,
      backZ: bc.position[2] - halfD,
      frontZ: bc.position[2] + halfD,
      tierYs: bc.tierYs,
      nameplateCenter: bc.nameplateCenter,
      bookIndices: bc.bookIndices,
      books: bc.books,
    };
    shelves.push(shelfLayout);
    if (!shelfByKey.has(bc.shelfKey)) shelfByKey.set(bc.shelfKey, shelfLayout);
  }

  return {
    shelves,
    books: floor.books,
    bookById: floor.bookById,
    shelfByKey,
    minX: floor.bounds.minX,
    maxX: floor.bounds.maxX,
    centerX: (floor.bounds.minX + floor.bounds.maxX) * 0.5,
    hallSpanX: floor.bounds.maxX - floor.bounds.minX,
  };
}

/**
 * Returns bookcases on the active floor sorted by 2D `(x, z)` distance from Kirito.
 */
export function getVisibleFloorBookcases(
  floor: FloorWorldLayout3D,
  playerX: number,
  playerZ: number,
  maxDistance: number = WORLD_LAYOUT_CONSTANTS.DEFAULT_SHELF_VIEW_RADIUS,
): WorldBookcase3D[] {
  const ranked: Array<{ bookcase: WorldBookcase3D; dist: number }> = [];
  for (let i = 0; i < floor.bookcases.length; i += 1) {
    const bookcase = floor.bookcases[i];
    const dist = Math.hypot(bookcase.position[0] - playerX, bookcase.position[2] - playerZ);
    if (dist <= maxDistance) ranked.push({ bookcase, dist });
  }
  ranked.sort((a, b) => a.dist - b.dist || a.bookcase.shelfIndex - b.bookcase.shelfIndex);
  return ranked.map((item) => item.bookcase);
}

/**
 * Selects up to `<= 20–24` featured `CoverPlane` book slots strictly on `activeFloor`
 * ranked by 2D `(x, z)` distance to Kirito (D-013 / D-017).
 */
export function selectActiveFloorFeaturedCovers(
  floor: FloorWorldLayout3D,
  options: ActiveFloorCoverOptions,
): BookSlot3D[] {
  const {
    playerX,
    playerZ,
    hoveredBookId,
    selectedBookId,
    maxSlots = DEFAULT_FEATURED_COVER_SLOTS,
    maxDistance = WORLD_LAYOUT_CONSTANTS.DEFAULT_SHELF_VIEW_RADIUS,
  } = options;

  const limit = Math.max(0, Math.min(Math.floor(maxSlots), MAX_FEATURED_COVER_SLOTS));
  if (limit === 0 || floor.books.length === 0) return [];

  const result: BookSlot3D[] = [];
  const addedIds = new Set<string>();

  const tryAddPriority = (bookId: string | null | undefined) => {
    if (!bookId || result.length >= limit || addedIds.has(bookId)) return;
    const slot = floor.bookById.get(bookId);
    if (!slot || !slot.book.cover_key) return;
    addedIds.add(bookId);
    result.push(slot);
  };

  tryAddPriority(selectedBookId);
  tryAddPriority(hoveredBookId);
  if (result.length >= limit) return result;

  const visibleBookcases = getVisibleFloorBookcases(floor, playerX, playerZ, maxDistance);
  const eyeY = LIBRARY_3D_CONSTANTS.EYE_LEVEL_Y;
  const candidates: Array<{ slot: BookSlot3D; score: number }> = [];

  for (let i = 0; i < visibleBookcases.length; i += 1) {
    const bc = visibleBookcases[i];
    for (let j = 0; j < bc.books.length; j += 1) {
      const slot = bc.books[j];
      if (slot.facing !== 'front' || !slot.book.cover_key || addedIds.has(slot.bookId)) continue;
      const distXZ = Math.hypot(slot.position[0] - playerX, slot.position[2] - playerZ);
      const distY = Math.abs(slot.position[1] - eyeY);
      candidates.push({ slot, score: distXZ + distY * 0.35 });
    }
  }

  candidates.sort((a, b) => a.score - b.score || a.slot.instanceIndex - b.slot.instanceIndex);
  for (let i = 0; i < candidates.length && result.length < limit; i += 1) {
    const slot = candidates[i].slot;
    addedIds.add(slot.bookId);
    result.push(slot);
  }
  return result;
}

export function findJumpTargetForShelf(
  tower: TowerWorldLayout3D,
  shelfKey: string,
): JumpTarget3D | null {
  const floorIndex = tower.floorIndexByShelfKey.get(shelfKey);
  if (floorIndex === undefined) return null;
  const floor = tower.floors[floorIndex];
  const bookcase = floor?.bookcasesByShelfKey.get(shelfKey)?.[0];
  if (!bookcase) return null;
  return {
    floorIndex,
    position: [...bookcase.interactPoint],
    yaw: bookcase.interactYaw,
    shelfKey,
  };
}

export function findJumpTargetForBook(
  tower: TowerWorldLayout3D,
  bookId: string,
): JumpTarget3D | null {
  const floorIndex = tower.floorIndexByBookId.get(bookId);
  if (floorIndex === undefined) return null;
  const floor = tower.floors[floorIndex];
  const slot = floor?.bookById.get(bookId);
  if (!slot) return null;
  const cabinetBaseY = floor.bookcasesByShelfKey.get(slot.shelfKey)?.[0]?.position[1] ?? 0;
  const [px, , pz] = slot.pullDirection;
  const standoff = WORLD_LAYOUT_CONSTANTS.BOOKCASE_STANDOFF_DIST;
  return {
    floorIndex,
    position: [slot.position[0] + px * standoff, cabinetBaseY, slot.position[2] + pz * standoff],
    yaw: slot.facingYaw + Math.PI,
    shelfKey: slot.shelfKey,
    bookId,
  };
}
