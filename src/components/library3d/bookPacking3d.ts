import type { Book, ShelfGroup } from '@/types';
import { pickCoverColor } from '@/lib/bookMetadata';

export type BookFacing = 'spine' | 'front';

export interface CoverPlaneTransform {
  /** World-space center of the cover plane slightly proud of the book cover face */
  position: [number, number, number];
  /** World-space Euler rotation [rx, ry, rz] (Three.js XYZ order) for a +Z facing PlaneGeometry */
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
  /** 0-based floor index in Aincrad Reading Tower (defaults to 0 in legacy flat hall) */
  floorIndex: number;
  bayIndex: number;
  /** Tier index from bottom (0 = bottom tier, TIERS_PER_BAY - 1 = top tier) */
  tierIndex: number;
  slotInTier: number;
  facing: BookFacing;
  /** Cabinet facing yaw around world Y (0 = facing +Z) */
  facingYaw: number;
  /** Normalized world-space pull-out vector for hover/select animation */
  pullDirection: [number, number, number];
  /** Local dimensions before rotation: X = spine thickness, Y = height, Z = cover width (depth) */
  dimensions: {
    thickness: number;
    height: number;
    depth: number;
  };
  /** World-space center of the book resting on its shelf plank */
  position: [number, number, number];
  /** World-space Euler rotation [rx, ry, rz] (Three.js XYZ order) */
  rotation: [number, number, number];
  /** Resolved hex binding color for InstancedMesh coloring */
  colorHex: string;
  /** Exact transform for mounting a CoverPlane onto this book's front cover */
  coverPlane: CoverPlaneTransform;
}

export interface PreparedBook {
  book: Book;
  facing: BookFacing;
  dimensions: { thickness: number; height: number; depth: number };
  footprintWidth: number;
}

export interface PackedShelfRows {
  group: ShelfGroup;
  rows: PreparedBook[][];
  bayCount: number;
  width: number;
}

export interface BuildCabinetBookSlotsOptions {
  rows: readonly PreparedBook[][];
  bayCount: number;
  bayOffset?: number;
  shelfKey: string;
  shelfIndex: number;
  floorIndex: number;
  startInstanceIndex: number;
  /** World-space horizontal center of the bookcase cabinet */
  centerX: number;
  /** World-space floor elevation where the cabinet plinth rests */
  baseY: number;
  /** World-space horizontal center (halfway between back and front face) */
  centerZ: number;
  /** Cabinet facing yaw around world Y (`0` faces `+Z`, `Math.PI/2` faces `+X`) */
  facingYaw: number;
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
  /** Depth of wooden bookcase carcass (Z axis in local cabinet space) */
  SHELF_DEPTH: 0.42,
  /** World Z coordinate of bookcase back panel in legacy corridor (cabinets face +Z) */
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
  /** Comfortable camera eye level framing tall bookcases */
  EYE_LEVEL_Y: 2.22,
  /** Default camera Z distance in front of bookcases (legacy corridor) */
  CAMERA_Z: 5.55,
  /** Second-story mezzanine balcony height for Grand Hall architecture */
  MEZZANINE_Y: 4.15,
  /** Grand Hall ceiling height */
  HALL_CEILING_Y: 7.8,
  /** Horizontal architectural margin past leftmost/rightmost shelves */
  HALL_SIDE_MARGIN: 5.5,
  /** Backward lean angle (radians) for face-out showcase books */
  FRONT_BOOK_LEAN_X: -0.095,
  /** Pull-out offset (world meters) along cabinet forward vector on hover/select */
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

type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

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

function mulMat3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function rotXMat3(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

function rotYMat3(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

function rotZMat3(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/**
 * Converts a 3x3 row-major rotation matrix to Three.js default `'XYZ'` Euler angles
 * with exact gimbal-lock handling so books and cover planes align at any cabinet `facingYaw`.
 */
export function rotationMatrixToEulerXYZ(m: Mat3): [number, number, number] {
  const m13 = Math.max(-1, Math.min(1, m[2]));
  const ry = Math.asin(m13);
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m[5], m[8]), ry, Math.atan2(-m[1], m[0])];
  }
  return [Math.atan2(m[7], m[4]), ry, 0];
}

export function transformCabinetLocalPoint(
  localX: number,
  localY: number,
  localZ: number,
  centerX: number,
  baseY: number,
  centerZ: number,
  facingYaw: number,
): [number, number, number] {
  const cosY = Math.cos(facingYaw);
  const sinY = Math.sin(facingYaw);
  return [
    centerX + localX * cosY + localZ * sinY,
    baseY + localY,
    centerZ - localX * sinY + localZ * cosY,
  ];
}

export function computeTierPlankYs(): number[] {
  const { PLINTH_HEIGHT, PLANK_THICKNESS, TIER_CLEAR_HEIGHT, TIERS_PER_BAY } = LIBRARY_3D_CONSTANTS;
  const ys: number[] = [];
  for (let tier = 0; tier < TIERS_PER_BAY; tier += 1) {
    ys.push(PLINTH_HEIGHT + PLANK_THICKNESS + tier * (TIER_CLEAR_HEIGHT + PLANK_THICKNESS));
  }
  return ys;
}

export function computeCabinetWidth(bayCount: number): number {
  const { BAY_INNER_WIDTH, SIDE_PANEL_THICKNESS } = LIBRARY_3D_CONSTANTS;
  return bayCount * BAY_INNER_WIDTH + (bayCount + 1) * SIDE_PANEL_THICKNESS;
}

function computeBookDimensions(book: Book): { thickness: number; height: number; depth: number } {
  const heightJitter = unitFloat(`${book.id}:h`);
  const thicknessJitter = unitFloat(`${book.id}:t`);

  const height = Number((0.345 + heightJitter * 0.072).toFixed(4));
  const sizeRatio = Math.min(1, Math.max(0, Math.log10(Math.max(1, book.file_size / 65536)) / 2.6));
  const thickness = Number((0.050 + thicknessJitter * 0.018 + sizeRatio * 0.020).toFixed(4));
  const depth = Number(Math.min(0.285, Math.max(0.228, height * 0.67)).toFixed(4));
  return { thickness, height, depth };
}

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
    for (let i = 0; i < count; i += 1) chosen.add(i);
    return chosen;
  }

  const targetCount =
    count <= 8
      ? Math.min(3, Math.max(2, Math.round(count / 3)))
      : Math.max(3, Math.round(count / 6.2));

  const stride = count / targetCount;
  for (let k = 0; k < targetCount; k += 1) {
    const stagger = ((k * 37) % 100) / 100;
    const rawIndex = Math.min(count - 1, Math.floor((k + 0.25 + stagger * 0.45) * stride));
    chosen.add(pickNearestWithCover(rawIndex, Math.max(1, Math.floor(stride * 0.45))));
  }
  return chosen;
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

  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

