import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { mergeSimpleGeometries } from './geometryUtils';
import { createScaledBox } from './worldGeometryBuilder';
import { getWorldBiomePalette } from './worldPalettes';
import type { BiomeId } from './worldTypes';

export interface WorldHorizonVistaProps {
  biomeId: BiomeId;
  theme: AppTheme;
  biomeVariant?: number;
  paused?: boolean;
  prefersReducedMotion?: boolean;
}

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createCloudSeaTexture(): THREE.CanvasTexture {
  const size = 512;
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({ width: 2, height: 2 } as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const rand = createSeededRandom(90421);
    // Concentric billowy ring of clouds (hollow center under floor, thick misty ocean outward)
    for (let i = 0; i < 220; i += 1) {
      const ang = rand() * Math.PI * 2;
      const dist = 0.16 + Math.pow(rand(), 0.72) * 0.31;
      const cx = size * (0.5 + Math.cos(ang) * dist);
      const cy = size * (0.5 + Math.sin(ang) * dist);
      const r = 18 + rand() * 44;
      const grad = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
      const alpha = (0.14 + rand() * 0.22).toFixed(3);
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(0.55, `rgba(236, 244, 255, ${(Number(alpha) * 0.55).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(236, 244, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fade outer boundary smoothly so zero square plane edges ever appear
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.08, size * 0.5, size * 0.5, size * 0.49);
    mask.addColorStop(0, 'rgba(255,255,255,0.4)');
    mask.addColorStop(0.3, 'rgba(255,255,255,1)');
    mask.addColorStop(0.8, 'rgba(255,255,255,0.82)');
    mask.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds a seamless 360-degree mountain ridge cylinder with jagged alpine peaks and valleys.
 */
function buildMountainRidgeRing(
  innerR: number,
  outerR: number,
  baseY: number,
  peakScale: number,
  seed: number,
  fujiPeakAngle?: number,
): THREE.BufferGeometry {
  const segs = 96;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i += 1) {
    const u = i / segs;
    const ang = u * Math.PI * 2;
    const hNoise =
      Math.sin(ang * 3 + seed) * 0.32 +
      Math.sin(ang * 7 + seed * 1.7) * 0.24 +
      Math.cos(ang * 13 + seed * 0.5) * 0.16 +
      Math.sin(ang * 21 + seed * 2.3) * 0.1;
    let peakH = Math.max(4, (0.58 + hNoise) * peakScale);

    // Optional iconic Mt. Fuji-like majestic volcano silhouette (Sakura Shrine North)
    if (fujiPeakAngle !== undefined) {
      let d = Math.abs(ang - fujiPeakAngle);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < 0.38) {
        const t = 1 - d / 0.38;
        peakH = Math.max(peakH, peakScale * (0.85 + 1.15 * Math.pow(t, 1.55)));
      }
    }

    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    // Ridge crest vertex (row 0) & lower skirt vertex (row 1)
    positions.push(cos * innerR, baseY + peakH, sin * innerR);
    uvs.push(u * 4, 1);
    positions.push(cos * outerR, baseY - 14, sin * outerR);
    uvs.push(u * 4, 0);
  }

  for (let i = 0; i < segs; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

interface VistaGeometries {
  farMountains: THREE.BufferGeometry;
  midRock: THREE.BufferGeometry;
  islandCaps: THREE.BufferGeometry;
  structures: THREE.BufferGeometry;
  glowAccents: THREE.BufferGeometry;
  aincradUpperRing: THREE.BufferGeometry | null;
}

function addFloatingIsland(
  rockParts: THREE.BufferGeometry[],
  capParts: THREE.BufferGeometry[],
  structParts: THREE.BufferGeometry[],
  glowParts: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  radius: number,
  depth: number,
  style: 'ruins' | 'sakura' | 'citadel',
  seed: number,
): void {
  // Inverted craggy floating rock island underside
  const underside = new THREE.ConeGeometry(radius, depth, 7, 1);
  underside.rotateX(Math.PI);
  underside.rotateY(seed);
  underside.translate(x, y - depth * 0.5, z);
  rockParts.push(underside);

  // Subtle side rock crag for organic silhouette
  const sideCrag = new THREE.ConeGeometry(radius * 0.52, depth * 0.65, 6, 1);
  sideCrag.rotateX(Math.PI);
  sideCrag.translate(x + Math.cos(seed) * radius * 0.46, y - depth * 0.36, z + Math.sin(seed) * radius * 0.46);
  rockParts.push(sideCrag);

  // Island top plateau cap
  const cap = new THREE.CylinderGeometry(radius * 1.02, radius * 0.92, Math.max(1.2, radius * 0.16), 7);
  cap.rotateY(seed);
  cap.translate(x, y + Math.max(0.6, radius * 0.08), z);
  capParts.push(cap);

  if (style === 'ruins') {
    // Ancient broken temple pillars + floating crystal monolith
    const colH = radius * 0.85;
    for (let k = -1; k <= 1; k += 2) {
      const col = new THREE.CylinderGeometry(radius * 0.07, radius * 0.09, colH, 6);
      col.translate(x + k * radius * 0.34, y + colH * 0.5, z);
      structParts.push(col);
    }
    const lintel = createScaledBox(radius * 0.9, radius * 0.14, radius * 0.22, x, y + colH, z, 0.2, seed);
    structParts.push(lintel);

    const crystal = new THREE.OctahedronGeometry(radius * 0.22, 0);
    crystal.scale(0.6, 2.2, 0.6);
    crystal.translate(x, y + colH * 0.85 + radius * 0.45, z);
    glowParts.push(crystal);
  } else if (style === 'sakura') {
    // Lush cherry-blossom grove silhouettes + warm shrine lantern
    for (let k = 0; k < 3; k += 1) {
      const ang = seed + k * 2.1;
      const crown = new THREE.DodecahedronGeometry(radius * (0.38 - k * 0.06), 0);
      crown.translate(
        x + Math.cos(ang) * radius * 0.32,
        y + radius * 0.42,
        z + Math.sin(ang) * radius * 0.32,
      );
      capParts.push(crown);
    }
    const lantern = new THREE.OctahedronGeometry(radius * 0.12, 0);
    lantern.translate(x, y + radius * 0.45, z);
    glowParts.push(lantern);
  } else {
    // Distant medieval spire / castle watchtower
    const towerH = radius * 1.5;
    const tower = new THREE.CylinderGeometry(radius * 0.24, radius * 0.32, towerH, 8);
    tower.translate(x, y + towerH * 0.5, z);
    structParts.push(tower);
    const roof = new THREE.ConeGeometry(radius * 0.34, radius * 0.9, 8);
    roof.translate(x, y + towerH + radius * 0.45, z);
    capParts.push(roof);
    const beacon = new THREE.OctahedronGeometry(radius * 0.12, 0);
    beacon.translate(x, y + towerH * 0.78, z);
    glowParts.push(beacon);
  }
}

function buildVistaGeometries(biomeId: BiomeId): VistaGeometries {
  const rand = createSeededRandom(biomeId.length * 9137 + 42);
  const rockParts: THREE.BufferGeometry[] = [];
  const capParts: THREE.BufferGeometry[] = [];
  const structParts: THREE.BufferGeometry[] = [];
  const glowParts: THREE.BufferGeometry[] = [];

  const isSakura = biomeId === 'sakura_shrine';
  const isRuins = biomeId === 'starlight_ruins';
  const isTown = biomeId === 'town_of_beginnings';

  // 1. 360-degree distant panoramic mountain ring
  const farMountains = buildMountainRidgeRing(
    148,
    185,
    isRuins ? -14 : -10,
    isSakura ? 46 : isRuins ? 34 : 38,
    biomeId.length * 1.3,
    isSakura ? -Math.PI * 0.5 : undefined,
  );

  // 2. Floating Aincrad sky islands & distant landmark silhouettes in 360 deg
  const islandCount = isRuins ? 14 : isSakura ? 10 : isTown ? 6 : 8;
  const style: 'ruins' | 'sakura' | 'citadel' = isRuins ? 'ruins' : isSakura ? 'sakura' : 'citadel';
  for (let i = 0; i < islandCount; i += 1) {
    const ang = (i / islandCount) * Math.PI * 2 + (rand() - 0.5) * 0.24;
    const dist = (isTown ? 105 : 64) + rand() * 76;
    const y = isTown ? 8 + rand() * 24 : -2 + rand() * 34;
    const radius = 5.5 + rand() * 8.5;
    const depth = radius * (1.25 + rand() * 0.9);
    addFloatingIsland(
      rockParts,
      capParts,
      structParts,
      glowParts,
      Math.cos(ang) * dist,
      y,
      Math.sin(ang) * dist,
      radius,
      depth,
      style,
      i * 1.7 + rand(),
    );
  }

  // Extra distant 5-tier Pagoda silhouette on Eastern ridge for Sakura Shrine
  if (isSakura) {
    const px = 68;
    const pz = -46;
    const py = 12;
    const ridge = new THREE.ConeGeometry(16, 26, 7);
    ridge.translate(px, py - 11, pz);
    rockParts.push(ridge);
    for (let tier = 0; tier < 4; tier += 1) {
      const w = 6.2 - tier * 1.1;
      const ty = py + tier * 2.4;
      structParts.push(createScaledBox(w * 0.65, 2.0, w * 0.65, px, ty + 1.0, pz, 0.2));
      const eave = new THREE.ConeGeometry(w * 0.78, 1.1, 4);
      eave.rotateY(Math.PI / 4);
      eave.translate(px, ty + 2.2, pz);
      capParts.push(eave);
    }
    const finial = new THREE.OctahedronGeometry(0.9, 0);
    finial.translate(px, py + 11.4, pz);
    glowParts.push(finial);
  }

  // 3. Colossal Aincrad upper-floor citadel ring floating high overhead (Floor 4 & Floor 2)
  let aincradUpperRing: THREE.BufferGeometry | null = null;
  if (isRuins || isSakura) {
    const upperParts: THREE.BufferGeometry[] = [];
    const ring = new THREE.TorusGeometry(132, 4.2, 8, 48);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 74, -22);
    upperParts.push(ring);
    const innerRing = new THREE.TorusGeometry(84, 2.8, 6, 36);
    innerRing.rotateX(Math.PI / 2);
    innerRing.translate(0, 82, -22);
    upperParts.push(innerRing);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const spire = new THREE.ConeGeometry(4.6, 28, 6);
      spire.rotateX(Math.PI);
      spire.translate(Math.cos(a) * 132, 58, -22 + Math.sin(a) * 132);
      upperParts.push(spire);
    }
    aincradUpperRing = mergeSimpleGeometries(upperParts);
  }

  return {
    farMountains,
    midRock: mergeSimpleGeometries(rockParts),
    islandCaps: mergeSimpleGeometries(capParts),
    structures: mergeSimpleGeometries(structParts),
    glowAccents: mergeSimpleGeometries(glowParts),
    aincradUpperRing,
  };
}

/**
 * Renders a 360-degree 3D Aincrad sky horizon panorama outside the playable floor:
 * drifting sea of clouds below the floating island, layered mountain silhouettes,
 * floating sky islands with ruins/groves/spires, and Aincrad's colossal upper-floor ring (`D-022`).
 */
export function WorldHorizonVista({
  biomeId,
  theme,
  biomeVariant = 0,
  paused = false,
  prefersReducedMotion = false,
}: WorldHorizonVistaProps) {
  const cloudUpperRef = useRef<THREE.Mesh | null>(null);
  const cloudLowerRef = useRef<THREE.Mesh | null>(null);
  const palette = useMemo(
    () => getWorldBiomePalette(biomeId, theme, biomeVariant),
    [biomeId, theme, biomeVariant],
  );

  const geoms = useMemo(() => buildVistaGeometries(biomeId), [biomeId]);
  const cloudTex = useMemo(() => createCloudSeaTexture(), []);

  useEffect(() => {
    return () => {
      geoms.farMountains.dispose();
      geoms.midRock.dispose();
      geoms.islandCaps.dispose();
      geoms.structures.dispose();
      geoms.glowAccents.dispose();
      geoms.aincradUpperRing?.dispose();
    };
  }, [geoms]);

  useEffect(() => {
    return () => {
      cloudTex.dispose();
    };
  }, [cloudTex]);

  const mats = useMemo(() => {
    const isNight = theme === 'midnight';
    const isDusk = theme === 'dim';
    const mountainColor = isNight ? '#161f3d' : isDusk ? '#4c385c' : '#7b9bbf';
    const rockColor = isNight ? '#212948' : isDusk ? '#55415e' : '#6c7a8c';
    const capColor =
      biomeId === 'sakura_shrine'
        ? palette.foliagePrimary
        : biomeId === 'starlight_ruins'
          ? isNight
            ? '#333b66'
            : '#4d5885'
          : palette.foliagePrimary;
    const structColor = isNight ? '#2c355c' : isDusk ? '#6b5369' : '#9ca5b3';
    const cloudTint = isNight ? '#3c4e7c' : isDusk ? '#f0a686' : '#f4f8ff';

    return {
      farMountains: new THREE.MeshBasicMaterial({
        color: mountainColor,
        side: THREE.DoubleSide,
        fog: true,
      }),
      midRock: new THREE.MeshStandardMaterial({
        color: rockColor,
        roughness: 0.95,
        metalness: 0.04,
      }),
      islandCaps: new THREE.MeshStandardMaterial({
        color: capColor,
        roughness: 0.85,
        metalness: 0.04,
      }),
      structures: new THREE.MeshStandardMaterial({
        color: structColor,
        roughness: 0.88,
        metalness: 0.08,
      }),
      glowAccents: new THREE.MeshBasicMaterial({
        color: biomeId === 'starlight_ruins' ? '#a5b4fc' : palette.lampGlow,
        fog: false,
      }),
      upperRing: new THREE.MeshBasicMaterial({
        color: isNight ? '#242e57' : isDusk ? '#5c4668' : '#9eb8d6',
        transparent: true,
        opacity: isNight ? 0.56 : 0.34,
        fog: false,
      }),
      cloudUpper: new THREE.MeshBasicMaterial({
        map: cloudTex,
        color: cloudTint,
        transparent: true,
        opacity: isNight ? 0.34 : isDusk ? 0.48 : 0.62,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
      cloudLower: new THREE.MeshBasicMaterial({
        map: cloudTex,
        color: isNight ? '#222d52' : isDusk ? '#c87e74' : '#dbeaff',
        transparent: true,
        opacity: isNight ? 0.42 : 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    };
  }, [biomeId, theme, palette.foliagePrimary, palette.lampGlow, cloudTex]);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  // Ultra-gentle revolving sea of clouds beneath Aincrad (0 CPU when paused/reduced motion)
  useFrame((_, delta) => {
    if (paused || prefersReducedMotion) return;
    const dt = Math.min(delta, 0.05);
    if (cloudUpperRef.current) cloudUpperRef.current.rotation.z += dt * 0.008;
    if (cloudLowerRef.current) cloudLowerRef.current.rotation.z -= dt * 0.005;
  });

  return (
    <group name={`horizon-vista-${biomeId}`}>
      <mesh geometry={geoms.farMountains} material={mats.farMountains} frustumCulled={false} />
      {geoms.midRock.attributes.position && (
        <mesh geometry={geoms.midRock} material={mats.midRock} frustumCulled={false} />
      )}
      {geoms.islandCaps.attributes.position && (
        <mesh geometry={geoms.islandCaps} material={mats.islandCaps} frustumCulled={false} />
      )}
      {geoms.structures.attributes.position && (
        <mesh geometry={geoms.structures} material={mats.structures} frustumCulled={false} />
      )}
      {geoms.glowAccents.attributes.position && (
        <mesh geometry={geoms.glowAccents} material={mats.glowAccents} frustumCulled={false} />
      )}
      {geoms.aincradUpperRing && (
        <mesh geometry={geoms.aincradUpperRing} material={mats.upperRing} frustumCulled={false} />
      )}

      {/* Drifting 2-layer Aincrad sea of clouds beneath the floating island */}
      <mesh
        ref={cloudUpperRef}
        position={[0, -9.5, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={mats.cloudUpper}
        frustumCulled={false}
      >
        <planeGeometry args={[430, 430]} />
      </mesh>
      <mesh
        ref={cloudLowerRef}
        position={[0, -21.0, 0]}
        rotation={[-Math.PI / 2, 0, 1.1]}
        material={mats.cloudLower}
        frustumCulled={false}
      >
        <planeGeometry args={[520, 520]} />
      </mesh>
    </group>
  );
}
