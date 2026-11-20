import { useEffect, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { mergeSimpleGeometries } from './geometryUtils';
import { LIBRARY_3D_CONSTANTS, type LibraryLayout3D } from './layout3d';
import {
  createShelfNameplateAtlas,
  getLibrary3DThemePalette,
  type LibraryMaterialBundle,
  type NameplateUVRect,
} from './proceduralMaterials';

interface LibraryRoomMeshProps {
  layout: LibraryLayout3D;
  theme: AppTheme;
  materialBundle: LibraryMaterialBundle;
  lanternLightRef: MutableRefObject<THREE.PointLight | null>;
}

interface RoomGeometries {
  woodCabinet: THREE.BufferGeometry;
  woodCrown: THREE.BufferGeometry;
  woodBackPanel: THREE.BufferGeometry;
  woodFloor: THREE.BufferGeometry;
  hallWall: THREE.BufferGeometry;
  hallColumn: THREE.BufferGeometry;
  windowGlow: THREE.BufferGeometry;
  brassTrim: THREE.BufferGeometry;
  lanternGlow: THREE.BufferGeometry;
}

const NAMEPLATE_WIDTH = 1.48;
const NAMEPLATE_HEIGHT = 0.275;
const COLUMN_SPACING = 6.2;

function createScaledBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  uvDensity = 0.65,
): THREE.BufferGeometry {
  const geom = new THREE.BoxGeometry(w, h, d);
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  // Scale face UVs by physical dimensions (6 faces × 4 vertices: +X, -X, +Y, -Y, +Z, -Z)
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
  geom.translate(x, y, z);
  return geom;
}

function mergeAndDispose(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeSimpleGeometries(parts);
}

function buildNameplateQuad(
  center: [number, number, number],
  width: number,
  height: number,
  uvRect: NameplateUVRect,
): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(width, height);
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  // PlaneGeometry vertex order: 0=TL, 1=TR, 2=BL, 3=BR
  uv.setXY(0, uvRect.u0, uvRect.v1);
  uv.setXY(1, uvRect.u1, uvRect.v1);
  uv.setXY(2, uvRect.u0, uvRect.v0);
  uv.setXY(3, uvRect.u1, uvRect.v0);
  uv.needsUpdate = true;
  geom.translate(center[0], center[1], center[2]);
  return geom;
}

