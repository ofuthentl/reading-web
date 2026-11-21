import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cloneGlbTemplate, useLocalGlb } from './gltfLoader';
import type { FloorWorldLayout3D, PlayerMotionState } from './worldTypes';

const STORMTERROR_URL = `${import.meta.env.BASE_URL ?? '/'}models/boss-stormterror.glb`;
const TARGET_DRAGON_HEIGHT = 4.8;
const WINGBEAT_SPEED = 2.45;
const HOVER_LIFT_Y = 1.25;

export interface StormterrorBossGlbProps {
  floor: FloorWorldLayout3D;
  playerMotionRef?: MutableRefObject<PlayerMotionState>;
  paused: boolean;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}

interface StormterrorUniforms {
  uTime: { value: number };
}

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

/**
 * Patches a cloned `MeshStandardMaterial` with a GPU vertex shader that animates Stormterror's
 * 6 wings (`Object_2`, with progressive span + front-to-rear wing ripple), whipping tail + tail fins,
 * swaying neck/head, and dangling claws in unified dragon-root space so body, spines, and crystals
 * stay 100% locked together without tearing (`0` extra `.glb` bytes, `0` CDN).
 */
function attachDragonFlightShader(
  material: THREE.MeshStandardMaterial,
  rootMatrix: THREE.Matrix4,
  isWingMesh: boolean,
  sharedUniforms: StormterrorUniforms,
): void {
  const invRootMatrix = rootMatrix.clone().invert();
  const rootUniform = { value: rootMatrix.clone() };
  const invRootUniform = { value: invRootMatrix };
  const wingFlag = { value: isWingMesh ? 1.0 : 0.0 };

  material.customProgramCacheKey = () =>
    isWingMesh ? 'stormterror-flight-wing-v1' : 'stormterror-flight-body-v1';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uRootMat = rootUniform;
    shader.uniforms.uInvRootMat = invRootUniform;
    shader.uniforms.uIsWing = wingFlag;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform mat4 uRootMat;
uniform mat4 uInvRootMat;
uniform float uIsWing;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec3 rp = (uRootMat * vec4(transformed, 1.0)).xyz;
vec3 dp = vec3(0.0);

if (uIsWing > 0.5) {
  // 6 Anemo wings (X in [-45.9, +45.9], Z in [-24.5, +34.4]): staggered flexible wingbeats
  float wingT = clamp((abs(rp.x) - 4.2) / 41.5, 0.0, 1.0);
  float wingCurve = wingT * sqrt(wingT);
  float wingSq = wingT * wingT;
  float zLag = clamp((26.0 - rp.z) / 52.0, 0.0, 1.0);
  float phase = uTime * ${WINGBEAT_SPEED.toFixed(2)} - wingT * 1.18 - zLag * 0.68;
  float flap = sin(phase);
  float wLift = flap * wingCurve * 16.0;
  float wTuck = -sign(rp.x) * (flap * flap) * wingSq * 4.2;
  float wSweep = cos(phase) * wingCurve * 3.6;
  dp += vec3(wTuck, wLift, wSweep);
} else {
  // Serpentine tail & flared tail-fins whip (Z < -20 -> -77.4)
  float tailT = clamp((-rp.z - 20.0) / 57.0, 0.0, 1.0);
  if (tailT > 0.0) {
    float tailCurve = tailT * sqrt(tailT);
    float tailX = sin(uTime * 2.15 - tailT * 3.6) * tailCurve * 11.5;
    float tailY = cos(uTime * ${WINGBEAT_SPEED.toFixed(2)} - tailT * 2.3) * tailCurve * 5.2;
    dp += vec3(tailX, tailY, 0.0);
  }
  // Regal neck & dragon head breathing + arena gaze sweep (Z > +16 -> +39.4)
  float neckT = clamp((rp.z - 16.0) / 23.5, 0.0, 1.0);
  if (neckT > 0.0) {
    float neckCurve = neckT * sqrt(neckT);
    float headX = sin(uTime * 0.92) * neckCurve * 4.4;
    float headY =
      sin(uTime * ${WINGBEAT_SPEED.toFixed(2)} - 0.55) * neckCurve * 2.6 +
      sin(uTime * 0.62) * (neckT * neckT) * 2.1;
    dp += vec3(headX, headY, 0.0);
  }
  // Subtle suspended claw drift below torso while hovering
  float clawT = clamp((7.5 - rp.y) / 9.5, 0.0, 1.0) * (1.0 - tailT) * (1.0 - neckT);
  dp.z += sin(uTime * ${WINGBEAT_SPEED.toFixed(2)} + 0.8) * clawT * 1.4;
}

transformed = (uInvRootMat * vec4(rp + dp, 1.0)).xyz;`,
      );
  };
  material.needsUpdate = true;
}

/**
 * Animated Floor 4 Boss Sentinel (**Phong Long Stormterror**):
 * combines GPU-driven flexible 6-wing flapping, serpentine tail whip, and breathing neck/head
 * with smooth figure-8 aerial hovering, banking roll, gaze tracking toward Kirito, and pulsing
 * Anemo wind aura (strictly frozen at `0 FPS` when paused or `prefers-reduced-motion`).
 */
export function StormterrorBossGlb({
  floor,
  playerMotionRef,
  paused,
  prefersReducedMotion,
  requestRender,
}: StormterrorBossGlbProps) {
  const { gl } = useThree();
  const { template } = useLocalGlb(STORMTERROR_URL);

  const flightRef = useRef<THREE.Group | null>(null);
  const auraLightRef = useRef<THREE.PointLight | null>(null);
  const windRingRef = useRef<THREE.Mesh | null>(null);
  const timeRef = useRef(0);
  const yawRef = useRef(floor.bossYaw);
  const sharedUniforms = useMemo<StormterrorUniforms>(() => ({ uTime: { value: 0 } }), []);

  const prepared = useMemo(() => {
    if (!template) return null;
    const instance = cloneGlbTemplate(template);
    instance.updateMatrixWorld(true);
    const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const clonedMaterials: THREE.Material[] = [];
    const crystalMaterials: THREE.MeshStandardMaterial[] = [];

    instance.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = !prefersReducedMotion;
      obj.receiveShadow = true;
      obj.frustumCulled = false;

      const isWing = obj.name === 'Object_2';
      const isCrystal = obj.name === 'Object_4';
      const rawMats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const nextMats = rawMats.map((raw) => {
        const cloned = raw.clone() as THREE.MeshStandardMaterial;
        clonedMaterials.push(cloned);
        if (cloned.map) cloned.map.anisotropy = maxAniso;
        if (cloned.normalMap) cloned.normalMap.anisotropy = maxAniso;
        if (isCrystal) {
          cloned.emissive.set('#38bdf8');
          cloned.emissiveIntensity = 1.1;
          crystalMaterials.push(cloned);
        }
        attachDragonFlightShader(cloned, obj.matrixWorld, isWing, sharedUniforms);
        return cloned;
      });
      obj.material = Array.isArray(obj.material) ? nextMats : nextMats[0];
    });

    const rawH = Math.max(0.01, template.bbox.size[1]);
    const scale = TARGET_DRAGON_HEIGHT / rawH;
    const groundedY = floor.bossAnchor[1] - template.bbox.min[1] * scale;

    return { instance, scale, groundedY, clonedMaterials, crystalMaterials };
  }, [template, gl, prefersReducedMotion, floor.bossAnchor, sharedUniforms]);

  useEffect(() => {
    if (!prepared) return undefined;
    requestRender?.();
    return () => {
      for (let i = 0; i < prepared.clonedMaterials.length; i += 1) {
        prepared.clonedMaterials[i].dispose();
      }
    };
  }, [prepared, requestRender]);

  const windRing = useMemo(() => {
    const geometry = new THREE.RingGeometry(2.6, 3.85, 48);
    const material = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return { geometry, material };
  }, []);

  useEffect(() => {
    return () => {
      windRing.geometry.dispose();
      windRing.material.dispose();
    };
  }, [windRing]);

  useFrame((_, delta) => {
    if (paused || !prepared || !flightRef.current) return;
    if (prefersReducedMotion) {
      sharedUniforms.uTime.value = 0;
      return;
    }

    const dt = Math.min(delta, 0.05);
    timeRef.current += dt;
    const t = timeRef.current;
    sharedUniforms.uTime.value = t;

    // Figure-8 aerial patrol glide + Newton's-3rd-law vertical hover thrust synced to wingbeats
    const [bx, , bz] = floor.bossAnchor;
    const glideX = Math.sin(t * 0.42) * 3.1;
    const glideZ = Math.sin(t * 0.84) * 0.95;
    const hoverBob = Math.cos(t * WINGBEAT_SPEED) * 0.42;

    const curX = bx + glideX;
    const curY = prepared.groundedY + HOVER_LIFT_Y + hoverBob;
    const curZ = bz + glideZ;
    flightRef.current.position.set(curX, curY, curZ);

    // Smoothly track Kirito's position with majestic clamped yaw + banking roll into glide turns
    let desiredYaw = floor.bossYaw + Math.sin(t * 0.42) * 0.22;
    if (playerMotionRef) {
      const [px, , pz] = playerMotionRef.current.position;
      const toPlayerYaw = Math.atan2(px - curX, pz - curZ);
      const rel = Math.max(-0.95, Math.min(0.95, toPlayerYaw - floor.bossYaw));
      desiredYaw = floor.bossYaw + rel;
    }
    yawRef.current = lerpAngle(yawRef.current, desiredYaw, Math.min(1, dt * 1.8));

    const bankRoll = -Math.cos(t * 0.42) * 0.14;
    const pitchHover = 0.08 + Math.sin(t * WINGBEAT_SPEED) * 0.045;
    flightRef.current.rotation.set(pitchHover, yawRef.current, bankRoll);

    // Pulse Anemo crystals, wind ring downdraft, and turquoise aura light in rhythm with wingbeats
    const pulse = 0.5 + 0.5 * Math.sin(t * WINGBEAT_SPEED);
    for (let i = 0; i < prepared.crystalMaterials.length; i += 1) {
      prepared.crystalMaterials[i].emissiveIntensity = 0.75 + pulse * 0.85;
    }
    if (auraLightRef.current) {
      auraLightRef.current.position.set(curX, curY + 1.8, curZ + 2.0);
      auraLightRef.current.intensity = 6.2 + pulse * 2.8;
    }
    if (windRingRef.current) {
      windRingRef.current.position.set(curX, floor.bossAnchor[1] + 0.04, curZ);
      const ringScale = 0.92 + (1 - pulse) * 0.22;
      windRingRef.current.scale.set(ringScale, ringScale, 1);
      windRingRef.current.rotation.z += dt * 0.75;
      windRing.material.opacity = 0.16 + (1 - pulse) * 0.22;
    }
  });

  if (!prepared) return null;

  const [bx, by, bz] = floor.bossAnchor;

  return (
    <group name="boss-room-guardian-stormterror">
      <group
        ref={flightRef}
        position={[bx, prepared.groundedY + HOVER_LIFT_Y, bz]}
        rotation={[0.08, floor.bossYaw, 0]}
        scale={[prepared.scale, prepared.scale, prepared.scale]}
      >
        <primitive object={prepared.instance} />
      </group>

      {/* Anemo downdraft wind ring pulsing beneath Stormterror's wings */}
      <mesh
        ref={windRingRef}
        position={[bx, by + 0.04, bz]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={windRing.geometry}
        material={windRing.material}
      />

      <pointLight
        ref={auraLightRef}
        color="#38bdf8"
        intensity={7.2}
        distance={18}
        decay={1.6}
        position={[bx, by + 3.2, bz + 2.2]}
      />
    </group>
  );
}
