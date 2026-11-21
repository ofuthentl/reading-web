import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  PLAYER_PHYSICS_CONSTANTS,
  findNearestInteractableStation,
  resolveCameraOrbitPosition,
  resolveSurfaceY,
  resolveWorldPlayerStep,
} from './worldPhysics3d';
import { getVisibleFloorBookcases } from './floorWorldLayout3d';
import type { FloorWorldLayout3D, WorldNpcSpec3D, WorldStation3D } from './worldTypes';
import type { PlayerMotionState } from './KiritoAvatar';

export interface TeleportCommand {
  position: [number, number, number];
  yaw: number;
  nonce: number;
}

export type ActiveWorldPrompt =
  | { kind: 'station'; station: WorldStation3D }
  | { kind: 'npc'; npc: WorldNpcSpec3D };

export interface PlayerRigProps {
  floor: FloorWorldLayout3D;
  motionRef: MutableRefObject<PlayerMotionState>;
  npcPositionsRef: MutableRefObject<Map<string, [number, number, number]>>;
  firstPerson: boolean;
  teleportCommand: TeleportCommand | null;
  paused: boolean;
  prefersReducedMotion: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  requestRender: () => void;
  onToggleFirstPerson: () => void;
  onInteractStation: (station: WorldStation3D) => void;
  onInteractNpc: (npc: WorldNpcSpec3D) => void;
  onActivePromptChange: (prompt: ActiveWorldPrompt | null) => void;
  onFootstepTick?: (dt: number, speed: number, isRunning: boolean) => void;
  onPlayerAreaChange: (
    playerX: number,
    playerZ: number,
    visibleShelfKeys: ReadonlySet<string>,
    nearestShelfKey: string | null,
  ) => void;
}

const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.0;
const DRAG_THRESHOLD_PX = 5;
const ORBIT_MIN_DIST = 2.4;
const ORBIT_MAX_DIST = 9.5;
const ORBIT_DEFAULT_DIST = 4.8;
const PITCH_MIN = -0.18;
const PITCH_MAX = 0.85;
const NPC_INTERACT_RADIUS = 3.1;

function isTypingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

function findNearestNpc(
  pos: readonly [number, number, number],
  npcs: readonly WorldNpcSpec3D[],
  livePositions: ReadonlyMap<string, [number, number, number]>,
): WorldNpcSpec3D | null {
  let nearest: WorldNpcSpec3D | null = null;
  let nearestDist = NPC_INTERACT_RADIUS;
  for (let i = 0; i < npcs.length; i += 1) {
    const npc = npcs[i];
    const live = livePositions.get(npc.id) ?? npc.spawn;
    const d = Math.hypot(live[0] - pos[0], live[2] - pos[2]);
    if (d <= nearestDist) {
      nearestDist = d;
      nearest = npc;
    }
  }
  return nearest;
}

/**
 * Full 3D character locomotion & camera orbit rig (`WASD`/Arrows + `Shift` sprint,
 * drag-to-orbit 360° with 5px click guard, wheel zoom, `V` third/first-person toggle,
 * `E` station/NPC interact) driven by `worldPhysics3d.ts`.
 */
