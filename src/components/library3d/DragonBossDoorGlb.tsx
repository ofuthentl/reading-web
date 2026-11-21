import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import type { LoadedGlbTemplate } from './gltfLoader';
import {
  computeFitTransform,
  disposeClonedMaterials,
  prepareGlbProp,
  type PrepareGlbOptions,
} from './furnitureGlbHelpers';

export interface FittedGlbProps {
  template: LoadedGlbTemplate;
  position: [number, number, number];
  rotationY?: number;
  targetSize: [number, number, number] | number;
  maxAniso: number;
  hidePattern?: RegExp;
  onlyPattern?: RegExp;
  tints?: PrepareGlbOptions['tints'];
}

/** Renders a cached local `.glb` template auto-centered, grounded at `Y = 0`, and scaled cleanly. */
export function FittedGlb({
  template,
  position,
  rotationY = 0,
  targetSize,
  maxAniso,
  hidePattern,
  onlyPattern,
  tints,
}: FittedGlbProps) {
  const isUniform = typeof targetSize === 'number';
  const tx = isUniform ? targetSize : targetSize[0];
  const ty = isUniform ? targetSize : targetSize[1];
  const tz = isUniform ? targetSize : targetSize[2];

  const prep = useMemo(() => {
    const p = prepareGlbProp(template, { maxAniso, hidePattern, onlyPattern, tints });
    const fit = computeFitTransform(p, isUniform ? tx : [tx, ty, tz]);
    return { ...p, ...fit };
  }, [template, maxAniso, hidePattern, onlyPattern, tints, isUniform, tx, ty, tz]);

  useEffect(() => {
    return () => {
      disposeClonedMaterials(prep.clonedMaterials);
    };
  }, [prep.clonedMaterials]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group position={prep.offset} scale={prep.scale}>
        <primitive object={prep.instance} />
      </group>
    </group>
  );
}

export interface DragonBossDoorGlbProps {
  position: [number, number, number];
  facingYaw: number;
  template: LoadedGlbTemplate;
  maxAniso: number;
  unlocked: boolean;
  theme: AppTheme;
  paused: boolean;
  prefersReducedMotion: boolean;
}

/**
 * Ancient Carved Dragon Stone Boss Door (`prop-dragon-door.glb`) framed by twin stone braziers
 * and an animated crimson-locked / emerald-unlocked magical barrier seal (`D-023`).
 */
export function DragonBossDoorGlb({
  position,
  facingYaw,
  template,
  maxAniso,
  unlocked,
  theme,
  paused,
  prefersReducedMotion,
}: DragonBossDoorGlbProps) {
  const ringRef = useRef<THREE.Mesh | null>(null);
  const sealMats = useMemo(() => {
    const tint = unlocked ? '#2dd4bf' : '#f59e0b';
    const emissive = unlocked ? '#14b8a6' : '#dc2626';
    return {
      ring: new THREE.MeshStandardMaterial({
        color: tint,
        emissive,
        emissiveIntensity: unlocked ? 1.55 : 1.35,
        roughness: 0.25,
        metalness: 0.15,
      }),
      curtain: new THREE.MeshBasicMaterial({
        color: unlocked ? '#14b8a6' : '#991b1b',
        transparent: true,
        opacity: unlocked ? 0.34 : 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    };
  }, [unlocked]);

  useEffect(() => {
    return () => {
      sealMats.ring.dispose();
      sealMats.curtain.dispose();
    };
  }, [sealMats]);

  useFrame((state, delta) => {
    if (paused || prefersReducedMotion || !ringRef.current) return;
    ringRef.current.rotation.z += Math.min(delta, 0.05) * (unlocked ? 0.95 : -0.35);
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.05;
    ringRef.current.scale.set(pulse, pulse, 1);
  });

  return (
    <group position={position} rotation={[0, facingYaw, 0]} name="dragon-boss-door-glb">
      <FittedGlb template={template} position={[0, 0, 0]} targetSize={5.1} maxAniso={maxAniso} />
      <mesh position={[0, 1.9, 0.14]} material={sealMats.curtain}>
        <planeGeometry args={[1.65, 3.1]} />
      </mesh>
      <mesh ref={ringRef} position={[0, 2.05, 0.22]} material={sealMats.ring}>
        <torusGeometry args={[0.68, 0.055, 8, 28]} />
      </mesh>
      {[-1.95, 1.95].map((bx) => (
        <group key={bx} position={[bx, 0, 0.62]}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.16, 0.26, 1.1, 8]} />
            <meshStandardMaterial color="#3c3734" roughness={0.86} metalness={0.14} />
          </mesh>
          <mesh position={[0, 1.18, 0]}>
            <cylinderGeometry args={[0.3, 0.16, 0.22, 8]} />
            <meshStandardMaterial color="#4a4035" roughness={0.55} metalness={0.55} />
          </mesh>
          <mesh position={[0, 1.44, 0]} material={sealMats.ring}>
            <octahedronGeometry args={[0.16, 0]} />
          </mesh>
        </group>
      ))}
      <pointLight
        color={unlocked ? '#2dd4bf' : '#f97316'}
        intensity={theme === 'midnight' ? 7.2 : 3.6}
        distance={12}
        decay={1.65}
        position={[0, 2.4, 1.45]}
      />
    </group>
  );
}
