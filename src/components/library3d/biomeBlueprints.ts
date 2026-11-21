import type {
  BiomeBlueprint3D,
  BiomeId,
  BiomeMeta,
  BiomePropKind,
  BiomePropPlacement3D,
  BookcaseAnchor3D,
  BoxCollider3D,
  ColliderTag,
  CylinderCollider3D,
  NpcRole,
  NpcWaypoint3D,
  WorldNpcSpec3D,
  WorldStation3D,
  WorldStationKind,
} from './worldTypes';

export const BIOME_SEQUENCE: readonly BiomeId[] = [
  'town_of_beginnings',
  'sakura_shrine',
  'starfield_atrium',
  'starlight_ruins',
] as const;

export const BIOME_CATALOG: Record<BiomeId, BiomeMeta> = {
  town_of_beginnings: {
    id: 'town_of_beginnings',
    label: 'Thị trấn Khởi Đầu',
    subtitle: 'Quảng trường lát đá, hàng cây xanh & dãy lầu sách mở',
    particleKind: 'leaves',
    hasWater: false,
  },
  sakura_shrine: {
    id: 'sakura_shrine',
    label: 'Rừng Anh Đào & Cầu Gỗ',
    subtitle: 'Hồ nước phản chiếu, cầu gỗ vồng & đền sách trên đồi',
    particleKind: 'petals',
    hasWater: true,
    waterY: -0.35,
  },
  starfield_atrium: {
    id: 'starfield_atrium',
    label: 'Đại sảnh Kính Starfield',
    subtitle: 'Mái vòm kính cao vút & vòng cung tháp kệ cong',
    particleKind: 'dust_motes',
    hasWater: false,
  },
  starlight_ruins: {
    id: 'starlight_ruins',
    label: 'Hồ Đêm Sao & Phế tích Cổ',
    subtitle: 'Đảo đá lơ lửng, cột pha lê sáng & Đài Cổng Boss',
    particleKind: 'fireflies',
    hasWater: true,
    waterY: -0.45,
  },
};

function box(
  id: string,
  tag: ColliderTag,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  minY: number,
  maxY: number,
  blocksCamera = true,
  yaw = 0,
): BoxCollider3D {
  return {
    kind: 'box',
    id,
    tag,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    halfWidth: (maxX - minX) * 0.5,
    halfDepth: (maxZ - minZ) * 0.5,
    yaw,
    minY,
    maxY,
    blocksCamera,
  };
}

function cyl(
  id: string,
  tag: ColliderTag,
  centerX: number,
  centerZ: number,
  radius: number,
  minY: number,
  maxY: number,
  blocksCamera = true,
): CylinderCollider3D {
  return { kind: 'cylinder', id, tag, centerX, centerZ, radius, minY, maxY, blocksCamera };
}

function anchor(id: string, x: number, z: number, facingYaw: number, baseY = 0): BookcaseAnchor3D {
  return { id, x, baseY, z, facingYaw, maxBays: 2 };
}

function station(
  id: string,
  kind: WorldStationKind,
  label: string,
  prompt: string,
  position: [number, number, number],
  facingYaw: number,
  interactRadius = 2.7,
): Omit<WorldStation3D, 'targetFloorIndex'> {
  return { id, kind, label, prompt, position, facingYaw, interactRadius };
}

function prop(
  id: string,
  kind: BiomePropKind,
  position: [number, number, number],
  rotationY = 0,
  scale = 1,
  scaleVec?: [number, number, number],
): BiomePropPlacement3D {
  return scaleVec
    ? { id, kind, position, rotationY, scale, scaleVec }
    : { id, kind, position, rotationY, scale };
}

/**
 * Exact non-uniform scale derived from measured decoded bbox & tread elevation map of
 * `public/models/mountain-stairs.glb`:
 * - Tread slope spans local Z `+0.48 -> -0.36` (0.84 m) and climbs local Y `0 -> 0.415 m`.
 * - Tread valley center sits at local X `-0.065 m` (shifted `+0.55 m` in world X at `sx = 8.4`).
 * - Matches `5.30 m` Z length & `2.40 m` Y rise of `sakura-mountain-stairs` / `ruins-ancient-stairs`.
 */
const MOUNTAIN_STAIRS_SCALE_VEC: [number, number, number] = [8.4, 5.783, 6.31];
const MOUNTAIN_STAIRS_OFFSET_X = 0.55;

