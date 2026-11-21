import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';

const TOWN_WORLD_MODEL_URL = `${import.meta.env.BASE_URL ?? '/'}models/town-world.glb`;

/**
 * Exact CAD-measured translation placing the lush tree-lined Parisian cobblestone
 * boulevard (`rawX ≈ 7.8`, `rawZ ∈ [16..66]`, `rawY = 0`) cleanly along `worldX = 0, worldZ ∈ [-24..26]`.
 */
const TOWN_WORLD_OFFSET: readonly [number, number, number] = [-7.8, 0, -40.0];

const FOLIAGE_MAT_RE = /(feuille|leaves|grass|weeds|fgrass)/i;
const NO_CAST_SHADOW_MESH_RE = /^(ground|trottoir|leaves|terre|zeppelin|3td_africa)/i;
const LAMP_GLASS_MAT_RE = /lampadaire-verre/i;

const LAMP_BOULEVARD_LIGHTS: ReadonlyArray<readonly [number, number, number]> = [
  [-4.6, 3.2, -17.8],
  [4.8, 3.2, -9.2],
  [-4.6, 3.2, 8.0],
  [4.8, 3.2, 16.6],
];

export interface TownWorldGlbProps {
  theme: AppTheme;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}

/**
 * Renders the real European cobblestone town scenery (`public/models/town-world.glb`,
 * adapted from "After the rain" by Aurélien Martel, CC-BY-NC-4.0, optimized locally
 * via Meshopt + 1024px WebP, 0 CDN) as Floor 1 (`town_of_beginnings`).
 */
export function TownWorldGlb({ theme, prefersReducedMotion, requestRender }: TownWorldGlbProps) {
  const { gl } = useThree();
  const { template } = useLocalGlb(TOWN_WORLD_MODEL_URL);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);
  const lampMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // Upgrade texture sharpness, alpha-mask foliage (eliminates BLEND z-sorting), and shadows
  useEffect(() => {
    if (!instance) return;
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const lampMats: THREE.MeshStandardMaterial[] = [];
    const seenMats = new Set<THREE.Material>();

    instance.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const meshName = obj.name || '';
      obj.receiveShadow = !/^zeppelin/i.test(meshName);
      obj.castShadow = !prefersReducedMotion && !NO_CAST_SHADOW_MESH_RE.test(meshName);

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < mats.length; i += 1) {
        const mat = mats[i] as THREE.MeshStandardMaterial | undefined;
        if (!mat || seenMats.has(mat)) continue;
        seenMats.add(mat);

        const texSlots = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap] as const;
        for (let t = 0; t < texSlots.length; t += 1) {
          const tex = texSlots[t];
          if (tex) {
            tex.anisotropy = maxAniso;
          }
        }

        if (FOLIAGE_MAT_RE.test(mat.name)) {
          mat.transparent = false;
          mat.alphaTest = 0.42;
          mat.depthWrite = true;
          mat.side = THREE.DoubleSide;
          mat.needsUpdate = true;
        } else if (LAMP_GLASS_MAT_RE.test(mat.name)) {
          lampMats.push(mat);
        }
      }
    });

    lampMaterialsRef.current = lampMats;
    requestRender?.();
  }, [instance, gl, prefersReducedMotion, requestRender]);

  // Illuminate all 22 Parisian street lamp glass lanterns during Dusk & Night
  useEffect(() => {
    const lampMats = lampMaterialsRef.current;
    if (lampMats.length === 0) return;
    const emissiveHex = theme === 'midnight' ? '#ffcf80' : theme === 'dim' ? '#ffb862' : '#fff3d1';
    const intensity = theme === 'midnight' ? 3.4 : theme === 'dim' ? 2.1 : 0.15;
    for (let i = 0; i < lampMats.length; i += 1) {
      lampMats[i].emissive.set(emissiveHex);
      lampMats[i].emissiveIntensity = intensity;
    }
    requestRender?.();
  }, [theme, instance, requestRender]);

  if (!instance) {
    // Lightweight placeholder cobblestone slab while town-world.glb streams in on first visit
    return (
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 60]} />
        <meshStandardMaterial
          color={theme === 'midnight' ? '#2c3340' : theme === 'dim' ? '#5c534c' : '#8c8378'}
          roughness={0.85}
        />
      </mesh>
    );
  }

  const showWarmLampLights = theme !== 'light';
  return (
    <group name="town-world-glb-scenery">
      <primitive
        object={instance}
        position={[TOWN_WORLD_OFFSET[0], TOWN_WORLD_OFFSET[1], TOWN_WORLD_OFFSET[2]]}
      />
      {showWarmLampLights &&
        LAMP_BOULEVARD_LIGHTS.map(([lx, ly, lz], idx) => (
          <pointLight
            key={idx}
            position={[lx, ly, lz]}
            color={theme === 'midnight' ? '#ffcc7a' : '#ffb866'}
            intensity={theme === 'midnight' ? 5.5 : 3.4}
            distance={14}
            decay={1.8}
          />
        ))}
    </group>
  );
}
