import {
  DEFAULT_FEATURED_COVER_SLOTS,
  LIBRARY_3D_CONSTANTS,
  MAX_FEATURED_COVER_SLOTS,
  type BookFacing,
  type BookSlot3D,
  type CoverPlaneTransform,
} from './bookPacking3d';

export {
  DEFAULT_FEATURED_COVER_SLOTS,
  LIBRARY_3D_CONSTANTS,
  MAX_FEATURED_COVER_SLOTS,
  type BookFacing,
  type BookSlot3D,
  type CoverPlaneTransform,
};

export interface ShelfLayout3D {
  key: string;
  name: string;
  shelfIndex: number;
  floorIndex: number;
  bookCount: number;
  bayCount: number;
  centerX: number;
  centerZ: number;
  facingYaw: number;
  minX: number;
  maxX: number;
  width: number;
  height: number;
  depth: number;
  backZ: number;
  frontZ: number;
  /** Top Y surface of each shelf plank (index 0 = bottom tier) */
  tierYs: number[];
  /** World-space center of the classical frieze nameplate above the cabinet */
  nameplateCenter: [number, number, number];
  bookIndices: number[];
  books: BookSlot3D[];
}

export interface LibraryLayout3D {
  shelves: ShelfLayout3D[];
  books: BookSlot3D[];
  bookById: Map<string, BookSlot3D>;
  shelfByKey: Map<string, ShelfLayout3D>;
  minX: number;
  maxX: number;
  centerX: number;
  /** Total architectural hall width along X including end margins */
  hallSpanX: number;
}

export interface VisibleShelfWindow {
  centerIndex: number;
  startIndex: number;
  endIndex: number;
  shelves: ShelfLayout3D[];
  keys: string[];
  keySet: Set<string>;
}

export interface VisibleShelfWindowOptions {
  /** Player or camera Z coordinate for 2D `(x, z)` distance ranking */
  cameraZ?: number;
  /** Restrict window to shelves on the currently active tower floor (`D-017`) */
  activeFloorIndex?: number;
  /** Optional radial cutoff in world meters when ranking in 2D `(x, z)` */
  maxDistance?: number;
}

export interface FeaturedCoverSelectionOptions {
  cameraX: number;
  /** Optional player/camera Z coordinate for 2D `(x, z)` proximity scoring */
  cameraZ?: number;
  /** Restrict CoverPlanes to the active floor (`D-017`) */
  activeFloorIndex?: number;
  visibleShelfKeys?: ReadonlySet<string>;
  hoveredBookId?: string | null;
  selectedBookId?: string | null;
  /** Desired max featured CoverPlanes (defaults to 20, hard-clamped to <= 24 per D-013) */
  maxSlots?: number;
  /** Shelf window radius used when visibleShelfKeys is omitted (defaults to 2) */
  radius?: number;
}