function npc(
  id: string,
  name: string,
  role: NpcRole,
  spawn: [number, number, number],
  facingYaw: number,
  greeting: string,
  accentColor: string,
  waypoints?: NpcWaypoint3D[],
): Omit<WorldNpcSpec3D, 'floorIndex'> {
  return {
    id,
    name,
    role,
    spawn,
    facingYaw,
    greeting,
    accentColor,
    waypoints: waypoints ?? [{ x: spawn[0], y: spawn[1], z: spawn[2], pauseSec: 5, facingYaw }],
  };
}

function buildTownBlueprint(): BiomeBlueprint3D {
  // Exact CAD-measured Parisian cobblestone boulevard from `public/models/town-world.glb`
  // mounted at offset (-7.8, 0, -40.0): open avenue spans X ∈ [-5.3, +5.3], Z ∈ [-24, +23],
  // flanked by real European houses, overhanging trees, iron fences & 22 street lamps.
  return {
    meta: BIOME_CATALOG.town_of_beginnings,
    bounds: { minX: -5.3, maxX: 5.3, minZ: -24.0, maxZ: 23.0 },
    spawnPoint: [0, 0, 18.0],
    spawnYaw: Math.PI,
    bossAnchor: [0, 0, -19.2],
    bossYaw: 0,
    bookcaseAnchors: [
      anchor('town-w0', -4.2, 3.75, Math.PI / 2),
      anchor('town-w1', -4.2, -4.9, Math.PI / 2),
      anchor('town-w2', -4.2, -13.55, Math.PI / 2),
      anchor('town-e0', 4.2, 12.75, -Math.PI / 2),
      anchor('town-e1', 4.2, -4.9, -Math.PI / 2),
      anchor('town-e2', 4.2, -13.55, -Math.PI / 2),
    ],
    surfaces: [],
    colliders: [
      // Real European building facades (blocksCamera=true keeps 3rd-person camera cleanly on street)
      box('town-facade-w', 'wall', -7.2, -5.35, -25.0, 24.0, 0, 11.0, true),
      box('town-facade-e', 'wall', 5.35, 7.2, -25.0, 24.0, 0, 11.0, true),
      // Real Parisian trees & wooden barrel/crate cluster along sidewalks
      cyl('town-tree-1', 'tree', -5.17, -0.52, 0.48, 0, 4.8, false),
      cyl('town-tree-2', 'tree', -5.55, 13.4, 0.48, 0, 4.8, false),
      cyl('town-tree-3', 'tree', -5.45, 15.5, 0.48, 0, 4.8, false),
      box('town-barrels', 'wall', 4.65, 6.2, 2.7, 9.7, 0, 1.4, false),
      // Interactive street stations & mascot pedestal
      box('town-reading-table', 'station', -3.05, -1.95, 10.25, 12.15, 0, 0.9, false),
      box('town-librarian-desk', 'station', 1.95, 3.05, 3.45, 5.35, 0, 1.1, false),
      cyl('town-weather-pillar', 'station', -2.8, -18.2, 0.55, 0, 2.5, false),
      cyl('town-mascot-pedestal', 'pillar', 3.2, 1.5, 0.65, 0, 1.4, false),
    ],
    stations: [
      station('st-reading', 'reading_table', 'Bàn đọc Đại lộ', 'Tiếp tục cuốn sách đang đọc dở', [-2.5, 0, 11.2], Math.PI / 2),
      station('st-librarian', 'librarian_desk', 'Bục Thủ thư', 'Tải sách mới vào thư viện', [2.5, 0, 4.4], -Math.PI / 2),
      station('st-weather', 'weather_shrine', 'Trụ Đèn & Thời tiết', 'Chuyển Ban ngày / Chiều tối / Đêm khuya', [-2.8, 0, -18.2], Math.PI / 4, 2.6),
      station('st-portal-up', 'portal_up', 'Cổng lên Tầng kế tiếp', 'Bước qua Cổng Ánh Sáng lên tầng trên', [0, 0, -21.8], 0, 2.8),
    ],
    portalDownAnchor: [0, 0, 21.0],
    props: [
      prop('p-bench-1', 'bench', [-3.65, 0, 11.2], Math.PI / 2),
      prop('p-mascot-town', 'mascot_pedestal', [3.2, 0, 1.5], -Math.PI * 0.6),
      prop('p-boss-pad', 'boss_pedestal', [0, 0, -19.2]),
    ],
    npcs: [
      npc('npc-town-librarian', 'Thủ thư Yui', 'librarian', [3.65, 0, 4.4], -Math.PI / 2, 'Chào mừng tới Đại lộ Khởi Đầu! Hãy ghé Bục Thủ thư bất cứ lúc nào để thêm sách mới.', '#38bdf8'),
      npc('npc-town-reader', 'Độc giả Klein', 'reader_sitting', [-3.65, 0, 11.2], Math.PI / 2, 'Ngồi đọc sách dưới tán cây phố đá lát sau cơn mưa thật yên bình.', '#f59e0b'),
      npc('npc-town-walker-w', 'Lữ khách Asuna', 'stroller', [-0.95, 0, 15.0], Math.PI, 'Hai bên đại lộ đá lát có 6 gian kệ sách mở, thử ghé qua xem nhé!', '#f43f5e', [
        { x: -0.95, y: 0, z: 15.0, pauseSec: 2.2 },
        { x: -0.95, y: 0, z: -15.8, pauseSec: 2.5 },
        { x: 0.95, y: 0, z: -15.8, pauseSec: 1.8 },
        { x: 0.95, y: 0, z: 15.0, pauseSec: 2.2 },
      ]),
      npc('npc-town-walker-e', 'Học giả Agil', 'stroller', [0.95, 0, -12.0], 0, 'Phía cuối con phố là Cổng Ánh Sáng dẫn thẳng lên Tầng 2 — Rừng Anh Đào & Cầu Gỗ.', '#10b981', [
        { x: 0.95, y: 0, z: -12.0, pauseSec: 2.5 },
        { x: 0.95, y: 0, z: 13.5, pauseSec: 2.0 },
        { x: -0.95, y: 0, z: 13.5, pauseSec: 1.5 },
        { x: -0.95, y: 0, z: -12.0, pauseSec: 2.0 },
      ]),
    ],
    walkCheckpoints: [[0, 18.0], [0, 8.0], [0, 0.0], [0, -10.0], [0, -17.0], [0, -21.8]],
  };
}

