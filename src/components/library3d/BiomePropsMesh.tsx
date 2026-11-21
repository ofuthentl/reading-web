import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { mergeSimpleGeometries } from './geometryUtils';
import type { LibraryMaterialBundle } from './proceduralMaterials';
import {
  createSoftParticleTexture,
  getWorldBiomePalette,
  type WorldMaterialBundle,
} from './worldMaterials';
import { createScaledBox } from './worldGeometryBuilder';
import type { FloorWorldLayout3D } from './worldTypes';
import {
  DragonMascotGlb,
  MossyStairsGlb,
  ToriiGateGlb,
} from './WorldGlbActors';
import { WorldFurnitureGlbs } from './WorldFurnitureGlbs';

export interface BiomePropsMeshProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  libraryMaterials: LibraryMaterialBundle;
  worldMaterials: WorldMaterialBundle;
  bossDoorUnlocked?: boolean;
  paused?: boolean;
  prefersReducedMotion?: boolean;
  requestRender?: () => void;
}

const PARTICLE_COUNT = 130;

interface BatchedPropGeometries {
  bark: THREE.BufferGeometry;
  foliageMain: THREE.BufferGeometry;
  foliageAlt: THREE.BufferGeometry;
  stone: THREE.BufferGeometry;
  wood: THREE.BufferGeometry;
  brass: THREE.BufferGeometry;
  lampGlow: THREE.BufferGeometry;
  crystal: THREE.BufferGeometry;
  portalGlow: THREE.BufferGeometry;
  fountainWater: THREE.BufferGeometry | null;
}

function addRotatedPart(
  target: THREE.BufferGeometry[],
  geom: THREE.BufferGeometry,
  px: number,
  py: number,
  pz: number,
  rotY = 0,
  scale = 1,
): void {
  if (scale !== 1) geom.scale(scale, scale, scale);
  if (rotY !== 0) geom.rotateY(rotY);
  geom.translate(px, py, pz);
  target.push(geom);
}

