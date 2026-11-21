import * as THREE from 'three';
import { mergeSimpleGeometries } from './geometryUtils';
import { LIBRARY_3D_CONSTANTS } from './bookPacking3d';
import type { NameplateUVRect } from './proceduralMaterials';
import type { FloorWorldLayout3D, SurfaceZone3D } from './worldTypes';

export interface WorldArchitectureGeometries {
  ground: THREE.BufferGeometry;
  plaza: THREE.BufferGeometry;
  stone: THREE.BufferGeometry;
  bridgeWood: THREE.BufferGeometry;
  bridgeRed: THREE.BufferGeometry;
  water: THREE.BufferGeometry | null;
  glassDome: THREE.BufferGeometry | null;
  woodCabinet: THREE.BufferGeometry;
  woodCrown: THREE.BufferGeometry;
  woodBackPanel: THREE.BufferGeometry;
  brassTrim: THREE.BufferGeometry;
  bookcaseLampGlow: THREE.BufferGeometry;
}

const NAMEPLATE_WIDTH = 1.48;
const NAMEPLATE_HEIGHT = 0.275;

export function createScaledBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  uvDensity = 0.55,
  yaw = 0,
): THREE.BufferGeometry {
  const geom = new THREE.BoxGeometry(w, h, d);
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  const faceScales: Array<[number, number]> = [
    [d * uvDensity, h * uvDensity],
    [d * uvDensity, h * uvDensity],
    [w * uvDensity, d * uvDensity],
    [w * uvDensity, d * uvDensity],
    [w * uvDensity, h * uvDensity],
    [w * uvDensity, h * uvDensity],
  ];
  for (let face = 0; face < 6; face += 1) {
    const [su, sv] = faceScales[face];
    const base = face * 4;
    for (let v = 0; v < 4; v += 1) {
      uv.setXY(base + v, uv.getX(base + v) * su, uv.getY(base + v) * sv);
    }
  }
  uv.needsUpdate = true;
  if (yaw !== 0) geom.rotateY(yaw);
  geom.translate(x, y, z);
  return geom;
}

function addLocalCabinetBox(
  target: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  lx: number,
  ly: number,
  lz: number,
  cx: number,
  by: number,
  cz: number,
  yaw: number,
  uvDensity = 0.65,
): void {
  const geom = createScaledBox(w, h, d, lx, ly, lz, uvDensity);
  if (yaw !== 0) geom.rotateY(yaw);
  geom.translate(cx, by, cz);
  target.push(geom);
}

