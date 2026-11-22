import type { Book, ReadingProgress } from '@/types';
import {
  type LibraryReadingTotals,
  type ReaderRpgStats,
  computeLibraryReadingTotals,
  computeReaderRpgStats,
} from '@/lib/readingStats';
import type {
  BiomeId,
  BossRoomUnlockStatus,
  BoxCollider3D,
  FloorWorldLayout3D,
} from './worldTypes';

export {
  type LibraryReadingTotals,
  type ReaderRpgStats,
  computeLibraryReadingTotals,
  computeReaderRpgStats,
};

const PAGES_PER_BOOK_MILESTONE = 150;

export function getFloorBossName(biomeId: BiomeId, floorNumber: number): string {
  if (biomeId === 'sakura_shrine') return 'Long Kỵ Sĩ Đền Đỏ (Drago Knight)';
  if (biomeId === 'starfield_atrium') return 'Cự Thần Hộ Pháp (Obsidian Golem)';
  if (biomeId === 'starlight_ruins') return 'Phong Long Stormterror';
  return floorNumber === 1 ? 'Hộ vệ Đá Cổ (Stone Golem)' : `Hộ vệ Tháp Tầng ${floorNumber}`;
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
  tag: BoxCollider3D['tag'] = 'wall',
  blocksCamera = true,
): BoxCollider3D {
  return {
    kind: 'box',
    id,
    tag,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    halfWidth: (maxX - minX) * 0.5,
    halfDepth: (maxZ - minZ) * 0.5,
    yaw: 0,
    minY: 0,
    maxY: 8.5,
    blocksCamera,
  };
}

/**
 * Returns `true` when this floor's Boss Room uses the open-air Floating Sky Battlefield
 * (`public/models/boss-battlefield.glb`, Stormterror / `starlight_ruins`, `D-024`) instead
 * of the 360° enclosed Colosseum chamber (`boss-arena.glb`).
 */
export function isSkyBattlefieldBossRoom(biomeId: BiomeId): boolean {
  return biomeId === 'starlight_ruins';
}

/**
 * Generates the dedicated Boss Arena layout isolated from the main library floor:
 * - Floors with `starlight_ruins` (Floor 4 — Stormterror): Open-air Floating Sky Battlefield
 *   (`boss-battlefield.glb` scaled 4x, flat deck `[-14.8, 14.8] × [-4.8, 4.8]`, open-sky camera).
 * - Other floors (Floors 1–3 — Golem / Drago Knight): Enclosed 360° Colosseum chamber (`19.6 m²`).
 */
export function buildBossRoomFloorLayout(sourceFloor: FloorWorldLayout3D): FloorWorldLayout3D {
  const bossName = getFloorBossName(sourceFloor.biomeId, sourceFloor.floorNumber);

  if (isSkyBattlefieldBossRoom(sourceFloor.biomeId)) {
    return {
      floorIndex: sourceFloor.floorIndex,
      floorNumber: sourceFloor.floorNumber,
      biomeId: sourceFloor.biomeId,
      biomeVariant: sourceFloor.biomeVariant,
      biomeMeta: sourceFloor.biomeMeta,
      title: `Đấu trường Bầu Trời Tầng ${sourceFloor.floorNumber} — ${bossName}`,
      // Generous open-sky bounds so the 3rd-person orbit camera flies freely outside the island rim
      bounds: { minX: -18.5, maxX: 18.5, minZ: -12.5, maxZ: 12.5 },
      spawnPoint: [0, 0, 3.6],
      spawnYaw: Math.PI,
      bossAnchor: [0, 0, -1.5],
      bossYaw: 0,
      bookcases: [],
      bookcasesByShelfKey: new Map(),
      shelfKeys: [],
      books: [],
      bookById: new Map(),
      surfaces: [
        { kind: 'flat', id: 'sky-battlefield-deck', minX: -14.8, maxX: 14.8, minZ: -4.8, maxZ: 4.8, y: 0 },
      ],
      colliders: [
        // Invisible edge barriers aligned to the exact raycast-measured flat deck (`blocksCamera: false`)
        wallBox('sky-edge-n', -18.5, 18.5, -12.5, -4.8, 'railing', false),
        wallBox('sky-edge-s', -18.5, 18.5, 4.8, 12.5, 'railing', false),
        wallBox('sky-edge-w', -18.5, -14.8, -12.5, 12.5, 'railing', false),
        wallBox('sky-edge-e', 14.8, 18.5, -12.5, 12.5, 'railing', false),
        // Stormterror personal-space cylinder (leaves clean clearance from North rim -4.8 & spawn +3.6)
        {
          kind: 'cylinder',
          id: 'boss-body-guard',
          tag: 'pillar',
          centerX: 0,
          centerZ: -1.5,
          radius: 2.35,
          minY: 0,
          maxY: 6.5,
          blocksCamera: false,
        },
      ],
      stations: [
        {
          id: 'st-boss-exit',
          kind: 'boss_exit',
          label: 'Cửa rời Đấu trường Bầu Trời',
          prompt: `Quay lại Tầng ${sourceFloor.floorNumber} — ${sourceFloor.biomeMeta.label}`,
          position: [-12.4, 0, 0.2],
          facingYaw: Math.PI / 2,
          interactRadius: 2.8,
          targetFloorIndex: sourceFloor.floorIndex,
        },
      ],
      props: [],
      npcs: [],
      walkCheckpoints: [
        [0, 3.6],
        [6.5, 2.4],
        [10.5, -1.8],
        [-6.5, 2.4],
        [-11.8, 0.2],
      ],
      hasPrevFloor: false,
      hasNextFloor: false,
      isBossRoom: true,
      bossSourceFloorIndex: sourceFloor.floorIndex,
    };
  }

  const bossRadius = 2.15;

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
