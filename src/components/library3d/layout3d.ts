import type { Book, ShelfGroup } from '@/types';
import { pickCoverColor } from '@/lib/bookMetadata';

export type BookFacing = 'spine' | 'front';

export interface CoverPlaneTransform {
  /** World-space center of the cover plane slightly proud of the book cover face */
  position: [number, number, number];
  /** World-space Euler rotation [rx, ry, rz] (XYZ order) for a +Z facing PlaneGeometry */
  rotation: [number, number, number];
  /** Width of the cover quad (world units) */
  width: number;
  /** Height of the cover quad (world units) */
  height: number;
}

export interface BookSlot3D {
  book: Book;
  bookId: string;
  instanceIndex: number;
  shelfKey: string;
  shelfIndex: number;
  bayIndex: number;
  /** Tier index from bottom (0 = bottom tier, TIERS_PER_BAY - 1 = top tier) */
  tierIndex: number;
  slotInTier: number;
  facing: BookFacing;
  /** Local dimensions before rotation: X = spine thickness, Y = height, Z = cover width (depth) */
  dimensions: {
    thickness: number;
    height: number;
    depth: number;
  };
  /** World-space center of the book resting on its shelf plank */
  position: [number, number, number];
  /** World-space Euler rotation [rx, ry, rz] (XYZ order) */
  rotation: [number, number, number];
  /** Resolved hex binding color for InstancedMesh coloring */
  colorHex: string;
  /** Exact transform for mounting a CoverPlane onto this book's front cover */
  coverPlane: CoverPlaneTransform;
}