function buildGrandHallGeometries(layout: LibraryLayout3D): RoomGeometries {
  const {
    BAY_INNER_WIDTH,
    SIDE_PANEL_THICKNESS,
    SHELF_DEPTH,
    SHELF_BACK_Z,
    PLINTH_HEIGHT,
    PLANK_THICKNESS,
    CROWN_HEIGHT,
    SHELF_TOTAL_HEIGHT,
    MEZZANINE_Y,
    HALL_CEILING_Y,
  } = LIBRARY_3D_CONSTANTS;

  const cabinetParts: THREE.BufferGeometry[] = [];
  const crownParts: THREE.BufferGeometry[] = [];
  const backParts: THREE.BufferGeometry[] = [];
  const wallParts: THREE.BufferGeometry[] = [];
  const columnParts: THREE.BufferGeometry[] = [];
  const windowParts: THREE.BufferGeometry[] = [];
  const brassParts: THREE.BufferGeometry[] = [];
  const lanternParts: THREE.BufferGeometry[] = [];

  const frontZ = SHELF_BACK_Z + SHELF_DEPTH;
  const shelfCenterZ = SHELF_BACK_Z + SHELF_DEPTH * 0.5;
  const canopyTopY = SHELF_TOTAL_HEIGHT - CROWN_HEIGHT;
  const sideBodyHeight = canopyTopY - PLINTH_HEIGHT;
  const sideCenterY = PLINTH_HEIGHT + sideBodyHeight * 0.5;

  // 1. Tall classical wooden bookcases with plinth bases & two-tier crown molding
  for (let i = 0; i < layout.shelves.length; i += 1) {
    const shelf = layout.shelves[i];
    const { minX, centerX, width, bayCount, tierYs } = shelf;

    // Stepped base plinth
    crownParts.push(
      createScaledBox(width + 0.08, PLINTH_HEIGHT * 0.55, SHELF_DEPTH + 0.08, centerX, PLINTH_HEIGHT * 0.275, shelfCenterZ + 0.02),
      createScaledBox(width + 0.03, PLINTH_HEIGHT * 0.45, SHELF_DEPTH + 0.04, centerX, PLINTH_HEIGHT * 0.775, shelfCenterZ + 0.01),
    );

    // Side pilasters & vertical inter-bay mullions
    for (let p = 0; p <= bayCount; p += 1) {
      const panelX = minX + SIDE_PANEL_THICKNESS * 0.5 + p * (BAY_INNER_WIDTH + SIDE_PANEL_THICKNESS);
      cabinetParts.push(
        createScaledBox(SIDE_PANEL_THICKNESS, sideBodyHeight, SHELF_DEPTH, panelX, sideCenterY, shelfCenterZ),
      );
      // Classical front pilaster relief strip
      crownParts.push(
        createScaledBox(SIDE_PANEL_THICKNESS * 0.62, sideBodyHeight - 0.08, 0.026, panelX, sideCenterY, frontZ + 0.012),
      );
    }

    // Horizontal shelf planks + top canopy board
    const innerSpan = width - SIDE_PANEL_THICKNESS * 2;
    for (let t = 0; t < tierYs.length; t += 1) {
      cabinetParts.push(
        createScaledBox(innerSpan, PLANK_THICKNESS, SHELF_DEPTH - 0.03, centerX, tierYs[t] - PLANK_THICKNESS * 0.5, shelfCenterZ - 0.005),
      );
    }
    cabinetParts.push(
      createScaledBox(width, PLANK_THICKNESS, SHELF_DEPTH + 0.02, centerX, canopyTopY - PLANK_THICKNESS * 0.5, shelfCenterZ + 0.01),
    );

    // Recessed dark-wood back panel for strong depth contrast behind books
    backParts.push(
      createScaledBox(width - 0.06, sideBodyHeight, 0.03, centerX, sideCenterY, SHELF_BACK_Z + 0.015),
    );

    // Frieze backing (front at frontZ + 0.024) + 2-tier overhanging crown molding + brass fillets
    const friezeHeight = 0.34;
    const friezeCenterY = canopyTopY + friezeHeight * 0.5;
    crownParts.push(
      createScaledBox(width + 0.02, friezeHeight, SHELF_DEPTH + 0.024, centerX, friezeCenterY, shelfCenterZ + 0.012),
      createScaledBox(width + 0.12, 0.068, SHELF_DEPTH + 0.11, centerX, canopyTopY + friezeHeight + 0.034, shelfCenterZ + 0.045),
      createScaledBox(width + 0.2, 0.072, SHELF_DEPTH + 0.19, centerX, SHELF_TOTAL_HEIGHT - 0.036, shelfCenterZ + 0.075),
    );
    brassParts.push(
      createScaledBox(width + 0.05, 0.02, 0.024, centerX, canopyTopY + 0.012, frontZ + 0.024),
      createScaledBox(width + 0.14, 0.022, 0.028, centerX, canopyTopY + friezeHeight + 0.01, frontZ + 0.052),
    );
  }

  // 2. Grand Classical 2-Story Hall Envelope (floor, walls, mezzanine gallery, columns, coffers)
  const hallWidth = Math.max(24, layout.hallSpanX + 10);
  const hallCenterX = layout.centerX;
  const hallLeftX = hallCenterX - hallWidth * 0.5;
  const hallRightX = hallCenterX + hallWidth * 0.5;
  const rearWallZ = SHELF_BACK_Z - 0.16;
  const hallDepth = 16;
  const hallCenterZ = rearWallZ + hallDepth * 0.5;

  const woodFloor = createScaledBox(hallWidth, 0.12, hallDepth, hallCenterX, -0.06, hallCenterZ, 0.45);

  // Rear wall, coffered ceiling slab, left & right architectural end walls
  wallParts.push(
    createScaledBox(hallWidth, HALL_CEILING_Y, 0.24, hallCenterX, HALL_CEILING_Y * 0.5, rearWallZ - 0.12, 0.25),
    createScaledBox(hallWidth, 0.28, hallDepth, hallCenterX, HALL_CEILING_Y + 0.14, hallCenterZ, 0.25),
    createScaledBox(0.35, HALL_CEILING_Y, hallDepth, hallLeftX, HALL_CEILING_Y * 0.5, hallCenterZ, 0.25),
    createScaledBox(0.35, HALL_CEILING_Y, hallDepth, hallRightX, HALL_CEILING_Y * 0.5, hallCenterZ, 0.25),
  );

  // 2nd-story Mezzanine balcony deck & classical balustrade railing (Library_Full.webp inspiration)
  const mezzFrontZ = 0.72;
  const mezzDepth = mezzFrontZ - rearWallZ;
  const mezzCenterZ = rearWallZ + mezzDepth * 0.5;
  crownParts.push(
    createScaledBox(hallWidth, 0.24, mezzDepth, hallCenterX, MEZZANINE_Y, mezzCenterZ, 0.5),
    createScaledBox(hallWidth, 0.07, 0.14, hallCenterX, MEZZANINE_Y + 0.96, mezzFrontZ - 0.05, 0.6),
    createScaledBox(hallWidth, 0.06, 0.12, hallCenterX, MEZZANINE_Y + 0.16, mezzFrontZ - 0.05, 0.6),
  );
  brassParts.push(
    createScaledBox(hallWidth, 0.025, 0.04, hallCenterX, MEZZANINE_Y - 0.09, mezzFrontZ + 0.015),
  );

  // Mezzanine balusters along the entire gallery edge
  const balusterCount = Math.min(96, Math.floor(hallWidth / 0.52));
  const balusterStep = hallWidth / Math.max(1, balusterCount);
  for (let b = 0; b <= balusterCount; b += 1) {
    const bx = hallLeftX + b * balusterStep;
    cabinetParts.push(
      createScaledBox(0.055, 0.74, 0.055, bx, MEZZANINE_Y + 0.56, mezzFrontZ - 0.05, 0.8),
    );
  }

  // Coffered ceiling longitudinal beams
  for (const beamZ of [0.4, 2.8, 5.2]) {
    crownParts.push(
      createScaledBox(hallWidth, 0.28, 0.34, hallCenterX, HALL_CEILING_Y - 0.14, beamZ, 0.4),
    );
  }

  // 3. Rhythmic classical columns (2nd-story mezzanine + rear wall pilasters + end-aisle pillars),
  //    corbel brackets above bookcase crowns, glowing mezzanine windows & brass chandeliers.
  const baySpanCount = Math.max(4, Math.min(28, Math.ceil(hallWidth / COLUMN_SPACING)));
  const actualSpacing = hallWidth / baySpanCount;
  const upperColHeight = HALL_CEILING_Y - MEZZANINE_Y - 0.56;
  const upperColCenterY = MEZZANINE_Y + 0.24 + upperColHeight * 0.5;

  // Flanking full-height grand columns just outside leftmost & rightmost bookcases (never blocking books)
  const flankPositions = layout.shelves.length > 0
    ? [layout.minX - 0.95, layout.maxX + 0.95]
    : [hallCenterX - 4.2, hallCenterX + 4.2];
  for (const fx of flankPositions) {
    columnParts.push(
      createScaledBox(0.5, 0.34, 0.5, fx, 0.17, mezzFrontZ - 0.08, 0.5),
      createScaledBox(0.38, MEZZANINE_Y - 0.58, 0.38, fx, 0.34 + (MEZZANINE_Y - 0.58) * 0.5, mezzFrontZ - 0.08, 0.4),
      createScaledBox(0.52, 0.24, 0.52, fx, MEZZANINE_Y - 0.14, mezzFrontZ - 0.08, 0.5),
    );
  }

  for (let c = 0; c <= baySpanCount; c += 1) {
    const colX = hallLeftX + c * actualSpacing;
    const colZ = mezzFrontZ - 0.08;

    // Rear wall pilaster + upper corbel bracket (sits cleanly above bookcase crowns) + 2nd-story column
    columnParts.push(
      createScaledBox(0.42, MEZZANINE_Y, 0.16, colX, MEZZANINE_Y * 0.5, rearWallZ + 0.08, 0.4),
      createScaledBox(0.36, 0.22, mezzDepth, colX, MEZZANINE_Y - 0.23, mezzCenterZ, 0.45),
      createScaledBox(0.42, 0.2, 0.42, colX, MEZZANINE_Y + 0.14, colZ, 0.5),
      createScaledBox(0.32, upperColHeight, 0.32, colX, upperColCenterY, colZ, 0.4),
      createScaledBox(0.46, 0.26, 0.46, colX, HALL_CEILING_Y - 0.22, colZ, 0.5),
    );

    // Transverse coffered ceiling beam tying each column across the nave
    crownParts.push(
      createScaledBox(0.34, 0.28, 6.2, colX, HALL_CEILING_Y - 0.14, 2.5, 0.4),
    );

    // Between columns: tall glowing 2nd-story classical window + hanging brass globe chandelier
    if (c < baySpanCount) {
      const midX = colX + actualSpacing * 0.5;
      const winW = Math.min(2.3, actualSpacing * 0.44);
      const winH = 2.45;
      const winY = MEZZANINE_Y + 1.85;
      const winZ = rearWallZ + 0.02;

      windowParts.push(createScaledBox(winW, winH, 0.04, midX, winY, winZ, 0.5));
      // Window frame & classical cross mullions
      crownParts.push(
        createScaledBox(winW + 0.18, 0.1, 0.12, midX, winY + winH * 0.5 + 0.05, winZ + 0.04),
        createScaledBox(winW + 0.18, 0.1, 0.12, midX, winY - winH * 0.5 - 0.05, winZ + 0.04),
        createScaledBox(0.06, winH, 0.08, midX, winY, winZ + 0.03),
        createScaledBox(winW, 0.06, 0.08, midX, winY + 0.35, winZ + 0.03),
        createScaledBox(winW, 0.06, 0.08, midX, winY - 0.45, winZ + 0.03),
      );

      // Hanging brass chandelier with 4 warm opal globes framing upper nave (aba744c3...png)
      const chanY = 4.22;
      const chanZ = 1.25;
      brassParts.push(
        createScaledBox(0.035, HALL_CEILING_Y - chanY, 0.035, midX, (HALL_CEILING_Y + chanY) * 0.5, chanZ),
        createScaledBox(0.95, 0.06, 0.06, midX, chanY, chanZ),
        createScaledBox(0.06, 0.06, 0.95, midX, chanY, chanZ),
      );
      for (const [gx, gz] of [
        [-0.45, 0],
        [0.45, 0],
        [0, -0.45],
        [0, 0.45],
      ]) {
        const globe = new THREE.OctahedronGeometry(0.115, 1);
        globe.translate(midX + gx, chanY + 0.11, chanZ + gz);
        lanternParts.push(globe);
      }
    }
  }

  return {
    woodCabinet: mergeAndDispose(cabinetParts),
    woodCrown: mergeAndDispose(crownParts),
    woodBackPanel: mergeAndDispose(backParts),
    woodFloor,
    hallWall: mergeAndDispose(wallParts),
    hallColumn: mergeAndDispose(columnParts),
    windowGlow: mergeAndDispose(windowParts),
    brassTrim: mergeAndDispose(brassParts),
    lanternGlow: mergeAndDispose(lanternParts),
  };
}