function buildSakuraBlueprint(): BiomeBlueprint3D {
  return {
    meta: BIOME_CATALOG.sakura_shrine,
    bounds: { minX: -21, maxX: 21, minZ: -29.0, maxZ: 20.0 },
    spawnPoint: [0, 0, 14.0],
    spawnYaw: Math.PI,
    bossAnchor: [0, 2.4, -24.2],
    bossYaw: 0,
    bookcaseAnchors: [
      anchor('sakura-w0', -12.0, -7.8, Math.PI / 2),
      anchor('sakura-w1', -12.0, -13.6, Math.PI / 2),
      anchor('sakura-e0', 12.0, -7.8, -Math.PI / 2),
      anchor('sakura-e1', 12.0, -13.6, -Math.PI / 2),
      anchor('sakura-nw', -6.8, -16.6, 0),
      anchor('sakura-ne', 6.8, -16.6, 0),
    ],
    surfaces: [
      { kind: 'arch', id: 'sakura-bridge', minX: -2.8, maxX: 2.8, startZ: 5.0, endZ: -5.0, baseY: 0, peakY: 0.9 },
      { kind: 'ramp', id: 'sakura-mountain-stairs', minX: -1.75, maxX: 1.75, startZ: -17.2, endZ: -22.5, startY: 0, endY: 2.4 },
      { kind: 'flat', id: 'sakura-summit', minX: -8.5, maxX: 8.5, minZ: -28.5, maxZ: -22.5, y: 2.4 },
    ],
    colliders: [
      box('sakura-lake-w', 'water', -21, -2.8, -4.8, 4.8, -1, 2.5, false),
      box('sakura-lake-e', 'water', 2.8, 21, -4.8, 4.8, -1, 2.5, false),
      box('sakura-cliff-w', 'cliff', -21, -1.75, -22.5, -17.2, 0, 5.6, true),
      box('sakura-cliff-e', 'cliff', 1.75, 21, -22.5, -17.2, 0, 5.6, true),
      box('sakura-summit-edge-w', 'railing', -21, -8.5, -29.0, -22.5, 0, 4.5, false),
      box('sakura-summit-edge-e', 'railing', 8.5, 21, -29.0, -22.5, 0, 4.5, false),
      box('sakura-reading-table', 'station', -7.4, -5.6, 9.95, 11.05, 0, 0.9, false),
      cyl('sakura-weather-lantern', 'station', 6.5, 10.5, 0.55, 0, 2.4, false),
      box('sakura-librarian-desk', 'station', 4.85, 6.75, -10.35, -9.25, 0, 1.1, false),
      cyl('sakura-tree-sw', 'tree', -14.2, 11.5, 0.6, 0, 5.0, false),
      cyl('sakura-tree-se', 'tree', 14.2, 11.5, 0.6, 0, 5.0, false),
      cyl('sakura-tree-nw', 'tree', -16.0, -10.8, 0.6, 0, 5.0, false),
      cyl('sakura-tree-ne', 'tree', 16.0, -10.8, 0.6, 0, 5.0, false),
    ],
    stations: [
      station('st-reading', 'reading_table', 'Bàn trà ngắm hồ', 'Tiếp tục cuốn sách đang đọc dở', [-6.5, 0, 10.5], Math.PI),
      station('st-weather', 'weather_shrine', 'Đèn lồng Thời tiết', 'Đổi sắc trời & cánh hoa rơi', [6.5, 0, 10.5], Math.PI, 2.5),
      station('st-librarian', 'librarian_desk', 'Hiên Thủ thư Đền', 'Tải sách mới vào thư viện', [5.8, 0, -9.8], 0),
      station('st-portal-up', 'portal_up', 'Cổng Đền lên Tầng 3', 'Bước lên Đại sảnh Kính Starfield', [0, 2.4, -26.2], 0, 2.8),
    ],
    portalDownAnchor: [0, 0, 17.8],
    props: [
      prop('p-sakura-1', 'sakura_tree', [-14.2, 0, 11.5], 0.3, 1.2),
      prop('p-sakura-2', 'sakura_tree', [14.2, 0, 11.5], 1.9, 1.15),
      prop('p-sakura-3', 'sakura_tree', [-16.0, 0, -10.8], 2.6, 1.25),
      prop('p-sakura-4', 'sakura_tree', [16.0, 0, -10.8], 4.1, 1.18),
      prop('p-lantern-1', 'stone_lantern', [-3.4, 0, 6.2]),
      prop('p-lantern-2', 'stone_lantern', [3.4, 0, 6.2]),
      prop('p-lantern-3', 'stone_lantern', [-3.4, 0, -6.2]),
      prop('p-lantern-4', 'stone_lantern', [3.4, 0, -6.2]),
      prop('p-mascot', 'mascot_pedestal', [7.6, 0, -9.8], -Math.PI * 0.25),
      prop('p-stairs-glb', 'mountain_stairs_glb', [MOUNTAIN_STAIRS_OFFSET_X, 0, -20.23], 0, 1, MOUNTAIN_STAIRS_SCALE_VEC),
      prop('p-boss-pad', 'boss_pedestal', [0, 2.4, -24.2]),
    ],
    npcs: [
      npc('npc-sakura-librarian', 'Vu nữ Silica', 'librarian', [4.2, 0, -10.5], -Math.PI * 0.3, 'Cầu gỗ vồng qua hồ và bậc đá dẫn lên Đền Cổng rất đẹp khi hoàng hôn xuống.', '#f472b6'),
      npc('npc-sakura-reader', 'Độc giả Lisbeth', 'reader_sitting', [-6.5, 0, 11.8], Math.PI, 'Gió thổi cánh hoa anh đào rơi khắp mặt hồ — đọc light novel ở đây hết ý!', '#fb7185'),
      npc('npc-sakura-stroller', 'Du khách Sinon', 'stroller', [-4.5, 0, -7.2], Math.PI, 'Cẩn thận vách đá hai bên khi leo bậc thang lên Đài Cổng nhé!', '#22d3ee', [
        { x: -4.5, y: 0, z: -7.2, pauseSec: 2.5 },
        { x: -4.5, y: 0, z: -13.2, pauseSec: 2.5 },
        { x: 2.5, y: 0, z: -13.2, pauseSec: 2 },
        { x: 2.5, y: 0, z: -7.2, pauseSec: 2 },
      ]),
    ],
    walkCheckpoints: [[0, 14.0], [0, 5.0], [0, 0.0], [0, -5.0], [0, -11.5], [0, -17.2], [0, -20.0], [0, -26.2]],
  };
}