export interface ShelfLayout3D {
  key: string;
  name: string;
  shelfIndex: number;
  bookCount: number;
  bayCount: number;
  centerX: number;
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

export interface FeaturedCoverSelectionOptions {
  cameraX: number;
  visibleShelfKeys?: ReadonlySet<string>;
  hoveredBookId?: string | null;
  selectedBookId?: string | null;
  /** Desired max featured CoverPlanes (defaults to 20, hard-clamped to <= 24 per D-013) */
  maxSlots?: number;
  /** Shelf window radius used when visibleShelfKeys is omitted (defaults to 2) */
  radius?: number;
}

export const DEFAULT_FEATURED_COVER_SLOTS = 20;
export const MAX_FEATURED_COVER_SLOTS = 24;

export const LIBRARY_3D_CONSTANTS = {
  /** Number of horizontal book tiers inside each tall classical bay */
  TIERS_PER_BAY: 5,
  /** Inner clear width of a single wooden bookcase bay (world meters) */
  BAY_INNER_WIDTH: 2.18,
  /** Usable horizontal packing width inside a bay (leaves side breathing room) */
  BAY_USABLE_WIDTH: 2.02,
  /** Thickness of vertical cabinet pilasters & mullion dividers */
  SIDE_PANEL_THICKNESS: 0.14,
  /** Gap between separate ShelfLayout3D bookcases along the grand hall wall */
  SHELF_GAP_X: 0.52,
  /** Depth of wooden bookcase carcass (Z axis) */
  SHELF_DEPTH: 0.42,
  /** World Z coordinate of bookcase back panel (cabinets face +Z) */
  SHELF_BACK_Z: -0.42,
  /** Decorative stepped base plinth height */
  PLINTH_HEIGHT: 0.28,
  /** Shelf board thickness */
  PLANK_THICKNESS: 0.048,
  /** Clear vertical space per tier (books range 0.345..0.435m) */
  TIER_CLEAR_HEIGHT: 0.50,
  /** Top crown molding + classical nameplate frieze height */
  CROWN_HEIGHT: 0.48,
  /** Total bookcase height: plinth + 5*(plank + clear) + top plank + crown */
  SHELF_TOTAL_HEIGHT: 0.28 + 5 * (0.50 + 0.048) + 0.048 + 0.48,
  /** Comfortable camera eye level looking at middle tiers */
  EYE_LEVEL_Y: 1.88,
  /** Default camera Z distance in front of bookcases */
  CAMERA_Z: 4.55,
  /** Second-story mezzanine balcony height for Grand Hall architecture */
  MEZZANINE_Y: 4.15,
  /** Grand Hall ceiling height */
  HALL_CEILING_Y: 7.8,
  /** Horizontal architectural margin past leftmost/rightmost shelves */
  HALL_SIDE_MARGIN: 5.5,
  /** Backward lean angle (radians) for face-out showcase books */
  FRONT_BOOK_LEAN_X: -0.095,
  /** Pull-out offset (world meters) along +Z when hovering/selecting a book */
  BOOK_PULLOUT_Z: 0.095,
} as const;

const COVER_SURFACE_OFFSET = 0.004;
const SPINE_GAP_X = 0.009;
const FRONT_GAP_X = 0.036;
const IDEAL_ROW_FILL_WIDTH = 1.38;
const MAX_ROW_FILL_RATIO = 0.94;

const TIER_PLACEMENT_ORDERS: Record<number, readonly number[]> = {
  1: [2],
  2: [3, 2],
  3: [3, 2, 1],
  4: [4, 3, 2, 1],
  5: [4, 3, 2, 1, 0],
};

function hashString32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unitFloat(seed: string): number {
  return (hashString32(seed) % 10000) / 10000;
}

function computeTierPlankYs(): number[] {
  const { PLINTH_HEIGHT, PLANK_THICKNESS, TIER_CLEAR_HEIGHT, TIERS_PER_BAY } = LIBRARY_3D_CONSTANTS;
  const ys: number[] = [];
  for (let tier = 0; tier < TIERS_PER_BAY; tier += 1) {
    ys.push(PLINTH_HEIGHT + PLANK_THICKNESS + tier * (TIER_CLEAR_HEIGHT + PLANK_THICKNESS));
  }
  return ys;
}

function computeBookDimensions(book: Book): { thickness: number; height: number; depth: number } {
  const heightJitter = unitFloat(`${book.id}:h`);
  const thicknessJitter = unitFloat(`${book.id}:t`);
  const formatBonus = book.file_type === 'pdf' ? 0.014 : 0;

  const height = Number((0.345 + heightJitter * 0.072 + formatBonus).toFixed(4));
  const sizeRatio = Math.min(1, Math.max(0, Math.log10(Math.max(1, book.file_size / 65536)) / 2.6));
  const thickness = Number((0.050 + thicknessJitter * 0.018 + sizeRatio * 0.020).toFixed(4));
  const depth = Number(Math.min(0.285, Math.max(0.228, height * 0.67)).toFixed(4));

  return { thickness, height, depth };
}

/**
 * Selects rhythmic showcase book indices turned face-out (`facing: 'front'`) on a shelf,
 * strongly favoring books that have a real `cover_key` while interspersing them cleanly
 * among spine-out volumes.
 */
function chooseShowcaseIndices(books: readonly Book[]): Set<number> {
  const count = books.length;
  const chosen = new Set<number>();
  if (count === 0) return chosen;

  const hasCover = (index: number) => Boolean(books[index]?.cover_key);
  const pickNearestWithCover = (target: number, maxRadius: number): number => {
    if (hasCover(target) && !chosen.has(target)) return target;
    for (let offset = 1; offset <= maxRadius; offset += 1) {
      const right = target + offset;
      if (right < count && hasCover(right) && !chosen.has(right)) return right;
      const left = target - offset;
      if (left >= 0 && hasCover(left) && !chosen.has(left)) return left;
    }
    return target;
  };

  if (count <= 3) {
    for (let i = 0; i < count; i += 1) {
      chosen.add(i);
    }
    return chosen;
  }

  const targetCount =
    count <= 8
      ? Math.min(3, Math.max(2, Math.round(count / 3)))
      : Math.max(3, Math.round(count / 6.2));

  const stride = count / targetCount;
  for (let k = 0; k < targetCount; k += 1) {
    // Stagger showcase positions slightly across tiers so covers don't stack in one column
    const stagger = ((k * 37) % 100) / 100;
    const rawIndex = Math.min(count - 1, Math.floor((k + 0.25 + stagger * 0.45) * stride));
    const resolved = pickNearestWithCover(rawIndex, Math.max(1, Math.floor(stride * 0.45)));
    chosen.add(resolved);
  }
  return chosen;
}

interface PreparedBook {
  book: Book;
  facing: BookFacing;
  dimensions: { thickness: number; height: number; depth: number };
  footprintWidth: number;
}

function packBooksIntoRows(prepared: readonly PreparedBook[]): PreparedBook[][] {
  if (prepared.length === 0) return [];
  const maxRowWidth = LIBRARY_3D_CONSTANTS.BAY_USABLE_WIDTH * MAX_ROW_FILL_RATIO;
  const totalWidth = prepared.reduce((sum, item) => sum + item.footprintWidth, 0);

  const minRows = Math.max(1, Math.ceil(totalWidth / maxRowWidth));
  const desiredRows =
    totalWidth <= LIBRARY_3D_CONSTANTS.BAY_USABLE_WIDTH * 0.88
      ? 1
      : Math.max(minRows, Math.ceil(totalWidth / IDEAL_ROW_FILL_WIDTH));

  const targetWidthPerRow = Math.min(maxRowWidth, (totalWidth / desiredRows) * 1.08);
  const rows: PreparedBook[][] = [];
  let currentRow: PreparedBook[] = [];
  let currentWidth = 0;

  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i];
    const wouldOverflowHard = currentRow.length > 0 && currentWidth + item.footprintWidth > maxRowWidth;
    const wouldExceedBalanced =
      currentRow.length > 0 &&
      rows.length + 1 < desiredRows &&
      currentWidth + item.footprintWidth * 0.5 > targetWidthPerRow;

