import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { cloneGlbTemplate, useLocalGlb, type LoadedGlbTemplate } from './gltfLoader';
import type { FloorWorldLayout3D } from './worldTypes';

export interface WorldFurnitureGlbsProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  bossDoorUnlocked: boolean;
  paused: boolean;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}

const BASE = import.meta.env.BASE_URL ?? '/';
const TABLE_URL = `${BASE}models/prop-library-table.glb`;
const CHAIR_URL = `${BASE}models/prop-library-chair.glb`;
const BOOK_PILE_URL = `${BASE}models/prop-book-pile.glb`;
const DRAGON_DOOR_URL = `${BASE}models/prop-dragon-door.glb`;
const STONE_WELL_URL = `${BASE}models/prop-stone-well.glb`;
const STONE_PLATFORM_URL = `${BASE}models/prop-stone-platform.glb`;

interface PreparedGlbBounds {
  instance: THREE.Object3D;
  size: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
}

function prepareGlbInstance(
  template: LoadedGlbTemplate,
  maxAniso: number,
  hideMeshPattern?: RegExp,
): PreparedGlbBounds {
  const instance = cloneGlbTemplate(template);
  instance.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();

  instance.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (hideMeshPattern && hideMeshPattern.test(obj.name)) {
      obj.visible = false;
      return;
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
    meshBox.setFromObject(obj);
    box.union(meshBox);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (let i = 0; i < mats.length; i += 1) {
      const m = mats[i] as THREE.MeshStandardMaterial | undefined;
      if (m?.map) m.map.anisotropy = maxAniso;
    }
  });

  if (box.isEmpty()) box.setFromObject(instance);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return {
    instance,
    size,
    center,
    minY: Number.isFinite(box.min.y) ? box.min.y : 0,
  };
}

/**
 * Renders a real PBR antique wooden reading table or librarian desk (`prop-library-table.glb`)
 * topped with a real stack of antique books (`prop-book-pile.glb`), replacing procedural boxes.
 */
function LibraryTableStationGlb({
  position,
  facingYaw,
  targetHeight,
  tableTemplate,
  pileTemplate,
  maxAniso,
}: {
  position: [number, number, number];
  facingYaw: number;
  targetHeight: number;
  tableTemplate: LoadedGlbTemplate;
  pileTemplate: LoadedGlbTemplate | null;
  maxAniso: number;
}) {
  const table = useMemo(() => {
    const p = prepareGlbInstance(tableTemplate, maxAniso);
    const sy = targetHeight / Math.max(0.01, p.size.y);
    // Keep table footprint neatly matching existing station collider (~1.95 m x 1.0 m)
    const sx = Math.min(sy * 0.72, 2.0 / Math.max(0.01, p.size.x));
    const sz = Math.min(sy * 0.76, 1.02 / Math.max(0.01, p.size.z));
    return {
      instance: p.instance,
      scale: [sx, sy, sz] as [number, number, number],
      offset: [-p.center.x * sx, -p.minY * sy, -p.center.z * sz] as [number, number, number],
    };
  }, [tableTemplate, maxAniso, targetHeight]);

  const pile = useMemo(() => {
    if (!pileTemplate) return null;
    const p = prepareGlbInstance(pileTemplate, maxAniso);
    const s = 0.62 / Math.max(0.01, p.size.x);
    return {
      instance: p.instance,
      scale: s,
      offset: [-p.center.x * s, -p.minY * s, -p.center.z * s] as [number, number, number],
    };
  }, [pileTemplate, maxAniso]);

  return (
    <group position={position} rotation={[0, facingYaw, 0]}>
      <group position={table.offset} scale={table.scale}>
        <primitive object={table.instance} />
      </group>
      {pile && (
        <group position={[0.18, targetHeight - 0.01, -0.05]} rotation={[0, 0.35, 0]}>
          <group position={pile.offset} scale={pile.scale}>
            <primitive object={pile.instance} />
          </group>
        </group>
      )}
    </group>
  );
}