export function getNearestShelfIndex(
  cameraX: number,
  layouts: readonly ShelfLayout3D[],
  cameraZ?: number,
): number {
  if (layouts.length === 0) return -1;
  let nearestIdx = 0;
  let nearestDist =
    cameraZ === undefined
      ? Math.abs(layouts[0].centerX - cameraX)
      : Math.hypot(layouts[0].centerX - cameraX, layouts[0].centerZ - cameraZ);

  for (let i = 1; i < layouts.length; i += 1) {
    const dist =
      cameraZ === undefined
        ? Math.abs(layouts[i].centerX - cameraX)
        : Math.hypot(layouts[i].centerX - cameraX, layouts[i].centerZ - cameraZ);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

/**
 * Computes the active window of shelves around the camera/player for texture windowing &
 * CoverPlane budgeting (D-013 / D-014). Supports both legacy 1D corridor (`cameraX`) and
 * active-floor 2D world proximity (`activeFloorIndex` + `cameraZ`).
 */
export function getVisibleShelfWindow(
  cameraX: number,
  layouts: readonly ShelfLayout3D[],
  radius = 2,
  options?: VisibleShelfWindowOptions,
): VisibleShelfWindow {
  const empty: VisibleShelfWindow = {
    centerIndex: -1,
    startIndex: 0,
    endIndex: -1,
    shelves: [],
    keys: [],
    keySet: new Set<string>(),
  };
  if (layouts.length === 0) return empty;

  const activeFloorIndex = options?.activeFloorIndex;
  const cameraZ = options?.cameraZ;
  const safeRadius = Math.max(0, Math.floor(radius));

  if (activeFloorIndex !== undefined || cameraZ !== undefined) {
    const candidates: Array<{ shelf: ShelfLayout3D; originalIndex: number; dist: number }> = [];
    for (let i = 0; i < layouts.length; i += 1) {
      const shelf = layouts[i];
      if (activeFloorIndex !== undefined && shelf.floorIndex !== activeFloorIndex) continue;
      const dist =
        cameraZ === undefined
          ? Math.abs(shelf.centerX - cameraX)
          : Math.hypot(shelf.centerX - cameraX, shelf.centerZ - cameraZ);
      if (options?.maxDistance !== undefined && dist > options.maxDistance) continue;
      candidates.push({ shelf, originalIndex: i, dist });
    }
    if (candidates.length === 0) return empty;

    candidates.sort((a, b) => a.dist - b.dist || a.originalIndex - b.originalIndex);
    const maxCount = Math.max(1, safeRadius * 2 + 1);
    const chosen = candidates.slice(0, maxCount);
    const visibleShelves = chosen.map((item) => item.shelf);
    const keys = visibleShelves.map((shelf) => shelf.key);
    const indices = chosen.map((item) => item.originalIndex);

    return {
      centerIndex: chosen[0].originalIndex,
      startIndex: Math.min(...indices),
      endIndex: Math.max(...indices),
      shelves: visibleShelves,
      keys,
      keySet: new Set(keys),
    };
  }

  const centerIndex = getNearestShelfIndex(cameraX, layouts);
  const startIndex = Math.max(0, centerIndex - safeRadius);
  const endIndex = Math.min(layouts.length - 1, centerIndex + safeRadius);
  const visibleShelves = layouts.slice(startIndex, endIndex + 1);
  const keys = visibleShelves.map((shelf) => shelf.key);

  return {
    centerIndex,
    startIndex,
    endIndex,
    shelves: visibleShelves,
    keys,
    keySet: new Set(keys),
  };
}

/**
 * Selects up to `<= 20–24` featured book slots to mount `CoverPlane` textures onto (D-013):
 * 1. Selected & hovered books on the active floor with a cover key always get priority.
 * 2. Face-out showcase books inside the visible shelf window sorted by proximity to camera/player
 *    (1D `cameraX` or 2D `(cameraX, cameraZ)` with gentle eye-level preference) fill up to cap.
 */
export function selectFeaturedCoverSlots(
  layout: LibraryLayout3D,
  options: FeaturedCoverSelectionOptions,
): BookSlot3D[] {
  const {
    cameraX,
    cameraZ,
    activeFloorIndex,
    visibleShelfKeys,
    hoveredBookId,
    selectedBookId,
    maxSlots = DEFAULT_FEATURED_COVER_SLOTS,
    radius = 2,
  } = options;

  const limit = Math.max(0, Math.min(Math.floor(maxSlots), MAX_FEATURED_COVER_SLOTS));
  if (limit === 0 || layout.books.length === 0) return [];

  const result: BookSlot3D[] = [];
  const addedIds = new Set<string>();

  const tryAddPriorityBook = (bookId: string | null | undefined) => {
    if (!bookId || result.length >= limit || addedIds.has(bookId)) return;
    const slot = layout.bookById.get(bookId);
    if (!slot || !slot.book.cover_key) return;
    if (activeFloorIndex !== undefined && slot.floorIndex !== activeFloorIndex) return;
    addedIds.add(bookId);
    result.push(slot);
  };

  tryAddPriorityBook(selectedBookId);
  tryAddPriorityBook(hoveredBookId);
  if (result.length >= limit) return result;

  const activeKeys =
    visibleShelfKeys ??
    getVisibleShelfWindow(cameraX, layout.shelves, radius, { cameraZ, activeFloorIndex }).keySet;

  const candidates: Array<{ slot: BookSlot3D; score: number }> = [];
  const eyeY = LIBRARY_3D_CONSTANTS.EYE_LEVEL_Y;

  for (let i = 0; i < layout.shelves.length; i += 1) {
    const shelf = layout.shelves[i];
    if (activeFloorIndex !== undefined && shelf.floorIndex !== activeFloorIndex) continue;
    if (!activeKeys.has(shelf.key)) continue;

    for (let j = 0; j < shelf.books.length; j += 1) {
      const slot = shelf.books[j];
      if (slot.facing !== 'front' || !slot.book.cover_key || addedIds.has(slot.bookId)) continue;
      const distXZ =
        cameraZ === undefined
          ? Math.abs(slot.position[0] - cameraX)
          : Math.hypot(slot.position[0] - cameraX, slot.position[2] - cameraZ);
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
