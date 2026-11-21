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
const PLAYER_GREET_RADIUS = 3.6;

const NPC_MODEL_META: Record<NpcModelKey, { url: string; targetHeight: number }> = {
  maid: { url: `${BASE}models/npc-maid.glb`, targetHeight: 1.62 },
  zhongli: { url: `${BASE}models/npc-zhongli.glb`, targetHeight: 1.82 },
  schoolgirl: { url: `${BASE}models/npc-schoolgirl.glb`, targetHeight: 1.6 },
  mint: { url: `${BASE}models/npc-mint.glb`, targetHeight: 1.64 },
};

const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const WORLD_Z = new THREE.Vector3(0, 0, 1);

interface RiggedBoneSlot {
  bone: THREE.Object3D;
  restLocalQ: THREE.Quaternion;
  restParentWorldQ: THREE.Quaternion;
}

interface RiggedNpcPoseRig {
  leftArm?: RiggedBoneSlot;
  rightArm?: RiggedBoneSlot;
  leftElbow?: RiggedBoneSlot;
  rightElbow?: RiggedBoneSlot;
  chest?: RiggedBoneSlot;
  head?: RiggedBoneSlot;
  armDropDeg: number;
  elbowBendDeg: number;
}

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

function applyWorldAxisDeltas(
  slot: RiggedBoneSlot,
  ops: ReadonlyArray<readonly [THREE.Vector3, number]>,
  tmpQ: THREE.Quaternion,
  tmpTarget: THREE.Quaternion,
  tmpInvParent: THREE.Quaternion,
): void {
  tmpTarget.copy(slot.restParentWorldQ).multiply(slot.restLocalQ);
  for (let i = 0; i < ops.length; i += 1) {
    const [axis, deg] = ops[i];
    if (Math.abs(deg) < 1e-4) continue;
    tmpQ.setFromAxisAngle(axis, (deg * Math.PI) / 180);
    tmpTarget.premultiply(tmpQ);
  }
  tmpInvParent.copy(slot.restParentWorldQ).invert();
  slot.bone.quaternion.copy(tmpInvParent).multiply(tmpTarget).normalize();
}

function captureBoneSlot(root: THREE.Object3D, namePattern: RegExp): RiggedBoneSlot | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (!found && obj instanceof THREE.Bone && namePattern.test(obj.name)) {
      found = obj;
    }
  });
  if (!found) return undefined;
  const parentWorldQ = new THREE.Quaternion();
  if (found.parent) {
    found.parent.getWorldQuaternion(parentWorldQ);
  }
  return {
    bone: found,
    restLocalQ: found.quaternion.clone(),
    restParentWorldQ: parentWorldQ,
  };
}

function buildRiggedIdleRig(
  instance: THREE.Object3D,
  modelKey: NpcModelKey,
): RiggedNpcPoseRig | null {
  if (modelKey !== 'zhongli' && modelKey !== 'schoolgirl') return null;
  instance.updateMatrixWorld(true);
  if (modelKey === 'zhongli') {
    return {
      leftArm: captureBoneSlot(instance, /^Left_arm_/i),
      rightArm: captureBoneSlot(instance, /^Right_arm_/i),
      leftElbow: captureBoneSlot(instance, /^Left_elbow_/i),
      rightElbow: captureBoneSlot(instance, /^Right_elbow_/i),
      chest: captureBoneSlot(instance, /^Chest_/i),
      head: captureBoneSlot(instance, /^Head_/i),
      armDropDeg: 38,
      elbowBendDeg: 9,
    };
  }
  return {
    leftArm: captureBoneSlot(instance, /Bip001_L_UpperArm/i),
    rightArm: captureBoneSlot(instance, /Bip001_R_UpperArm/i),
    leftElbow: captureBoneSlot(instance, /Bip001_L_Forearm/i),
    rightElbow: captureBoneSlot(instance, /Bip001_R_Forearm/i),
    chest: captureBoneSlot(instance, /Bip001_Spine2/i),
    head: captureBoneSlot(instance, /Bip001_Head_/i),
    armDropDeg: 6,
    elbowBendDeg: 7,
  };
}