/**
 * Replaces procedural wooden bench blocks with a pair of carved real PBR library wooden chairs
 * (`prop-library-chair.glb`), facing cleanly toward the adjacent reading table.
 */
function LibraryChairPairGlb({
  position,
  rotationY,
  template,
  maxAniso,
}: {
  position: [number, number, number];
  rotationY: number;
  template: LoadedGlbTemplate;
  maxAniso: number;
}) {
  const pair = useMemo(() => {
    const left = prepareGlbInstance(template, maxAniso);
    const right = prepareGlbInstance(template, maxAniso);
    const s = 0.94 / Math.max(0.01, left.size.y);
    return { left, right, s };
  }, [template, maxAniso]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group position={[-0.46, 0, 0]} rotation={[0, 0.08, 0]}>
        <group
          position={[-pair.left.center.x * pair.s, -pair.left.minY * pair.s, -pair.left.center.z * pair.s]}
          scale={pair.s}
        >
          <primitive object={pair.left.instance} />
        </group>
      </group>
      <group position={[0.46, 0, 0]} rotation={[0, -0.08, 0]}>
        <group
          position={[-pair.right.center.x * pair.s, -pair.right.minY * pair.s, -pair.right.center.z * pair.s]}
          scale={pair.s}
        >
          <primitive object={pair.right.instance} />
        </group>
      </group>
    </group>
  );
}

/**
 * Replaces the blocky procedural Boss Door with the real carved Ancient Dragon Stone Portal
 * (`prop-dragon-door.glb`), paired with a pulsing crimson-locked / emerald-unlocked magic seal.
 */