function buildRotatedBookcases(
  floor: FloorWorldLayout3D,
  cabinetParts: THREE.BufferGeometry[],
  crownParts: THREE.BufferGeometry[],
  backParts: THREE.BufferGeometry[],
  brassParts: THREE.BufferGeometry[],
  lampGlowParts: THREE.BufferGeometry[],
): void {
  const {
    BAY_INNER_WIDTH,
    SIDE_PANEL_THICKNESS,
    SHELF_DEPTH,
    PLINTH_HEIGHT,
    PLANK_THICKNESS,
    CROWN_HEIGHT,
    SHELF_TOTAL_HEIGHT,
  } = LIBRARY_3D_CONSTANTS;

  const frontZ = SHELF_DEPTH * 0.5;
  const backZ = -SHELF_DEPTH * 0.5;
  const canopyTopY = SHELF_TOTAL_HEIGHT - CROWN_HEIGHT;
  const sideBodyH = canopyTopY - PLINTH_HEIGHT;
  const sideCenterY = PLINTH_HEIGHT + sideBodyH * 0.5;
  const hasAwning = floor.biomeId === 'town_of_beginnings' || floor.biomeId === 'sakura_shrine';

  for (let i = 0; i < floor.bookcases.length; i += 1) {
    const bc = floor.bookcases[i];
    const [cx, by, cz] = bc.position;
    const { width, bayCount, facingYaw: yaw, tierYs } = bc;
    const minLocalX = -width * 0.5;

    // Stepped plinth base
    addLocalCabinetBox(crownParts, width + 0.08, PLINTH_HEIGHT * 0.55, SHELF_DEPTH + 0.08, 0, PLINTH_HEIGHT * 0.275, 0.02, cx, by, cz, yaw);
    addLocalCabinetBox(crownParts, width + 0.03, PLINTH_HEIGHT * 0.45, SHELF_DEPTH + 0.04, 0, PLINTH_HEIGHT * 0.775, 0.01, cx, by, cz, yaw);

    // Side pilasters & vertical bay dividers
    for (let p = 0; p <= bayCount; p += 1) {
      const px = minLocalX + SIDE_PANEL_THICKNESS * 0.5 + p * (BAY_INNER_WIDTH + SIDE_PANEL_THICKNESS);
      addLocalCabinetBox(cabinetParts, SIDE_PANEL_THICKNESS, sideBodyH, SHELF_DEPTH, px, sideCenterY, 0, cx, by, cz, yaw);
      addLocalCabinetBox(crownParts, SIDE_PANEL_THICKNESS * 0.62, sideBodyH - 0.08, 0.026, px, sideCenterY, frontZ + 0.012, cx, by, cz, yaw);
    }

    // Horizontal planks + top canopy
    const innerSpan = width - SIDE_PANEL_THICKNESS * 2;
    for (let t = 0; t < tierYs.length; t += 1) {
      addLocalCabinetBox(cabinetParts, innerSpan, PLANK_THICKNESS, SHELF_DEPTH - 0.03, 0, tierYs[t] - PLANK_THICKNESS * 0.5, -0.005, cx, by, cz, yaw);
    }
    addLocalCabinetBox(cabinetParts, width, PLANK_THICKNESS, SHELF_DEPTH + 0.02, 0, canopyTopY - PLANK_THICKNESS * 0.5, 0.01, cx, by, cz, yaw);
    addLocalCabinetBox(backParts, width - 0.06, sideBodyH, 0.03, 0, sideCenterY, backZ + 0.015, cx, by, cz, yaw);

    // Frieze + 2-tier crown molding + brass fillets
    const friezeH = 0.34;
    addLocalCabinetBox(crownParts, width + 0.02, friezeH, SHELF_DEPTH + 0.024, 0, canopyTopY + friezeH * 0.5, 0.012, cx, by, cz, yaw);
    addLocalCabinetBox(crownParts, width + 0.12, 0.068, SHELF_DEPTH + 0.11, 0, canopyTopY + friezeH + 0.034, 0.045, cx, by, cz, yaw);
    addLocalCabinetBox(crownParts, width + 0.2, 0.072, SHELF_DEPTH + 0.19, 0, SHELF_TOTAL_HEIGHT - 0.036, 0.075, cx, by, cz, yaw);
    addLocalCabinetBox(brassParts, width + 0.05, 0.02, 0.024, 0, canopyTopY + 0.012, frontZ + 0.024, cx, by, cz, yaw);
    addLocalCabinetBox(brassParts, width + 0.14, 0.022, 0.028, 0, canopyTopY + friezeH + 0.01, frontZ + 0.052, cx, by, cz, yaw);

    // Cozy timber bookshop awning / shrine roof eaves for open-air biomes
    if (hasAwning) {
      const awning = createScaledBox(width + 0.52, 0.09, 1.05, 0, 0, 0, 0.5);
      awning.rotateX(0.18);
      awning.translate(0, SHELF_TOTAL_HEIGHT + 0.12, 0.28);
      if (yaw !== 0) awning.rotateY(yaw);
      awning.translate(cx, by, cz);
      crownParts.push(awning);
    }

    // Twin vintage brass bookshop sconce lamps flanking the nameplate + warm under-canopy strip
    const plateHalfW = Math.min(NAMEPLATE_WIDTH, width - 0.34) * 0.5;
    const sconceOffsetX = Math.min(width * 0.5 - 0.14, Math.max(plateHalfW + 0.14, width * 0.36));
    for (const side of [-1, 1]) {
      const lx = side * sconceOffsetX;
      // Brass wall backplate + projecting swan-neck arm + shade hood
      addLocalCabinetBox(brassParts, 0.08, 0.09, 0.03, lx, canopyTopY + 0.2, frontZ + 0.03, cx, by, cz, yaw);
      addLocalCabinetBox(brassParts, 0.028, 0.028, 0.26, lx, canopyTopY + 0.23, frontZ + 0.16, cx, by, cz, yaw);
      addLocalCabinetBox(brassParts, 0.15, 0.048, 0.15, lx, canopyTopY + 0.18, frontZ + 0.28, cx, by, cz, yaw);
      // Warm frosted glass lantern bulb hanging beneath hood
      addLocalCabinetBox(lampGlowParts, 0.085, 0.105, 0.085, lx, canopyTopY + 0.115, frontZ + 0.28, cx, by, cz, yaw);
    }
    // Concealed warm library strip light under the top shelf cornice illuminating book spines
    addLocalCabinetBox(
      lampGlowParts,
      Math.max(0.8, width - 0.36),
      0.024,
      0.045,
      0,
      canopyTopY - PLANK_THICKNESS - 0.014,
      frontZ - 0.03,
      cx,
      by,
      cz,
      yaw,
    );
  }
}

