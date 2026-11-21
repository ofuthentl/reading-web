import type {
  BoxCollider3D,
  CylinderCollider3D,
  FloorWorldLayout3D,
  SurfaceZone3D,
  WorldBounds3D,
  WorldCollider3D,
  WorldStation3D,
} from './floorWorldLayout3d';

export const PLAYER_PHYSICS_CONSTANTS = {
  /** Horizontal player collision capsule radius (meters) */
  RADIUS: 0.42,
  /** Standing player collision height (meters) */
  HEIGHT: 1.72,
  /** Eye/shoulder pivot height for third-person camera target */
  EYE_HEIGHT: 1.46,
  /** Maximum vertical step-up allowed in a single sub-step without a ramp */
  MAX_STEP_UP: 0.65,
  /** Maximum vertical sheer drop allowed in a single sub-step (guards ledges) */
  MAX_STEP_DOWN: 0.95,
  /** Sub-step length ceiling to prevent tunneling at high sprint speed */
  MAX_SUBSTEP_DIST: 0.22,
  /** Maximum overlap-resolution passes per sub-step */
  SOLVER_ITERATIONS: 4,
  /** Third-person camera collision sphere radius */
  CAMERA_RADIUS: 0.28,
  /** Minimum camera distance to player target when squeezed against a wall */
  CAMERA_MIN_DIST: 0.85,
  /** Minimum clearance above local floor surface for third-person camera */
  CAMERA_MIN_CLEARANCE_Y: 0.35,
} as const;

export interface SurfaceSample3D {
  y: number;
  onSlope: boolean;
  surfaceId: string | null;
}

export interface PlayerStepInput {
  currentPos: readonly [number, number, number];
  deltaX: number;
  deltaZ: number;
  floor: Pick<FloorWorldLayout3D, 'bounds' | 'colliders' | 'surfaces'>;
  playerRadius?: number;
  playerHeight?: number;
  maxStepUp?: number;
  maxStepDown?: number;
}

export interface PlayerStepResult {
  position: [number, number, number];
  collided: boolean;
  onSlope: boolean;
  surfaceId: string | null;
}

export interface CameraOrbitResult {
  position: [number, number, number];
  hitCollider: boolean;
  distance: number;
}

const SEAM_TOLERANCE = 0.03;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Evaluates a single `SurfaceZone3D` at world `(x, z)`. Returns `null` if outside footprint.
 */
export function evaluateSurfaceZoneY(
  x: number,
  z: number,
  zone: SurfaceZone3D,
  edgeTolerance = SEAM_TOLERANCE,
): number | null {
  if (x < zone.minX - edgeTolerance || x > zone.maxX + edgeTolerance) {
    return null;
  }

  if (zone.kind === 'flat') {
    if (z < zone.minZ - edgeTolerance || z > zone.maxZ + edgeTolerance) return null;
    return zone.y;
  }

  const minZ = Math.min(zone.startZ, zone.endZ);
  const maxZ = Math.max(zone.startZ, zone.endZ);
  if (z < minZ - edgeTolerance || z > maxZ + edgeTolerance) {
    return null;
  }

  const span = zone.endZ - zone.startZ;
  const t = Math.abs(span) < 1e-6 ? 0 : clamp((z - zone.startZ) / span, 0, 1);

  if (zone.kind === 'ramp') {
    return zone.startY + (zone.endY - zone.startY) * t;
  }

  // Smooth parabolic arch: 0 at both ends (t=0, t=1), peakY at t=0.5 with zero seam step
  const archFactor = 4 * t * (1 - t);
  return zone.baseY + (zone.peakY - zone.baseY) * archFactor;
}

/**
 * Resolves the walkable floor elevation `Y` at world `(x, z)` across flat grounds,
 * stairs/ramps, and curved bridges. When `currentY` is supplied, ignores sheer elevated
 * ledges higher than `currentY + maxStepUp`.
 */
export function resolveSurfaceY(
  x: number,
  z: number,
  floor: Pick<FloorWorldLayout3D, 'surfaces'>,
  currentY?: number,
  maxStepUp: number = PLAYER_PHYSICS_CONSTANTS.MAX_STEP_UP,
): SurfaceSample3D {
  let bestY = 0;
  let bestSlope = false;
  let bestId: string | null = null;

  for (let i = 0; i < floor.surfaces.length; i += 1) {
    const zone = floor.surfaces[i];
    const sampled = evaluateSurfaceZoneY(x, z, zone);
    if (sampled === null) continue;
    if (currentY !== undefined && sampled > currentY + maxStepUp) continue;

    if (sampled > bestY || (Math.abs(sampled - bestY) < 1e-4 && zone.kind !== 'flat')) {
      bestY = sampled;
      bestSlope = zone.kind !== 'flat';
      bestId = zone.id;
    }
  }

  return { y: bestY, onSlope: bestSlope, surfaceId: bestId };
}