export function packShelfGroupIntoRows(group: ShelfGroup): PackedShelfRows {
  const showcaseSet = chooseShowcaseIndices(group.books);
  const prepared: PreparedBook[] = group.books.map((book, idx) => {
    const facing: BookFacing = showcaseSet.has(idx) ? 'front' : 'spine';
    const dimensions = computeBookDimensions(book);
    const footprintWidth =
      facing === 'front' ? dimensions.depth + FRONT_GAP_X : dimensions.thickness + SPINE_GAP_X;
    return { book, facing, dimensions, footprintWidth };
  });
  const rows = packBooksIntoRows(prepared);
  const bayCount = Math.max(1, Math.ceil(rows.length / LIBRARY_3D_CONSTANTS.TIERS_PER_BAY));
  return { group, rows, bayCount, width: computeCabinetWidth(bayCount) };
}

/**
 * Populates world-space `BookSlot3D[]` for a cabinet positioned at `(centerX, baseY, centerZ)`
 * and rotated by `facingYaw` around world Y (`0` = facing `+Z`).
 */
export function buildCabinetBookSlots(options: BuildCabinetBookSlotsOptions): BookSlot3D[] {
  const {
    rows,
    bayCount,
    bayOffset = 0,
    shelfKey,
    shelfIndex,
    floorIndex,
    startInstanceIndex,
    centerX,
    baseY,
    centerZ,
    facingYaw,
  } = options;

  const {
    TIERS_PER_BAY,
    BAY_INNER_WIDTH,
    SIDE_PANEL_THICKNESS,
    SHELF_DEPTH,
    FRONT_BOOK_LEAN_X,
  } = LIBRARY_3D_CONSTANTS;

  const tierYs = computeTierPlankYs();
  const width = computeCabinetWidth(bayCount);
  const localMinX = -width * 0.5;
  const localFrontZ = SHELF_DEPTH * 0.5;
  const yawMat = rotYMat3(facingYaw);
  const pullDirection: [number, number, number] = [Math.sin(facingYaw), 0, Math.cos(facingYaw)];

  const frontBookRot = rotationMatrixToEulerXYZ(
    mulMat3(yawMat, mulMat3(rotXMat3(FRONT_BOOK_LEAN_X), rotYMat3(-Math.PI / 2))),
  );
  const frontCoverRot = rotationMatrixToEulerXYZ(mulMat3(yawMat, rotXMat3(FRONT_BOOK_LEAN_X)));

  const slots: BookSlot3D[] = [];
  let nextIndex = startInstanceIndex;

  for (let localBay = 0; localBay < bayCount; localBay += 1) {
    const bayRows = rows.slice(localBay * TIERS_PER_BAY, (localBay + 1) * TIERS_PER_BAY);
    if (bayRows.length === 0) continue;

    const tierOrder = TIER_PLACEMENT_ORDERS[bayRows.length] ?? TIER_PLACEMENT_ORDERS[TIERS_PER_BAY];
    const bayCenterLocalX =
      localMinX +
      SIDE_PANEL_THICKNESS +
      localBay * (BAY_INNER_WIDTH + SIDE_PANEL_THICKNESS) +
      BAY_INNER_WIDTH * 0.5;

    for (let r = 0; r < bayRows.length; r += 1) {
      const rowItems = bayRows[r];
      const tierIndex = tierOrder[r];
      const plankTopY = tierYs[tierIndex];

      const rowSpan = rowItems.reduce((sum, item) => sum + item.footprintWidth, 0);
      let cursorLocalX = bayCenterLocalX - rowSpan * 0.5;

      for (let slotInTier = 0; slotInTier < rowItems.length; slotInTier += 1) {
        const { book, facing, dimensions, footprintWidth } = rowItems[slotInTier];
        const localX = cursorLocalX + footprintWidth * 0.5;
        cursorLocalX += footprintWidth;

        let localY: number;
        let localZ: number;
        let rotation: [number, number, number];
        let coverLocalX: number;
        let coverLocalY: number;
        let coverLocalZ: number;
        let coverRotation: [number, number, number];

        if (facing === 'front') {
          const absLean = Math.abs(FRONT_BOOK_LEAN_X);
          localY =
            plankTopY +
            dimensions.height * 0.5 * Math.cos(absLean) +
            dimensions.thickness * 0.5 * Math.sin(absLean);
          localZ = localFrontZ - dimensions.thickness * 0.5 - 0.055;
          rotation = frontBookRot;

          const offsetDist = dimensions.thickness * 0.5 + COVER_SURFACE_OFFSET;
          coverLocalX = localX;
          coverLocalY = localY + Math.sin(absLean) * offsetDist;
          coverLocalZ = localZ + Math.cos(absLean) * offsetDist;
          coverRotation = frontCoverRot;
        } else {
          const depthJitter = (unitFloat(`${book.id}:z`) - 0.5) * 0.024;
          const subtleTiltZ = (unitFloat(`${book.id}:rz`) - 0.5) * 0.022;
          localY = plankTopY + dimensions.height * 0.5;
          localZ = localFrontZ - dimensions.depth * 0.5 - 0.032 + depthJitter;
          const tiltMat = rotZMat3(subtleTiltZ);
          rotation = rotationMatrixToEulerXYZ(mulMat3(yawMat, tiltMat));

          coverLocalX = localX + dimensions.thickness * 0.5 + COVER_SURFACE_OFFSET;
          coverLocalY = localY;
          coverLocalZ = localZ;
          coverRotation = rotationMatrixToEulerXYZ(
            mulMat3(yawMat, mulMat3(tiltMat, rotYMat3(Math.PI / 2))),
          );
        }

        const position = transformCabinetLocalPoint(
          localX,
          localY,
          localZ,
          centerX,
          baseY,
          centerZ,
          facingYaw,
        );
        const coverPosition = transformCabinetLocalPoint(
          coverLocalX,
          coverLocalY,
          coverLocalZ,
          centerX,
          baseY,
          centerZ,
          facingYaw,
        );

        slots.push({
          book,
          bookId: book.id,
          instanceIndex: nextIndex,
          shelfKey,
          shelfIndex,
          floorIndex,
          bayIndex: bayOffset + localBay,
          tierIndex,
          slotInTier,
          facing,
          facingYaw,
          pullDirection,
          dimensions,
          position,
          rotation,
          colorHex: book.cover_color || pickCoverColor(book.id),
          coverPlane: {
            position: coverPosition,
            rotation: coverRotation,
            width: dimensions.depth * 0.96,
            height: dimensions.height * 0.96,
          },
        });
        nextIndex += 1;
      }
    }
  }

  return slots;
}