    if (wouldOverflowHard || wouldExceedBalanced) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
    currentRow.push(item);
    currentWidth += item.footprintWidth;
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }
  return rows;
}

function buildCoverPlaneTransform(
  position: [number, number, number],
  rotation: [number, number, number],
  dimensions: { thickness: number; height: number; depth: number },
  facing: BookFacing,
): CoverPlaneTransform {
  const coverWidth = dimensions.depth * 0.96;
  const coverHeight = dimensions.height * 0.96;

  if (facing === 'front') {
    const leanAbs = Math.abs(rotation[0]);
    const offsetDist = dimensions.thickness * 0.5 + COVER_SURFACE_OFFSET;
    return {
      position: [
        position[0],
        position[1] + Math.sin(leanAbs) * offsetDist,
        position[2] + Math.cos(leanAbs) * offsetDist,
      ],
      rotation: [rotation[0], 0, 0],
      width: coverWidth,
      height: coverHeight,
    };
  }

  // Spine-out books have their front cover on local +X face
  const sideOffset = dimensions.thickness * 0.5 + COVER_SURFACE_OFFSET;
  return {
    position: [position[0] + sideOffset, position[1], position[2]],
    rotation: [0, Math.PI / 2, rotation[2]],
    width: coverWidth,
    height: coverHeight,
  };
}

function computeCabinetWidth(bayCount: number): number {
  const { BAY_INNER_WIDTH, SIDE_PANEL_THICKNESS } = LIBRARY_3D_CONSTANTS;
  return bayCount * BAY_INNER_WIDTH + (bayCount + 1) * SIDE_PANEL_THICKNESS;
}

/**
 * Pure deterministic layout engine turning grouped shelves into world-space 3D bookcase
 * cabinets and individual book transforms (spine-out + rhythmic face-out showcase books).
 */