function pushOutOfBoxXZ(
  x: number,
  z: number,
  radius: number,
  box: BoxCollider3D,
): { x: number; z: number; hit: boolean } {
  const dx = x - box.centerX;
  const dz = z - box.centerZ;
  const cosY = Math.cos(box.yaw);
  const sinY = Math.sin(box.yaw);

  // Transform point into OBB local frame (inverse rotation by -yaw)
  const localX = dx * cosY - dz * sinY;
  const localZ = dx * sinY + dz * cosY;

  const clampedX = clamp(localX, -box.halfWidth, box.halfWidth);
  const clampedZ = clamp(localZ, -box.halfDepth, box.halfDepth);
  const diffX = localX - clampedX;
  const diffZ = localZ - clampedZ;
  const distSq = diffX * diffX + diffZ * diffZ;

  if (distSq >= radius * radius) {
    return { x, z, hit: false };
  }

  let pushLocalX = 0;
  let pushLocalZ = 0;

  if (distSq > 1e-10) {
    const dist = Math.sqrt(distSq);
    const penetration = radius - dist;
    pushLocalX = (diffX / dist) * penetration;
    pushLocalZ = (diffZ / dist) * penetration;
  } else {
    // Center lies inside OBB: eject along shallowest axis
    const overlapX = box.halfWidth - Math.abs(localX) + radius;
    const overlapZ = box.halfDepth - Math.abs(localZ) + radius;
    if (overlapX < overlapZ) {
      pushLocalX = localX >= 0 ? overlapX : -overlapX;
    } else {
      pushLocalZ = localZ >= 0 ? overlapZ : -overlapZ;
    }
  }

  // Rotate push vector back into world XZ (+yaw)
  const pushWorldX = pushLocalX * cosY + pushLocalZ * sinY;
  const pushWorldZ = -pushLocalX * sinY + pushLocalZ * cosY;
  return { x: x + pushWorldX, z: z + pushWorldZ, hit: true };
}

function pushOutOfCylinderXZ(
  x: number,
  z: number,
  radius: number,
  cyl: CylinderCollider3D,
): { x: number; z: number; hit: boolean } {
  const dx = x - cyl.centerX;
  const dz = z - cyl.centerZ;
  const minDist = radius + cyl.radius;
  const distSq = dx * dx + dz * dz;

  if (distSq >= minDist * minDist) {
    return { x, z, hit: false };
  }
  if (distSq < 1e-10) {
    return { x: x + minDist, z, hit: true };
  }
  const dist = Math.sqrt(distSq);
  const scale = minDist / dist;
  return {
    x: cyl.centerX + dx * scale,
    z: cyl.centerZ + dz * scale,
    hit: true,
  };
}

function clampToBounds(
  x: number,
  z: number,
  radius: number,
  bounds: WorldBounds3D,
): { x: number; z: number; hit: boolean } {
  const cx = clamp(x, bounds.minX + radius, bounds.maxX - radius);
  const cz = clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
  return { x: cx, z: cz, hit: cx !== x || cz !== z };
}

function solveCollidersXZ(
  startX: number,
  startZ: number,
  footY: number,
  radius: number,
  playerHeight: number,
  bounds: WorldBounds3D,
  colliders: readonly WorldCollider3D[],
): { x: number; z: number; hit: boolean } {
  let x = startX;
  let z = startZ;
  let hit = false;
  const footClearY = footY + 0.16;
  const headY = footY + playerHeight;

  for (let iter = 0; iter < PLAYER_PHYSICS_CONSTANTS.SOLVER_ITERATIONS; iter += 1) {
    let iterHit = false;

    const clamped = clampToBounds(x, z, radius, bounds);
    if (clamped.hit) {
      x = clamped.x;
      z = clamped.z;
      hit = true;
      iterHit = true;
    }

    for (let i = 0; i < colliders.length; i += 1) {
      const col = colliders[i];
      if (col.maxY <= footClearY || col.minY >= headY) continue;

      const resolved =
        col.kind === 'box'
          ? pushOutOfBoxXZ(x, z, radius, col)
          : pushOutOfCylinderXZ(x, z, radius, col);

      if (resolved.hit) {
        x = resolved.x;
        z = resolved.z;
        hit = true;
        iterHit = true;
      }
    }

    if (!iterHit) break;
  }

  return { x, z, hit };
}

