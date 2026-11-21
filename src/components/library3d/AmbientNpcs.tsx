import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { FloorWorldLayout3D, NpcModelKey, WorldNpcSpec3D } from './worldTypes';
import type { PlayerMotionState } from './KiritoAvatar';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';
import { createContactShadowTexture } from './worldMaterials';

export interface AmbientNpcsProps {
  floor: FloorWorldLayout3D;
  playerMotionRef: MutableRefObject<PlayerMotionState>;
  npcPositionsRef: MutableRefObject<Map<string, [number, number, number]>>;
  paused: boolean;
  prefersReducedMotion: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  onSelectNpc: (npc: WorldNpcSpec3D) => void;
}

const BASE = import.meta.env.BASE_URL ?? '/';
const NPC_WALK_SPEED = 1.28;
const PLAYER_GREET_RADIUS = 3.2;

const NPC_MODEL_META: Record<
  NpcModelKey,
  { url: string; targetHeight: number; floatHeight?: number }
> = {
  yui: { url: `${BASE}models/npc-yui.glb`, targetHeight: 1.12, floatHeight: 0.24 },
  asuna: { url: `${BASE}models/npc-asuna.glb`, targetHeight: 1.66 },
  maid: { url: `${BASE}models/npc-maid.glb`, targetHeight: 1.62 },
  zhongli: { url: `${BASE}models/npc-zhongli.glb`, targetHeight: 1.82 },
  schoolgirl: { url: `${BASE}models/npc-schoolgirl.glb`, targetHeight: 1.6 },
  mint: { url: `${BASE}models/npc-mint.glb`, targetHeight: 1.64 },
};

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

/**
 * Strips flat Sketchfab showcase floor shadow tiles (`size.y < 0.015 && span > 1.2`,
 * e.g. `Object_4` inside `npc-maid.glb`), enables crisp shadows + 8x anisotropy,
 * and computes the true character-only bounding box for exact grounding & scaling.
 */
function prepareNpcGlbInstance(
  instance: THREE.Object3D,
  maxAniso: number,
): { minY: number; height: number } {
  instance.updateMatrixWorld(true);
  const meshBox = new THREE.Box3();
  const meshSize = new THREE.Vector3();
  const charBox = new THREE.Box3();

  instance.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    meshBox.setFromObject(obj);
    meshBox.getSize(meshSize);
    if (meshSize.y < 0.015 && Math.max(meshSize.x, meshSize.z) > 1.2) {
      obj.visible = false;
      return;
    }
    charBox.union(meshBox);
    obj.castShadow = true;
    obj.receiveShadow = true;
    if (obj instanceof THREE.SkinnedMesh) {
      obj.frustumCulled = false;
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (let i = 0; i < mats.length; i += 1) {
      const mat = mats[i] as THREE.MeshStandardMaterial | undefined;
      if (mat?.map) mat.map.anisotropy = maxAniso;
    }
  });

  if (charBox.isEmpty()) {
    charBox.setFromObject(instance);
  }
  return {
    minY: Number.isFinite(charBox.min.y) ? charBox.min.y : 0,
    height: Math.max(0.05, charBox.max.y - charBox.min.y),
  };
}

