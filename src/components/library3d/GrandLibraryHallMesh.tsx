import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { cloneGlbTemplate, useLocalGlb, type LoadedGlbTemplate } from './gltfLoader';
import type { LibraryMaterialBundle } from './proceduralMaterials';
import type { WorldMaterialBundle } from './worldMaterials';
import {
  buildGrandLibraryGeometries,
  createRoyalCarpetTexture,
  type GlbPlacement3D,
} from './grandLibraryBuilder';

export interface GrandLibraryHallMeshProps {
  theme: AppTheme;
  libraryMaterials: LibraryMaterialBundle;
  worldMaterials: WorldMaterialBundle;
  requestRender?: () => void;
}

const BASE = import.meta.env.BASE_URL ?? '/';
const VICTORIAN_BOOKCASE_URL = `${BASE}models/prop-bookcase-victorian.glb`;
const LIBRARY_STAIRS_URL = `${BASE}models/prop-library-stairs.glb`;
const SPIRAL_STAIRS_URL = `${BASE}models/prop-spiral-stairs.glb`;
const TABLE_URL = `${BASE}models/prop-library-table.glb`;
const CHAIR_URL = `${BASE}models/prop-library-chair.glb`;
const BOOK_PILE_URL = `${BASE}models/prop-book-pile.glb`;

function prepareMeshBounds(
  template: LoadedGlbTemplate,
  maxAniso: number,
  hidePattern?: RegExp,
): { instance: THREE.Object3D; size: THREE.Vector3; center: THREE.Vector3; minY: number } {
  const instance = cloneGlbTemplate(template);
  instance.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  instance.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (hidePattern && hidePattern.test(obj.name)) {
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
  return { instance, size, center, minY: Number.isFinite(box.min.y) ? box.min.y : 0 };
}

function VictorianWallBookcase({
  placement,
  template,
  maxAniso,
}: {
  placement: GlbPlacement3D;
  template: LoadedGlbTemplate;
  maxAniso: number;
}) {
  const prep = useMemo(() => {
    const p = prepareMeshBounds(template, maxAniso, /Small/i);
    const sx = placement.width / Math.max(0.01, p.size.x);
    const sy = placement.height / Math.max(0.01, p.size.y);
    const sz = placement.depth / Math.max(0.01, p.size.z);
    return {
      instance: p.instance,
      scale: [sx, sy, sz] as [number, number, number],
      offset: [-p.center.x * sx, -p.minY * sy, -p.center.z * sz] as [number, number, number],
    };
  }, [template, maxAniso, placement.width, placement.height, placement.depth]);

  return (
    <group position={placement.position} rotation={[0, placement.yaw, 0]}>
      <group position={prep.offset} scale={prep.scale}>
        <primitive object={prep.instance} />
      </group>
    </group>
  );
}

function GrandStudyAlcoveGlb({
  position,
  yaw,
  tableTpl,
  chairTpl,
  pileTpl,
  maxAniso,
}: {
  position: [number, number, number];
  yaw: number;
  tableTpl: LoadedGlbTemplate;
  chairTpl: LoadedGlbTemplate | null;
  pileTpl: LoadedGlbTemplate | null;
  maxAniso: number;
}) {
  const prep = useMemo(() => {
    const tbl = prepareMeshBounds(tableTpl, maxAniso);
    const sy = 0.78 / Math.max(0.01, tbl.size.y);
    const sx = 2.35 / Math.max(0.01, tbl.size.x);
    const sz = 1.12 / Math.max(0.01, tbl.size.z);
    const ch1 = chairTpl ? prepareMeshBounds(chairTpl, maxAniso) : null;
    const ch2 = chairTpl ? prepareMeshBounds(chairTpl, maxAniso) : null;
    const cs = ch1 ? 0.94 / Math.max(0.01, ch1.size.y) : 1;
    const pile = pileTpl ? prepareMeshBounds(pileTpl, maxAniso) : null;
    const ps = pile ? 0.65 / Math.max(0.01, pile.size.x) : 1;
    return { tbl, sx, sy, sz, ch1, ch2, cs, pile, ps };
  }, [tableTpl, chairTpl, pileTpl, maxAniso]);

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <group
        position={[-prep.tbl.center.x * prep.sx, -prep.tbl.minY * prep.sy, -prep.tbl.center.z * prep.sz]}
        scale={[prep.sx, prep.sy, prep.sz]}
      >
        <primitive object={prep.tbl.instance} />
      </group>
      {prep.ch1 && (
        <group position={[-0.55, 0, 0.78]} rotation={[0, Math.PI - 0.1, 0]}>
          <group
            position={[-prep.ch1.center.x * prep.cs, -prep.ch1.minY * prep.cs, -prep.ch1.center.z * prep.cs]}
            scale={prep.cs}
          >
            <primitive object={prep.ch1.instance} />
          </group>
        </group>
      )}
      {prep.ch2 && (
        <group position={[0.55, 0, 0.78]} rotation={[0, Math.PI + 0.1, 0]}>
          <group
            position={[-prep.ch2.center.x * prep.cs, -prep.ch2.minY * prep.cs, -prep.ch2.center.z * prep.cs]}
            scale={prep.cs}
          >
            <primitive object={prep.ch2.instance} />
          </group>
        </group>
      )}
      {prep.pile && (
        <group position={[0.25, 0.77, -0.05]} rotation={[0, 0.4, 0]}>
          <group
            position={[-prep.pile.center.x * prep.ps, -prep.pile.minY * prep.ps, -prep.pile.center.z * prep.ps]}
            scale={prep.ps}
          >
            <primitive object={prep.pile.instance} />
          </group>
        </group>
      )}
    </group>
  );
}