function addArchBridge(
  woodParts: THREE.BufferGeometry[],
  redParts: THREE.BufferGeometry[],
  zone: Extract<SurfaceZone3D, { kind: 'arch' }>,
): void {
  const width = zone.maxX - zone.minX;
  const cx = (zone.minX + zone.maxX) * 0.5;
  const spanZ = zone.endZ - zone.startZ;
  const segments = 16;
  const segDepth = Math.abs(spanZ) / segments + 0.06;

  for (let i = 0; i < segments; i += 1) {
    const t = (i + 0.5) / segments;
    const z = zone.startZ + spanZ * t;
    const y = zone.baseY + (zone.peakY - zone.baseY) * (4 * t * (1 - t));
    woodParts.push(createScaledBox(width, 0.16, segDepth, cx, y - 0.08, z, 0.7));
    // Vermilion arch railing beams along left & right bridge edges
    for (const side of [-1, 1]) {
      const rx = cx + side * (width * 0.5 - 0.08);
      redParts.push(
        createScaledBox(0.11, 0.09, segDepth, rx, y + 0.86, z, 0.7),
        createScaledBox(0.08, 0.06, segDepth, rx, y + 0.44, z, 0.7),
      );
      if (i % 3 === 0 || i === segments - 1) {
        redParts.push(createScaledBox(0.13, 1.02, 0.13, rx, y + 0.48, z, 0.7));
      }
    }
  }
}

function buildSakuraTerrain(
  floor: FloorWorldLayout3D,
  ground: THREE.BufferGeometry[],
  plaza: THREE.BufferGeometry[],
  stone: THREE.BufferGeometry[],
  bridgeWood: THREE.BufferGeometry[],
  bridgeRed: THREE.BufferGeometry[],
  water: THREE.BufferGeometry[],
): void {
  // South grass bank (Z: 4.8..24), North shrine bank (Z: -20..-4.8) & Summit hill (stops flush at Z = -22.5, never cuts mountain-stairs.glb!)
  ground.push(
    createScaledBox(56, 0.8, 21, 0, -0.4, 15.3, 0.08),
    createScaledBox(56, 0.8, 17, 0, -0.4, -13.3, 0.08),
    createScaledBox(56, 2.8, 14, 0, 1.0, -29.5, 0.08),
  );
  // Stepping-stone south walkway, north shrine courtyard & summit terrace (Y = 2.4)
  plaza.push(
    createScaledBox(6.8, 0.08, 14.5, 0, -0.02, 12.2, 0.16),
    createScaledBox(25.5, 0.08, 12.4, 0, -0.02, -11.0, 0.16),
    createScaledBox(17.0, 2.42, 6.2, 0, 1.2, -25.6, 0.18),
  );
  // Lakebed & shimmering Sakura Lake water plane
  stone.push(
    createScaledBox(56, 0.3, 12, 0, -0.95, 0, 0.15),
    // Embankment stones along lake edges & cliff flanks beside mountain-stairs.glb
    createScaledBox(18.2, 0.45, 0.55, -12.0, 0.12, 4.8, 0.35),
    createScaledBox(18.2, 0.45, 0.55, 12.0, 0.12, 4.8, 0.35),
    createScaledBox(18.2, 0.45, 0.55, -12.0, 0.12, -4.8, 0.35),
    createScaledBox(18.2, 0.45, 0.55, 12.0, 0.12, -4.8, 0.35),
    createScaledBox(16.4, 2.6, 5.4, -10.08, 1.3, -19.85, 0.25),
    createScaledBox(16.4, 2.6, 5.4, 10.08, 1.3, -19.85, 0.25),
  );
  const lake = new THREE.PlaneGeometry(60, 10.6);
  lake.rotateX(-Math.PI / 2);
  lake.translate(0, -0.35, 0);
  water.push(lake);

  const arch = floor.surfaces.find((s) => s.kind === 'arch');
  if (arch && arch.kind === 'arch') addArchBridge(bridgeWood, bridgeRed, arch);
}

