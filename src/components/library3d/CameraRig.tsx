import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import {
  getVisibleShelfWindow,
  LIBRARY_3D_CONSTANTS,
  type LibraryLayout3D,
  type VisibleShelfWindow,
} from './layout3d';

interface CameraRigProps {
  layout: LibraryLayout3D;
  focusShelfKey: string | null;
  focusNonce: number;
  prefersReducedMotion: boolean;
  paused: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  lanternLightRef: MutableRefObject<THREE.PointLight | null>;
  requestRender: () => void;
  onVisibleWindowChange: (window: VisibleShelfWindow, cameraX: number) => void;
}

const CAMERA_EPSILON = 1e-3;
const CAMERA_DAMP_LAMBDA = 9.5;
const DRAG_THRESHOLD_PX = 5;
const DRAG_WORLD_PER_PX = 0.0095;
const WHEEL_WORLD_SCALE = 0.0055;
const KEY_STEP_WORLD = 2.6;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Demand-rendered horizontal aisle camera rig (drag, mouse wheel/trackpad, Arrow/A-D keys,
 * and shelf-chip jump). Strictly stops calling `invalidate()` once `|target - current| < 1e-3`.
 */
export function CameraRig({
  layout,
  focusShelfKey,
  focusNonce,
  prefersReducedMotion,
  paused,
  isDraggingRef,
  lanternLightRef,
  requestRender,
  onVisibleWindowChange,
}: CameraRigProps) {
  const { camera, gl } = useThree();

  const boundsRef = useRef({ minX: 0, maxX: 0 });
  const initialX = layout.shelves[0]?.centerX ?? layout.centerX;
  const currentXRef = useRef(initialX);
  const targetXRef = useRef(initialX);
  const lastReportedKeyRef = useRef('');
  const lastReportedQuantXRef = useRef<number>(Number.NaN);
  const dragResetRafRef = useRef<number | null>(null);
  const hadShelvesRef = useRef(layout.shelves.length > 0);

  const emitVisibleWindowIfChanged = useCallback(
    (camX: number) => {
      const win = getVisibleShelfWindow(camX, layout.shelves, 2);
      const keysSignature = win.keys.join('|');
      const quantX = Math.round(camX * 2) / 2;
      if (
        keysSignature !== lastReportedKeyRef.current ||
        quantX !== lastReportedQuantXRef.current
      ) {
        lastReportedKeyRef.current = keysSignature;
        lastReportedQuantXRef.current = quantX;
        onVisibleWindowChange(win, quantX);
      }
    },
    [layout.shelves, onVisibleWindowChange],
  );

  const applyCameraPose = useCallback(
    (camX: number, lookOffset = 0) => {
      const { EYE_LEVEL_Y, CAMERA_Z } = LIBRARY_3D_CONSTANTS;
      camera.position.set(camX, EYE_LEVEL_Y, CAMERA_Z);
      camera.lookAt(camX + lookOffset, EYE_LEVEL_Y - 0.04, -0.15);
      if (lanternLightRef.current) {
        lanternLightRef.current.position.x = camX;
      }
    },
    [camera, lanternLightRef],
  );

  const moveTargetTo = useCallback(
    (nextX: number) => {
      const { minX, maxX } = boundsRef.current;
      const clamped = clamp(nextX, minX, maxX);
      targetXRef.current = clamped;

      if (prefersReducedMotion) {
        currentXRef.current = clamped;
        applyCameraPose(clamped, 0);
        emitVisibleWindowIfChanged(clamped);
      }
      requestRender();
    },
    [prefersReducedMotion, applyCameraPose, emitVisibleWindowIfChanged, requestRender],
  );

  // Sync camera bounds whenever visible shelves change (e.g. search or shelf filter)
  useEffect(() => {
    const first = layout.shelves[0];
    const last = layout.shelves[layout.shelves.length - 1];
    const minX = first ? first.centerX : 0;
    const maxX = last ? last.centerX : 0;
    boundsRef.current = { minX, maxX };

    if (!hadShelvesRef.current && first) {
      currentXRef.current = first.centerX;
      targetXRef.current = first.centerX;
    }
    hadShelvesRef.current = layout.shelves.length > 0;

    const clampedCurrent = clamp(currentXRef.current, minX, maxX);
    const clampedTarget = clamp(targetXRef.current, minX, maxX);
    currentXRef.current = clampedCurrent;
    targetXRef.current = clampedTarget;
    applyCameraPose(clampedCurrent, 0);

    // Force-report visible shelf window for the updated layout
    lastReportedKeyRef.current = '';
    emitVisibleWindowIfChanged(clampedCurrent);
    requestRender();
  }, [layout, applyCameraPose, emitVisibleWindowIfChanged, requestRender]);

  // Programmatic jump when user clicks a shelf chip or changes active shelf filter
  useEffect(() => {
    if (!focusShelfKey) return;
    const targetShelf = layout.shelfByKey.get(focusShelfKey);
    if (!targetShelf) return;
    moveTargetTo(targetShelf.centerX);
  }, [focusShelfKey, focusNonce, layout.shelfByKey, moveTargetTo]);

  // Mouse drag & wheel scrolling on canvas
  useEffect(() => {
    const domElement = gl.domElement;
    if (!domElement) return undefined;

    let pointerActive = false;
    let activePointerId = -1;
    let lastClientX = 0;
    let movedPx = 0;

    const handlePointerDown = (event: PointerEvent) => {
      if (paused || event.button !== 0) return;
      pointerActive = true;
      activePointerId = event.pointerId;
      lastClientX = event.clientX;
      movedPx = 0;
      isDraggingRef.current = false;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerActive || event.pointerId !== activePointerId || paused) return;
      const dx = event.clientX - lastClientX;
      lastClientX = event.clientX;
      movedPx += Math.abs(dx);

      if (!isDraggingRef.current && movedPx >= DRAG_THRESHOLD_PX) {
        isDraggingRef.current = true;
        document.body.style.cursor = 'grabbing';
      }

      if (isDraggingRef.current) {
        moveTargetTo(targetXRef.current - dx * DRAG_WORLD_PER_PX);
      }
    };

    const finishDrag = (event: PointerEvent) => {
      if (!pointerActive || event.pointerId !== activePointerId) return;
      pointerActive = false;
      activePointerId = -1;
      if (isDraggingRef.current) {
        document.body.style.cursor = '';
        // Defer resetting flag by 1 frame so the immediately following click event is ignored
        if (dragResetRafRef.current !== null) {
          window.cancelAnimationFrame(dragResetRafRef.current);
        }
        dragResetRafRef.current = window.requestAnimationFrame(() => {
          isDraggingRef.current = false;
          dragResetRafRef.current = null;
        });
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (paused) return;
      const primaryDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (primaryDelta === 0) return;
      event.preventDefault();
      moveTargetTo(targetXRef.current + primaryDelta * WHEEL_WORLD_SCALE);
    };

    domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    domElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      domElement.removeEventListener('wheel', handleWheel);
      if (dragResetRafRef.current !== null) {
        window.cancelAnimationFrame(dragResetRafRef.current);
        dragResetRafRef.current = null;
      }
      isDraggingRef.current = false;
      document.body.style.cursor = '';
    };
  }, [gl.domElement, paused, isDraggingRef, moveTargetTo]);

  // Keyboard navigation (ArrowLeft/Right, A/D, Home/End)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (paused || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const { minX, maxX } = boundsRef.current;
      switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          event.preventDefault();
          moveTargetTo(targetXRef.current - KEY_STEP_WORLD);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          event.preventDefault();
          moveTargetTo(targetXRef.current + KEY_STEP_WORLD);
          break;
        case 'Home':
          event.preventDefault();
          moveTargetTo(minX);
          break;
        case 'End':
          event.preventDefault();
          moveTargetTo(maxX);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paused, moveTargetTo]);

  // Demand-rendered damping loop: halts completely (0 FPS) when |target - current| < 1e-3
  useFrame((_, delta) => {
    if (paused) return;
    const diff = targetXRef.current - currentXRef.current;
    if (Math.abs(diff) < CAMERA_EPSILON) {
      if (diff !== 0) {
        currentXRef.current = targetXRef.current;
        applyCameraPose(currentXRef.current, 0);
        emitVisibleWindowIfChanged(currentXRef.current);
      }
      return;
    }

    const alpha = 1 - Math.exp(-Math.min(delta, 0.1) * CAMERA_DAMP_LAMBDA);
    const nextX = currentXRef.current + diff * alpha;
    const remaining = targetXRef.current - nextX;

    if (Math.abs(remaining) < CAMERA_EPSILON) {
      currentXRef.current = targetXRef.current;
      applyCameraPose(currentXRef.current, 0);
      emitVisibleWindowIfChanged(currentXRef.current);
      return;
    }

    currentXRef.current = nextX;
    const lookAhead = clamp(remaining * 0.08, -0.35, 0.35);
    applyCameraPose(nextX, lookAhead);
    emitVisibleWindowIfChanged(nextX);
    requestRender();
  });

  return null;
}
