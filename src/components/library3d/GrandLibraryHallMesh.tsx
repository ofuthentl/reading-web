import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import type { LibraryMaterialBundle } from './proceduralMaterials';
import type { WorldMaterialBundle } from './worldMaterials';
import {
  buildGrandLibraryGeometries,
  createRoyalCarpetTexture,
} from './grandLibraryBuilder';

export interface GrandLibraryHallMeshProps {
  theme: AppTheme;
  libraryMaterials: LibraryMaterialBundle;
  worldMaterials: WorldMaterialBundle;
}

/**
 * Renders Floor 3's two-story European Cathedral Grand Library (`starfield_atrium`, `D-022`):
 * towering walnut perimeter bookcases packed with 1,800+ instanced antique leather books,
 * mezzanine gallery balconies with brass railings & ladders, glowing stained-glass cathedral
 * windows + rose window, curved Gothic vault ribs, royal crimson carpet runner, and hanging
 * brass chandeliers — guaranteeing a true Grand Library atmosphere even with 0 user books on Floor 3.
 */
export function GrandLibraryHallMesh({
  theme,
  libraryMaterials,
  worldMaterials,
}: GrandLibraryHallMeshProps) {
  const booksInstancedRef = useRef<THREE.InstancedMesh | null>(null);
  const geoms = useMemo(() => buildGrandLibraryGeometries(), []);
  const carpetTex = useMemo(() => createRoyalCarpetTexture(), []);
  const unitBookGeom = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useEffect(() => {
    return () => {
      geoms.woodDark.dispose();
      geoms.woodTrim.dispose();
      geoms.brass.dispose();
      geoms.windowGlass.dispose();
      geoms.lampGlow.dispose();
      geoms.emeraldShades.dispose();
      geoms.stoneTrim.dispose();
      geoms.skylightGlass.dispose();
      carpetTex.dispose();
      unitBookGeom.dispose();
    };
  }, [geoms, carpetTex, unitBookGeom]);

  const mats = useMemo(() => {
    const isNight = theme === 'midnight';
    const isDusk = theme === 'dim';
    const winColor = isNight ? '#7cb3f5' : isDusk ? '#ffb876' : '#fff4d6';
    const winIntensity = isNight ? 1.15 : isDusk ? 1.45 : 1.05;

    return {
      carpet: new THREE.MeshStandardMaterial({
        map: carpetTex,
        roughness: 0.92,
        metalness: 0.04,
      }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: winColor,
        emissive: winColor,
        emissiveIntensity: winIntensity,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      }),
      emeraldShade: new THREE.MeshStandardMaterial({
        color: '#107a4b',
        emissive: '#059669',
        emissiveIntensity: isNight ? 0.95 : 0.45,
        roughness: 0.25,
        metalness: 0.1,
      }),
      wallBooks: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.72,
        metalness: 0.08,
      }),
    };
  }, [theme, carpetTex]);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  // Populate 1,800+ antique decorative books into 1 InstancedMesh draw call
  useEffect(() => {
    const mesh = booksInstancedRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const list = geoms.wallBooks;
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.yaw, b.tilt);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(b.color);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [geoms.wallBooks]);

  const lm = libraryMaterials.materials;
  const wm = worldMaterials.materials;
  const chandelierIntensity = theme === 'midnight' ? 16 : theme === 'dim' ? 12.5 : 5.5;
  const chandelierColor = theme === 'midnight' ? '#ffd591' : '#ffe4b5';

  return (
    <group name="grand-library-cathedral-hall">
      <mesh geometry={geoms.stoneTrim} material={wm.stone} castShadow receiveShadow />
      <mesh geometry={geoms.woodDark} material={lm.woodCabinet} castShadow receiveShadow />
      <mesh geometry={geoms.woodTrim} material={lm.woodCrown} receiveShadow />
      <mesh geometry={geoms.brass} material={lm.brassTrim} />
      <mesh geometry={geoms.lampGlow} material={lm.lanternGlow} />
      <mesh geometry={geoms.emeraldShades} material={mats.emeraldShade} />
      <mesh geometry={geoms.windowGlass} material={mats.windowGlass} />
      <mesh geometry={geoms.skylightGlass} material={wm.glassDome} />

      {/* 1,800+ packed antique leather books across both tiers in 1 single InstancedMesh */}
      <instancedMesh
        ref={booksInstancedRef}
        args={[unitBookGeom, mats.wallBooks, geoms.wallBooks.length]}
        frustumCulled={false}
      />

      {/* Royal crimson-and-gold woven carpet runner down the central nave & upper terrace */}
      <mesh position={[0, 0.016, 2.75]} rotation={[-Math.PI / 2, 0, 0]} material={mats.carpet} receiveShadow>
        <planeGeometry args={[4.4, 29.4]} />
      </mesh>
      <mesh position={[0, 1.818, -20.8]} rotation={[-Math.PI / 2, 0, 0]} material={mats.carpet} receiveShadow>
        <planeGeometry args={[4.4, 6.2]} />
      </mesh>

      {/* Warm golden chandelier point lights illuminating both gallery tiers */}
      {geoms.chandelierPositions.map(([cx, cy, cz], idx) => (
        <pointLight
          key={`chandelier-${idx}`}
          color={chandelierColor}
          intensity={chandelierIntensity}
          distance={24}
          decay={1.45}
          position={[cx, cy - 0.6, cz]}
        />
      ))}
    </group>
  );
}
