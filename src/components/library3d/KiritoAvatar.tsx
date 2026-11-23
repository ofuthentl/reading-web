import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AnimatedPlayerGlb } from './AnimatedPlayerGlb';
import { hasCachedLocalGlb } from './gltfLoader';
import { createContactShadowTexture } from './worldMaterials';
import type { PlayerMotionState } from './worldTypes';

export type { PlayerMotionState };

const DEFAULT_PLAYER_MODEL_URL = `${import.meta.env.BASE_URL ?? '/'}models/player.glb`;

export interface KiritoAvatarProps {
  motionRef: MutableRefObject<PlayerMotionState>;
  paused: boolean;
  prefersReducedMotion: boolean;
  /** Optional local `.glb` override path under `public/models/` (0 CDN) */
  customModelUrl?: string | null;
}

/**
 * Paints an equirectangular anime head texture mapped onto `SphereGeometry(r, 24, 18, -Math.PI/2)`:
 * `u = 0.5` maps directly to `+Z` (front face center), so eyes, brows, nose, mouth, and back hair
 * wrap smoothly around the curved 3D head with zero z-fighting or buried planes.
 */
function createKiritoHeadTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas =
    typeof document !== 'undefined'
      ? Object.assign(document.createElement('canvas'), { width: w, height: h })
      : ({ width: w, height: h } as unknown as HTMLCanvasElement);

  const ctx = typeof document !== 'undefined' ? canvas.getContext('2d') : null;
  if (ctx) {
    // Warm anime skin base across face area
    ctx.fillStyle = '#f6d7bf';
    ctx.fillRect(0, 0, w, h);

    // Back & crown dark blue-charcoal hair coverage (u < 0.28 and u > 0.72, plus top crown)
    ctx.fillStyle = '#232836';
    ctx.fillRect(0, 0, w, 66);
    ctx.fillRect(0, 0, 148, h);
    ctx.fillRect(w - 148, 0, 148, h);

    // Soft hairline fringe shadow on forehead
    ctx.fillStyle = 'rgba(35, 40, 54, 0.22)';
    ctx.fillRect(148, 66, w - 296, 20);

    // Soft cheek blush
    for (const cx of [210, 302]) {
      const blush = ctx.createRadialGradient(cx, 152, 2, cx, 152, 16);
      blush.addColorStop(0, 'rgba(240, 138, 126, 0.34)');
      blush.addColorStop(1, 'rgba(240, 138, 126, 0)');
      ctx.fillStyle = blush;
      ctx.fillRect(cx - 18, 134, 36, 36);
    }

    // SAO sharp eyebrows (centered around u = 0.5 -> x = 256)
    ctx.strokeStyle = '#1b1f2a';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(204, 108);
    ctx.quadraticCurveTo(222, 102, 240, 110);
    ctx.moveTo(308, 108);
    ctx.quadraticCurveTo(290, 102, 272, 110);
    ctx.stroke();

    // Expressive charcoal-silver Kirito anime eyes
    for (const [ex, flip] of [
      [223, 1],
      [289, -1],
    ] as const) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, 130, 16, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      const iris = ctx.createLinearGradient(ex, 118, ex, 142);
      iris.addColorStop(0, '#1e2433');
      iris.addColorStop(0.65, '#434d63');
      iris.addColorStop(1, '#7c8aa6');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.ellipse(ex, 131, 10.5, 11.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0e1118';
      ctx.beginPath();
      ctx.arc(ex, 131, 4.8, 0, Math.PI * 2);
      ctx.fill();

      // Crisp specular anime catchlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 4 * flip, 125, 3.4, 0, Math.PI * 2);
      ctx.arc(ex + 3.5 * flip, 136, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Bold upper eyelash
      ctx.strokeStyle = '#141720';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(ex - 17, 127);
      ctx.quadraticCurveTo(ex, 113, ex + 17, 127);
      ctx.stroke();
    }

    // Minimal anime nose dot & subtle warm smile
    ctx.fillStyle = '#c8997e';
    ctx.beginPath();
    ctx.arc(256, 151, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#996754';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(244, 169);
    ctx.quadraticCurveTo(256, 177, 268, 169);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Player avatar (`D-015`/`D-019`): defaults to the real Mixamo-rigged Kirito `.glb`
 * (`public/models/player.glb`, 4 clips `Idle`/`Walk`/`Run`/`Sprint`, 0 CDN) and keeps the
 * articulated stylized Black Swordsman procedural rig as an instant loading/error fallback.
 */
export function KiritoAvatar({
  motionRef,
  paused,
  prefersReducedMotion,
  customModelUrl = DEFAULT_PLAYER_MODEL_URL,
}: KiritoAvatarProps) {
  const [glbLoaded, setGlbLoaded] = useState(() =>
    Boolean(customModelUrl && hasCachedLocalGlb(customModelUrl)),
  );
  const handleGlbLoadedChange = useCallback((loaded: boolean) => {
    setGlbLoaded(loaded);
  }, []);
  const rootRef = useRef<THREE.Group | null>(null);
  const bodyRef = useRef<THREE.Group | null>(null);
  const headRef = useRef<THREE.Group | null>(null);
  const leftArmRef = useRef<THREE.Group | null>(null);
  const rightArmRef = useRef<THREE.Group | null>(null);
  const leftLegRef = useRef<THREE.Group | null>(null);
  const rightLegRef = useRef<THREE.Group | null>(null);
  const coatTailLRef = useRef<THREE.Group | null>(null);
  const coatTailRRef = useRef<THREE.Group | null>(null);
  const coatTailBackRef = useRef<THREE.Group | null>(null);
  const walkCycleRef = useRef(0);
  const idleTimeRef = useRef(0);

  const shadowAssets = useMemo(() => {
    const texture = createContactShadowTexture();
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    return { texture, material };
  }, []);

  const shadowDisposeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (shadowDisposeTimerRef.current !== null) {
      window.clearTimeout(shadowDisposeTimerRef.current);
      shadowDisposeTimerRef.current = null;
    }
    return () => {
      shadowDisposeTimerRef.current = window.setTimeout(() => {
        shadowDisposeTimerRef.current = null;
        shadowAssets.material.dispose();
        shadowAssets.texture.dispose();
      }, 0);
    };
  }, [shadowAssets]);

  // Chỉ tạo texture khuôn mặt & bộ vật liệu procedural khi player.glb chưa sẵn sàng; giải phóng ngay khi GLB đã tải
  const fallbackAssets = useMemo(() => {
    if (glbLoaded) return null;
    const headTexture = createKiritoHeadTexture();
    const mats = {
      // Readable dark slate-charcoal so contours & folds stay crisp in Day/Dusk/Night
      coat: new THREE.MeshStandardMaterial({ color: '#2b3140', roughness: 0.68, metalness: 0.1 }),
      coatDark: new THREE.MeshStandardMaterial({ color: '#1f2430', roughness: 0.72, metalness: 0.08 }),
      shirt: new THREE.MeshStandardMaterial({ color: '#394052', roughness: 0.82, metalness: 0.04 }),
      trim: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.34, metalness: 0.55 }),
      buckle: new THREE.MeshStandardMaterial({ color: '#9aa5b8', roughness: 0.28, metalness: 0.72 }),
      hair: new THREE.MeshStandardMaterial({ color: '#232836', roughness: 0.55, metalness: 0.1 }),
      skin: new THREE.MeshStandardMaterial({ color: '#f6d7bf', roughness: 0.74, metalness: 0.02 }),
      head: new THREE.MeshStandardMaterial({ map: headTexture, roughness: 0.64, metalness: 0.02 }),
      boot: new THREE.MeshStandardMaterial({ color: '#1d222d', roughness: 0.58, metalness: 0.14 }),
      swordBlade: new THREE.MeshStandardMaterial({ color: '#1b202c', roughness: 0.24, metalness: 0.82 }),
      swordSilver: new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.22, metalness: 0.86 }),
    };
    return { headTexture, mats };
  }, [glbLoaded]);

  const fallbackDisposeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (fallbackDisposeTimerRef.current !== null) {
      window.clearTimeout(fallbackDisposeTimerRef.current);
      fallbackDisposeTimerRef.current = null;
    }
    if (!fallbackAssets) return undefined;
    return () => {
      fallbackDisposeTimerRef.current = window.setTimeout(() => {
        fallbackDisposeTimerRef.current = null;
        Object.values(fallbackAssets.mats).forEach((m) => m.dispose());
        fallbackAssets.headTexture.dispose();
      }, 0);
    };
  }, [fallbackAssets]);

  const mats = fallbackAssets?.mats ?? null;

  useFrame((_, delta) => {
    const root = rootRef.current;
    if (!root) return;
    const state = motionRef.current;
    root.visible = !state.firstPerson;
    root.position.set(state.position[0], state.position[1], state.position[2]);
    root.rotation.y = state.yaw;

    if (paused || state.firstPerson || glbLoaded) return;

    const dt = Math.min(delta, 0.05);
    idleTimeRef.current += dt;
    const speedRatio = Math.min(1, state.speed / (state.isRunning ? 6.4 : 3.8));
    const isMoving = state.speed > 0.08;

    if (isMoving && !prefersReducedMotion) {
      walkCycleRef.current += dt * (state.isRunning ? 12.2 : 8.0);
    }

    const phase = walkCycleRef.current;
    const swingAmp = isMoving && !prefersReducedMotion ? (state.isRunning ? 0.72 : 0.48) * speedRatio : 0;
    const breath = prefersReducedMotion ? 0 : Math.sin(idleTimeRef.current * 2.4) * 0.012;
    const bounce = isMoving && !prefersReducedMotion ? Math.abs(Math.sin(phase)) * (state.isRunning ? 0.06 : 0.03) : 0;

    if (bodyRef.current) {
      bodyRef.current.position.y = bounce + breath;
      const targetLean = isMoving ? (state.isRunning ? 0.2 : 0.07) * speedRatio : 0;
      bodyRef.current.rotation.x += (targetLean - bodyRef.current.rotation.x) * Math.min(1, dt * 10);
    }
    if (headRef.current) {
      headRef.current.rotation.y = prefersReducedMotion ? 0 : Math.sin(idleTimeRef.current * 0.9) * 0.05;
    }
    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = Math.sin(phase) * swingAmp;
      rightLegRef.current.rotation.x = -Math.sin(phase) * swingAmp;
    }
    if (leftArmRef.current && rightArmRef.current) {
      leftArmRef.current.rotation.x = -Math.sin(phase) * swingAmp * 0.85;
      const interactLift = state.interactPulse > 0 ? -Math.sin(state.interactPulse * Math.PI) * 0.9 : 0;
      rightArmRef.current.rotation.x = Math.sin(phase) * swingAmp * 0.85 + interactLift;
    }
    const tailFlutter =
      isMoving && !prefersReducedMotion
        ? (state.isRunning ? 0.42 : 0.16) * speedRatio + Math.sin(phase * 2) * 0.07
        : 0.06 + Math.sin(idleTimeRef.current * 1.8) * 0.018;
    if (coatTailBackRef.current) coatTailBackRef.current.rotation.x = -tailFlutter;
    if (coatTailLRef.current) coatTailLRef.current.rotation.z = 0.12 + tailFlutter * 0.24;
    if (coatTailRRef.current) coatTailRRef.current.rotation.z = -(0.12 + tailFlutter * 0.24);
  });

  return (
    <group ref={rootRef} name="kirito-avatar">
      {/* Ground contact shadow disc (grounds boots smoothly in both GLB & fallback modes) */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} material={shadowAssets.material}>
        <planeGeometry args={[0.92, 0.92]} />
      </mesh>

      {customModelUrl && (
        <AnimatedPlayerGlb
          url={customModelUrl}
          motionRef={motionRef}
          paused={paused}
          prefersReducedMotion={prefersReducedMotion}
          onLoadedChange={handleGlbLoadedChange}
        />
      )}

      {!glbLoaded && mats && (
        <group ref={bodyRef}>
        {/* Tapered athletic torso & Coat of Midnight upper jacket */}
        <group position={[0, 1.07, 0]}>
          {/* Inner shirt */}
          <mesh scale={[1.05, 1, 0.68]} material={mats.shirt}>
            <cylinderGeometry args={[0.145, 0.125, 0.44, 12]} />
          </mesh>
          {/* Coat torso shell */}
          <mesh position={[0, 0, -0.018]} scale={[1.18, 1, 0.72]} material={mats.coat}>
            <cylinderGeometry args={[0.155, 0.132, 0.46, 12]} />
          </mesh>
          {/* Open-front coat lapel strips + crisp silver vertical piping */}
          <mesh position={[-0.095, 0, 0.076]} material={mats.coat}>
            <boxGeometry args={[0.085, 0.45, 0.04]} />
          </mesh>
          <mesh position={[0.095, 0, 0.076]} material={mats.coat}>
            <boxGeometry args={[0.085, 0.45, 0.04]} />
          </mesh>
          <mesh position={[-0.055, 0, 0.098]} material={mats.trim}>
            <boxGeometry args={[0.014, 0.45, 0.01]} />
          </mesh>
          <mesh position={[0.055, 0, 0.098]} material={mats.trim}>
            <boxGeometry args={[0.014, 0.45, 0.01]} />
          </mesh>

          {/* Flared high standing collar with silver trim */}
          <mesh position={[0, 0.255, -0.015]} rotation={[-0.14, 0, 0]} material={mats.coatDark}>
            <cylinderGeometry args={[0.155, 0.115, 0.12, 14, 1, true, Math.PI * 0.68, Math.PI * 1.64]} />
          </mesh>
          <mesh position={[0, 0.31, -0.025]} rotation={[Math.PI / 2 - 0.14, 0, Math.PI * 0.18]} material={mats.trim}>
            <torusGeometry args={[0.152, 0.009, 6, 16, Math.PI * 1.64]} />
          </mesh>

          {/* Diagonal chest strap + properly forward-facing 3-pronged silver clasp */}
          <mesh position={[0, 0.01, 0.106]} rotation={[0, 0, -0.58]} material={mats.coatDark}>
            <boxGeometry args={[0.32, 0.042, 0.016]} />
          </mesh>
          <mesh position={[0, 0.01, 0.115]} rotation={[0, 0, -0.58]} material={mats.trim}>
            <boxGeometry args={[0.32, 0.01, 0.006]} />
          </mesh>
          <group position={[-0.072, 0.068, 0.118]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.buckle}>
              <cylinderGeometry args={[0.032, 0.032, 0.016, 10]} />
            </mesh>
            {[0.3, 2.39, 4.48].map((ang) => (
              <mesh
                key={ang}
                position={[Math.cos(ang) * 0.036, Math.sin(ang) * 0.036, 0.002]}
                rotation={[Math.PI / 2, 0, 0]}
                material={mats.buckle}
              >
                <cylinderGeometry args={[0.018, 0.018, 0.015, 8]} />
              </mesh>
            ))}
          </group>

          {/* Waist belt + metallic rectangular buckle */}
          <mesh position={[0, -0.21, 0]} scale={[1.16, 1, 0.78]} material={mats.boot}>
            <cylinderGeometry args={[0.142, 0.146, 0.058, 12]} />
          </mesh>
          <mesh position={[0, -0.21, 0.114]} material={mats.buckle}>
            <boxGeometry args={[0.082, 0.05, 0.018]} />
          </mesh>

          {/* Elucidator (Black Sword) behind the back, hilt over right shoulder */}
          <group position={[-0.03, 0.05, -0.14]} rotation={[0.05, 0, 0.42]}>
            <mesh position={[0, -0.08, 0]} material={mats.swordBlade}>
              <boxGeometry args={[0.055, 0.88, 0.024]} />
            </mesh>
            <mesh position={[0, -0.51, 0]} material={mats.swordSilver}>
              <boxGeometry args={[0.06, 0.055, 0.028]} />
            </mesh>
            <mesh position={[0, 0.36, 0]} material={mats.swordSilver}>
              <boxGeometry args={[0.19, 0.036, 0.036]} />
            </mesh>
            <mesh position={[0, 0.49, 0]} material={mats.swordBlade}>
              <cylinderGeometry args={[0.018, 0.02, 0.22, 8]} />
            </mesh>
            <mesh position={[0, 0.61, 0]} material={mats.swordSilver}>
              <octahedronGeometry args={[0.03, 0]} />
            </mesh>
          </group>
        </group>

        {/* Sleek flared A-line coat tails below waist */}
        <group position={[0, 0.85, 0]}>
          <group ref={coatTailBackRef} position={[0, 0, -0.075]}>
            <mesh position={[0, -0.32, -0.02]} material={mats.coat}>
              <cylinderGeometry args={[0.145, 0.24, 0.64, 10, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
            </mesh>
            <mesh position={[0, -0.63, -0.02]} material={mats.trim}>
              <cylinderGeometry args={[0.24, 0.244, 0.022, 10, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
            </mesh>
          </group>
          <group ref={coatTailLRef} position={[0.135, 0, 0.005]}>
            <mesh position={[0.04, -0.31, 0]} rotation={[0, 0, 0.08]} material={mats.coat}>
              <boxGeometry args={[0.024, 0.62, 0.19]} />
            </mesh>
            <mesh position={[0.042, -0.31, 0.095]} rotation={[0, 0, 0.08]} material={mats.trim}>
              <boxGeometry args={[0.026, 0.62, 0.012]} />
            </mesh>
          </group>
          <group ref={coatTailRRef} position={[-0.135, 0, 0.005]}>
            <mesh position={[-0.04, -0.31, 0]} rotation={[0, 0, -0.08]} material={mats.coat}>
              <boxGeometry args={[0.024, 0.62, 0.19]} />
            </mesh>
            <mesh position={[-0.042, -0.31, 0.095]} rotation={[0, 0, -0.08]} material={mats.trim}>
              <boxGeometry args={[0.026, 0.62, 0.012]} />
            </mesh>
          </group>
        </group>

        {/* Neck & Stylized Anime Head (equirectangular face mapped cleanly onto curved sphere) */}
        <mesh position={[0, 1.33, 0]} material={mats.skin}>
          <cylinderGeometry args={[0.048, 0.056, 0.1, 10]} />
        </mesh>
        <group ref={headRef} position={[0, 1.49, 0]}>
          <mesh scale={[0.96, 1.03, 0.94]} material={mats.head}>
            <sphereGeometry args={[0.155, 24, 18, -Math.PI / 2]} />
          </mesh>
          {/* Rounded anime hair crown cap (offset slightly back/up so face stays completely clear) */}
          <mesh position={[0, 0.036, -0.022]} scale={[1.02, 0.96, 1.02]} material={mats.hair}>
            <sphereGeometry args={[0.158, 16, 14]} />
          </mesh>
          {/* Downward-hanging spiky Kirito bangs & cheek-framing locks (cone tip points -Y!) */}
          {[
            [0, 0.115, 0.125, Math.PI - 0.34, 0, 0, 0.038, 0.105],
            [-0.056, 0.112, 0.118, Math.PI - 0.3, 0, -0.22, 0.036, 0.11],
            [0.056, 0.112, 0.118, Math.PI - 0.3, 0, 0.22, 0.036, 0.11],
            [-0.128, 0.02, 0.068, Math.PI - 0.12, 0, -0.18, 0.038, 0.165],
            [0.128, 0.02, 0.068, Math.PI - 0.12, 0, 0.18, 0.038, 0.165],
            [0, -0.045, -0.14, Math.PI + 0.22, 0, 0, 0.07, 0.16],
            [-0.085, -0.03, -0.125, Math.PI + 0.18, 0, -0.2, 0.05, 0.155],
            [0.085, -0.03, -0.125, Math.PI + 0.18, 0, 0.2, 0.05, 0.155],
          ].map(([x, y, z, rx, ry, rz, rad, len], idx) => (
            <mesh key={idx} position={[x, y, z]} rotation={[rx, ry, rz]} material={mats.hair}>
              <coneGeometry args={[rad, len, 6]} />
            </mesh>
          ))}
        </group>

        {/* Rounded Capsule Arms (left sleeve carries iconic metallic shoulder emblem) */}
        <group ref={leftArmRef} position={[0.215, 1.24, 0]}>
          <mesh position={[0.044, -0.04, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.buckle}>
            <cylinderGeometry args={[0.038, 0.038, 0.018, 10]} />
          </mesh>
          <mesh position={[0, -0.2, 0]} material={mats.coat}>
            <capsuleGeometry args={[0.048, 0.34, 6, 10]} />
          </mesh>
          <mesh position={[0, -0.375, 0]} material={mats.trim}>
            <cylinderGeometry args={[0.052, 0.052, 0.02, 10]} />
          </mesh>
          <mesh position={[0, -0.43, 0]} material={mats.boot}>
            <sphereGeometry args={[0.044, 10, 8]} />
          </mesh>
          <mesh position={[0, -0.47, 0]} material={mats.skin}>
            <sphereGeometry args={[0.034, 8, 8]} />
          </mesh>
        </group>

        <group ref={rightArmRef} position={[-0.215, 1.24, 0]}>
          <mesh position={[0, -0.2, 0]} material={mats.coat}>
            <capsuleGeometry args={[0.048, 0.34, 6, 10]} />
          </mesh>
          <mesh position={[0, -0.375, 0]} material={mats.trim}>
            <cylinderGeometry args={[0.052, 0.052, 0.02, 10]} />
          </mesh>
          <mesh position={[0, -0.43, 0]} material={mats.boot}>
            <sphereGeometry args={[0.044, 10, 8]} />
          </mesh>
          <mesh position={[0, -0.47, 0]} material={mats.skin}>
            <sphereGeometry args={[0.034, 8, 8]} />
          </mesh>
        </group>

        {/* Rounded Legs + Silver-Grey Cuffed Boots grounded flush at Y = 0 */}
        {[
          { ref: leftLegRef, x: 0.088, key: 'leg-l' },
          { ref: rightLegRef, x: -0.088, key: 'leg-r' },
        ].map(({ ref, x, key }) => (
          <group key={key} ref={ref} position={[x, 0.82, 0]}>
            <mesh position={[0, -0.29, 0]} material={mats.coatDark}>
              <capsuleGeometry args={[0.058, 0.44, 6, 10]} />
            </mesh>
            <mesh position={[0, -0.59, 0.004]} material={mats.buckle}>
              <cylinderGeometry args={[0.068, 0.064, 0.1, 10]} />
            </mesh>
            <mesh position={[0, -0.735, 0.028]} material={mats.boot}>
              <boxGeometry args={[0.12, 0.17, 0.21]} />
            </mesh>
          </group>
        ))}
      </group>
      )}
    </group>
  );
}