/**
 * Renders the procedural 2-story Grand Classical Library hall, tall crown-molded wooden
 * bookcases, atlas-batched shelf nameplates, and 3-theme Three.js lighting rig (10 draw calls).
 */
export function LibraryRoomMesh({
  layout,
  theme,
  materialBundle,
  lanternLightRef,
}: LibraryRoomMeshProps) {
  const palette = getLibrary3DThemePalette(theme);
  const { lighting, fog } = palette;
  const { materials } = materialBundle;

  const roomGeometries = useMemo(() => buildGrandHallGeometries(layout), [layout]);

  useEffect(() => {
    return () => {
      Object.values(roomGeometries).forEach((geom) => geom.dispose());
    };
  }, [roomGeometries]);

  const nameplateBatch = useMemo(() => {
    const items = layout.shelves.map((shelf) => ({
      key: shelf.key,
      name: shelf.name,
      bookCount: shelf.bookCount,
    }));
    const atlas = createShelfNameplateAtlas(items, theme);
    const quads: THREE.BufferGeometry[] = [];
    for (let i = 0; i < layout.shelves.length; i += 1) {
      const shelf = layout.shelves[i];
      const uvRect = atlas.uvByKey.get(shelf.key);
      if (!uvRect) continue;
      const plateW = Math.min(NAMEPLATE_WIDTH, shelf.width - 0.34);
      quads.push(buildNameplateQuad(shelf.nameplateCenter, plateW, NAMEPLATE_HEIGHT, uvRect));
    }
    return {
      atlas,
      geometry: mergeAndDispose(quads),
    };
  }, [layout.shelves, theme]);

  useEffect(() => {
    return () => {
      nameplateBatch.geometry.dispose();
      nameplateBatch.atlas.dispose();
    };
  }, [nameplateBatch]);

  const initialLanternX = layout.shelves[0]?.centerX ?? layout.centerX;

  return (
    <group name="grand-library-room">
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[fog.color, fog.near, fog.far]} />

      {/* Pure Three.js 3-theme lighting rig (0 CDN HDRI / 0 dynamic shadows) */}
      <hemisphereLight
        args={[lighting.hemisphere.skyColor, lighting.hemisphere.groundColor, lighting.hemisphere.intensity]}
      />
      <directionalLight
        color={lighting.keyDirectional.color}
        intensity={lighting.keyDirectional.intensity}
        position={lighting.keyDirectional.position}
      />
      <directionalLight
        color={lighting.fillDirectional.color}
        intensity={lighting.fillDirectional.intensity}
        position={lighting.fillDirectional.position}
      />
      <pointLight
        ref={lanternLightRef}
        color={lighting.lanternPoint.color}
        intensity={lighting.lanternPoint.intensity}
        distance={lighting.lanternPoint.distance}
        decay={lighting.lanternPoint.decay}
        position={[initialLanternX, 3.25, 2.25]}
      />

      {/* Merged Grand Hall & Bookcase Architecture (10 constant draw calls) */}
      <mesh geometry={roomGeometries.woodFloor} material={materials.woodFloor} />
      <mesh geometry={roomGeometries.hallWall} material={materials.hallWall} />
      <mesh geometry={roomGeometries.hallColumn} material={materials.hallColumn} />
      <mesh geometry={roomGeometries.windowGlow} material={materials.windowGlow} />
      <mesh geometry={roomGeometries.woodBackPanel} material={materials.woodBackPanel} />
      <mesh geometry={roomGeometries.woodCabinet} material={materials.woodCabinet} />
      <mesh geometry={roomGeometries.woodCrown} material={materials.woodCrown} />
      <mesh geometry={roomGeometries.brassTrim} material={materials.brassTrim} />
      <mesh geometry={roomGeometries.lanternGlow} material={materials.lanternGlow} />
      {layout.shelves.length > 0 && (
        <mesh geometry={nameplateBatch.geometry} material={nameplateBatch.atlas.material} />
      )}
    </group>
  );
}
