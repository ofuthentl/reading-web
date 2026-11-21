import type { Book, ReadingProgress } from '@/types';
import { computeBookProgressPercent } from '@/lib/bookMetadata';
import type {
  BiomeId,
  BossRoomUnlockStatus,
  BoxCollider3D,
  FloorWorldLayout3D,
} from './worldTypes';

const EPUB_PAGES_PER_CHAPTER = 20;
const PAGES_PER_BOOK_MILESTONE = 150;

export interface LibraryReadingTotals {
  completedBooks: number;
  readPages: number;
}

export function getFloorBossName(biomeId: BiomeId, floorNumber: number): string {
  if (biomeId === 'sakura_shrine') return 'Long Kỵ Sĩ Đền Đỏ (Drago Knight)';
  if (biomeId === 'starfield_atrium') return 'Cự Thần Hộ Pháp (Obsidian Golem)';
  if (biomeId === 'starlight_ruins') return 'Phong Long Stormterror';
  return floorNumber === 1 ? 'Hộ vệ Đá Cổ (Stone Golem)' : `Hộ vệ Tháp Tầng ${floorNumber}`;
}

/**
 * Computes global cumulative reading milestones across ANY books in the library
 * (zero fixed book per floor — reading any series contributes toward Boss Room unlocks).
 */
export function computeLibraryReadingTotals(
  books: readonly Book[],
  progress: Readonly<Record<string, ReadingProgress>>,
): LibraryReadingTotals {
  let completedBooks = 0;
  let readPages = 0;

  for (let i = 0; i < books.length; i += 1) {
    const book = books[i];
    const p = progress[book.id];
    if (!p) continue;

    const percent = computeBookProgressPercent(book, p);
    const isDone = p.completed || percent === 100;
    if (isDone) {
      completedBooks += 1;
    }

    if (book.file_type === 'pdf') {
      if (isDone) {
        readPages += Math.max(1, p.totalChapters ?? p.chapterIndex + 1);
      } else {
        const partial = p.chapterIndex + (p.scrollRatio >= 0.45 ? 1 : 0);
        readPages += Math.max(1, partial);
      }
    } else {
      if (isDone) {
        const totalCh = Math.max(1, p.totalChapters ?? p.chapterIndex + 1);
        readPages += totalCh * EPUB_PAGES_PER_CHAPTER;
      } else {
        const clampedRatio = Math.max(0, Math.min(1, p.scrollRatio));
        readPages += Math.round((Math.max(0, p.chapterIndex) + clampedRatio) * EPUB_PAGES_PER_CHAPTER);
      }
    }
  }

  return { completedBooks, readPages };
}

/**
 * Flexible cumulative Boss Room unlock check for Floor `N`:
 * - Floor 1: `1 tập` OR `150 trang`
 * - Floor 2: `3 tập` OR `450 trang`
 * - Floor 3: `6 tập` OR `900 trang`
 * - Floor 4: `10 tập` OR `1.500 trang`
 * - Floor N: `N*(N+1)/2` completed books OR `requiredBooks * 150` read pages across ANY series.
 */
export function evaluateFloorBossUnlock(
  floorNumber: number,
  biomeId: BiomeId,
  books: readonly Book[],
  progress: Readonly<Record<string, ReadingProgress>>,
): BossRoomUnlockStatus {
  const safeFloor = Math.max(1, Math.floor(floorNumber));
  const requiredBooks = Math.round((safeFloor * (safeFloor + 1)) / 2);
  const requiredPages = requiredBooks * PAGES_PER_BOOK_MILESTONE;
  const { completedBooks, readPages } = computeLibraryReadingTotals(books, progress);
  const unlocked = completedBooks >= requiredBooks || readPages >= requiredPages;
  const bossName = getFloorBossName(biomeId, safeFloor);

  const summaryText = unlocked
    ? `Đã mở phong ấn Phòng Boss (${completedBooks}/${requiredBooks} tập · ${readPages}/${requiredPages} trang) — Vào đối mặt ${bossName}`
    : `Phong ấn Phòng Boss Tầng ${safeFloor}: đã đọc ${completedBooks}/${requiredBooks} tập · ${readPages}/${requiredPages} trang (đạt ${requiredBooks} tập hoặc ${requiredPages} trang bất kỳ để mở khoá)`;

  return {
    floorNumber: safeFloor,
    unlocked,
    completedBooks,
    requiredBooks,
    readPages,
    requiredPages,
    bossName,
    summaryText,
  };
}

