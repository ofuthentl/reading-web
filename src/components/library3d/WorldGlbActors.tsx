import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';
import type { BiomePropPlacement3D, FloorWorldLayout3D } from './worldTypes';

const BASE = import.meta.env.BASE_URL ?? '/';
const ACTOR_MODEL_URLS = {
  mountainStairs: `${BASE}models/mountain-stairs.glb`,
  dragonMascot: `${BASE}models/dragon-mascot.glb`,
  vineProp: `${BASE}models/prop-vines.glb`,
  mossyStairs: `${BASE}models/prop-mossy-stairs.glb`,
  stoneGolem: `${BASE}models/stone-golem.glb`,
  bossMonster: `${BASE}models/boss-monster.glb`,
  bossStormterror: `${BASE}models/boss-stormterror.glb`,
} as const;

function polishGlbMesh(instance: THREE.Object3D, maxAniso: number, castShadow = true): void {
  instance.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = castShadow;
    obj.receiveShadow = true;
    if (obj instanceof THREE.SkinnedMesh) {
      obj.frustumCulled = false;
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (let i = 0; i < mats.length; i += 1) {
      const mat = mats[i] as THREE.MeshStandardMaterial | undefined;
      if (!mat) continue;
      if (mat.map) mat.map.anisotropy = maxAniso;
      if (mat.normalMap) mat.normalMap.anisotropy = maxAniso;
    }
  });
}

export function MountainStairsGlb({
  prop,
  fallbackMaterial,
  requestRender,
}: {
  prop: BiomePropPlacement3D;
  fallbackMaterial: THREE.Material;
  requestRender?: () => void;
}) {
  const { gl } = useThree();
  const { template } = useLocalGlb(ACTOR_MODEL_URLS.mountainStairs);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);
  const scale: [number, number, number] = prop.scaleVec ?? [prop.scale, prop.scale, prop.scale];

  useEffect(() => {
    if (!instance) return;
    polishGlbMesh(instance, Math.min(8, gl.capabilities.getMaxAnisotropy()), true);
    requestRender?.();
  }, [instance, gl, requestRender]);

  if (!instance || !template) {
    return (
      <mesh
        position={[0, 1.15, prop.position[2]]}
        rotation={[-0.42, 0, 0]}
        material={fallbackMaterial}
      >
        <boxGeometry args={[3.5, 0.35, 5.8]} />
      </mesh>
    );
  }
  const groundedY = prop.position[1] - template.bbox.min[1] * scale[1];
  return (
    <primitive
      object={instance}
      position={[prop.position[0], groundedY, prop.position[2]]}
      rotation={[0, prop.rotationY, 0]}
      scale={scale}
    />
  );
}

export function DragonMascotGlb({
  prop,
  paused,
  prefersReducedMotion,
  requestRender,
}: {
  prop: BiomePropPlacement3D;
  paused: boolean;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}) {
  const { gl } = useThree();
  const { template } = useLocalGlb(ACTOR_MODEL_URLS.dragonMascot);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);
  const groupRef = useRef<THREE.Group | null>(null);
  const phaseRef = useRef(0);
  const mascotScale = 0.95;
  const baseGroundedY = template
    ? prop.position[1] + 0.62 - template.bbox.min[1] * mascotScale
    : prop.position[1] + 0.62;

  useEffect(() => {
    if (!instance) return;
    polishGlbMesh(instance, Math.min(8, gl.capabilities.getMaxAnisotropy()), true);
    requestRender?.();
  }, [instance, gl, requestRender]);

  useFrame((_, delta) => {
    if (paused || prefersReducedMotion || !groupRef.current) return;
    phaseRef.current += Math.min(delta, 0.05) * 2.1;
    groupRef.current.position.y = baseGroundedY + Math.sin(phaseRef.current) * 0.035;
  });

  if (!instance || !template) return null;
  return (
    <group
      ref={groupRef}
      position={[prop.position[0], baseGroundedY, prop.position[2]]}
      rotation={[0, prop.rotationY, 0]}
      scale={[mascotScale, mascotScale, mascotScale]}
    >
      <primitive object={instance} />
    </group>
  );
}

export function StaticSceneryPropGlb({
  kind,
  prop,
  requestRender,
}: {
  kind: 'vine' | 'mossy_stairs';
  prop: BiomePropPlacement3D;
  requestRender?: () => void;
}) {
  const { gl } = useThree();
  const url = kind === 'vine' ? ACTOR_MODEL_URLS.vineProp : ACTOR_MODEL_URLS.mossyStairs;
  const { template } = useLocalGlb(url);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);
  const scale: [number, number, number] = prop.scaleVec ?? [prop.scale, prop.scale, prop.scale];

  useEffect(() => {
    if (!instance) return;
    polishGlbMesh(instance, Math.min(8, gl.capabilities.getMaxAnisotropy()), true);
    requestRender?.();
  }, [instance, gl, requestRender]);

  if (!instance || !template) return null;
  const groundedY = prop.position[1] - template.bbox.min[1] * scale[1];
  return (
    <primitive
      object={instance}
      position={[prop.position[0], groundedY, prop.position[2]]}
      rotation={[0, prop.rotationY, 0]}
      scale={scale}
    />
  );
}

