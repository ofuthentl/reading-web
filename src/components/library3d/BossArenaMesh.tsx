import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';
import type { FloorWorldLayout3D } from './worldTypes';
import { getWorldBiomePalette, type WorldMaterialBundle } from './worldMaterials';
import { isSkyBattlefieldBossRoom } from './bossRoomLayout3d';
import { WorldHorizonVista } from './WorldHorizonVista';
import { FloorBossSentinelGlb } from './WorldGlbActors';

const BASE = import.meta.env.BASE_URL ?? '/';
const BOSS_ARENA_URL = `${BASE}models/boss-arena.glb`;
const SKY_BATTLEFIELD_URL = `${BASE}models/boss-battlefield.glb`;
const SKY_BATTLEFIELD_SCALE = 4.0;

/** 4 modular Colosseum walls forming a 360° enclosed Boss Chamber around `(0, 0, 0)`. */
const ARENA_WALL_PLACEMENTS: ReadonlyArray<{
  pos: [number, number, number];
  rotY: number;
}> = [
  { pos: [-13.4, 0, 0], rotY: 0 },
  { pos: [13.4, 0, 0], rotY: Math.PI },
  { pos: [0, 0, -13.4], rotY: -Math.PI / 2 },
  { pos: [0, 0, 13.4], rotY: Math.PI / 2 },
];

const BRAZIER_LIGHTS: ReadonlyArray<readonly [number, number, number]> = [
  [-8.2, 3.4, -8.2],
  [8.2, 3.4, -8.2],
  [-8.2, 3.4, 8.2],
  [8.2, 3.4, 8.2],
];

export interface BossArenaMeshProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  skyGeometry: THREE.BufferGeometry;
  worldMaterials: WorldMaterialBundle;
  paused: boolean;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}

function BossExitPortalArch({
  position,
  rotationY,
  stoneMaterial,
  prefersReducedMotion,
}: {
  position: [number, number, number];
  rotationY: number;
  stoneMaterial: THREE.Material;
  prefersReducedMotion: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-1.45, 2.0, 0]} material={stoneMaterial} castShadow={!prefersReducedMotion}>
        <boxGeometry args={[0.48, 4.0, 0.55]} />
      </mesh>
      <mesh position={[1.45, 2.0, 0]} material={stoneMaterial} castShadow={!prefersReducedMotion}>
        <boxGeometry args={[0.48, 4.0, 0.55]} />
      </mesh>
      <mesh position={[0, 4.15, 0]} material={stoneMaterial} castShadow={!prefersReducedMotion}>
        <boxGeometry args={[3.6, 0.5, 0.7]} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <planeGeometry args={[2.35, 3.7]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={1.7}
          transparent
          opacity={0.72}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight color="#38bdf8" intensity={3.2} distance={10} decay={1.7} position={[0, 2.2, 1.0]} />
    </group>
  );
}

/**
 * Open-air Floating Sky Battlefield Boss Arena (`public/models/boss-battlefield.glb`, 2.83 MB
 * WebP 1024 + Meshopt, 0 CDN, PA-2 / `D-024`): used for Floor 4 (`starlight_ruins` — Stormterror)
 * surrounded by the 2K starry Aincrad SkyDome and 360° horizon cloud sea.
 */