function buildPropBatch(floor: FloorWorldLayout3D): BatchedPropGeometries {
  const bark: THREE.BufferGeometry[] = [];
  const foliageMain: THREE.BufferGeometry[] = [];
  const foliageAlt: THREE.BufferGeometry[] = [];
  const stone: THREE.BufferGeometry[] = [];
  const wood: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];
  const lampGlow: THREE.BufferGeometry[] = [];
  const crystal: THREE.BufferGeometry[] = [];
  const portalGlow: THREE.BufferGeometry[] = [];
  const fountainWater: THREE.BufferGeometry[] = [];

  for (let i = 0; i < floor.props.length; i += 1) {
    const p = floor.props[i];
    const [x, y, z] = p.position;
    const s = p.scale;

    if (p.kind === 'tree' || p.kind === 'sakura_tree') {
      const trunk = new THREE.CylinderGeometry(0.18, 0.3, 2.7, 8);
      trunk.translate(0, 1.35, 0);
      addRotatedPart(bark, trunk, x, y, z, p.rotationY, s);

      const c1 = new THREE.DodecahedronGeometry(1.55, 1);
      c1.translate(0, 3.25, 0);
      addRotatedPart(foliageMain, c1, x, y, z, p.rotationY, s);
      const c2 = new THREE.DodecahedronGeometry(1.15, 1);
      c2.translate(0.95, 2.85, 0.45);
      addRotatedPart(foliageAlt, c2, x, y, z, p.rotationY, s);
      const c3 = new THREE.DodecahedronGeometry(1.05, 1);
      c3.translate(-0.85, 2.95, -0.55);
      addRotatedPart(foliageMain, c3, x, y, z, p.rotationY, s);
    } else if (p.kind === 'lamp') {
      const pole = new THREE.CylinderGeometry(0.06, 0.1, 3.3, 8);
      pole.translate(0, 1.65, 0);
      addRotatedPart(brass, pole, x, y, z, p.rotationY, s);
      const arm = createScaledBox(0.65, 0.07, 0.07, 0.25, 3.25, 0, 1);
      addRotatedPart(brass, arm, x, y, z, p.rotationY, s);
      const globe = new THREE.OctahedronGeometry(0.22, 1);
      globe.translate(0.52, 3.06, 0);
      addRotatedPart(lampGlow, globe, x, y, z, p.rotationY, s);
    } else if (p.kind === 'stone_lantern') {
      addRotatedPart(stone, createScaledBox(0.62, 0.28, 0.62, 0, 0.14, 0), x, y, z, p.rotationY, s);
      addRotatedPart(stone, createScaledBox(0.28, 1.05, 0.28, 0, 0.8, 0), x, y, z, p.rotationY, s);
      addRotatedPart(stone, createScaledBox(0.76, 0.22, 0.76, 0, 1.85, 0), x, y, z, p.rotationY, s);
      addRotatedPart(lampGlow, createScaledBox(0.32, 0.36, 0.32, 0, 1.52, 0), x, y, z, p.rotationY, s);
    } else if (p.kind === 'fountain') {
      const basin = new THREE.CylinderGeometry(2.25, 2.38, 0.62, 24);
      basin.translate(0, 0.31, 0);
      addRotatedPart(stone, basin, x, y, z, 0, s);
      const pillar = new THREE.CylinderGeometry(0.34, 0.48, 1.85, 12);
      pillar.translate(0, 0.92, 0);
      addRotatedPart(stone, pillar, x, y, z, 0, s);
      const bowl = new THREE.CylinderGeometry(0.95, 0.36, 0.28, 16);
      bowl.translate(0, 1.75, 0);
      addRotatedPart(stone, bowl, x, y, z, 0, s);
      const pool = new THREE.CylinderGeometry(2.02, 2.02, 0.08, 24);
      pool.translate(0, 0.56, 0);
      addRotatedPart(fountainWater, pool, x, y, z, 0, s);
    } else if (p.kind === 'atrium_column') {
      // Classical dark-walnut & bronze cathedral pillar (never stretched cobblestone!)
      const colH = 9.45;
      const shaft = new THREE.CylinderGeometry(0.36, 0.42, colH - 0.8, 16);
      shaft.translate(0, colH * 0.5, 0);
      addRotatedPart(wood, shaft, x, y, z, p.rotationY, s);
      addRotatedPart(wood, createScaledBox(1.06, 0.42, 1.06, 0, 0.21, 0), x, y, z, p.rotationY, s);
      addRotatedPart(brass, createScaledBox(1.12, 0.14, 1.12, 0, 0.46, 0), x, y, z, p.rotationY, s);
      addRotatedPart(brass, createScaledBox(1.14, 0.18, 1.14, 0, colH - 0.26, 0), x, y, z, p.rotationY, s);
      addRotatedPart(wood, createScaledBox(1.24, 0.24, 1.24, 0, colH - 0.12, 0), x, y, z, p.rotationY, s);
    } else if (p.kind === 'ruin_column') {
      const colH = 4.2;
      const shaft = new THREE.CylinderGeometry(0.42, 0.52, colH, 12);
      shaft.translate(0, colH * 0.5, 0);
      addRotatedPart(stone, shaft, x, y, z, p.rotationY, s);
      addRotatedPart(stone, createScaledBox(1.22, 0.34, 1.22, 0, 0.17, 0), x, y, z, p.rotationY, s);
    } else if (p.kind === 'crystal_pillar') {
      addRotatedPart(stone, createScaledBox(1.1, 0.45, 1.1, 0, 0.225, 0), x, y, z, p.rotationY, s);
      const shard = new THREE.OctahedronGeometry(0.55, 0);
      shard.scale(0.65, 2.4, 0.65);
      shard.translate(0, 1.65, 0);
      addRotatedPart(crystal, shard, x, y, z, p.rotationY, s);
    } else if (p.kind === 'mascot_pedestal') {
      const ped = new THREE.CylinderGeometry(0.52, 0.62, 0.62, 12);
      ped.translate(0, 0.31, 0);
      addRotatedPart(stone, ped, x, y, z, p.rotationY, s);
    } else if (p.kind === 'boss_pedestal') {
      const pad = new THREE.CylinderGeometry(2.15, 2.35, 0.12, 24);
      pad.translate(0, 0.06, 0);
      addRotatedPart(stone, pad, x, y, z, 0, s);
    }
  }

  // Interactive stations (Weather Shrine & Portal Gate Archways; Reading Tables, Librarian Desks,
  // Benches/Chairs, and Carved Dragon Boss Doors are now rendered as real PBR GLBs in WorldFurnitureGlbs)
  for (let i = 0; i < floor.stations.length; i += 1) {
    const st = floor.stations[i];
    const [x, y, z] = st.position;
    if (st.kind === 'weather_shrine') {
      addRotatedPart(stone, createScaledBox(0.9, 0.45, 0.9, 0, 0.225, 0), x, y, z, st.facingYaw);
      addRotatedPart(stone, createScaledBox(0.44, 1.35, 0.44, 0, 1.12, 0), x, y, z, st.facingYaw);
      const orb = new THREE.OctahedronGeometry(0.32, 1);
      orb.translate(0, 2.22, 0);
      addRotatedPart(crystal, orb, x, y, z, st.facingYaw);
    } else if (st.kind === 'portal_up' || st.kind === 'portal_down') {
      const gateW = st.kind === 'portal_up' ? 3.1 : 2.5;
      const gateH = st.kind === 'portal_up' ? 4.2 : 3.4;
      addRotatedPart(stone, createScaledBox(0.52, gateH, 0.62, -gateW * 0.5, gateH * 0.5, 0), x, y, z, st.facingYaw);
      addRotatedPart(stone, createScaledBox(0.52, gateH, 0.62, gateW * 0.5, gateH * 0.5, 0), x, y, z, st.facingYaw);
      addRotatedPart(stone, createScaledBox(gateW + 0.9, 0.55, 0.78, 0, gateH + 0.2, 0), x, y, z, st.facingYaw);
      addRotatedPart(brass, createScaledBox(gateW + 0.3, 0.14, 0.84, 0, gateH - 0.06, 0), x, y, z, st.facingYaw);
      const curtain = new THREE.PlaneGeometry(gateW - 0.55, gateH - 0.35);
      curtain.translate(0, (gateH - 0.2) * 0.5, 0);
      addRotatedPart(portalGlow, curtain, x, y, z, st.facingYaw);
    }
  }

  return {
    bark: mergeSimpleGeometries(bark),
    foliageMain: mergeSimpleGeometries(foliageMain),
    foliageAlt: mergeSimpleGeometries(foliageAlt),
    stone: mergeSimpleGeometries(stone),
    wood: mergeSimpleGeometries(wood),
    brass: mergeSimpleGeometries(brass),
    lampGlow: mergeSimpleGeometries(lampGlow),
    crystal: mergeSimpleGeometries(crystal),
    portalGlow: mergeSimpleGeometries(portalGlow),
    fountainWater: fountainWater.length > 0 ? mergeSimpleGeometries(fountainWater) : null,
  };
}