function isStepElevationValid(
  prevY: number,
  nextY: number,
  maxStepUp: number,
  maxStepDown: number,
): boolean {
  const dy = nextY - prevY;
  return dy <= maxStepUp && -dy <= maxStepDown;
}

/**
 * Pure sub-stepped player locomotion & wall-sliding solver:
 * handles OBB bookcases/walls, cylinder props, water barriers, smooth ramp/arch elevation,
 * and step-height guards so Kirito never clips walls, tunnels at sprint speed, or drops off ledges.
 */
export function resolveWorldPlayerStep(input: PlayerStepInput): PlayerStepResult {
  const {
    currentPos,
    deltaX,
    deltaZ,
    floor,
    playerRadius = PLAYER_PHYSICS_CONSTANTS.RADIUS,
    playerHeight = PLAYER_PHYSICS_CONSTANTS.HEIGHT,
    maxStepUp = PLAYER_PHYSICS_CONSTANTS.MAX_STEP_UP,
    maxStepDown = PLAYER_PHYSICS_CONSTANTS.MAX_STEP_DOWN,
  } = input;

  let x = currentPos[0];
  let y = currentPos[1];
  let z = currentPos[2];
  let collided = false;

  const totalDist = Math.hypot(deltaX, deltaZ);
  const steps = Math.max(1, Math.ceil(totalDist / PLAYER_PHYSICS_CONSTANTS.MAX_SUBSTEP_DIST));
  const stepX = deltaX / steps;
  const stepZ = deltaZ / steps;

  let lastSurface = resolveSurfaceY(x, z, floor, y, maxStepUp);
  y = lastSurface.y;

  for (let s = 0; s < steps; s += 1) {
    const solved = solveCollidersXZ(
      x + stepX,
      z + stepZ,
      y,
      playerRadius,
      playerHeight,
      floor.bounds,
      floor.colliders,
    );
    if (solved.hit) collided = true;

    const candidateSurface = resolveSurfaceY(solved.x, solved.z, floor, y, maxStepUp);
    if (isStepElevationValid(y, candidateSurface.y, maxStepUp, maxStepDown)) {
      x = solved.x;
      z = solved.z;
      y = candidateSurface.y;
      lastSurface = candidateSurface;
      continue;
    }

    // Ledge/cliff guard: attempt single-axis slide along X or Z
    collided = true;
    const slideX = solveCollidersXZ(
      x + stepX,
      z,
      y,
      playerRadius,
      playerHeight,
      floor.bounds,
      floor.colliders,
    );
    const surfX = resolveSurfaceY(slideX.x, slideX.z, floor, y, maxStepUp);
    if (isStepElevationValid(y, surfX.y, maxStepUp, maxStepDown)) {
      x = slideX.x;
      z = slideX.z;
      y = surfX.y;
      lastSurface = surfX;
      continue;
    }

    const slideZ = solveCollidersXZ(
      x,
      z + stepZ,
      y,
      playerRadius,
      playerHeight,
      floor.bounds,
      floor.colliders,
    );
    const surfZ = resolveSurfaceY(slideZ.x, slideZ.z, floor, y, maxStepUp);
    if (isStepElevationValid(y, surfZ.y, maxStepUp, maxStepDown)) {
      x = slideZ.x;
      z = slideZ.z;
      y = surfZ.y;
      lastSurface = surfZ;
    }
  }

  return {
    position: [x, y, z],
    collided,
    onSlope: lastSurface.onSlope,
    surfaceId: lastSurface.surfaceId,
  };
}

function raycastBoxSegment(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  box: BoxCollider3D,
  pad: number,
): number | null {
  const cosY = Math.cos(box.yaw);
  const sinY = Math.sin(box.yaw);

  const relOx = origin[0] - box.centerX;
  const relOz = origin[2] - box.centerZ;
  const lox = relOx * cosY - relOz * sinY;
  const loy = origin[1];
  const loz = relOx * sinY + relOz * cosY;

  const ldx = dir[0] * cosY - dir[2] * sinY;
  const ldy = dir[1];
  const ldz = dir[0] * sinY + dir[2] * cosY;

  const minX = -box.halfWidth - pad;
  const maxX = box.halfWidth + pad;
  const minY = box.minY - pad;
  const maxY = box.maxY + pad;
  const minZ = -box.halfDepth - pad;
  const maxZ = box.halfDepth + pad;

  let tMin = 0;
  let tMax = 1;

  const axes: Array<[number, number, number, number]> = [
    [lox, ldx, minX, maxX],
    [loy, ldy, minY, maxY],
    [loz, ldz, minZ, maxZ],
  ];

  for (let i = 0; i < 3; i += 1) {
    const [o, d, lo, hi] = axes[i];
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }

  return tMin > 0 && tMin <= 1 ? tMin : null;
}

