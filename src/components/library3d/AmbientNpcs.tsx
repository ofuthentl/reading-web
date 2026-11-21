import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FloorWorldLayout3D, WorldNpcSpec3D } from './worldTypes';
import type { PlayerMotionState } from './KiritoAvatar';

export interface AmbientNpcsProps {
  floor: FloorWorldLayout3D;
  playerMotionRef: MutableRefObject<PlayerMotionState>;
  npcPositionsRef: MutableRefObject<Map<string, [number, number, number]>>;
  paused: boolean;
  prefersReducedMotion: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  onSelectNpc: (npc: WorldNpcSpec3D) => void;
}

const NPC_WALK_SPEED = 1.45;

function createNpcFaceTexture(eyeColor: string): THREE.CanvasTexture {
  const size = 128;
  const canvas =
    typeof document !== 'undefined'
      ? Object.assign(document.createElement('canvas'), { width: size, height: size })
      : ({ width: size, height: size } as unknown as HTMLCanvasElement);
  const ctx = typeof document !== 'undefined' ? canvas.getContext('2d') : null;

  if (ctx) {
    ctx.fillStyle = '#f8dcc6';
    ctx.fillRect(0, 0, size, size);
    for (const ex of [42, 86]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, 66, 10, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(ex, 67, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 2.2, 64, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#9e6f5c';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(54, 92);
    ctx.quadraticCurveTo(64, 98, 74, 92);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

function SingleAmbientNpc({
  spec,
  playerMotionRef,
  npcPositionsRef,
  paused,
  prefersReducedMotion,
  isDraggingRef,
  onSelectNpc,
}: {
  spec: WorldNpcSpec3D;
  playerMotionRef: MutableRefObject<PlayerMotionState>;
  npcPositionsRef: MutableRefObject<Map<string, [number, number, number]>>;
  paused: boolean;
  prefersReducedMotion: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  onSelectNpc: (npc: WorldNpcSpec3D) => void;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const leftArmRef = useRef<THREE.Mesh | null>(null);
  const rightArmRef = useRef<THREE.Mesh | null>(null);
  const leftLegRef = useRef<THREE.Mesh | null>(null);
  const rightLegRef = useRef<THREE.Mesh | null>(null);

  const navRef = useRef({
    x: spec.spawn[0],
    y: spec.spawn[1],
    z: spec.spawn[2],
    yaw: spec.facingYaw,
    wpIndex: spec.waypoints.length > 1 ? 1 : 0,
    pauseLeft: 0.8,
    phase: (spec.name.length * 1.37) % 6.28,
  });

  const faceTexture = useMemo(() => createNpcFaceTexture(spec.accentColor), [spec.accentColor]);
  useEffect(() => {
    return () => {
      faceTexture.dispose();
    };
  }, [faceTexture]);

  const mats = useMemo(
    () => ({
      cloak: new THREE.MeshStandardMaterial({ color: spec.accentColor, roughness: 0.72, metalness: 0.06 }),
      tunic: new THREE.MeshStandardMaterial({ color: '#e8e2d5', roughness: 0.82, metalness: 0.02 }),
      hair: new THREE.MeshStandardMaterial({
        color: spec.role === 'librarian' ? '#3d2c2e' : spec.role === 'reader_sitting' ? '#5c3c28' : '#2f364a',
        roughness: 0.65,
      }),
      skin: new THREE.MeshStandardMaterial({ color: '#f8dcc6', roughness: 0.76 }),
      face: new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.65 }),
      book: new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.7 }),
    }),
    [spec.accentColor, spec.role, faceTexture],
  );

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  useFrame((_, delta) => {
    const grp = groupRef.current;
    if (!grp || paused) return;

    const nav = navRef.current;
    const dt = Math.min(delta, 0.05);
    const pPos = playerMotionRef.current.position;
    const distToPlayer = Math.hypot(pPos[0] - nav.x, pPos[2] - nav.z);
    let walking = false;

    if (spec.role === 'stroller' && spec.waypoints.length > 1 && !prefersReducedMotion) {
      if (distToPlayer < 2.6) {
        // Politely pause and turn toward Kirito when nearby
        const lookYaw = Math.atan2(pPos[0] - nav.x, pPos[2] - nav.z);
        nav.yaw = lerpAngle(nav.yaw, lookYaw, Math.min(1, dt * 6));
      } else if (nav.pauseLeft > 0) {
        nav.pauseLeft -= dt;
      } else {
        const target = spec.waypoints[nav.wpIndex];
        const dx = target.x - nav.x;
        const dz = target.z - nav.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.18) {
          nav.pauseLeft = target.pauseSec ?? 2.2;
          nav.wpIndex = (nav.wpIndex + 1) % spec.waypoints.length;
        } else {
          const step = Math.min(dist, NPC_WALK_SPEED * dt);
          nav.x += (dx / dist) * step;
          nav.z += (dz / dist) * step;
          nav.y = target.y;
          nav.yaw = lerpAngle(nav.yaw, Math.atan2(dx, dz), Math.min(1, dt * 7));
          walking = true;
        }
      }
    } else if (distToPlayer < 3.4 && spec.role === 'librarian') {
      const lookYaw = Math.atan2(pPos[0] - nav.x, pPos[2] - nav.z);
      nav.yaw = lerpAngle(nav.yaw, lookYaw, Math.min(1, dt * 5));
    }

    nav.phase += dt * (walking ? 7.5 : 2.1);
    const sitDrop = spec.role === 'reader_sitting' ? -0.3 : 0;
    const bob = prefersReducedMotion ? 0 : walking ? Math.abs(Math.sin(nav.phase)) * 0.035 : Math.sin(nav.phase) * 0.012;

    grp.position.set(nav.x, nav.y + sitDrop + bob, nav.z);
    grp.rotation.y = nav.yaw;
    npcPositionsRef.current.set(spec.id, [nav.x, nav.y, nav.z]);

    const swing = walking && !prefersReducedMotion ? Math.sin(nav.phase) * 0.48 : 0;
    if (leftLegRef.current && rightLegRef.current) {
      if (spec.role === 'reader_sitting') {
        leftLegRef.current.rotation.x = -1.25;
        rightLegRef.current.rotation.x = -1.25;
      } else {
        leftLegRef.current.rotation.x = swing;
        rightLegRef.current.rotation.x = -swing;
      }
    }
    if (leftArmRef.current && rightArmRef.current) {
      if (spec.role === 'reader_sitting') {
        leftArmRef.current.rotation.x = -0.75;
        rightArmRef.current.rotation.x = -0.75;
      } else {
        leftArmRef.current.rotation.x = -swing * 0.8;
        rightArmRef.current.rotation.x = swing * 0.8;
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={spec.spawn}
      rotation={[0, spec.facingYaw, 0]}
      onClick={(e) => {
        if (paused || isDraggingRef.current) return;
        e.stopPropagation();
        onSelectNpc(spec);
      }}
      onPointerOver={() => {
        if (!paused && typeof document !== 'undefined') document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (typeof document !== 'undefined') document.body.style.cursor = '';
      }}
    >
      {/* Cloak & tunic body */}
      <mesh position={[0, 1.0, 0]} material={mats.tunic}>
        <boxGeometry args={[0.3, 0.48, 0.18]} />
      </mesh>
      <mesh position={[0, 0.86, -0.02]} material={mats.cloak}>
        <cylinderGeometry args={[0.17, 0.27, 0.72, 10]} />
      </mesh>

      {/* Head, Canvas2D anime eyes & hair */}
      <group position={[0, 1.41, 0]}>
        <mesh material={mats.skin}>
          <sphereGeometry args={[0.145, 14, 12]} />
        </mesh>
        <mesh position={[0, -0.01, 0.125]} material={mats.face}>
          <circleGeometry args={[0.115, 16]} />
        </mesh>
        <mesh position={[0, 0.04, -0.02]} material={mats.hair}>
          <sphereGeometry args={[0.158, 12, 10]} />
        </mesh>
      </group>

      {/* Arms */}
      <mesh ref={leftArmRef} position={[0.21, 1.02, 0]} material={mats.cloak}>
        <boxGeometry args={[0.09, 0.42, 0.1]} />
      </mesh>
      <mesh ref={rightArmRef} position={[-0.21, 1.02, 0]} material={mats.cloak}>
        <boxGeometry args={[0.09, 0.42, 0.1]} />
      </mesh>

      {/* Sitting reader holds an open book */}
      {spec.role === 'reader_sitting' && (
        <mesh position={[0, 1.02, 0.28]} rotation={[0.35, 0, 0]} material={mats.book}>
          <boxGeometry args={[0.24, 0.04, 0.18]} />
        </mesh>
      )}

      {/* Legs */}
      <mesh ref={leftLegRef} position={[0.085, 0.36, 0]} material={mats.hair}>
        <boxGeometry args={[0.11, 0.68, 0.12]} />
      </mesh>
      <mesh ref={rightLegRef} position={[-0.085, 0.36, 0]} material={mats.hair}>
        <boxGeometry args={[0.11, 0.68, 0.12]} />
      </mesh>
    </group>
  );
}

/**
 * Populates the active floor with living stylized Librarians, sitting Readers,
 * and patrolling Strollers along verified collision-free waypoints (`D-017`).
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
          paused={paused}
          prefersReducedMotion={prefersReducedMotion}
          isDraggingRef={isDraggingRef}
          onSelectNpc={onSelectNpc}
        />
      ))}
    </group>
  );
}