function BiomeParticles({
  floor,
  color,
  paused,
  prefersReducedMotion,
}: {
  floor: FloorWorldLayout3D;
  color: string;
  paused: boolean;
  prefersReducedMotion: boolean;
}) {
  const pointsRef = useRef<THREE.Points | null>(null);
  const spriteTexture = useMemo(
    () => createSoftParticleTexture(floor.biomeMeta.particleKind),
    [floor.biomeMeta.particleKind],
  );
  useEffect(() => {
    return () => {
      spriteTexture.dispose();
    };
  }, [spriteTexture]);

  const particleData = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const spanX = floor.bounds.maxX - floor.bounds.minX;
    const spanZ = floor.bounds.maxZ - floor.bounds.minZ;
    let seed = (floor.floorNumber * 7919 + 1013) >>> 0;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      positions[i * 3] = floor.bounds.minX + rand() * spanX;
      positions[i * 3 + 1] = 0.6 + rand() * 8.5;
      positions[i * 3 + 2] = floor.bounds.minZ + rand() * spanZ;
      speeds[i] = 0.28 + rand() * 0.55;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry, speeds };
  }, [floor.bounds, floor.floorNumber]);

  useEffect(() => {
    return () => {
      particleData.geometry.dispose();
    };
  }, [particleData]);

  const risesUp =
    floor.biomeMeta.particleKind === 'fireflies' || floor.biomeMeta.particleKind === 'dust_motes';

  useFrame((state, delta) => {
    if (paused || prefersReducedMotion || !pointsRef.current) return;
    const attr = particleData.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const ix = i * 3;
      const spd = particleData.speeds[i];
      arr[ix] += Math.sin(t * 0.9 + i) * dt * 0.26;
      arr[ix + 1] += (risesUp ? 1 : -1) * spd * dt;
      if (arr[ix + 1] < 0.3) arr[ix + 1] = 8.8;
      else if (arr[ix + 1] > 9.0) arr[ix + 1] = 0.5;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={particleData.geometry} frustumCulled={false}>
      <pointsMaterial
        color={color}
        map={spriteTexture}
        alphaTest={0.02}
        size={risesUp ? 0.105 : 0.14}
        transparent
        opacity={risesUp ? 0.85 : 0.78}
        blending={risesUp ? THREE.AdditiveBlending : THREE.NormalBlending}
        depthWrite={false}
      />
    </points>
  );
}

