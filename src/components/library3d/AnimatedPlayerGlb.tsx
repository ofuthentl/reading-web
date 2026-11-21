import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';
import type { PlayerMotionState } from './KiritoAvatar';

export interface AnimatedPlayerGlbProps {
  url: string;
  motionRef: MutableRefObject<PlayerMotionState>;
  paused: boolean;
  prefersReducedMotion: boolean;
  onLoadedChange?: (loaded: boolean) => void;
}

type ClipKey = 'Idle' | 'Walk' | 'Run' | 'Sprint';

const FADE_DURATION_SEC = 0.18;

function pickDesiredClip(state: PlayerMotionState): { key: ClipKey; timeScale: number } {
  if (state.speed <= 0.12) {
    return { key: 'Idle', timeScale: 1.0 };
  }
  if (!state.isRunning) {
    const scale = Math.max(0.85, Math.min(1.38, state.speed / 3.35));
    return { key: 'Walk', timeScale: scale };
  }
  if (state.speed >= 5.6) {
    return { key: 'Sprint', timeScale: Math.max(0.95, Math.min(1.25, state.speed / 6.3)) };
  }
  return { key: 'Run', timeScale: 1.08 };
}

/**
 * Renders the rigged Mixamo Kirito `.glb` (`public/models/player.glb`, 0 CDN)
 * with smooth `AnimationMixer` crossfade across `Idle`, `Walk`, `Run`, and `Sprint`.
 */
export function AnimatedPlayerGlb({
  url,
  motionRef,
  paused,
  prefersReducedMotion,
  onLoadedChange,
}: AnimatedPlayerGlbProps) {
  const { gl, invalidate } = useThree();
  const { template } = useLocalGlb(url);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<ClipKey, THREE.AnimationAction>>>({});
  const activeKeyRef = useRef<ClipKey>('Idle');

  useEffect(() => {
    onLoadedChange?.(Boolean(instance));
    return () => {
      onLoadedChange?.(false);
    };
  }, [instance, onLoadedChange]);

  // Configure crisp texture filtering, shadows, and skinned mesh bounds
  useEffect(() => {
    if (!instance) return;
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    instance.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      // Prevent animated skinned meshes from frustum-popping near the camera
      obj.frustumCulled = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < mats.length; i += 1) {
        const mat = mats[i] as THREE.MeshStandardMaterial | undefined;
        if (mat?.map) {
          mat.map.anisotropy = maxAniso;
          mat.map.needsUpdate = true;
        }
      }
    });
  }, [instance, gl]);

  // Build AnimationMixer & bind Idle / Walk / Run / Sprint clips
  useEffect(() => {
    if (!instance || !template) return undefined;
    const mixer = new THREE.AnimationMixer(instance);
    const actions: Partial<Record<ClipKey, THREE.AnimationAction>> = {};
    const findClip = (name: ClipKey) =>
      template.animations.find((clip) => clip.name.toLowerCase() === name.toLowerCase());

    const fallback = template.animations[0];
    const idleClip = findClip('Idle') ?? fallback;
    const walkClip = findClip('Walk') ?? idleClip;
    const runClip = findClip('Run') ?? walkClip;
    const sprintClip = findClip('Sprint') ?? runClip;

    if (idleClip) actions.Idle = mixer.clipAction(idleClip);
    if (walkClip) actions.Walk = mixer.clipAction(walkClip);
    if (runClip) actions.Run = mixer.clipAction(runClip);
    if (sprintClip) actions.Sprint = mixer.clipAction(sprintClip);

    if (actions.Idle) {
      actions.Idle.reset().play();
      activeKeyRef.current = 'Idle';
    }

    mixerRef.current = mixer;
    actionsRef.current = actions;
    invalidate();

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(instance);
      mixerRef.current = null;
      actionsRef.current = {};
    };
  }, [instance, template, invalidate]);

  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer || paused || prefersReducedMotion) return;

    const state = motionRef.current;
    if (state.firstPerson) return;

    const { key, timeScale } = pickDesiredClip(state);
    const actions = actionsRef.current;
    const nextAction = actions[key] ?? actions.Idle;

    if (nextAction && activeKeyRef.current !== key) {
      const prevAction = actions[activeKeyRef.current];
      nextAction.reset();
      nextAction.enabled = true;
      nextAction.setEffectiveWeight(1);
      nextAction.setEffectiveTimeScale(timeScale);
      nextAction.play();
      if (prevAction && prevAction !== nextAction) {
        prevAction.crossFadeTo(nextAction, FADE_DURATION_SEC, true);
      }
      activeKeyRef.current = key;
    } else if (nextAction) {
      nextAction.setEffectiveTimeScale(timeScale);
    }

    mixer.update(Math.min(delta, 0.05));
  });

  if (!instance || !template) return null;
  const groundedY = -template.bbox.min[1];
  return <primitive object={instance} position={[0, groundedY, 0]} />;
}