function SkyBattlefieldBossArena({
  floor,
  theme,
  skyGeometry,
  worldMaterials,
  paused,
  prefersReducedMotion,
  requestRender,
}: BossArenaMeshProps) {
  const { gl } = useThree();
  const { template } = useLocalGlb(SKY_BATTLEFIELD_URL);
  const palette = useMemo(
    () => getWorldBiomePalette(floor.biomeId, theme, floor.biomeVariant),
    [floor.biomeId, theme, floor.biomeVariant],
  );

  const islandInstance = useMemo(() => {
    if (!template) return null;
    const clone = cloneGlbTemplate(template);
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    clone.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.receiveShadow = true;
      obj.castShadow = !prefersReducedMotion;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < mats.length; i += 1) {
        const mat = mats[i] as THREE.MeshStandardMaterial | undefined;
        if (!mat) continue;
        if (mat.map) mat.map.anisotropy = maxAniso;
        if (mat.normalMap) mat.normalMap.anisotropy = maxAniso;
        // Crisp alpha cutout for Battlefield foliage/leaves (zero depth-sorting flicker)
        if (mat.transparent && /plant|leaf/i.test(mat.name)) {
          mat.transparent = false;
          mat.alphaTest = 0.45;
          mat.depthWrite = true;
          mat.needsUpdate = true;
        }
        // Soft celestial glow on the central blue rune & golden edge accents
        if (/centerblue/i.test(mat.name)) {
          mat.emissive.set('#38bdf8');
          mat.emissiveIntensity = theme === 'light' ? 0.45 : 0.9;
        } else if (/ringyellow/i.test(mat.name)) {
          mat.emissive.set('#fbbf24');
          mat.emissiveIntensity = theme === 'light' ? 0.35 : 0.7;
        }
      }
    });
    return clone;
  }, [template, gl, theme, prefersReducedMotion]);

  useEffect(() => {
    if (islandInstance) requestRender?.();
  }, [islandInstance, requestRender]);

  const exitStation = floor.stations.find((s) => s.kind === 'boss_exit');
  const exitPos: [number, number, number] = exitStation
    ? [exitStation.position[0] - 0.55, exitStation.position[1], exitStation.position[2]]
    : [-13.0, 0, 0.2];

  return (
    <group name={`sky-battlefield-boss-floor-${floor.floorNumber}`}>
      <color attach="background" args={[palette.fogColor]} />
      <fog attach="fog" args={[palette.fogColor, palette.fogNear, palette.fogFar]} />

      {/* 2K equirectangular SkyDome + 360° Aincrad horizon vista surrounding the floating island */}
      <mesh geometry={skyGeometry} material={worldMaterials.materials.skyDome} frustumCulled={false} />
      <WorldHorizonVista
        biomeId={floor.biomeId}
        theme={theme}
        biomeVariant={floor.biomeVariant}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
      />

      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, Math.max(0.95, palette.hemiIntensity)]} />
      <directionalLight
        color={palette.sunColor}
        intensity={Math.max(1.35, palette.sunIntensity)}
        position={[18, 28, 16]}
        castShadow={!prefersReducedMotion}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={2}
        shadow-camera-far={90}
        shadow-bias={-0.0005}
        shadow-normalBias={0.035}
      />
      <directionalLight color={palette.fillColor} intensity={0.75} position={[-16, 12, -14]} />

      {/* Real PBR Floating Sky Battlefield (`boss-battlefield.glb`, scaled 4x so deck = 31.6m × 11.2m) */}
      {islandInstance ? (
        <primitive
          object={islandInstance}
          position={[0, 0, 0]}
          scale={[SKY_BATTLEFIELD_SCALE, SKY_BATTLEFIELD_SCALE, SKY_BATTLEFIELD_SCALE]}
        />
      ) : (
        <mesh position={[0, -0.25, 0]} material={worldMaterials.materials.stone} receiveShadow>
          <boxGeometry args={[30, 0.5, 10]} />
        </mesh>
      )}

      {/* Glowing cyan Exit Portal on the West wing of the floating island */}
      <BossExitPortalArch
        position={exitPos}
        rotationY={Math.PI / 2}
        stoneMaterial={worldMaterials.materials.stone}
        prefersReducedMotion={prefersReducedMotion}
      />

      {/* Stormterror hovering / perched dramatically at the center-north of the Sky Battlefield */}
      <FloorBossSentinelGlb
        floor={floor}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
        requestRender={requestRender}
      />
    </group>
  );
}

/**
 * Dual-arena Aincrad Boss Room renderer (`D-021` + PA-2 `D-024`):
 * - `starlight_ruins` (Floor 4 — Stormterror): Open-air Floating Sky Battlefield (`boss-battlefield.glb`).
 * - Other floors (Floors 1–3 — Golem / Drago Knight): Enclosed 360° Colosseum (`boss-arena.glb`).
 */