/**
 * Renders decorative biome props, interactive station landmarks, local Meshopt/WebP `.glb`
 * hybrid assets (`prop-mossy-stairs.glb`, `dragon-mascot.glb`, `prop-torii-gate.glb`), and
 * drifting atmospheric particles synced to the active floor (`D-010`, `D-017`, `D-023`).
 */
export function BiomePropsMesh({
  floor,
  theme,
  libraryMaterials,
  worldMaterials,
  bossDoorUnlocked = false,
  paused = false,
  prefersReducedMotion = false,
  requestRender,
}: BiomePropsMeshProps) {
  const propGeoms = useMemo(() => buildPropBatch(floor), [floor]);
  const palette = useMemo(
    () => getWorldBiomePalette(floor.biomeId, theme, floor.biomeVariant),
    [floor.biomeId, theme, floor.biomeVariant],
  );

  useEffect(() => {
    return () => {
      propGeoms.bark.dispose();
      propGeoms.foliageMain.dispose();
      propGeoms.foliageAlt.dispose();
      propGeoms.stone.dispose();
      propGeoms.wood.dispose();
      propGeoms.brass.dispose();
      propGeoms.lampGlow.dispose();
      propGeoms.crystal.dispose();
      propGeoms.portalGlow.dispose();
      propGeoms.fountainWater?.dispose();
    };
  }, [propGeoms]);

  const mascotProps = useMemo(
    () => floor.props.filter((p) => p.kind === 'mascot_pedestal'),
    [floor.props],
  );
  const toriiProps = useMemo(
    () => floor.props.filter((p) => p.kind === 'torii_gate_glb'),
    [floor.props],
  );
  const mossyStairsProps = useMemo(
    () => floor.props.filter((p) => p.kind === 'mossy_stairs_glb'),
    [floor.props],
  );

  const wm = worldMaterials.materials;
  const lm = libraryMaterials.materials;

  return (
    <group name={`biome-props-floor-${floor.floorNumber}`}>
      {propGeoms.bark.attributes.position && (
        <mesh geometry={propGeoms.bark} material={wm.bark} castShadow receiveShadow />
      )}
      {propGeoms.foliageMain.attributes.position && (
        <mesh geometry={propGeoms.foliageMain} material={wm.foliageMain} castShadow receiveShadow />
      )}
      {propGeoms.foliageAlt.attributes.position && (
        <mesh geometry={propGeoms.foliageAlt} material={wm.foliageAlt} castShadow receiveShadow />
      )}
      {propGeoms.stone.attributes.position && (
        <mesh geometry={propGeoms.stone} material={wm.stone} castShadow receiveShadow />
      )}
      {propGeoms.wood.attributes.position && (
        <mesh geometry={propGeoms.wood} material={lm.woodCabinet} castShadow receiveShadow />
      )}
      {propGeoms.brass.attributes.position && (
        <mesh geometry={propGeoms.brass} material={lm.brassTrim} castShadow />
      )}
      {propGeoms.lampGlow.attributes.position && (
        <mesh geometry={propGeoms.lampGlow} material={wm.lampGlow} />
      )}
      {propGeoms.crystal.attributes.position && (
        <mesh geometry={propGeoms.crystal} material={wm.crystal} />
      )}
      {propGeoms.portalGlow.attributes.position && (
        <mesh geometry={propGeoms.portalGlow} material={wm.portalGlow} />
      )}
      {propGeoms.fountainWater && (
        <mesh geometry={propGeoms.fountainWater} material={wm.water} />
      )}

      {/* Local Hybrid GLB Assets (WebP 1024 + Meshopt, 0 CDN) */}
      {mascotProps.map((p) => (
        <DragonMascotGlb
          key={p.id}
          prop={p}
          paused={paused}
          prefersReducedMotion={prefersReducedMotion}
          requestRender={requestRender}
        />
      ))}
      {toriiProps.map((p) => (
        <ToriiGateGlb key={p.id} prop={p} requestRender={requestRender} />
      ))}
      {mossyStairsProps.map((p) => (
        <MossyStairsGlb key={p.id} prop={p} requestRender={requestRender} />
      ))}

      {/* Real PBR Furniture, Carved Dragon Boss Doors, Stone Well & Summit Platforms (`D-023`) */}
      <WorldFurnitureGlbs
        floor={floor}
        theme={theme}
        bossDoorUnlocked={bossDoorUnlocked}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
        requestRender={requestRender}
      />

      <BiomeParticles
        floor={floor}
        color={palette.particleColor}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
      />
    </group>
  );
}