function buildStarfieldTerrain(
  ground: THREE.BufferGeometry[],
  plaza: THREE.BufferGeometry[],
  stone: THREE.BufferGeometry[],
  brass: THREE.BufferGeometry[],
): void {
  // Polished marble Grand Library floor & full-width upper terrace (Y = 1.8)
  // (Perimeter walls, 2-story Victorian bookcases, real library staircase & vaulted ceiling
  // are rendered by `GrandLibraryHallMesh.tsx` using real PBR GLBs, `D-023`.)
  ground.push(createScaledBox(40.2, 0.3, 45.4, 0, -0.16, -2.2, 0.1));
  const medallion = new THREE.CylinderGeometry(11.5, 11.5, 0.04, 36);
  medallion.translate(0, -0.008, 0);
  plaza.push(medallion);
  plaza.push(createScaledBox(38.8, 1.8, 6.8, 0, 0.9, -20.9, 0.16));

  stone.push(
    createScaledBox(16.4, 1.85, 0.48, -11.2, 0.92, -17.5, 0.35),
    createScaledBox(16.4, 1.85, 0.48, 11.2, 0.92, -17.5, 0.35),
  );
  brass.push(
    createScaledBox(0.12, 0.92, 6.6, -7.55, 2.26, -20.8, 0.5),
    createScaledBox(0.12, 0.92, 6.6, 7.55, 2.26, -20.8, 0.5),
  );
}

function buildStarlightRuinsTerrain(
  ground: THREE.BufferGeometry[],
  plaza: THREE.BufferGeometry[],
  stone: THREE.BufferGeometry[],
  water: THREE.BufferGeometry[],
): void {
  // Ancient carved floating stone sanctuary island + Boss Arena (Y = 2.4)
  ground.push(createScaledBox(29.8, 1.4, 36.2, 0, -0.7, 2.4, 0.14));
  plaza.push(
    createScaledBox(7.2, 0.08, 34.5, 0, -0.015, 2.0, 0.16),
    createScaledBox(18.0, 2.5, 8.5, 0, 1.15, -25.0, 0.16),
  );
  // Flanking cliff stonework beside mountain-stairs.glb + island rim stones
  stone.push(
    createScaledBox(13.0, 2.55, 5.4, -8.38, 1.25, -18.15, 0.25),
    createScaledBox(13.0, 2.55, 5.4, 8.38, 1.25, -18.15, 0.25),
    createScaledBox(0.55, 0.42, 36.0, -14.8, 0.18, 2.4, 0.35),
    createScaledBox(0.55, 0.42, 36.0, 14.8, 0.18, 2.4, 0.35),
    createScaledBox(0.55, 0.55, 8.6, -9.05, 2.65, -25.0, 0.35),
    createScaledBox(0.55, 0.55, 8.6, 9.05, 2.65, -25.0, 0.35),
  );
  // Expansive starry reflecting mirror lake around the floating ruin island
  const mirrorLake = new THREE.PlaneGeometry(92, 92);
  mirrorLake.rotateX(-Math.PI / 2);
  mirrorLake.translate(0, -0.45, -4);
  water.push(mirrorLake);
}

