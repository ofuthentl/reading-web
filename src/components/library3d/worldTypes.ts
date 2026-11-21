import type { BookSlot3D } from './bookPacking3d';

export type BiomeId =
  | 'town_of_beginnings'
  | 'sakura_shrine'
  | 'starfield_atrium'
  | 'starlight_ruins';

export type ColliderTag =
  | 'boundary'
  | 'bookcase'
  | 'wall'
  | 'water'
  | 'cliff'
  | 'fountain'
  | 'pillar'
  | 'tree'
  | 'station'
  | 'railing';

export interface WorldBounds3D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface BoxCollider3D {
  kind: 'box';
  id: string;
  tag: ColliderTag;
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
  /** Rotation around world Y in radians (`0` = axis-aligned) */
  yaw: number;
  minY: number;
  maxY: number;
  /** Whether third-person camera raycast collides with this volume (default `true`) */
  blocksCamera?: boolean;
}

export interface CylinderCollider3D {
  kind: 'cylinder';
  id: string;
  tag: ColliderTag;
  centerX: number;
  centerZ: number;
  radius: number;
  minY: number;
  maxY: number;
  blocksCamera?: boolean;
}

export type WorldCollider3D = BoxCollider3D | CylinderCollider3D;

export type SurfaceZone3D =
  | {
      kind: 'flat';
      id: string;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      y: number;
    }
  | {
      kind: 'ramp';
      id: string;
      minX: number;
      maxX: number;
      /** Z coordinate corresponding to `startY` */
      startZ: number;
      /** Z coordinate corresponding to `endY` */
      endZ: number;
      startY: number;
      endY: number;
    }
  | {
      kind: 'arch';
      id: string;
      minX: number;
      maxX: number;
      startZ: number;
      endZ: number;
      baseY: number;
      peakY: number;
    };

export type WorldStationKind =
  | 'reading_table'
  | 'librarian_desk'
  | 'weather_shrine'
  | 'portal_up'
  | 'portal_down'
  | 'boss_door'
  | 'boss_exit';

export interface WorldStation3D {
  id: string;
  kind: WorldStationKind;
  label: string;
  prompt: string;
  position: [number, number, number];
  facingYaw: number;
  interactRadius: number;
  targetFloorIndex?: number;
}

export type NpcRole = 'librarian' | 'reader_sitting' | 'stroller';

export type NpcModelKey = 'asuna' | 'maid' | 'zhongli' | 'schoolgirl' | 'mint';

export interface NpcWaypoint3D {
  x: number;
  y: number;
  z: number;
  pauseSec?: number;
  facingYaw?: number;
}

export interface WorldNpcSpec3D {
  id: string;
  name: string;
  role: NpcRole;
  modelKey?: NpcModelKey;
  floorIndex: number;
  spawn: [number, number, number];
  facingYaw: number;
  waypoints: NpcWaypoint3D[];
  greeting: string;
  accentColor: string;
}

export type BiomePropKind =
  | 'tree'
  | 'sakura_tree'
  | 'lamp'
  | 'stone_lantern'
  | 'bench'
  | 'fountain'
  | 'crystal_pillar'
  | 'ruin_column'
  | 'atrium_column'
  | 'mascot_pedestal'
  | 'mountain_stairs_glb'
  | 'torii_gate_glb'
  | 'mossy_stairs_glb'
  | 'boss_pedestal';

export interface BossRoomUnlockStatus {
  floorNumber: number;
  unlocked: boolean;
  completedBooks: number;
  requiredBooks: number;
  readPages: number;
  requiredPages: number;
  bossName: string;
  summaryText: string;
}

export interface BiomePropPlacement3D {
  id: string;
  kind: BiomePropKind;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  /** Optional non-uniform `[sx, sy, sz]` scale (used to align real GLB bbox to terrain ramps) */
  scaleVec?: [number, number, number];
}

export interface BookcaseAnchor3D {
  id: string;
  x: number;
  baseY: number;
  z: number;
  facingYaw: number;
  maxBays: number;
}

export interface BiomeMeta {
  id: BiomeId;
  label: string;
  subtitle: string;
  particleKind: 'leaves' | 'petals' | 'dust_motes' | 'fireflies';
  hasWater: boolean;
  waterY?: number;
}