interface BossConfig {
  url: string;
  targetHeight: number;
  position: [number, number, number];
  rotationY: number;
  preferredClip?: string;
  auraColor: string;
  auraIntensity: number;
}

function getFloorBossConfig(floor: FloorWorldLayout3D): BossConfig | null {
  const [bx, by, bz] = floor.bossAnchor;
  if (floor.biomeId === 'sakura_shrine') {
    return {
      url: ACTOR_MODEL_URLS.bossMonster,
      targetHeight: 3.15,
      position: [bx + 3.5, by, bz],
      rotationY: -0.38,
      preferredClip: 'motion',
      auraColor: '#fb7185',
      auraIntensity: 3.2,
    };
  }
  if (floor.biomeId === 'starfield_atrium') {
    return {
      url: ACTOR_MODEL_URLS.stoneGolem,
      targetHeight: 3.05,
      position: [bx + 3.5, by, bz],
      rotationY: -0.35,
      preferredClip: 'idle',
      auraColor: '#60a5fa',
      auraIntensity: 3.0,
    };
  }
  if (floor.biomeId === 'starlight_ruins') {
    // Stormterror stands majestically grounded inside the Floor 4 Boss Room (never circling sky)
    return {
      url: ACTOR_MODEL_URLS.bossStormterror,
      targetHeight: 3.7,
      position: [bx, by, bz - 1.2],
      rotationY: floor.bossYaw,
      auraColor: '#38bdf8',
      auraIntensity: 5.0,
    };
  }
  return null;
}

/**
 * Renders each upper floor's unique 3D Boss Guardian standing inside its Boss Room:
 * - Floor 2 (Sakura Shrine): Animated Dragon Knight (`boss-monster.glb`, `MOTION` clip)
 * - Floor 3 (Starfield Atrium): Animated Stone Golem (`stone-golem.glb`, `Idle` clip)
 * - Floor 4 (Starlight Ruins): Stormterror / Dvalin (`boss-stormterror.glb`, grounded inside Boss Room)
 */
export function FloorBossSentinelGlb({
  floor,
  paused,
  prefersReducedMotion,
  requestRender,
}: {
  floor: FloorWorldLayout3D;
  paused: boolean;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}) {
  const cfg = useMemo(() => getFloorBossConfig(floor), [floor]);
  const { gl } = useThree();
  const { template } = useLocalGlb(cfg?.url ?? null);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);
  const groupRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const breathRef = useRef(0);

  const computedScale = useMemo(() => {
    if (!template || !cfg) return 1;
    const rawH = Math.max(0.01, template.bbox.size[1]);
    return cfg.targetHeight / rawH;
  }, [template, cfg]);

  useEffect(() => {
    if (!instance || !template || !cfg) return undefined;
    polishGlbMesh(instance, Math.min(8, gl.capabilities.getMaxAnisotropy()), true);

    if (template.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(instance);
      const preferred = cfg.preferredClip?.toLowerCase();
      const clip =
        (preferred
          ? template.animations.find((c) => c.name.toLowerCase().includes(preferred))
          : undefined) ?? template.animations[0];
      if (clip) {
        mixer.clipAction(clip).play();
      }
      mixerRef.current = mixer;
      requestRender?.();
      return () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(instance);
        mixerRef.current = null;
      };
    }
    requestRender?.();
    return undefined;
  }, [instance, template, cfg, gl, requestRender]);

  useFrame((_, delta) => {
    if (paused || prefersReducedMotion) return;
    const dt = Math.min(delta, 0.05);
    if (mixerRef.current) {
      mixerRef.current.update(dt);
    } else if (groupRef.current) {
      // Subtle grounded breathing heave for static Boss statues (Stormterror)
      breathRef.current += dt * 1.4;
      const heave = 1 + Math.sin(breathRef.current) * 0.014;
      groupRef.current.scale.set(computedScale, computedScale * heave, computedScale);
    }
  });

  if (!cfg || !instance || !template) return null;
  const groundedY = cfg.position[1] - template.bbox.min[1] * computedScale;
  return (
    <group name={`boss-sentinel-${floor.biomeId}`}>
      <group
        ref={groupRef}
        position={[cfg.position[0], groundedY, cfg.position[2]]}
        rotation={[0, cfg.rotationY, 0]}
        scale={[computedScale, computedScale, computedScale]}
      >
        <primitive object={instance} />
      </group>
      <pointLight
        color={cfg.auraColor}
        intensity={cfg.auraIntensity}
        distance={14}
        decay={1.8}
        position={[cfg.position[0], cfg.position[1] + 2.2, cfg.position[2] + 1.8]}
      />
    </group>
  );
}