/**
 * Strips flat Sketchfab showcase floor tiles (`size.y < 0.015 && span > 1.2`, e.g. `Object_4`
 * inside `npc-maid.glb`), enables crisp shadows + 8x anisotropy, and measures exact character height.
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
  const modelKey: NpcModelKey = spec.modelKey ?? 'schoolgirl';
  const meta = NPC_MODEL_META[modelKey];
  const { template } = useLocalGlb(meta.url);

  const prepared = useMemo(() => {
    if (!template) return null;
    const instance = cloneGlbTemplate(template);
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const bounds = prepareNpcGlbInstance(instance, maxAniso);
    const poseRig = buildRiggedIdleRig(instance, modelKey);
    const scale = meta.targetHeight / bounds.height;
    const groundedY = -bounds.minY * scale;
    return { instance, scale, groundedY, poseRig };
  }, [template, gl, meta.targetHeight, modelKey]);

  const groupRef = useRef<THREE.Group | null>(null);
  const modelHolderRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const yawRef = useRef(spec.facingYaw);
  const cycleRef = useRef(Math.random() * Math.PI * 2);
  const scratchQuats = useMemo(
    () => ({ q: new THREE.Quaternion(), t: new THREE.Quaternion(), inv: new THREE.Quaternion() }),
    [],
  );

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

  // Apply initial relaxed skeletal pose immediately & wire embedded AnimationMixer clip (`npc-mint.glb`)
  useEffect(() => {
    if (!prepared || !template) return undefined;
    if (prepared.poseRig) {
      const r = prepared.poseRig;
      if (r.leftArm) {
        applyWorldAxisDeltas(r.leftArm, [[WORLD_Z, -r.armDropDeg]], scratchQuats.q, scratchQuats.t, scratchQuats.inv);
      }
      if (r.rightArm) {
        applyWorldAxisDeltas(r.rightArm, [[WORLD_Z, r.armDropDeg]], scratchQuats.q, scratchQuats.t, scratchQuats.inv);
      }
      if (r.leftElbow) {
        applyWorldAxisDeltas(r.leftElbow, [[WORLD_X, -r.elbowBendDeg]], scratchQuats.q, scratchQuats.t, scratchQuats.inv);
      }
      if (r.rightElbow) {
        applyWorldAxisDeltas(r.rightElbow, [[WORLD_X, -r.elbowBendDeg]], scratchQuats.q, scratchQuats.t, scratchQuats.inv);
      }
    }
    invalidate();
    if (template.animations.length === 0) return undefined;
    const mixer = new THREE.AnimationMixer(prepared.instance);
    const clip = template.animations[0];
    if (clip) mixer.clipAction(clip).play();
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(prepared.instance);
      mixerRef.current = null;
    };
  }, [prepared, template, invalidate, scratchQuats]);

  useEffect(() => {
    yawRef.current = spec.facingYaw;
    npcPositionsRef.current.set(spec.id, [...spec.spawn]);
  }, [spec, npcPositionsRef]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || paused) return;

    const dt = Math.min(delta, 0.05);
    cycleRef.current += dt;
    const [sx, sy, sz] = spec.spawn;
    const playerPos = playerMotionRef.current.position;
    const distToPlayer = Math.hypot(playerPos[0] - sx, playerPos[2] - sz);

    // Smooth turn to greet Kirito when nearby (ZERO stiff waypoint sliding!)
    if (!prefersReducedMotion) {
      const targetYaw =
        distToPlayer < PLAYER_GREET_RADIUS
          ? Math.atan2(playerPos[0] - sx, playerPos[2] - sz)
          : spec.facingYaw;
      yawRef.current = lerpAngle(yawRef.current, targetYaw, Math.min(1, dt * 4.5));
    }

    group.position.set(sx, sy, sz);
    group.rotation.y = yawRef.current;
    npcPositionsRef.current.set(spec.id, [sx, sy, sz]);

    if (prefersReducedMotion || !prepared) return;

    if (mixerRef.current) {
      mixerRef.current.update(dt);
    } else if (prepared.poseRig) {
      // Live skeletal breathing + subtle arm/head poise for rigged Zhongli & SchoolGirl
      const breath = Math.sin(cycleRef.current * 1.65);
      const gaze = Math.sin(cycleRef.current * 0.72);
      const r = prepared.poseRig;
      if (r.chest) {
        applyWorldAxisDeltas(r.chest, [[WORLD_X, -breath * 1.4]], scratchQuats.q, scratchQuats.t, scratchQuats.inv);
      }
      if (r.head) {
        applyWorldAxisDeltas(
          r.head,
          [
            [WORLD_X, breath * 1.2],
            [WORLD_Y, gaze * 4.5],
          ],
          scratchQuats.q,
          scratchQuats.t,
          scratchQuats.inv,
        );
      }
      if (r.leftArm) {
        applyWorldAxisDeltas(
          r.leftArm,
          [[WORLD_Z, -r.armDropDeg + breath * 1.1]],
          scratchQuats.q,
          scratchQuats.t,
          scratchQuats.inv,
        );
      }
      if (r.rightArm) {
        applyWorldAxisDeltas(
          r.rightArm,
          [[WORLD_Z, r.armDropDeg - breath * 1.1]],
          scratchQuats.q,
          scratchQuats.t,
          scratchQuats.inv,
        );
      }
    } else if (modelHolderRef.current) {
      // Ultra-subtle natural standing breath for posed static models (Maid)
      const breathe = 1 + Math.sin(cycleRef.current * 1.75) * 0.006;
      modelHolderRef.current.scale.set(prepared.scale, prepared.scale * breathe, prepared.scale);
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
 * Populates the active floor with naturally posed / skeletally animated anime `.glb` NPCs
 * (`mint` live 24s clip, `zhongli` & `schoolgirl` relaxed rigged Idle, `maid` naturally sculpted
 * standing pose — zero T-pose/A-pose and zero stiff sliding, `D-021`).
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

  if (floor.npcs.length === 0) return null;

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