export interface BiomeBlueprint3D {
  meta: BiomeMeta;
  bounds: WorldBounds3D;
  spawnPoint: [number, number, number];
  spawnYaw: number;
  bossAnchor: [number, number, number];
  bossYaw: number;
  bookcaseAnchors: BookcaseAnchor3D[];
  surfaces: SurfaceZone3D[];
  colliders: WorldCollider3D[];
  stations: Omit<WorldStation3D, 'targetFloorIndex'>[];
  portalDownAnchor: [number, number, number];
  props: BiomePropPlacement3D[];
  npcs: Omit<WorldNpcSpec3D, 'floorIndex'>[];
  /** Canonical walk route from spawn -> library -> bridge/stairs -> portal_up */
  walkCheckpoints: Array<[number, number]>;
}

export interface WorldBookcase3D {
  id: string;
  shelfKey: string;
  shelfName: string;
  /** Nameplate label (adds `(1/N)` suffix when a massive shelf spans multiple cabinets) */
  displayLabel: string;
  shelfIndex: number;
  segmentIndex: number;
  segmentCount: number;
  floorIndex: number;
  bayCount: number;
  width: number;
  height: number;
  depth: number;
  /** World-space center `(x, baseY, z)` of the cabinet footprint */
  position: [number, number, number];
  /** Cabinet facing yaw around world Y (`0` faces `+Z`, `Math.PI/2` faces `+X`) */
  facingYaw: number;
  nameplateCenter: [number, number, number];
  nameplateYaw: number;
  /** Recommended walkable standoff spot right in front of the cabinet facing the books */
  interactPoint: [number, number, number];
  interactYaw: number;
  tierYs: number[];
  books: BookSlot3D[];
  bookIndices: number[];
  bookCount: number;
}

export interface FloorWorldLayout3D {
  floorIndex: number;
  floorNumber: number;
  title: string;
  biomeId: BiomeId;
  biomeVariant: number;
  biomeMeta: BiomeMeta;
  bounds: WorldBounds3D;
  spawnPoint: [number, number, number];
  spawnYaw: number;
  bossAnchor: [number, number, number];
  bossYaw: number;
  bookcases: WorldBookcase3D[];
  shelfKeys: string[];
  books: BookSlot3D[];
  bookById: Map<string, BookSlot3D>;
  bookcasesByShelfKey: Map<string, WorldBookcase3D[]>;
  stations: WorldStation3D[];
  surfaces: SurfaceZone3D[];
  colliders: WorldCollider3D[];
  npcs: WorldNpcSpec3D[];
  props: BiomePropPlacement3D[];
  walkCheckpoints: Array<[number, number]>;
  hasPrevFloor: boolean;
  hasNextFloor: boolean;
  /** True when rendering the dedicated 360° enclosed Boss Arena chamber for this floor */
  isBossRoom?: boolean;
  bossSourceFloorIndex?: number;
}

export interface TowerWorldLayout3D {
  floors: FloorWorldLayout3D[];
  totalFloors: number;
  totalBooks: number;
  floorIndexByShelfKey: Map<string, number>;
  floorIndexByBookId: Map<string, number>;
  bookById: Map<string, BookSlot3D>;
}

export interface BuildTowerOptions {
  /** Minimum number of navigable biome floors (defaults to 4 so all 4 biomes are always visitable) */
  minFloors?: number;
}

export interface ActiveFloorCoverOptions {
  playerX: number;
  playerZ: number;
  hoveredBookId?: string | null;
  selectedBookId?: string | null;
  /** Desired max featured CoverPlanes (defaults to 20, hard-clamped to <= 24 per D-013) */
  maxSlots?: number;
  /** Optional radial shelf cutoff around Kirito (defaults to 24 m) */
  maxDistance?: number;
}

export interface JumpTarget3D {
  floorIndex: number;
  position: [number, number, number];
  yaw: number;
  shelfKey: string;
  bookId?: string;
}

export interface PlayerMotionState {
  position: [number, number, number];
  yaw: number;
  /** Active camera orbit yaw in radians (falls back to `yaw` when unset) */
  cameraYaw?: number;
  speed: number;
  isRunning: boolean;
  firstPerson: boolean;
  /** Decrements toward 0 when player clicks a book or triggers `[E]` */
  interactPulse: number;
}

export interface WorldTelemetryRefs {
  playerMotionRef: { current: PlayerMotionState };
  npcPositionsRef: { current: Map<string, [number, number, number]> };
}