export function PlayerRig({
  floor,
  motionRef,
  npcPositionsRef,
  firstPerson,
  teleportCommand,
  paused,
  prefersReducedMotion,
  isDraggingRef,
  requestRender,
  onToggleFirstPerson,
  onInteractStation,
  onInteractNpc,
  onActivePromptChange,
  onFootstepTick,
  onPlayerAreaChange,
}: PlayerRigProps) {
  const { camera, gl } = useThree();
  const keysRef = useRef<Set<string>>(new Set());
  const orbitRef = useRef({
    yaw: floor.spawnYaw,
    pitch: 0.28,
    distance: ORBIT_DEFAULT_DIST,
  });

  const lastAreaReportRef = useRef({ x: NaN, z: NaN, floorIndex: -1, shelfSig: '' });
  const lastPromptKeyRef = useRef<string>('');
  const activePromptRef = useRef<ActiveWorldPrompt | null>(null);
  const lastTeleportNonceRef = useRef<number>(-1);

  const callbacksRef = useRef({
    onToggleFirstPerson,
    onInteractStation,
    onInteractNpc,
    onActivePromptChange,
    onFootstepTick,
    onPlayerAreaChange,
    requestRender,
  });
  callbacksRef.current = {
    onToggleFirstPerson,
    onInteractStation,
    onInteractNpc,
    onActivePromptChange,
    onFootstepTick,
    onPlayerAreaChange,
    requestRender,
  };

  // Sync firstPerson flag into live motionRef immediately
  useEffect(() => {
    motionRef.current.firstPerson = firstPerson;
    callbacksRef.current.requestRender();
  }, [firstPerson, motionRef]);

  // Reset Kirito to floor spawn whenever active floor changes
  useEffect(() => {
    const y = resolveSurfaceY(floor.spawnPoint[0], floor.spawnPoint[2], floor).y;
    motionRef.current.position = [floor.spawnPoint[0], y, floor.spawnPoint[2]];
    motionRef.current.yaw = floor.spawnYaw;
    motionRef.current.cameraYaw = floor.spawnYaw;
    motionRef.current.speed = 0;
    orbitRef.current.yaw = floor.spawnYaw;
    orbitRef.current.pitch = 0.28;
    lastAreaReportRef.current.floorIndex = -1;
    callbacksRef.current.requestRender();
  }, [floor, motionRef]);

  // Execute explicit jump/teleport commands (Search / Shelf Chip jump)
  useEffect(() => {
    if (!teleportCommand || teleportCommand.nonce === lastTeleportNonceRef.current) return;
    lastTeleportNonceRef.current = teleportCommand.nonce;
    const [tx, , tz] = teleportCommand.position;
    const y = resolveSurfaceY(tx, tz, floor).y;
    motionRef.current.position = [tx, y, tz];
    motionRef.current.yaw = teleportCommand.yaw;
    motionRef.current.cameraYaw = teleportCommand.yaw;
    motionRef.current.speed = 0;
    orbitRef.current.yaw = teleportCommand.yaw;
    lastAreaReportRef.current.x = NaN;
    callbacksRef.current.requestRender();
  }, [teleportCommand, floor, motionRef]);

  // Clear pressed keys whenever paused so Kirito never keeps running after opening a book/modal
  useEffect(() => {
    if (paused) keysRef.current.clear();
  }, [paused]);

  // Keyboard listeners: WASD / Arrows / Shift / V (view) / E (interact)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (paused || isTypingElement(event.target)) return;
      const code = event.code;
      if (code === 'KeyV' && !event.repeat) {
        event.preventDefault();
        callbacksRef.current.onToggleFirstPerson();
        return;
      }
      if (code === 'KeyE' && !event.repeat) {
        const prompt = activePromptRef.current;
        if (prompt) {
          event.preventDefault();
          motionRef.current.interactPulse = 1;
          if (prompt.kind === 'station') callbacksRef.current.onInteractStation(prompt.station);
          else callbacksRef.current.onInteractNpc(prompt.npc);
        }
        return;
      }
      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'ShiftLeft' ||
        code === 'ShiftRight'
      ) {
        keysRef.current.add(code);
        callbacksRef.current.requestRender();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };

    const handleBlur = () => {
      keysRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [paused, motionRef]);

  // Pointer drag-to-orbit (5px click guard) + wheel zoom on Canvas DOM element
  useEffect(() => {
    const dom = gl.domElement;
    let pointerDown = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let didDrag = false;

    const onPointerDown = (e: PointerEvent) => {
      if (paused || (e.button !== 0 && e.button !== 2)) return;
      pointerDown = true;
      didDrag = false;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDown || paused) return;
      if (!didDrag && Math.hypot(e.clientX - startX, e.clientY - startY) >= DRAG_THRESHOLD_PX) {
        didDrag = true;
        isDraggingRef.current = true;
      }
      if (!didDrag) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      orbitRef.current.yaw -= dx * 0.0055;
      orbitRef.current.pitch = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, orbitRef.current.pitch + dy * 0.0045),
      );
      callbacksRef.current.requestRender();
    };

    const endDrag = () => {
      if (!pointerDown) return;
      pointerDown = false;
      if (didDrag) {
        // Hold isDraggingRef briefly through the same frame's click event to suppress accidental clicks
        window.setTimeout(() => {
          isDraggingRef.current = false;
        }, 40);
      }
      didDrag = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (paused) return;
      orbitRef.current.distance = Math.max(
        ORBIT_MIN_DIST,
        Math.min(ORBIT_MAX_DIST, orbitRef.current.distance + e.deltaY * 0.0035),
      );
      callbacksRef.current.requestRender();
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    dom.addEventListener('wheel', onWheel, { passive: true });
    dom.addEventListener('contextmenu', onContextMenu);
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
    };
  }, [gl, paused, isDraggingRef]);

  useFrame((_, delta) => {
    if (paused) return;
    const dt = Math.min(delta, 0.05);
    const keys = keysRef.current;
    const motion = motionRef.current;
    const orbit = orbitRef.current;

    if (motion.interactPulse > 0) {
      motion.interactPulse = Math.max(0, motion.interactPulse - dt * 2.8);
    }

    // Read directional input relative to camera yaw (yaw=0 faces +Z, yaw=PI faces -Z)
    const forwardInput =
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafeInput =
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const isRunning = keys.has('ShiftLeft') || keys.has('ShiftRight');

    if (forwardInput !== 0 || strafeInput !== 0) {
      const fwdX = Math.sin(orbit.yaw);
      const fwdZ = Math.cos(orbit.yaw);
      // Screen-right perpendicular vector when looking along (fwdX, fwdZ): (-fwdZ, fwdX)
      const rightX = -fwdZ;
      const rightZ = fwdX;

      let dirX = fwdX * forwardInput + rightX * strafeInput;
      let dirZ = fwdZ * forwardInput + rightZ * strafeInput;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;

      const moveSpeed = isRunning ? SPRINT_SPEED : WALK_SPEED;
      const stepRes = resolveWorldPlayerStep({
        currentPos: motion.position,
        deltaX: dirX * moveSpeed * dt,
        deltaZ: dirZ * moveSpeed * dt,
        floor,
      });

      const movedDist = Math.hypot(
        stepRes.position[0] - motion.position[0],
        stepRes.position[2] - motion.position[2],
      );
      motion.position = stepRes.position;
      motion.speed = dt > 1e-4 ? movedDist / dt : 0;
      motion.isRunning = isRunning;

      const targetFacingYaw = Math.atan2(dirX, dirZ);
      motion.yaw = prefersReducedMotion
        ? targetFacingYaw
        : lerpAngle(motion.yaw, targetFacingYaw, Math.min(1, dt * 12));
      callbacksRef.current.requestRender();
    } else {
      motion.speed = 0;
      motion.isRunning = false;
      if (motion.firstPerson) {
        motion.yaw = orbit.yaw;
      }
      if (motion.interactPulse > 0) {
        callbacksRef.current.requestRender();
      }
    }

    // Sync camera yaw into motionRef for live minimap FOV cone & drive gentle footsteps
    motion.cameraYaw = orbit.yaw;
    callbacksRef.current.onFootstepTick?.(dt, motion.speed, motion.isRunning);

    // Position camera: First-Person eye view OR Third-Person anti-clipping orbit
    const [px, py, pz] = motion.position;
    const eyeY = py + PLAYER_PHYSICS_CONSTANTS.EYE_HEIGHT;

    if (motion.firstPerson) {
      camera.position.set(px, eyeY, pz);
      const lookDist = 6;
      const cosP = Math.cos(orbit.pitch);
      camera.lookAt(
        px + Math.sin(orbit.yaw) * cosP * lookDist,
        eyeY - Math.sin(orbit.pitch) * lookDist,
        pz + Math.cos(orbit.yaw) * cosP * lookDist,
      );
    } else {
      const target: [number, number, number] = [px, eyeY, pz];
      const horizDist = Math.cos(orbit.pitch) * orbit.distance;
      const desiredPos: [number, number, number] = [
        px - Math.sin(orbit.yaw) * horizDist,
        eyeY + Math.sin(orbit.pitch) * orbit.distance + 0.35,
        pz - Math.cos(orbit.yaw) * horizDist,
      ];
      const camRes = resolveCameraOrbitPosition(target, desiredPos, floor);
      camera.position.set(camRes.position[0], camRes.position[1], camRes.position[2]);
      camera.lookAt(target[0], target[1], target[2]);
    }

    // Throttled area report for CoverPlane 2D windowing & shelf highlight
    const lastArea = lastAreaReportRef.current;
    if (
      lastArea.floorIndex !== floor.floorIndex ||
      Math.hypot(px - lastArea.x, pz - lastArea.z) > 0.65 ||
      Number.isNaN(lastArea.x)
    ) {
      const visibleBookcases = getVisibleFloorBookcases(floor, px, pz);
      const keysArr = visibleBookcases.map((bc) => bc.shelfKey);
      const nearestKey = keysArr[0] ?? null;
      lastArea.x = px;
      lastArea.z = pz;
      lastArea.floorIndex = floor.floorIndex;
      lastArea.shelfSig = `${floor.floorIndex}:${keysArr.join('|')}`;
      callbacksRef.current.onPlayerAreaChange(px, pz, new Set(keysArr), nearestKey);
    }

    // Proximity prompt detection for Stations & NPCs
    const station = findNearestInteractableStation(motion.position, floor);
    const nextPrompt: ActiveWorldPrompt | null = station
      ? { kind: 'station', station }
      : (() => {
          const npc = findNearestNpc(motion.position, floor.npcs, npcPositionsRef.current);
          return npc ? { kind: 'npc', npc } : null;
        })();

    const promptKey = nextPrompt
      ? nextPrompt.kind === 'station'
        ? `st:${nextPrompt.station.id}`
        : `npc:${nextPrompt.npc.id}`
      : '';
    if (promptKey !== lastPromptKeyRef.current) {
      lastPromptKeyRef.current = promptKey;
      activePromptRef.current = nextPrompt;
      callbacksRef.current.onActivePromptChange(nextPrompt);
    }
  });

  return null;
}