export function buildLibraryLayout3D(shelfGroups: readonly ShelfGroup[]): LibraryLayout3D {
  const tierYs = computeTierPlankYs();
  const {
    TIERS_PER_BAY,
    BAY_INNER_WIDTH,
    SIDE_PANEL_THICKNESS,
    SHELF_GAP_X,
    SHELF_DEPTH,
    SHELF_BACK_Z,
    SHELF_TOTAL_HEIGHT,
    CROWN_HEIGHT,
    HALL_SIDE_MARGIN,
    FRONT_BOOK_LEAN_X,
  } = LIBRARY_3D_CONSTANTS;

  const frontZ = SHELF_BACK_Z + SHELF_DEPTH;
  const preparedByShelf = shelfGroups.map((group) => {
    const showcaseSet = chooseShowcaseIndices(group.books);
    const prepared: PreparedBook[] = group.books.map((book, idx) => {
      const facing: BookFacing = showcaseSet.has(idx) ? 'front' : 'spine';
      const dimensions = computeBookDimensions(book);
      const footprintWidth =
        facing === 'front' ? dimensions.depth + FRONT_GAP_X : dimensions.thickness + SPINE_GAP_X;
      return { book, facing, dimensions, footprintWidth };
    });
    const rows = packBooksIntoRows(prepared);
    const bayCount = Math.max(1, Math.ceil(rows.length / TIERS_PER_BAY));
    const width = computeCabinetWidth(bayCount);
    return { group, rows, bayCount, width };
  });

  if (preparedByShelf.length === 0) {
    return {
      shelves: [],
      books: [],
      bookById: new Map(),
      shelfByKey: new Map(),
      minX: 0,
      maxX: 0,
      centerX: 0,
      hallSpanX: HALL_SIDE_MARGIN * 2,
    };
  }

  const totalRowWidth =
    preparedByShelf.reduce((sum, item) => sum + item.width, 0) +
    Math.max(0, preparedByShelf.length - 1) * SHELF_GAP_X;

  let cursorX = -totalRowWidth * 0.5;
  const shelves: ShelfLayout3D[] = [];
  const allBooks: BookSlot3D[] = [];
  const bookById = new Map<string, BookSlot3D>();
  const shelfByKey = new Map<string, ShelfLayout3D>();

  for (let shelfIndex = 0; shelfIndex < preparedByShelf.length; shelfIndex += 1) {
    const { group, rows, bayCount, width } = preparedByShelf[shelfIndex];
    const minX = cursorX;
    const maxX = cursorX + width;
    const centerX = (minX + maxX) * 0.5;
    cursorX = maxX + SHELF_GAP_X;

    const shelfBooks: BookSlot3D[] = [];
    const shelfBookIndices: number[] = [];

    for (let bayIndex = 0; bayIndex < bayCount; bayIndex += 1) {
      const bayRows = rows.slice(bayIndex * TIERS_PER_BAY, (bayIndex + 1) * TIERS_PER_BAY);
      if (bayRows.length === 0) continue;

      const tierOrder = TIER_PLACEMENT_ORDERS[bayRows.length] ?? TIER_PLACEMENT_ORDERS[TIERS_PER_BAY];
      const bayCenterX =
        minX + SIDE_PANEL_THICKNESS + bayIndex * (BAY_INNER_WIDTH + SIDE_PANEL_THICKNESS) + BAY_INNER_WIDTH * 0.5;

      for (let r = 0; r < bayRows.length; r += 1) {
        const rowItems = bayRows[r];
        const tierIndex = tierOrder[r];
        const plankTopY = tierYs[tierIndex];

        const rowSpan = rowItems.reduce((sum, item) => sum + item.footprintWidth, 0);
        let itemCursorX = bayCenterX - rowSpan * 0.5;

        for (let slotInTier = 0; slotInTier < rowItems.length; slotInTier += 1) {
          const item = rowItems[slotInTier];
          const { book, facing, dimensions, footprintWidth } = item;
          const slotCenterX = itemCursorX + footprintWidth * 0.5;
          itemCursorX += footprintWidth;

          let posY: number;
          let posZ: number;
          let rotation: [number, number, number];

          if (facing === 'front') {
            const lean = FRONT_BOOK_LEAN_X;
            const absLean = Math.abs(lean);
            posY =
              plankTopY +
              dimensions.height * 0.5 * Math.cos(absLean) +
              dimensions.thickness * 0.5 * Math.sin(absLean);
            // Set showcase books proudly near the front edge of the plank
            posZ = frontZ - dimensions.thickness * 0.5 - 0.055;
            rotation = [lean, -Math.PI / 2, 0];
          } else {
            const depthJitter = (unitFloat(`${book.id}:z`) - 0.5) * 0.024;
            const subtleTiltZ = (unitFloat(`${book.id}:rz`) - 0.5) * 0.022;
            posY = plankTopY + dimensions.height * 0.5;
            posZ = frontZ - dimensions.depth * 0.5 - 0.032 + depthJitter;
            rotation = [0, 0, subtleTiltZ];
          }

          const position: [number, number, number] = [slotCenterX, posY, posZ];
          const instanceIndex = allBooks.length;
          const slot: BookSlot3D = {
            book,
            bookId: book.id,
            instanceIndex,
            shelfKey: group.key,
            shelfIndex,
            bayIndex,
            tierIndex,
            slotInTier,
            facing,
            dimensions,
            position,
            rotation,
            colorHex: book.cover_color || pickCoverColor(book.id),
            coverPlane: buildCoverPlaneTransform(position, rotation, dimensions, facing),
          };

          allBooks.push(slot);
          shelfBooks.push(slot);
          shelfBookIndices.push(instanceIndex);
          bookById.set(book.id, slot);
        }
      }
    }

    const shelfLayout: ShelfLayout3D = {
      key: group.key,
      name: group.name,
      shelfIndex,
      bookCount: group.books.length,
      bayCount,
      centerX,
      minX,
      maxX,
      width,
      height: SHELF_TOTAL_HEIGHT,
      depth: SHELF_DEPTH,
      backZ: SHELF_BACK_Z,
      frontZ,
      tierYs,
      nameplateCenter: [centerX, SHELF_TOTAL_HEIGHT - CROWN_HEIGHT * 0.54, frontZ + 0.028],
      bookIndices: shelfBookIndices,
      books: shelfBooks,
    };

    shelves.push(shelfLayout);
    shelfByKey.set(group.key, shelfLayout);
  }

  const minX = shelves[0].minX;
  const maxX = shelves[shelves.length - 1].maxX;

  return {
    shelves,
    books: allBooks,
    bookById,
    shelfByKey,
    minX,
    maxX,
    centerX: (minX + maxX) * 0.5,
    hallSpanX: maxX - minX + HALL_SIDE_MARGIN * 2,
  };
}