function raycastCylinderSegment(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  cyl: CylinderCollider3D,
  pad: number,
): number | null {
  const r = cyl.radius + pad;
  const ox = origin[0] - cyl.centerX;
  const oz = origin[2] - cyl.centerZ;
  const a = dir[0] * dir[0] + dir[2] * dir[2];
  if (a < 1e-8) return null;

  const b = 2 * (ox * dir[0] + oz * dir[2]);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t <= 0 || t > 1) return null;

  const hitY = origin[1] + dir[1] * t;
  if (hitY < cyl.minY - pad || hitY > cyl.maxY + pad) return null;
  return t;
}

function raycastBoundsSegment(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  bounds: WorldBounds3D,
  pad: number,
): number {
  let bestT = 1;
  const planes: Array<[number, number, number]> = [
    [origin[0], dir[0], bounds.minX + pad],
    [origin[0], dir[0], bounds.maxX - pad],
    [origin[2], dir[2], bounds.minZ + pad],
    [origin[2], dir[2], bounds.maxZ - pad],
  ];

  for (let i = 0; i < planes.length; i += 1) {
    const [o, d, limit] = planes[i];
    if (Math.abs(d) < 1e-8) continue;
    const isMin = i % 2 === 0;
    const headingOut = isMin ? d < 0 : d > 0;
    if (!headingOut) continue;
    const t = (limit - o) / d;
    if (t > 0 && t < bestT) bestT = t;
  }
  return bestT;
}

/**
 * Pulls the third-person orbit camera forward along `target -> desiredPos` whenever
 * walls, bookcases, cliffs, or world boundaries intervene, and clamps camera Y above ground.
 */
export function resolveCameraOrbitPosition(
  target: readonly [number, number, number],
  desiredPos: readonly [number, number, number],
  floor: Pick<FloorWorldLayout3D, 'bounds' | 'colliders' | 'surfaces'>,
  cameraRadius: number = PLAYER_PHYSICS_CONSTANTS.CAMERA_RADIUS,
): CameraOrbitResult {
  const dir: [number, number, number] = [
    desiredPos[0] - target[0],
    desiredPos[1] - target[1],
    desiredPos[2] - target[2],
  ];
  const fullDist = Math.hypot(dir[0], dir[1], dir[2]);
  if (fullDist < 1e-5) {
    return { position: [desiredPos[0], desiredPos[1], desiredPos[2]], hitCollider: false, distance: 0 };
  }

  let bestT = raycastBoundsSegment(target, dir, floor.bounds, cameraRadius);
  let hitCollider = bestT < 1;

  for (let i = 0; i < floor.colliders.length; i += 1) {
    const col = floor.colliders[i];
    if (col.blocksCamera === false) continue;
    const t =
      col.kind === 'box'
        ? raycastBoxSegment(target, dir, col, cameraRadius)
        : raycastCylinderSegment(target, dir, col, cameraRadius);
    if (t !== null && t < bestT) {
      bestT = t;
      hitCollider = true;
    }
  }

  const minT = Math.min(1, PLAYER_PHYSICS_CONSTANTS.CAMERA_MIN_DIST / fullDist);
  const clampedT = clamp(bestT, minT, 1);

  const camX = target[0] + dir[0] * clampedT;
  const camZ = target[2] + dir[2] * clampedT;
  const floorSample = resolveSurfaceY(camX, camZ, floor);
  const minCamY = floorSample.y + PLAYER_PHYSICS_CONSTANTS.CAMERA_MIN_CLEARANCE_Y;
  const camY = Math.max(minCamY, target[1] + dir[1] * clampedT);

  return {
    position: [camX, camY, camZ],
    hitCollider,
    distance: Math.hypot(camX - target[0], camY - target[1], camZ - target[2]),
  };
}

/**
 * Finds the closest interactive station within its `interactRadius` of Kirito.
 */
export function findNearestInteractableStation(
  playerPos: readonly [number, number, number],
  floor: Pick<FloorWorldLayout3D, 'stations'>,
): WorldStation3D | null {
  let nearest: WorldStation3D | null = null;
  let nearestDist = Infinity;

  for (let i = 0; i < floor.stations.length; i += 1) {
    const st = floor.stations[i];
    const dist = Math.hypot(
      st.position[0] - playerPos[0],
      st.position[1] - playerPos[1],
      st.position[2] - playerPos[2],
    );
    if (dist <= st.interactRadius && dist < nearestDist) {
      nearestDist = dist;
      nearest = st;
    }
  }
  return nearest;
}