function SingleAmbientNpc({
  spec,
  playerMotionRef,
  npcPositionsRef,
  shadowTexture,
  paused,
  prefersReducedMotion,
  isDraggingRef,
  onSelectNpc,
}: {
  spec: WorldNpcSpec3D;
  playerMotionRef: MutableRefObject<PlayerMotionState>;
  npcPositionsRef: MutableRefObject<Map<string, [number, number, number]>>;
  shadowTexture: THREE.Texture;
  paused: boolean;
  prefersReducedMotion: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  onSelectNpc: (npc: WorldNpcSpec3D) => void;
}) {
  const { gl, invalidate } = useThree();
  const modelKey: NpcModelKey = spec.modelKey ?? 'asuna';
  const meta = NPC_MODEL_META[modelKey];
  const { template } = useLocalGlb(meta.url);

  const prepared = useMemo(() => {
    if (!template) return null;
    const instance = cloneGlbTemplate(template);
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const bounds = prepareNpcGlbInstance(instance, maxAniso);
    const scale = meta.targetHeight / bounds.height;
    const groundedY = -bounds.minY * scale + (meta.floatHeight ?? 0);
    return { instance, scale, groundedY };
  }, [template, gl, meta.targetHeight, meta.floatHeight]);

  const groupRef = useRef<THREE.Group | null>(null);
  const modelHolderRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  const posRef = useRef<[number, number, number]>([...spec.spawn]);
  const yawRef = useRef(spec.facingYaw);
  const waypointIndexRef = useRef(0);
  const pauseTimerRef = useRef(1.2);
  const cycleRef = useRef(Math.random() * Math.PI * 2);

  const shadowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
      }),
    [shadowTexture],
  );
  const fallbackMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: spec.accentColor, roughness: 0.72 }),
    [spec.accentColor],
  );

  useEffect(() => {
    return () => {
      shadowMat.dispose();
      fallbackMat.dispose();
    };
  }, [shadowMat, fallbackMat]);

  // Attach embedded AnimationMixer clip when present (e.g. `npc-mint.glb` 24s animation)
  useEffect(() => {
    if (!prepared || !template) return undefined;
    invalidate();
    if (template.animations.length === 0) return undefined;
    const mixer = new THREE.AnimationMixer(prepared.instance);
    const clip = template.animations[0];
    if (clip) {
      mixer.clipAction(clip).play();
    }
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(prepared.instance);
      mixerRef.current = null;
    };
  }, [prepared, template, invalidate]);

  useEffect(() => {
    posRef.current = [...spec.spawn];
    yawRef.current = spec.facingYaw;
    waypointIndexRef.current = 0;
    npcPositionsRef.current.set(spec.id, [...spec.spawn]);
  }, [spec, npcPositionsRef]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (paused) return;

    const dt = Math.min(delta, 0.05);
    cycleRef.current += dt;
    const pos = posRef.current;
    const playerPos = playerMotionRef.current.position;
    const distToPlayer = Math.hypot(playerPos[0] - pos[0], playerPos[2] - pos[2]);

    let isMoving = false;
    if (!prefersReducedMotion) {
      if (distToPlayer < PLAYER_GREET_RADIUS) {
        const facePlayerYaw = Math.atan2(playerPos[0] - pos[0], playerPos[2] - pos[2]);
        yawRef.current = lerpAngle(yawRef.current, facePlayerYaw, Math.min(1, dt * 6));
      } else if (spec.role === 'stroller' && spec.waypoints.length >= 2) {
        const targetWp = spec.waypoints[waypointIndexRef.current];
        const dx = targetWp.x - pos[0];
        const dz = targetWp.z - pos[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 0.14) {
          const step = Math.min(dist, NPC_WALK_SPEED * dt);
          pos[0] += (dx / dist) * step;
          pos[1] = targetWp.y;
          pos[2] += (dz / dist) * step;
          yawRef.current = lerpAngle(yawRef.current, Math.atan2(dx, dz), Math.min(1, dt * 7));
          isMoving = true;
        } else {
          pauseTimerRef.current -= dt;
          if (pauseTimerRef.current <= 0) {
            waypointIndexRef.current = (waypointIndexRef.current + 1) % spec.waypoints.length;
            pauseTimerRef.current = spec.waypoints[waypointIndexRef.current].pauseSec ?? 2.2;
          }
        }
      } else {
        yawRef.current = lerpAngle(yawRef.current, spec.facingYaw, Math.min(1, dt * 3));
      }
    }

    group.position.set(pos[0], pos[1], pos[2]);
    group.rotation.y = yawRef.current;
    npcPositionsRef.current.set(spec.id, [pos[0], pos[1], pos[2]]);

    if (!prefersReducedMotion) {
      if (mixerRef.current) {
        mixerRef.current.update(dt);
      }
      if (modelHolderRef.current && prepared) {
        if (meta.floatHeight) {
          // Pixie Yui gentle hover float
          modelHolderRef.current.position.y =
            prepared.groundedY + Math.sin(cycleRef.current * 2.2) * 0.08;
        } else if (isMoving) {
          // Crisp light stride bounce while strolling
          modelHolderRef.current.position.y =
            prepared.groundedY + Math.abs(Math.sin(cycleRef.current * 7.2)) * 0.045;
          modelHolderRef.current.rotation.z = Math.sin(cycleRef.current * 7.2) * 0.025;
        } else {
          modelHolderRef.current.position.y = prepared.groundedY;
          modelHolderRef.current.rotation.z = 0;
          if (!mixerRef.current) {
            const breathe = 1 + Math.sin(cycleRef.current * 1.9) * 0.008;
            modelHolderRef.current.scale.set(
              prepared.scale,
              prepared.scale * breathe,
              prepared.scale,
            );
          }
        }
      }
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (paused || isDraggingRef.current) return;
    event.stopPropagation();
    onSelectNpc(spec);
  };

  return (
    <group
      ref={groupRef}
      name={`npc-${spec.id}`}
      position={spec.spawn}
      rotation={[0, spec.facingYaw, 0]}
      onClick={handleClick}
    >
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} material={shadowMat}>
        <planeGeometry args={[0.88, 0.88]} />
      </mesh>

      {prepared ? (
        <group
          ref={modelHolderRef}
          position={[0, prepared.groundedY, 0]}
          scale={[prepared.scale, prepared.scale, prepared.scale]}
        >
          <primitive object={prepared.instance} />
        </group>
      ) : (
        <mesh position={[0, 0.85, 0]} material={fallbackMat}>
          <capsuleGeometry args={[0.16, 1.1, 4, 8]} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Populates the active floor with real anime `.glb` NPCs (`yui`, `asuna`, `maid`,
 * `zhongli`, `schoolgirl`, animated `mint`) synchronized in style with Kirito (`D-019`).
 */
export function AmbientNpcs({
  floor,
  playerMotionRef,
  npcPositionsRef,
  paused,
  prefersReducedMotion,
  isDraggingRef,
  onSelectNpc,
}: AmbientNpcsProps) {
  const shadowTexture = useMemo(() => createContactShadowTexture(), []);
  useEffect(() => {
    return () => {
      shadowTexture.dispose();
    };
  }, [shadowTexture]);

  useEffect(() => {
    const map = npcPositionsRef.current;
    map.clear();
    for (let i = 0; i < floor.npcs.length; i += 1) {
      const n = floor.npcs[i];
      map.set(n.id, [...n.spawn]);
    }
  }, [floor, npcPositionsRef]);

  return (
    <group name={`ambient-npcs-floor-${floor.floorNumber}`}>
      {floor.npcs.map((spec) => (
        <SingleAmbientNpc
          key={spec.id}
          spec={spec}
          playerMotionRef={playerMotionRef}
          npcPositionsRef={npcPositionsRef}
          shadowTexture={shadowTexture}
          paused={paused}
          prefersReducedMotion={prefersReducedMotion}
          isDraggingRef={isDraggingRef}
          onSelectNpc={onSelectNpc}
        />
      ))}
    </group>
  );
}
