import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';

export interface PlayerMotionState {
  position: [number, number, number];
  yaw: number;
  speed: number;
  isRunning: boolean;
  firstPerson: boolean;
  /** Decrements toward 0 when player clicks a book or triggers `[E]` */
  interactPulse: number;
}

export interface KiritoAvatarProps {
  motionRef: MutableRefObject<PlayerMotionState>;
  paused: boolean;
  prefersReducedMotion: boolean;
  /** Optional local `.glb` override path under `public/models/` (0 CDN) */
  customModelUrl?: string | null;
}

function createKiritoFaceTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas =
    typeof document !== 'undefined'
      ? Object.assign(document.createElement('canvas'), { width: size, height: size })
      : ({ width: size, height: size } as unknown as HTMLCanvasElement);

  const ctx = typeof document !== 'undefined' ? canvas.getContext('2d') : null;
  if (ctx) {
    // Warm anime skin base
    ctx.fillStyle = '#f6d6be';
    ctx.fillRect(0, 0, size, size);

    // Subtle cheek warmth
    for (const cx of [74, 182]) {
      const blush = ctx.createRadialGradient(cx, 162, 2, cx, 162, 22);
      blush.addColorStop(0, 'rgba(244, 146, 134, 0.28)');
      blush.addColorStop(1, 'rgba(244, 146, 134, 0)');
      ctx.fillStyle = blush;
      ctx.fillRect(cx - 24, 138, 48, 48);
    }

    // Crisp SAO-style eyebrows
    ctx.strokeStyle = '#1b1d24';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(56, 102);
    ctx.quadraticCurveTo(84, 93, 108, 104);
    ctx.moveTo(200, 102);
    ctx.quadraticCurveTo(172, 93, 148, 104);
    ctx.stroke();

    // Expressive dark charcoal-grey eyes with upper lash & specular catchlights
    for (const [ex, flip] of [
      [84, 1],
      [172, -1],
    ] as const) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, 132, 21, 17, 0, 0, Math.PI * 2);
      ctx.fill();

      const iris = ctx.createLinearGradient(ex, 117, ex, 148);
      iris.addColorStop(0, '#1e222d');
      iris.addColorStop(0.65, '#3b4254');
      iris.addColorStop(1, '#6c778f');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.ellipse(ex, 133, 13.5, 14.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f1117';
      ctx.beginPath();
      ctx.arc(ex, 133, 6.2, 0, Math.PI * 2);
      ctx.fill();

      // Anime highlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - 5 * flip, 126, 4.2, 0, Math.PI * 2);
      ctx.arc(ex + 5 * flip, 139, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Bold upper eyelash arc
      ctx.strokeStyle = '#14161c';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(ex - 23, 128);
      ctx.quadraticCurveTo(ex, 110, ex + 23, 128);
      ctx.stroke();
    }

    // Minimal anime nose & gentle confident smile
    ctx.fillStyle = '#cfa389';
    ctx.beginPath();
    ctx.arc(128, 160, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#996a57';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(114, 184);
    ctx.quadraticCurveTo(128, 193, 142, 184);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function CustomPlayerGlb({ url }: { url: string }) {
  const { template } = useLocalGlb(url);
  const instance = useMemo(() => (template ? cloneGlbTemplate(template) : null), [template]);
  if (!instance || !template) return null;
  const groundedY = -template.bbox.min[1];
  return <primitive object={instance} position={[0, groundedY, 0]} />;
}

/**
 * Articulated Black Swordsman (Kirito) 3D avatar matching the reference sheet (`D-015`):
 * spiky layered black hair, Canvas2D anime face, high-collared Coat of Midnight with silver
 * piping, diagonal strap + 3-pronged chest clasp, left shoulder emblem, billowing split coat
 * tails, grey-cuffed boots, and Elucidator slung diagonally across the back.
 */
export function KiritoAvatar({
  motionRef,
  paused,
  prefersReducedMotion,
  customModelUrl = null,
}: KiritoAvatarProps) {
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

  const faceTexture = useMemo(() => createKiritoFaceTexture(), []);
  useEffect(() => {
    return () => {
      faceTexture.dispose();
    };
  }, [faceTexture]);

  const mats = useMemo(
    () => ({
      coat: new THREE.MeshStandardMaterial({ color: '#1d2029', roughness: 0.72, metalness: 0.08 }),
      shirt: new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.84, metalness: 0.04 }),
      trim: new THREE.MeshStandardMaterial({ color: '#b4bccb', roughness: 0.36, metalness: 0.55 }),
      buckle: new THREE.MeshStandardMaterial({ color: '#8d98aa', roughness: 0.28, metalness: 0.72 }),
      hair: new THREE.MeshStandardMaterial({ color: '#181b22', roughness: 0.58, metalness: 0.08 }),
      skin: new THREE.MeshStandardMaterial({ color: '#f6d6be', roughness: 0.76, metalness: 0.02 }),
      face: new THREE.MeshStandardMaterial({ map: faceTexture, roughness: 0.65, metalness: 0.02 }),
      boot: new THREE.MeshStandardMaterial({ color: '#15181f', roughness: 0.62, metalness: 0.12 }),
      swordBlade: new THREE.MeshStandardMaterial({ color: '#141720', roughness: 0.22, metalness: 0.82 }),
      swordSilver: new THREE.MeshStandardMaterial({ color: '#d4dce8', roughness: 0.24, metalness: 0.85 }),
    }),
    [faceTexture],
  );

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  useFrame((_, delta) => {
    const root = rootRef.current;
    if (!root) return;
    const state = motionRef.current;
    root.visible = !state.firstPerson;
    root.position.set(state.position[0], state.position[1], state.position[2]);
    root.rotation.y = state.yaw;

    if (paused || state.firstPerson) return;

    const dt = Math.min(delta, 0.05);
    idleTimeRef.current += dt;
    const speedRatio = Math.min(1, state.speed / (state.isRunning ? 6.4 : 3.8));
    const isMoving = state.speed > 0.08;

    if (isMoving && !prefersReducedMotion) {
      walkCycleRef.current += dt * (state.isRunning ? 12.5 : 8.2);
    }

    const phase = walkCycleRef.current;
    const swingAmp = isMoving && !prefersReducedMotion ? (state.isRunning ? 0.78 : 0.52) * speedRatio : 0;
    const breath = prefersReducedMotion ? 0 : Math.sin(idleTimeRef.current * 2.4) * 0.014;
    const bounce = isMoving && !prefersReducedMotion ? Math.abs(Math.sin(phase)) * (state.isRunning ? 0.065 : 0.035) : 0;

    if (bodyRef.current) {
      bodyRef.current.position.y = bounce + breath;
      // Forward anime sprint lean
      const targetLean = isMoving ? (state.isRunning ? 0.22 : 0.08) * speedRatio : 0;
      bodyRef.current.rotation.x += (targetLean - bodyRef.current.rotation.x) * Math.min(1, dt * 10);
    }
    if (headRef.current) {
      headRef.current.rotation.y = prefersReducedMotion ? 0 : Math.sin(idleTimeRef.current * 0.9) * 0.06;
    }
    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = Math.sin(phase) * swingAmp;
      rightLegRef.current.rotation.x = -Math.sin(phase) * swingAmp;
    }
    if (leftArmRef.current && rightArmRef.current) {
      leftArmRef.current.rotation.x = -Math.sin(phase) * swingAmp * 0.85;
      const interactLift = state.interactPulse > 0 ? -Math.sin(state.interactPulse * Math.PI) * 0.95 : 0;
      rightArmRef.current.rotation.x = Math.sin(phase) * swingAmp * 0.85 + interactLift;
    }
    // Dynamic coat-tail flutter trailing backward when running
    const tailFlutter = isMoving && !prefersReducedMotion
      ? (state.isRunning ? 0.42 : 0.18) * speedRatio + Math.sin(phase * 2) * 0.08
      : 0.05 + Math.sin(idleTimeRef.current * 1.8) * 0.02;
    if (coatTailBackRef.current) coatTailBackRef.current.rotation.x = -tailFlutter;
    if (coatTailLRef.current) coatTailLRef.current.rotation.z = 0.08 + tailFlutter * 0.32;
    if (coatTailRRef.current) coatTailRRef.current.rotation.z = -(0.08 + tailFlutter * 0.32);
  });

  if (customModelUrl) {
    return (
      <group ref={rootRef} name="kirito-custom-avatar">
        <CustomPlayerGlb url={customModelUrl} />
      </group>
    );
  }

  return (
    <group ref={rootRef} name="kirito-avatar">
      <group ref={bodyRef}>
        {/* Torso & Coat of Midnight upper jacket */}
        <group position={[0, 1.07, 0]}>
          <mesh material={mats.shirt}>
            <boxGeometry args={[0.31, 0.46, 0.18]} />
          </mesh>
          {/* Left & right open trench coat front panels with iconic silver piping */}
          <mesh position={[-0.125, -0.01, 0.012]} material={mats.coat}>
            <boxGeometry args={[0.13, 0.48, 0.2]} />
          </mesh>
          <mesh position={[0.125, -0.01, 0.012]} material={mats.coat}>
            <boxGeometry args={[0.13, 0.48, 0.2]} />
          </mesh>
          <mesh position={[-0.068, -0.01, 0.114]} material={mats.trim}>
            <boxGeometry args={[0.018, 0.47, 0.012]} />
          </mesh>
          <mesh position={[0.068, -0.01, 0.114]} material={mats.trim}>
            <boxGeometry args={[0.018, 0.47, 0.012]} />
          </mesh>
          {/* Back coat torso */}
          <mesh position={[0, 0, -0.04]} material={mats.coat}>
            <boxGeometry args={[0.36, 0.48, 0.14]} />
          </mesh>

          {/* High flared standing collar with silver trim */}
          <mesh position={[0, 0.26, -0.03]} rotation={[-0.18, 0, 0]} material={mats.coat}>
            <cylinderGeometry args={[0.17, 0.13, 0.14, 10, 1, true, Math.PI * 0.65, Math.PI * 1.7]} />
          </mesh>
          <mesh position={[0, 0.32, -0.04]} rotation={[-0.18, 0, 0]} material={mats.trim}>
            <torusGeometry args={[0.165, 0.01, 6, 14, Math.PI * 1.4]} />
          </mesh>

          {/* Diagonal chest belt + iconic 3-pronged silver clasp on right chest */}
          <mesh position={[0, 0.02, 0.116]} rotation={[0, 0, -0.58]} material={mats.coat}>
            <boxGeometry args={[0.36, 0.048, 0.018]} />
          </mesh>
          <mesh position={[0, 0.02, 0.126]} rotation={[0, 0, -0.58]} material={mats.trim}>
            <boxGeometry args={[0.36, 0.012, 0.008]} />
          </mesh>
          <group position={[-0.085, 0.08, 0.128]}>
            <mesh material={mats.buckle}>
              <cylinderGeometry args={[0.048, 0.048, 0.018, 6]} />
            </mesh>
            {[0, 2.09, 4.18].map((ang) => (
              <mesh
                key={ang}
                position={[Math.cos(ang) * 0.042, Math.sin(ang) * 0.042, 0.004]}
                rotation={[Math.PI / 2, 0, 0]}
                material={mats.buckle}
              >
                <cylinderGeometry args={[0.018, 0.018, 0.018, 8]} />
              </mesh>
            ))}
          </group>

          {/* Waist belt + silver rectangular buckle */}
          <mesh position={[0, -0.21, 0.005]} material={mats.boot}>
            <boxGeometry args={[0.365, 0.062, 0.22]} />
          </mesh>
          <mesh position={[0, -0.21, 0.122]} material={mats.buckle}>
            <boxGeometry args={[0.09, 0.055, 0.02]} />
          </mesh>

          {/* Elucidator (Black Sword) slung diagonally behind the back, hilt over right shoulder */}
          <group position={[-0.03, 0.04, -0.155]} rotation={[0.06, 0, 0.44]}>
            {/* Dark sheath */}
            <mesh position={[0, -0.1, 0]} material={mats.swordBlade}>
              <boxGeometry args={[0.062, 0.92, 0.028]} />
            </mesh>
            <mesh position={[0, -0.54, 0]} material={mats.swordSilver}>
              <boxGeometry args={[0.066, 0.06, 0.032]} />
            </mesh>
            {/* Crossguard */}
            <mesh position={[0, 0.37, 0]} material={mats.swordSilver}>
              <boxGeometry args={[0.21, 0.042, 0.04]} />
            </mesh>
            {/* Hilt & pommel */}
            <mesh position={[0, 0.51, 0]} material={mats.swordBlade}>
              <cylinderGeometry args={[0.02, 0.022, 0.24, 8]} />
            </mesh>
            <mesh position={[0, 0.64, 0]} material={mats.swordSilver}>
              <octahedronGeometry args={[0.034, 0]} />
            </mesh>
          </group>
        </group>

        {/* Flowing split long-coat tails below waist */}
        <group position={[0, 0.84, 0]}>
          <group ref={coatTailBackRef} position={[0, 0, -0.095]}>
            <mesh position={[0, -0.34, -0.02]} material={mats.coat}>
              <boxGeometry args={[0.38, 0.68, 0.04]} />
            </mesh>
            <mesh position={[0, -0.68, -0.02]} material={mats.trim}>
              <boxGeometry args={[0.38, 0.02, 0.044]} />
            </mesh>
          </group>
          <group ref={coatTailLRef} position={[0.17, 0, 0.01]}>
            <mesh position={[0.02, -0.33, 0]} material={mats.coat}>
              <boxGeometry args={[0.06, 0.66, 0.21]} />
            </mesh>
            <mesh position={[0.024, -0.33, 0.106]} material={mats.trim}>
              <boxGeometry args={[0.056, 0.66, 0.014]} />
            </mesh>
          </group>
          <group ref={coatTailRRef} position={[-0.17, 0, 0.01]}>
            <mesh position={[-0.02, -0.33, 0]} material={mats.coat}>
              <boxGeometry args={[0.06, 0.66, 0.21]} />
            </mesh>
            <mesh position={[-0.024, -0.33, 0.106]} material={mats.trim}>
              <boxGeometry args={[0.056, 0.66, 0.014]} />
            </mesh>
          </group>
        </group>

        {/* Neck & Head with Canvas2D anime face + spiky layered black hair */}
        <mesh position={[0, 1.34, 0]} material={mats.skin}>
          <cylinderGeometry args={[0.055, 0.062, 0.1, 8]} />
        </mesh>
        <group ref={headRef} position={[0, 1.49, 0]}>
          <mesh material={mats.skin}>
            <sphereGeometry args={[0.155, 16, 14]} />
          </mesh>
          {/* Anime Face Front Plane curved nicely onto face */}
          <mesh position={[0, -0.01, 0.132]} material={mats.face}>
            <circleGeometry args={[0.125, 18]} />
          </mesh>
          {/* Hair cap & layered anime spikes */}
          <mesh position={[0, 0.035, -0.02]} material={mats.hair}>
            <sphereGeometry args={[0.168, 14, 12]} />
          </mesh>
          {/* Center & side spiky bangs framing the eyes */}
          {[
            [0, 0.08, 0.145, 0.35, 0, 0, 0.05, 0.14],
            [-0.075, 0.07, 0.132, 0.25, -0.25, 0.22, 0.048, 0.15],
            [0.075, 0.07, 0.132, 0.25, 0.25, -0.22, 0.048, 0.15],
            [-0.135, 0.01, 0.065, 0.1, -0.6, 0.28, 0.05, 0.18],
            [0.135, 0.01, 0.065, 0.1, 0.6, -0.28, 0.05, 0.18],
            [0, -0.01, -0.145, -0.25, 0, 0, 0.09, 0.2],
            [-0.08, 0.02, -0.135, -0.2, 0.35, 0.15, 0.06, 0.18],
            [0.08, 0.02, -0.135, -0.2, -0.35, -0.15, 0.06, 0.18],
          ].map(([x, y, z, rx, ry, rz, rad, len], idx) => (
            <mesh key={idx} position={[x, y, z]} rotation={[rx, ry, rz]} material={mats.hair}>
              <coneGeometry args={[rad, len, 5]} />
            </mesh>
          ))}
        </group>

        {/* Left Arm (with iconic round metallic-grey shoulder badge on upper sleeve) */}
        <group ref={leftArmRef} position={[0.235, 1.25, 0]}>
          <mesh position={[0.042, -0.05, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.buckle}>
            <cylinderGeometry args={[0.042, 0.042, 0.022, 10]} />
          </mesh>
          <mesh position={[0, -0.21, 0]} material={mats.coat}>
            <boxGeometry args={[0.105, 0.46, 0.115]} />
          </mesh>
          <mesh position={[0, -0.41, 0]} material={mats.trim}>
            <boxGeometry args={[0.112, 0.022, 0.12]} />
          </mesh>
          <mesh position={[0, -0.47, 0]} material={mats.boot}>
            <boxGeometry args={[0.086, 0.08, 0.09]} />
          </mesh>
          <mesh position={[0, -0.52, 0]} material={mats.skin}>
            <boxGeometry args={[0.072, 0.042, 0.075]} />
          </mesh>
        </group>

        {/* Right Arm */}
        <group ref={rightArmRef} position={[-0.235, 1.25, 0]}>
          <mesh position={[0, -0.21, 0]} material={mats.coat}>
            <boxGeometry args={[0.105, 0.46, 0.115]} />
          </mesh>
          <mesh position={[0, -0.41, 0]} material={mats.trim}>
            <boxGeometry args={[0.112, 0.022, 0.12]} />
          </mesh>
          <mesh position={[0, -0.47, 0]} material={mats.boot}>
            <boxGeometry args={[0.086, 0.08, 0.09]} />
          </mesh>
          <mesh position={[0, -0.52, 0]} material={mats.skin}>
            <boxGeometry args={[0.072, 0.042, 0.075]} />
          </mesh>
        </group>

        {/* Left & Right Legs + Silver-Grey Cuffed Boots */}
        {[
          { ref: leftLegRef, x: 0.095, key: 'leg-l' },
          { ref: rightLegRef, x: -0.095, key: 'leg-r' },
        ].map(({ ref, x, key }) => (
          <group key={key} ref={ref} position={[x, 0.82, 0]}>
            <mesh position={[0, -0.3, 0]} material={mats.shirt}>
              <boxGeometry args={[0.125, 0.56, 0.14]} />
            </mesh>
            {/* Silver-grey boot cuff + dark leather boot touching exact Y = 0 */}
            <mesh position={[0, -0.61, 0.005]} material={mats.buckle}>
              <boxGeometry args={[0.142, 0.11, 0.155]} />
            </mesh>
            <mesh position={[0, -0.74, 0.032]} material={mats.boot}>
              <boxGeometry args={[0.14, 0.16, 0.22]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