function buildStarfieldBlueprint(): BiomeBlueprint3D {
  const arcRadius = 13.8;
  const arcAnglesDeg = [-55, -90, -125, 55, 90, 125];
  const bookcaseAnchors = arcAnglesDeg.map((deg, idx) => {
    const theta = (deg * Math.PI) / 180;
    return anchor(
      `starfield-arc-${idx}`,
      Number((Math.sin(theta) * arcRadius).toFixed(3)),
      Number((Math.cos(theta) * arcRadius).toFixed(3)),
      theta + Math.PI,
    );
  });

  return {
    meta: BIOME_CATALOG.starfield_atrium,
    bounds: { minX: -19.5, maxX: 19.5, minZ: -24.5, maxZ: 20.0 },
    spawnPoint: [0, 0, 14.0],
    spawnYaw: Math.PI,
    bossAnchor: [0, 1.8, -19.5],
    bossYaw: 0,
    bookcaseAnchors,
    surfaces: [
      { kind: 'ramp', id: 'starfield-glass-stairs', minX: -3.0, maxX: 3.0, startZ: -12.0, endZ: -17.5, startY: 0, endY: 1.8 },
      { kind: 'flat', id: 'starfield-terrace', minX: -7.5, maxX: 7.5, minZ: -24.0, maxZ: -17.5, y: 1.8 },
    ],
    colliders: [
      box('sf-corner-sw', 'wall', -20.5, -13.5, 13.5, 20.5, 0, 8.5, true, Math.PI / 4),
      box('sf-corner-se', 'wall', 13.5, 20.5, 13.5, 20.5, 0, 8.5, true, -Math.PI / 4),
      box('sf-corner-nw', 'wall', -20.5, -13.5, -18.5, -11.5, 0, 8.5, true, -Math.PI / 4),
      box('sf-corner-ne', 'wall', 13.5, 20.5, -18.5, -11.5, 0, 8.5, true, Math.PI / 4),
      box('sf-ledge-w', 'wall', -7.5, -3.0, -17.85, -17.15, 0, 2.0, true),
      box('sf-ledge-e', 'wall', 3.0, 7.5, -17.85, -17.15, 0, 2.0, true),
      box('sf-terrace-rail-w', 'railing', -7.9, -7.45, -24.0, -17.5, 0, 2.8, false),
      box('sf-terrace-rail-e', 'railing', 7.45, 7.9, -24.0, -17.5, 0, 2.8, false),
      box('sf-stair-rail-w', 'railing', -3.4, -3.0, -17.5, -12.0, 0, 2.1, false),
      box('sf-stair-rail-e', 'railing', 3.0, 3.4, -17.5, -12.0, 0, 2.1, false),
      box('sf-reading-table', 'station', -6.2, -4.2, 1.55, 2.85, 0, 0.9, false),
      box('sf-librarian-desk', 'station', 4.2, 6.2, 1.55, 2.85, 0, 1.1, false),
      cyl('sf-weather-pillar', 'station', -5.5, -5.2, 0.55, 0, 2.5, false),
      cyl('sf-col-sw', 'pillar', -15.4, 10.6, 0.65, 0, 9.0, true),
      cyl('sf-col-se', 'pillar', 15.4, 10.6, 0.65, 0, 9.0, true),
      cyl('sf-col-nw', 'pillar', -15.4, -10.6, 0.65, 0, 9.0, true),
      cyl('sf-col-ne', 'pillar', 15.4, -10.6, 0.65, 0, 9.0, true),
    ],
    stations: [
      station('st-reading', 'reading_table', 'Bàn đọc Giữa sảnh', 'Tiếp tục cuốn sách đang đọc dở', [-5.2, 0, 2.2], 0),
      station('st-librarian', 'librarian_desk', 'Quầy Thủ thư Kính', 'Tải sách mới vào thư viện', [5.2, 0, 2.2], 0),
      station('st-weather', 'weather_shrine', 'Trụ Ánh sáng Vòm kính', 'Chỉnh nắng sớm, hoàng hôn hay đêm sao', [-5.5, 0, -5.2], 0, 2.5),
      station('st-portal-up', 'portal_up', 'Cổng Kính lên Tầng 4', 'Bước tới Hồ Đêm Sao & Phế tích Cổ', [0, 1.8, -21.5], 0, 2.8),
    ],
    portalDownAnchor: [0, 0, 17.8],
    props: [
      prop('p-col-1', 'atrium_column', [-15.4, 0, 10.6]),
      prop('p-col-2', 'atrium_column', [15.4, 0, 10.6]),
      prop('p-col-3', 'atrium_column', [-15.4, 0, -10.6]),
      prop('p-col-4', 'atrium_column', [15.4, 0, -10.6]),
      prop('p-bench-1', 'bench', [-5.2, 0, 3.9], Math.PI),
      prop('p-bench-2', 'bench', [5.2, 0, -4.5]),
      prop('p-boss-pad', 'boss_pedestal', [0, 1.8, -19.5]),
    ],
    npcs: [
      npc('npc-sf-librarian', 'Thủ thư Alice', 'librarian', [5.2, 0, 0.8], Math.PI, 'Đại sảnh Starfield gom ánh sáng tự nhiên xuống toàn bộ vòng kệ cong hai tầng.', '#eab308'),
      npc('npc-sf-reader', 'Độc giả Eugeo', 'reader_sitting', [-5.2, 0, 3.9], Math.PI, 'Không gian rộng rãi thế này giúp tập trung đọc liền mạch hàng chục chương!', '#60a5fa'),
      npc('npc-sf-walker', 'Nhà nghiên cứu Leafa', 'stroller', [-8.8, 0, 4.8], Math.PI, 'Đi dọc vòng cung kệ sách là thấy đủ mọi bộ truyện yêu thích.', '#34d399', [
        { x: -8.8, y: 0, z: 4.8, pauseSec: 2 },
        { x: -8.8, y: 0, z: -6.8, pauseSec: 2.5 },
        { x: 0, y: 0, z: -9.6, pauseSec: 2 },
        { x: 8.8, y: 0, z: -6.8, pauseSec: 2.5 },
        { x: 8.8, y: 0, z: 4.8, pauseSec: 2 },
      ]),
    ],
    walkCheckpoints: [[0, 14.0], [0, 4.0], [0, -6.0], [0, -12.0], [0, -15.0], [0, -21.5]],
  };
}