export function getNearestShelfIndex(cameraX: number, layouts: readonly ShelfLayout3D[]): number {
  if (layouts.length === 0) return -1;
  let nearestIdx = 0;
  let nearestDist = Math.abs(layouts[0].centerX - cameraX);

  for (let i = 1; i < layouts.length; i += 1) {
    const dist = Math.abs(layouts[i].centerX - cameraX);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

/**
 * Computes the active window of shelves around the camera (`center ± radius`, default `radius = 2`)
 * for texture windowing & CoverPlane budgeting (D-013 / D-014).
 */
export function getVisibleShelfWindow(
  cameraX: number,
  layouts: readonly ShelfLayout3D[],
  radius = 2,
): VisibleShelfWindow {
  if (layouts.length === 0) {
    return {
      centerIndex: -1,
      startIndex: 0,
      endIndex: -1,
      shelves: [],
      keys: [],
      keySet: new Set<string>(),
    };
  }

  const safeRadius = Math.max(0, Math.floor(radius));
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
 * 1. Selected & hovered books with a cover key always get priority.
 * 2. Face-out showcase books inside the visible shelf window sorted by proximity to cameraX
 *    (with gentle eye-level preference) fill the remaining slots up to the hard cap.
 */
export function selectFeaturedCoverSlots(
  layout: LibraryLayout3D,
  options: FeaturedCoverSelectionOptions,
): BookSlot3D[] {
  const {
    cameraX,
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
    addedIds.add(bookId);
    result.push(slot);
  };

  tryAddPriorityBook(selectedBookId);
  tryAddPriorityBook(hoveredBookId);

  if (result.length >= limit) return result;

  const activeKeys =
    visibleShelfKeys ?? getVisibleShelfWindow(cameraX, layout.shelves, radius).keySet;

  const candidates: Array<{ slot: BookSlot3D; score: number }> = [];
  const eyeY = LIBRARY_3D_CONSTANTS.EYE_LEVEL_Y;

  for (let i = 0; i < layout.shelves.length; i += 1) {
    const shelf = layout.shelves[i];
    if (!activeKeys.has(shelf.key)) continue;

    for (let j = 0; j < shelf.books.length; j += 1) {
      const slot = shelf.books[j];
      if (slot.facing !== 'front' || !slot.book.cover_key || addedIds.has(slot.bookId)) continue;
      const distX = Math.abs(slot.position[0] - cameraX);
      const distY = Math.abs(slot.position[1] - eyeY);
      candidates.push({ slot, score: distX + distY * 0.35 });
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