function DragonBossDoorGlb({
  position,
  facingYaw,
  template,
  maxAniso,
  unlocked,
  theme,
  paused,
  prefersReducedMotion,
}: {
  position: [number, number, number];
  facingYaw: number;
  template: LoadedGlbTemplate;
  maxAniso: number;
  unlocked: boolean;
  theme: AppTheme;
  paused: boolean;
  prefersReducedMotion: boolean;
}) {
  const ringRef = useRef<THREE.Mesh | null>(null);
  const door = useMemo(() => {
    const p = prepareGlbInstance(template, maxAniso);
    const targetH = 5.1;
    const s = targetH / Math.max(0.01, p.size.y);
    return {
      instance: p.instance,
      s,
      offset: [-p.center.x * s, -p.minY * s, -p.center.z * s] as [number, number, number],
    };
  }, [template, maxAniso]);

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
      <group position={door.offset} scale={door.s}>
        <primitive object={door.instance} />
      </group>
      {/* Glowing magical barrier plane, animated lock/unlock seal & twin flanking braziers */}
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

function StaticCenteredGlb({
  template,
  position,
  rotationY = 0,
  targetSize,
  maxAniso,
}: {
  template: LoadedGlbTemplate;
  position: [number, number, number];
  rotationY?: number;
  targetSize: [number, number, number] | number;
  maxAniso: number;
}) {
  const prep = useMemo(() => {
    const p = prepareGlbInstance(template, maxAniso);
    let sx: number;
    let sy: number;
    let sz: number;
    if (typeof targetSize === 'number') {
      const s = targetSize / Math.max(0.01, p.size.y);
      sx = s;
      sy = s;
      sz = s;
    } else {
      sx = targetSize[0] / Math.max(0.01, p.size.x);
      sy = targetSize[1] / Math.max(0.01, p.size.y);
      sz = targetSize[2] / Math.max(0.01, p.size.z);
    }
    return {
      instance: p.instance,
      scale: [sx, sy, sz] as [number, number, number],
      offset: [-p.center.x * sx, -p.minY * sy, -p.center.z * sz] as [number, number, number],
    };
  }, [template, maxAniso, targetSize]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group position={prep.offset} scale={prep.scale}>
        <primitive object={prep.instance} />
      </group>
    </group>
  );
}

/**
 * Replaces procedural box furniture & Boss doors across all 4 Aincrad floors with real compressed
 * PBR `.glb` assets (library tables, carved chairs, antique book piles, ancient dragon stone
 * Boss Door, medieval stone well, and carved stone summit platforms, `D-023`).
 */
export function WorldFurnitureGlbs({
  floor,
  theme,
  bossDoorUnlocked,
  paused,
  prefersReducedMotion,
  requestRender,
}: WorldFurnitureGlbsProps) {
  const { gl } = useThree();
  const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());

  const { template: tableTpl } = useLocalGlb(TABLE_URL);
  const { template: chairTpl } = useLocalGlb(CHAIR_URL);
  const { template: pileTpl } = useLocalGlb(BOOK_PILE_URL);
  const { template: dragonDoorTpl } = useLocalGlb(DRAGON_DOOR_URL);
  const { template: wellTpl } = useLocalGlb(
    floor.biomeId === 'sakura_shrine' ? STONE_WELL_URL : null,
  );
  const { template: platformTpl } = useLocalGlb(
    floor.biomeId === 'sakura_shrine' || floor.biomeId === 'starlight_ruins'
      ? STONE_PLATFORM_URL
      : null,
  );

  useEffect(() => {
    if (tableTpl || chairTpl || pileTpl || dragonDoorTpl || wellTpl || platformTpl) {
      requestRender?.();
    }
  }, [tableTpl, chairTpl, pileTpl, dragonDoorTpl, wellTpl, platformTpl, requestRender]);

  const deskStations = useMemo(
    () =>
      floor.stations.filter(
        (s) => s.kind === 'reading_table' || s.kind === 'librarian_desk',
      ),
    [floor.stations],
  );
  const bossDoors = useMemo(
    () => floor.stations.filter((s) => s.kind === 'boss_door'),
    [floor.stations],
  );
  const benchProps = useMemo(
    () => floor.props.filter((p) => p.kind === 'bench'),
    [floor.props],
  );

  return (
    <group name={`world-furniture-glbs-floor-${floor.floorNumber}`}>
      {tableTpl &&
        deskStations.map((st) => (
          <LibraryTableStationGlb
            key={st.id}
            position={st.position}
            facingYaw={st.facingYaw}
            targetHeight={st.kind === 'librarian_desk' ? 0.94 : 0.78}
            tableTemplate={tableTpl}
            pileTemplate={pileTpl}
            maxAniso={maxAniso}
          />
        ))}

      {chairTpl &&
        benchProps.map((bp) => (
          <LibraryChairPairGlb
            key={bp.id}
            position={bp.position}
            rotationY={bp.rotationY}
            template={chairTpl}
            maxAniso={maxAniso}
          />
        ))}

      {dragonDoorTpl &&
        bossDoors.map((bd) => (
          <DragonBossDoorGlb
            key={bd.id}
            position={bd.position}
            facingYaw={bd.facingYaw}
            template={dragonDoorTpl}
            maxAniso={maxAniso}
            unlocked={bossDoorUnlocked}
            theme={theme}
            paused={paused}
            prefersReducedMotion={prefersReducedMotion}
          />
        ))}

      {/* Medieval carved stone water well landmark on Floor 2 Sakura Shrine courtyard */}
      {wellTpl && floor.biomeId === 'sakura_shrine' && (
        <StaticCenteredGlb
          template={wellTpl}
          position={[8.2, 0, -13.6]}
          rotationY={-Math.PI * 0.3}
          targetSize={1.95}
          maxAniso={maxAniso}
        />
      )}

      {/* Carved ancient stone dais accent flush under Floor 2 & Floor 4 summit Boss terraces */}
      {platformTpl && floor.biomeId === 'starlight_ruins' && (
        <StaticCenteredGlb
          template={platformTpl}
          position={[0, 1.76, -25.0]}
          targetSize={[17.8, 0.65, 8.4]}
          maxAniso={maxAniso}
        />
      )}
      {platformTpl && floor.biomeId === 'sakura_shrine' && (
        <StaticCenteredGlb
          template={platformTpl}
          position={[0, 1.76, -25.6]}
          targetSize={[16.8, 0.65, 6.2]}
          maxAniso={maxAniso}
        />
      )}
    </group>
  );
}