function buildStarlightRuinsBlueprint(): BiomeBlueprint3D {
  return {
    meta: BIOME_CATALOG.starlight_ruins,
    bounds: { minX: -20.0, maxX: 20.0, minZ: -29.5, maxZ: 20.0 },
    spawnPoint: [0, 0, 13.5],
    spawnYaw: Math.PI,
    bossAnchor: [0, 2.4, -24.0],
    bossYaw: 0,
    bookcaseAnchors: [
      anchor('ruins-w0', -10.5, 5.5, Math.PI / 2),
      anchor('ruins-w1', -10.5, -1.5, Math.PI / 2),
      anchor('ruins-w2', -10.5, -8.5, Math.PI / 2),
      anchor('ruins-e0', 10.5, 5.5, -Math.PI / 2),
      anchor('ruins-e1', 10.5, -1.5, -Math.PI / 2),
      anchor('ruins-e2', 10.5, -8.5, -Math.PI / 2),
    ],
    surfaces: [
      { kind: 'ramp', id: 'ruins-ancient-stairs', minX: -1.75, maxX: 1.75, startZ: -15.5, endZ: -20.8, startY: 0, endY: 2.4 },
      { kind: 'flat', id: 'ruins-boss-arena', minX: -9.0, maxX: 9.0, minZ: -29.0, maxZ: -20.8, y: 2.4 },
    ],
    colliders: [
      box('ruins-lake-w', 'water', -20, -14.8, -15.5, 20, -1, 2.5, false),
      box('ruins-lake-e', 'water', 14.8, 20, -15.5, 20, -1, 2.5, false),
      box('ruins-cliff-w', 'cliff', -20, -1.75, -20.8, -15.5, 0, 5.6, true),
      box('ruins-cliff-e', 'cliff', 1.75, 20, -20.8, -15.5, 0, 5.6, true),
      box('ruins-arena-edge-w', 'railing', -20, -9.0, -29.5, -20.8, 0, 4.5, false),
      box('ruins-arena-edge-e', 'railing', 9.0, 20, -29.5, -20.8, 0, 4.5, false),
      box('ruins-reading-table', 'station', -6.3, -4.5, 8.65, 9.75, 0, 0.9, false),
      box('ruins-librarian-desk', 'station', 4.5, 6.3, 8.65, 9.75, 0, 1.1, false),
      cyl('ruins-weather-crystal', 'station', -5.6, -11.5, 0.55, 0, 2.8, false),
      cyl('ruins-col-sw', 'pillar', -13.2, 11.4, 0.6, 0, 5.2, true),
      cyl('ruins-col-se', 'pillar', 13.2, 11.4, 0.6, 0, 5.2, true),
      cyl('ruins-col-nw', 'pillar', -13.2, -13.0, 0.6, 0, 5.2, true),
      cyl('ruins-col-ne', 'pillar', 13.2, -13.0, 0.6, 0, 5.2, true),
    ],
    stations: [
      station('st-reading', 'reading_table', 'Bàn Đá Ánh Sao', 'Tiếp tục cuốn sách đang đọc dở', [-5.4, 0, 9.2], 0),
      station('st-librarian', 'librarian_desk', 'Đài Thủ thư Cổ đại', 'Tải sách mới vào thư viện', [5.4, 0, 9.2], 0),
      station('st-weather', 'weather_shrine', 'Trụ Pha lê Tinh vân', 'Chuyển ánh sao & thời tiết tầng', [-5.6, 0, -11.5], 0, 2.5),
      station('st-portal-up', 'portal_up', 'Cổng Pha lê Lên tầng', 'Dịch chuyển sang tầng cao hơn của Aincrad', [0, 2.4, -27.2], 0, 2.8),
    ],
    portalDownAnchor: [0, 0, 17.8],
    props: [
      prop('p-ruin-1', 'ruin_column', [-13.2, 0, 11.4], 0.4, 1.1),
      prop('p-ruin-2', 'ruin_column', [13.2, 0, 11.4], 1.7, 1.0),
      prop('p-ruin-3', 'ruin_column', [-13.2, 0, -13.0], 2.5, 1.15),
      prop('p-ruin-4', 'ruin_column', [13.2, 0, -13.0], 3.9, 1.05),
      prop('p-crystal-1', 'crystal_pillar', [-7.5, 2.4, -22.5], 0.2, 1.1),
      prop('p-crystal-2', 'crystal_pillar', [7.5, 2.4, -22.5], 1.4, 1.1),
      prop('p-stairs-glb', 'mountain_stairs_glb', [MOUNTAIN_STAIRS_OFFSET_X, 0, -18.53], 0, 1, MOUNTAIN_STAIRS_SCALE_VEC),
      prop('p-boss-pad', 'boss_pedestal', [0, 2.4, -24.0], 0, 1.2),
    ],
    npcs: [
      npc('npc-ruins-keeper', 'Người gác Sao Argo', 'librarian', [5.8, 0, 7.8], -Math.PI * 0.7, 'Phía trên bậc đá cổ là Đài Hộ vệ Stone Golem — hãy chuẩn bị thật kỹ kiến thức các chương sách!', '#a78bfa'),
      npc('npc-ruins-explorer', 'Kiếm sĩ Yuuki', 'stroller', [-4.8, 0, 3.0], Math.PI, 'Đêm sao trên phế tích cổ Aincrad yên tĩnh đến mức nghe rõ tiếng lật trang.', '#c084fc', [
        { x: -4.8, y: 0, z: 3.0, pauseSec: 2 },
        { x: -4.8, y: 0, z: -8.0, pauseSec: 2.5 },
        { x: 4.8, y: 0, z: -8.0, pauseSec: 2 },
        { x: 4.8, y: 0, z: 3.0, pauseSec: 2.5 },
      ]),
    ],
    walkCheckpoints: [[0, 13.5], [0, 4.0], [0, -6.0], [0, -15.5], [0, -18.2], [0, -22.2], [0, -27.2]],
  };
}

export const BIOME_BLUEPRINTS: Record<BiomeId, BiomeBlueprint3D> = {
  town_of_beginnings: buildTownBlueprint(),
  sakura_shrine: buildSakuraBlueprint(),
  starfield_atrium: buildStarfieldBlueprint(),
  starlight_ruins: buildStarlightRuinsBlueprint(),
};

export function getBiomeForFloorIndex(floorIndex: number): {
  biomeId: BiomeId;
  biomeVariant: number;
  blueprint: BiomeBlueprint3D;
} {
  const safeIndex = Math.max(0, Math.floor(floorIndex));
  const biomeId = BIOME_SEQUENCE[safeIndex % BIOME_SEQUENCE.length];
  const biomeVariant = Math.floor(safeIndex / BIOME_SEQUENCE.length);
  return { biomeId, biomeVariant, blueprint: BIOME_BLUEPRINTS[biomeId] };
}
