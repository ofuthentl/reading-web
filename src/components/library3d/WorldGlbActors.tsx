import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';
import { StormterrorBossGlb } from './StormterrorBossGlb';
import type { BiomePropPlacement3D, FloorWorldLayout3D, PlayerMotionState } from './worldTypes';

const BASE = import.meta.env.BASE_URL ?? '/';
const ACTOR_MODEL_URLS = {
  dragonMascot: `${BASE}models/dragon-mascot.glb`,
  toriiGate: `${BASE}models/prop-torii-gate.glb`,
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

export function ToriiGateGlb({
  prop,
  requestRender,
}: {
  prop: BiomePropPlacement3D;
  requestRender?: () => void;
}) {
  const { gl } = useThree();
  const { template } = useLocalGlb(ACTOR_MODEL_URLS.toriiGate);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);

  useEffect(() => {
    if (!instance) return;
    polishGlbMesh(instance, Math.min(8, gl.capabilities.getMaxAnisotropy()), true);
    requestRender?.();
  }, [instance, gl, requestRender]);

  if (!instance || !template) return null;
  const rawH = Math.max(0.1, template.bbox.size[1]);
  const s = (6.2 * prop.scale) / rawH;
  const groundedY = prop.position[1] - template.bbox.min[1] * s;
  return (
    <primitive
      object={instance}
      position={[prop.position[0], groundedY, prop.position[2]]}
      rotation={[0, prop.rotationY, 0]}
      scale={[s, s, s]}
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

export function MossyStairsGlb({
  prop,
  requestRender,
}: {
  prop: BiomePropPlacement3D;
  requestRender?: () => void;
}) {
  const { gl } = useThree();
  const { template } = useLocalGlb(ACTOR_MODEL_URLS.mossyStairs);
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
  preferredClip?: string;
  auraColor: string;
  auraIntensity: number;
}

function getBossRoomSentinelConfig(floor: FloorWorldLayout3D): BossConfig {
  if (floor.biomeId === 'sakura_shrine') {
    return {
      url: ACTOR_MODEL_URLS.bossMonster,
      targetHeight: 3.45,
      preferredClip: 'motion',
      auraColor: '#fb7185',
      auraIntensity: 5.5,
    };
  }
  if (floor.biomeId === 'starlight_ruins') {
    return {
      url: ACTOR_MODEL_URLS.bossStormterror,
      targetHeight: 4.1,
      auraColor: '#38bdf8',
      auraIntensity: 7.0,
    };
  }
  // Floor 1 (Town of Beginnings) & Floor 3 (Starfield Atrium): Stone Golem guardian
  return {
    url: ACTOR_MODEL_URLS.stoneGolem,
    targetHeight: 3.35,
    preferredClip: 'idle',
    auraColor: floor.biomeId === 'starfield_atrium' ? '#60a5fa' : '#f59e0b',
    auraIntensity: 5.2,
  };
}

/**
 * Renders the Boss Guardian strictly INSIDE the dedicated Boss Arena (`BossArenaMesh.tsx`).
 * Delegates Floor 4 (`starlight_ruins`) to `StormterrorBossGlb` for live GPU wingbeats, tail whip,
 * aerial figure-8 hover, and gaze tracking toward Kirito. Never rendered outdoors (`D-021`).
 */
export function FloorBossSentinelGlb({
  floor,
  playerMotionRef,
  paused,
  prefersReducedMotion,
  requestRender,
}: {
  floor: FloorWorldLayout3D;
  playerMotionRef?: MutableRefObject<PlayerMotionState>;
  paused: boolean;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}) {
  if (floor.biomeId === 'starlight_ruins') {
    return (
      <StormterrorBossGlb
        floor={floor}
        playerMotionRef={playerMotionRef}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
        requestRender={requestRender}
      />
    );
  }

  return (
    <StandardBossSentinelGlb
      floor={floor}
      paused={paused}
      prefersReducedMotion={prefersReducedMotion}
      requestRender={requestRender}
    />
  );
}

function StandardBossSentinelGlb({
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
  const cfg = useMemo(() => getBossRoomSentinelConfig(floor), [floor]);
  const { gl } = useThree();
  const { template } = useLocalGlb(cfg.url);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);
  const groupRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const breathRef = useRef(0);

  const computedScale = useMemo(() => {
    if (!template) return 1;
    const rawH = Math.max(0.01, template.bbox.size[1]);
    return cfg.targetHeight / rawH;
  }, [template, cfg.targetHeight]);

  useEffect(() => {
    if (!instance || !template) return undefined;
    polishGlbMesh(instance, Math.min(8, gl.capabilities.getMaxAnisotropy()), true);

    if (template.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(instance);
      const preferred = cfg.preferredClip?.toLowerCase();
      const clip =
        (preferred
          ? template.animations.find((c) => c.name.toLowerCase().includes(preferred))
          : undefined) ?? template.animations[0];
      if (clip) mixer.clipAction(clip).play();
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
  }, [instance, template, cfg.preferredClip, gl, requestRender]);

  useFrame((_, delta) => {
    if (paused || prefersReducedMotion) return;
    const dt = Math.min(delta, 0.05);
    if (mixerRef.current) {
      mixerRef.current.update(dt);
    } else if (groupRef.current) {
      breathRef.current += dt * 1.4;
      const heave = 1 + Math.sin(breathRef.current) * 0.015;
      groupRef.current.scale.set(computedScale, computedScale * heave, computedScale);
    }
  });

  if (!instance || !template) return null;
  const [bx, by, bz] = floor.bossAnchor;
  const groundedY = by - template.bbox.min[1] * computedScale;
  return (
    <group name={`boss-room-guardian-${floor.biomeId}`}>
      <group
        ref={groupRef}
        position={[bx, groundedY, bz]}
        rotation={[0, floor.bossYaw, 0]}
        scale={[computedScale, computedScale, computedScale]}
      >
        <primitive object={instance} />
      </group>
      <pointLight
        color={cfg.auraColor}
        intensity={cfg.auraIntensity}
        distance={16}
        decay={1.65}
        position={[bx, by + 2.6, bz + 2.4]}
      />
    </group>
  );
}