function wallBox(
  id: string,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): BoxCollider3D {
  return {
    kind: 'box',
    id,
    tag: 'wall',
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    halfWidth: (maxX - minX) * 0.5,
    halfDepth: (maxZ - minZ) * 0.5,
    yaw: 0,
    minY: 0,
    maxY: 8.5,
    blocksCamera: true,
  };
}

/**
 * Generates a dedicated, 360° enclosed Colosseum Boss Arena layout (`19.6 m × 19.6 m`)
 * isolated from the main floor so bosses strictly live inside their sealed Boss Room.
 */
export function buildBossRoomFloorLayout(sourceFloor: FloorWorldLayout3D): FloorWorldLayout3D {
  const bossName = getFloorBossName(sourceFloor.biomeId, sourceFloor.floorNumber);
  const bossRadius = sourceFloor.biomeId === 'starlight_ruins' ? 3.1 : 2.15;

  return {
    floorIndex: sourceFloor.floorIndex,
    floorNumber: sourceFloor.floorNumber,
    biomeId: sourceFloor.biomeId,
    biomeVariant: sourceFloor.biomeVariant,
    biomeMeta: sourceFloor.biomeMeta,
    title: `Phòng Boss Tầng ${sourceFloor.floorNumber} — ${bossName}`,
    bounds: { minX: -9.8, maxX: 9.8, minZ: -9.8, maxZ: 9.8 },
    spawnPoint: [0, 0, 7.2],
    spawnYaw: Math.PI,
    bossAnchor: [0, 0, -2.8],
    bossYaw: 0,
    bookcases: [],
    bookcasesByShelfKey: new Map(),
    shelfKeys: [],
    books: [],
    bookById: new Map(),
    surfaces: [],
    colliders: [
      // 4 perimeter Colosseum walls (blocksCamera=true keeps camera cleanly inside chamber)
      wallBox('boss-wall-n', -11.5, 11.5, -11.5, -9.8),
      wallBox('boss-wall-s', -11.5, 11.5, 9.8, 11.5),
      wallBox('boss-wall-w', -11.5, -9.8, -11.5, 11.5),
      wallBox('boss-wall-e', 9.8, 11.5, -11.5, 11.5),
      // Boss personal-space cylinder so Kirito never clips inside the Boss mesh
      {
        kind: 'cylinder',
        id: 'boss-body-guard',
        tag: 'pillar',
        centerX: 0,
        centerZ: -2.8,
        radius: bossRadius,
        minY: 0,
        maxY: 6.0,
        blocksCamera: false,
      },
    ],
    stations: [
      {
        id: 'st-boss-exit',
        kind: 'boss_exit',
        label: 'Cửa rời Phòng Boss',
        prompt: `Quay lại Tầng ${sourceFloor.floorNumber} — ${sourceFloor.biomeMeta.label}`,
        position: [0, 0, 8.8],
        facingYaw: Math.PI,
        interactRadius: 2.8,
        targetFloorIndex: sourceFloor.floorIndex,
      },
    ],
    props: [],
    npcs: [],
    walkCheckpoints: [
      [0, 7.2],
      [4.5, 2.0],
      [4.5, -5.5],
      [-4.5, -5.5],
      [-4.5, 2.0],
      [0, 8.2],
    ],
    hasPrevFloor: false,
    hasNextFloor: false,
    isBossRoom: true,
    bossSourceFloorIndex: sourceFloor.floorIndex,
  };
}