export function BossArenaMesh(props: BossArenaMeshProps) {
  if (isSkyBattlefieldBossRoom(props.floor.biomeId)) {
    return <SkyBattlefieldBossArena {...props} />;
  }

  return <ColosseumBossArena {...props} />;
}

function ColosseumBossArena({
  floor,
  worldMaterials,
  paused,
  prefersReducedMotion,
  requestRender,
}: BossArenaMeshProps) {
  const { gl } = useThree();
  const { template } = useLocalGlb(BOSS_ARENA_URL);

  const wallClones = useMemo(() => {
    if (!template) return [];
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return ARENA_WALL_PLACEMENTS.map((p) => {
      const clone = cloneGlbTemplate(template);
      clone.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        // Hide the off-center flat ground slab (`Object_5`) so our unified PBR arena floor has 0 Z-fighting
        if (obj.name === 'Object_5') {
          obj.visible = false;
          return;
        }
        obj.receiveShadow = true;
        obj.castShadow = !prefersReducedMotion;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (let i = 0; i < mats.length; i += 1) {
          const mat = mats[i] as THREE.MeshStandardMaterial | undefined;
          if (mat?.map) mat.map.anisotropy = maxAniso;
          if (mat?.normalMap) mat.normalMap.anisotropy = maxAniso;
        }
      });
      return { clone, pos: p.pos, rotY: p.rotY };
    });
  }, [template, gl, prefersReducedMotion]);

  useEffect(() => {
    if (wallClones.length > 0) requestRender?.();
  }, [wallClones, requestRender]);

  const runeColor = floor.biomeId === 'sakura_shrine' ? '#fb7185' : '#f59e0b';

  return (
    <group name={`boss-arena-chamber-floor-${floor.floorNumber}`}>
      {/* Dramatic enclosed Boss Room atmosphere */}
      <color attach="background" args={['#0d101d']} />
      <fog attach="fog" args={['#0d101d', 18, 52]} />

      <hemisphereLight args={['#8aa4d6', '#2a1f1b', 0.85]} />
      <directionalLight
        color="#ffe6c2"
        intensity={1.55}
        position={[12, 24, 14]}
        castShadow={!prefersReducedMotion}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={2}
        shadow-camera-far={65}
        shadow-bias={-0.0005}
        shadow-normalBias={0.035}
      />

      {/* 4 corner torch braziers lighting the Colosseum stonework */}
      {BRAZIER_LIGHTS.map(([lx, ly, lz], idx) => (
        <pointLight
          key={idx}
          position={[lx, ly, lz]}
          color="#ffb35c"
          intensity={5.5}
          distance={18}
          decay={1.65}
        />
      ))}

      {/* Unified PBR stone Colosseum arena floor */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={worldMaterials.materials.stone}
        receiveShadow
      >
        <planeGeometry args={[36, 36]} />
      </mesh>

      {/* Glowing arcane Boss Arena floor rune circle beneath Boss */}
      <mesh position={[0, 0.025, -2.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 4.05, 48]} />
        <meshStandardMaterial
          color={runeColor}
          emissive={runeColor}
          emissiveIntensity={2.2}
          roughness={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.022, -2.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.4, 5.65, 48]} />
        <meshStandardMaterial
          color={runeColor}
          emissive={runeColor}
          emissiveIntensity={1.4}
          roughness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 4 modular Colosseum arena wall segments (`boss-arena.glb`) */}
      {wallClones.map((w, idx) => (
        <primitive
          key={idx}
          object={w.clone}
          position={w.pos}
          rotation={[0, w.rotY, 0]}
        />
      ))}

      {/* Glowing cyan Exit Doorway back to the library floor (`Z = +9.2`) */}
      <BossExitPortalArch
        position={[0, 0, 9.2]}
        rotationY={Math.PI}
        stoneMaterial={worldMaterials.materials.stone}
        prefersReducedMotion={prefersReducedMotion}
      />

      {/* The Floor's Boss Guardian waiting inside the Boss Chamber */}
      <FloorBossSentinelGlb
        floor={floor}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
        requestRender={requestRender}
      />
    </group>
  );
}