/**
 * Renders Floor 3's airtight two-story Grand Cathedral Library (`starfield_atrium`, `D-023`):
 * real PBR Victorian carved wooden bookcases packed with real 3D antique books lining all 4 walls
 * on 2 stories, real Grand Library staircase, twin real spiral staircases up to the mezzanine
 * balcony, real antique study tables & chairs, curved cathedral vault ribs, royal carpet runner,
 * and warm antique-bronze double-tier chandeliers.
 */
export function GrandLibraryHallMesh({
  theme,
  libraryMaterials,
  worldMaterials,
  requestRender,
}: GrandLibraryHallMeshProps) {
  const { gl } = useThree();
  const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const geoms = useMemo(() => buildGrandLibraryGeometries(), []);
  const carpetTex = useMemo(() => createRoyalCarpetTexture(), []);

  const { template: bookcaseTpl } = useLocalGlb(VICTORIAN_BOOKCASE_URL);
  const { template: stairsTpl } = useLocalGlb(LIBRARY_STAIRS_URL);
  const { template: spiralTpl } = useLocalGlb(SPIRAL_STAIRS_URL);
  const { template: tableTpl } = useLocalGlb(TABLE_URL);
  const { template: chairTpl } = useLocalGlb(CHAIR_URL);
  const { template: pileTpl } = useLocalGlb(BOOK_PILE_URL);

  useEffect(() => {
    if (bookcaseTpl || stairsTpl || spiralTpl || tableTpl || chairTpl || pileTpl) {
      requestRender?.();
    }
  }, [bookcaseTpl, stairsTpl, spiralTpl, tableTpl, chairTpl, pileTpl, requestRender]);

  useEffect(() => {
    return () => {
      geoms.plasterWall.dispose();
      geoms.woodTrim.dispose();
      geoms.brass.dispose();
      geoms.windowGlass.dispose();
      geoms.lampGlow.dispose();
      geoms.skylightGlass.dispose();
      carpetTex.dispose();
    };
  }, [geoms, carpetTex]);

  // Real Grand Library Staircase aligned flush with Floor 3 ramp (X: -3..+3, Z: -12.0 -> -17.5, Y: 0 -> 1.80)
  const mainStairs = useMemo(() => {
    if (!stairsTpl) return null;
    const p = prepareMeshBounds(stairsTpl, maxAniso, /^Frame/i);
    const sx = 6.08 / Math.max(0.01, p.size.x);
    const sy = 1.82 / Math.max(0.01, p.size.y);
    const sz = 5.52 / Math.max(0.01, p.size.z);
    return {
      instance: p.instance,
      scale: [sx, sy, sz] as [number, number, number],
      offset: [-p.center.x * sx, -p.minY * sy, -p.center.z * sz] as [number, number, number],
    };
  }, [stairsTpl, maxAniso]);

  const spiralPair = useMemo(() => {
    if (!spiralTpl) return null;
    return geoms.spiralStairs.map((sp) => {
      const p = prepareMeshBounds(spiralTpl, maxAniso);
      const s = 4.6 / Math.max(0.01, p.size.y);
      return {
        ...sp,
        instance: p.instance,
        scale: s,
        offset: [-p.center.x * s, -p.minY * s, -p.center.z * s] as [number, number, number],
      };
    });
  }, [spiralTpl, maxAniso, geoms.spiralStairs]);

  const mats = useMemo(() => {
    const isNight = theme === 'midnight';
    const isDusk = theme === 'dim';
    const winColor = isNight ? '#7aa8e8' : isDusk ? '#efb07a' : '#faf0d7';
    const winIntensity = isNight ? 1.05 : isDusk ? 1.25 : 0.95;

    return {
      carpet: new THREE.MeshStandardMaterial({
        map: carpetTex,
        roughness: 0.94,
        metalness: 0.02,
      }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: winColor,
        emissive: winColor,
        emissiveIntensity: winIntensity,
        roughness: 0.25,
        metalness: 0.08,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      }),
    };
  }, [theme, carpetTex]);

  useEffect(() => {
    return () => {
      mats.carpet.dispose();
      mats.windowGlass.dispose();
    };
  }, [mats]);

  const lm = libraryMaterials.materials;
  const wm = worldMaterials.materials;
  const chandelierIntensity = theme === 'midnight' ? 15.5 : theme === 'dim' ? 12.0 : 5.5;
  const chandelierColor = theme === 'midnight' ? '#ffdfa8' : '#ffe8c2';

  return (
    <group name="grand-library-cathedral-hall">
      {/* Airtight plastered limestone cathedral walls, mezzanine balcony, curved vault ribs & chandeliers */}
      <mesh geometry={geoms.plasterWall} material={lm.hallWall} receiveShadow />
      <mesh geometry={geoms.woodTrim} material={lm.woodCrown} castShadow receiveShadow />
      <mesh geometry={geoms.brass} material={lm.brassTrim} />
      <mesh geometry={geoms.lampGlow} material={lm.lanternGlow} />
      <mesh geometry={geoms.windowGlass} material={mats.windowGlass} />
      <mesh geometry={geoms.skylightGlass} material={wm.glassDome} />

      {/* Real PBR Victorian Carved Wooden Bookcases with Real 3D Books lining all 4 walls on 2 stories */}
      {bookcaseTpl &&
        geoms.bookcasePlacements.map((pl, idx) => (
          <VictorianWallBookcase
            key={`vic-bc-${idx}`}
            placement={pl}
            template={bookcaseTpl}
            maxAniso={maxAniso}
          />
        ))}

      {/* Real PBR Grand Library Staircase aligned flush with physics ramp (Z: -12.0 -> -17.5, Y: 0 -> 1.8) */}
      {mainStairs && (
        <group position={[0, 0, -14.75]}>
          <group position={mainStairs.offset} scale={mainStairs.scale}>
            <primitive object={mainStairs.instance} />
          </group>
        </group>
      )}

      {/* Twin Real PBR Spiral Staircases rising from Ground Hall to Mezzanine Balcony */}
      {spiralPair &&
        spiralPair.map((sp, idx) => (
          <group key={`spiral-${idx}`} position={sp.position} rotation={[0, sp.yaw, 0]}>
            <group position={sp.offset} scale={sp.scale}>
              <primitive object={sp.instance} />
            </group>
          </group>
        ))}

      {/* 4 Real PBR Study Alcoves (Antique Wooden Tables + Carved Chairs + Book Piles) */}
      {tableTpl &&
        geoms.studyAlcoves.map((alc, idx) => (
          <GrandStudyAlcoveGlb
            key={`alcove-${idx}`}
            position={alc.position}
            yaw={alc.yaw}
            tableTpl={tableTpl}
            chairTpl={chairTpl}
            pileTpl={pileTpl}
            maxAniso={maxAniso}
          />
        ))}

      {/* Royal crimson-and-gold woven carpet runner down the central nave & upper terrace */}
      <mesh position={[0, 0.016, 2.75]} rotation={[-Math.PI / 2, 0, 0]} material={mats.carpet} receiveShadow>
        <planeGeometry args={[4.4, 29.4]} />
      </mesh>
      <mesh position={[0, 1.818, -20.8]} rotation={[-Math.PI / 2, 0, 0]} material={mats.carpet} receiveShadow>
        <planeGeometry args={[4.4, 6.2]} />
      </mesh>

      {/* Warm antique-gold chandelier point lights illuminating both gallery tiers */}
      {geoms.chandelierPositions.map(([cx, cy, cz], idx) => (
        <pointLight
          key={`chandelier-${idx}`}
          color={chandelierColor}
          intensity={chandelierIntensity}
          distance={25}
          decay={1.45}
          position={[cx, cy - 0.6, cz]}
        />
      ))}
    </group>
  );
}
