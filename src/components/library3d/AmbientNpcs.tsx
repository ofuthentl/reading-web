import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FloorWorldLayout3D, WorldNpcSpec3D } from './worldTypes';
import type { PlayerMotionState } from './KiritoAvatar';
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

const NPC_WALK_SPEED = 1.45;

/**
 * Equirectangular stylized anime NPC head texture mapped onto `SphereGeometry(r, 20, 14, -Math.PI/2)`
 * so eyes & smile sit cleanly on the curved front `+Z` face with zero z-fighting or buried planes.
 */
function createNpcHeadTexture(eyeColor: string, hairColor: string): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas =
    typeof document !== 'undefined'
      ? Object.assign(document.createElement('canvas'), { width: w, height: h })
      : ({ width: w, height: h } as unknown as HTMLCanvasElement);
  const ctx = typeof document !== 'undefined' ? canvas.getContext('2d') : null;

  if (ctx) {
    ctx.fillStyle = '#f8ddc7';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hairColor;
    ctx.fillRect(0, 0, w, 34);
    ctx.fillRect(0, 0, 74, h);
    ctx.fillRect(w - 74, 0, 74, h);

    for (const ex of [111, 145]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, 65, 8.5, 7.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(ex, 66, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 2, 63, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#241e22';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ex - 9, 63);
      ctx.quadraticCurveTo(ex, 56, ex + 9, 63);
      ctx.stroke();
    }
    ctx.strokeStyle = '#9e6f5c';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(122, 85);
    ctx.quadraticCurveTo(128, 90, 134, 85);
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
  shadowTexture,
  paused,
  prefersReducedMotion,
  isDraggingRef,
  onSelectNpc,
}: {
  spec: WorldNpcSpec3D;
  playerMotionRef: MutableRefObject<PlayerMotionState>;
  npcPositionsRef: MutableRefObject<Map<string, [number, number, number]>>;
  shadowTexture: THREE.CanvasTexture;
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

  const hairColor =
    spec.role === 'librarian' ? '#4a3235' : spec.role === 'reader_sitting' ? '#6b452d' : '#323a52';

  const headTexture = useMemo(
    () => createNpcHeadTexture(spec.accentColor, hairColor),
    [spec.accentColor, hairColor],
  );
  useEffect(() => {
    return () => {
      headTexture.dispose();
    };
  }, [headTexture]);

  const mats = useMemo(
    () => ({
      cloak: new THREE.MeshStandardMaterial({ color: spec.accentColor, roughness: 0.68, metalness: 0.06 }),
      tunic: new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.8, metalness: 0.02 }),
      hair: new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.6 }),
      head: new THREE.MeshStandardMaterial({ map: headTexture, roughness: 0.64 }),
      book: new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.7 }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
    }),
    [spec.accentColor, hairColor, headTexture, shadowTexture],
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
    const bob = prefersReducedMotion ? 0 : walking ? Math.abs(Math.sin(nav.phase)) * 0.032 : Math.sin(nav.phase) * 0.01;

    grp.position.set(nav.x, nav.y + sitDrop + bob, nav.z);
    grp.rotation.y = nav.yaw;
    npcPositionsRef.current.set(spec.id, [nav.x, nav.y, nav.z]);

    const swing = walking && !prefersReducedMotion ? Math.sin(nav.phase) * 0.45 : 0;
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
      {spec.role !== 'reader_sitting' && (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.shadow}>
          <planeGeometry args={[0.84, 0.84]} />
        </mesh>
      )}

      {/* Tapered tunic & cozy adventurer cloak */}
      <mesh position={[0, 1.0, 0]} scale={[1.05, 1, 0.72]} material={mats.tunic}>
        <cylinderGeometry args={[0.135, 0.12, 0.44, 12]} />
      </mesh>
      <mesh position={[0, 0.85, -0.02]} material={mats.cloak}>
        <cylinderGeometry args={[0.155, 0.255, 0.7, 12]} />
      </mesh>

      {/* Curved equirectangular anime head + downward hair bangs */}
      <group position={[0, 1.42, 0]}>
        <mesh scale={[0.96, 1.02, 0.94]} material={mats.head}>
          <sphereGeometry args={[0.145, 20, 14, -Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 0.032, -0.02]} material={mats.hair}>
          <sphereGeometry args={[0.148, 14, 12]} />
        </mesh>
        <mesh position={[-0.048, 0.098, 0.11]} rotation={[Math.PI - 0.3, 0, -0.2]} material={mats.hair}>
          <coneGeometry args={[0.036, 0.1, 6]} />
        </mesh>
        <mesh position={[0.048, 0.098, 0.11]} rotation={[Math.PI - 0.3, 0, 0.2]} material={mats.hair}>
          <coneGeometry args={[0.036, 0.1, 6]} />
        </mesh>
      </group>

      {/* Rounded capsule arms */}
      <mesh ref={leftArmRef} position={[0.19, 1.0, 0]} material={mats.cloak}>
        <capsuleGeometry args={[0.042, 0.3, 5, 8]} />
      </mesh>
      <mesh ref={rightArmRef} position={[-0.19, 1.0, 0]} material={mats.cloak}>
        <capsuleGeometry args={[0.042, 0.3, 5, 8]} />
      </mesh>

      {spec.role === 'reader_sitting' && (
        <mesh position={[0, 1.02, 0.28]} rotation={[0.35, 0, 0]} material={mats.book}>
          <boxGeometry args={[0.24, 0.04, 0.18]} />
        </mesh>
      )}

      {/* Rounded legs */}
      <mesh ref={leftLegRef} position={[0.08, 0.36, 0]} material={mats.hair}>
        <capsuleGeometry args={[0.05, 0.54, 5, 8]} />
      </mesh>
      <mesh ref={rightLegRef} position={[-0.08, 0.36, 0]} material={mats.hair}>
        <capsuleGeometry args={[0.05, 0.54, 5, 8]} />
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