/**
 * Builds batched, GPU-efficient Three.js geometries for the active floor biome,
 * terrain, staircases, bridges, and all rotated bookshelves on `floor`.
 */
export function buildWorldArchitectureGeometries(
  floor: FloorWorldLayout3D,
): WorldArchitectureGeometries {
  const ground: THREE.BufferGeometry[] = [];
  const plaza: THREE.BufferGeometry[] = [];
  const stone: THREE.BufferGeometry[] = [];
  const bridgeWood: THREE.BufferGeometry[] = [];
  const bridgeRed: THREE.BufferGeometry[] = [];
  const water: THREE.BufferGeometry[] = [];
  const glassDome: THREE.BufferGeometry[] = [];
  const cabinet: THREE.BufferGeometry[] = [];
  const crown: THREE.BufferGeometry[] = [];
  const backPanel: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];
  const bookcaseLampGlow: THREE.BufferGeometry[] = [];

  if (floor.biomeId === 'sakura_shrine') {
    buildSakuraTerrain(floor, ground, plaza, stone, bridgeWood, bridgeRed, water);
  } else if (floor.biomeId === 'starfield_atrium') {
    buildStarfieldTerrain(ground, plaza, stone, brass);
  } else if (floor.biomeId === 'starlight_ruins') {
    buildStarlightRuinsTerrain(ground, plaza, stone, water);
  }
  // `town_of_beginnings` renders the real Parisian cobblestone scenery (`TownWorldGlb.tsx`, D-019)
  // instead of flat procedural ground/curb blocks, while still keeping rotated bookcases below.

  buildRotatedBookcases(floor, cabinet, crown, backPanel, brass, bookcaseLampGlow);

  return {
    ground: mergeSimpleGeometries(ground),
    plaza: mergeSimpleGeometries(plaza),
    stone: mergeSimpleGeometries(stone),
    bridgeWood: mergeSimpleGeometries(bridgeWood),
    bridgeRed: mergeSimpleGeometries(bridgeRed),
    water: water.length > 0 ? mergeSimpleGeometries(water) : null,
    glassDome: glassDome.length > 0 ? mergeSimpleGeometries(glassDome) : null,
    woodCabinet: mergeSimpleGeometries(cabinet),
    woodCrown: mergeSimpleGeometries(crown),
    woodBackPanel: mergeSimpleGeometries(backPanel),
    brassTrim: mergeSimpleGeometries(brass),
    bookcaseLampGlow: mergeSimpleGeometries(bookcaseLampGlow),
  };
}

/**
 * Merges all rotated shelf nameplates on the active floor into 1 draw call using the atlas UVs.
 */
export function buildRotatedNameplateGeometry(
  floor: FloorWorldLayout3D,
  uvByKey: ReadonlyMap<string, NameplateUVRect>,
): THREE.BufferGeometry {
  const quads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < floor.bookcases.length; i += 1) {
    const bc = floor.bookcases[i];
    const uvRect = uvByKey.get(bc.id);
    if (!uvRect) continue;
    const plateW = Math.min(NAMEPLATE_WIDTH, bc.width - 0.34);
    const geom = new THREE.PlaneGeometry(plateW, NAMEPLATE_HEIGHT);
    const uv = geom.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, uvRect.u0, uvRect.v1);
    uv.setXY(1, uvRect.u1, uvRect.v1);
    uv.setXY(2, uvRect.u0, uvRect.v0);
    uv.setXY(3, uvRect.u1, uvRect.v0);
    uv.needsUpdate = true;
    if (bc.nameplateYaw !== 0) geom.rotateY(bc.nameplateYaw);
    geom.translate(bc.nameplateCenter[0], bc.nameplateCenter[1], bc.nameplateCenter[2]);
    quads.push(geom);
  }
  return mergeSimpleGeometries(quads);
}
