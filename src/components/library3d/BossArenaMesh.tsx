import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';
import type { FloorWorldLayout3D } from './worldTypes';
import type { WorldMaterialBundle } from './worldMaterials';
import { FloorBossSentinelGlb } from './WorldGlbActors';

const BOSS_ARENA_URL = `${import.meta.env.BASE_URL ?? '/'}models/boss-arena.glb`;

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
  worldMaterials: WorldMaterialBundle;
  paused: boolean;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}

/**
 * Dedicated 360° enclosed Aincrad Boss Arena chamber (`public/models/boss-arena.glb`,
 * instanced cleanly on 4 sides with 0 extra VRAM, `D-021`): dramatic Colosseum stone walls,
 * PBR floor with glowing Boss Rune circle, 4 torch braziers, glowing cyan Exit Doorway,
 * and the floor's Boss Guardian waiting in the center.
 */
export function BossArenaMesh({
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

  const runeColor =
    floor.biomeId === 'starlight_ruins'
      ? '#38bdf8'
      : floor.biomeId === 'sakura_shrine'
        ? '#fb7185'
        : '#f59e0b';

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

      {/* Glowing cyan Exit Doorway back to the library floor (`Z = +8.8`) */}
      <group position={[0, 0, 9.2]}>
        <mesh position={[-1.45, 2.0, 0]} material={worldMaterials.materials.stone} castShadow>
          <boxGeometry args={[0.48, 4.0, 0.55]} />
        </mesh>
        <mesh position={[1.45, 2.0, 0]} material={worldMaterials.materials.stone} castShadow>
          <boxGeometry args={[0.48, 4.0, 0.55]} />
        </mesh>
        <mesh position={[0, 4.15, 0]} material={worldMaterials.materials.stone} castShadow>
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
        <pointLight color="#38bdf8" intensity={3.2} distance={10} decay={1.7} position={[0, 2.2, -1.0]} />
      </group>

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
