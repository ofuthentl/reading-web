import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { useLocalGlb, type LoadedGlbTemplate } from './gltfLoader';
import {
  computeFitTransform,
  disposeClonedMaterials,
  prepareGlbProp,
  PROP_GLB_URLS,
  type PrepareGlbOptions,
} from './furnitureGlbHelpers';
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

const HIDE_SMALL = /Small/i;
const HIDE_FRAME = /^Frame/i;

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
    const p = prepareGlbProp(template, { maxAniso, hidePattern: HIDE_SMALL });
    const fit = computeFitTransform(p, [placement.width, placement.height, placement.depth]);
    return { ...p, ...fit };
  }, [template, maxAniso, placement.width, placement.height, placement.depth]);

  return (
    <group position={placement.position} rotation={[0, placement.yaw, 0]}>
      <group position={prep.offset} scale={prep.scale}>
        <primitive object={prep.instance} />
      </group>
    </group>
  );
}

/**
 * Distinct Floor 3 study alcove styles so all 4 alcoves feel curated instead of copy-pasted:
 * - Index 0 (SW): Cozy Burgundy Velvet Reading Lounge (`wooden-table` + 2 burgundy `armchair`s)
 * - Index 1 (SE): Emerald Velvet Reading Lounge (`wooden-table` walnut tint + 2 emerald `armchair`s)
 * - Index 2 (NW): Grand Antique Scholar Desk (`library-table` + 2 carved `library-chair`s)
 * - Index 3 (NE): Artisan Archive Worktable (`artisan-table` + 2 carved `library-chair`s)
 */
function CuratedStudyAlcoveGlb({
  alcoveIndex,
  position,
  yaw,
  templates,
  maxAniso,
}: {
  alcoveIndex: number;
  position: [number, number, number];
  yaw: number;
  templates: {
    libraryTable: LoadedGlbTemplate | null;
    woodenTable: LoadedGlbTemplate | null;
    artisanTable: LoadedGlbTemplate | null;
    chair: LoadedGlbTemplate | null;
    armchair: LoadedGlbTemplate | null;
    pile: LoadedGlbTemplate | null;
  };
  maxAniso: number;
}) {
  const isCozyLounge = alcoveIndex < 2;
  const tableTpl =
    alcoveIndex < 2
      ? templates.woodenTable ?? templates.libraryTable
      : alcoveIndex === 2
        ? templates.libraryTable
        : templates.artisanTable ?? templates.libraryTable;
  const seatTpl = isCozyLounge ? templates.armchair ?? templates.chair : templates.chair;

  const prep = useMemo(() => {
    if (!tableTpl) return null;
    const tableTints: PrepareGlbOptions['tints'] =
      alcoveIndex === 1
        ? [{ match: /.*/, color: '#b59a84', roughness: 0.78 }]
        : alcoveIndex === 3
          ? [{ match: /.*/, color: '#b8967c', roughness: 0.76 }]
          : undefined;
    const seatTints: PrepareGlbOptions['tints'] =
      alcoveIndex === 0
        ? [{ match: /pillow/i, color: '#8f3b4a', roughness: 0.9 }]
        : alcoveIndex === 1
          ? [{ match: /pillow/i, color: '#396b5c', roughness: 0.9 }]
          : undefined;

    const tbl = prepareGlbProp(tableTpl, { maxAniso, tints: tableTints });
    const tblTarget: [number, number, number] = isCozyLounge
      ? [1.85, 0.72, 0.96]
      : [2.32, 0.78, 1.1];
    const tblFit = computeFitTransform(tbl, tblTarget);

    const s1 = seatTpl ? prepareGlbProp(seatTpl, { maxAniso, tints: seatTints }) : null;
    const s2 = seatTpl ? prepareGlbProp(seatTpl, { maxAniso, tints: seatTints }) : null;
    const seatH = isCozyLounge ? 0.98 : 0.94;
    const s1Fit = s1 ? computeFitTransform(s1, seatH) : null;
    const s2Fit = s2 ? computeFitTransform(s2, seatH) : null;

    const pile = templates.pile ? prepareGlbProp(templates.pile, { maxAniso }) : null;
    const pileFit = pile ? computeFitTransform(pile, [0.64, 0.22, 0.32]) : null;

    const allCloned = [
      ...tbl.clonedMaterials,
      ...(s1?.clonedMaterials ?? []),
      ...(s2?.clonedMaterials ?? []),
    ];
    return { tbl, tblFit, topY: tblTarget[1], s1, s1Fit, s2, s2Fit, pile, pileFit, allCloned };
  }, [tableTpl, seatTpl, templates.pile, maxAniso, alcoveIndex, isCozyLounge]);

  useEffect(() => {
    if (!prep) return undefined;
    return () => {
      disposeClonedMaterials(prep.allCloned);
    };
  }, [prep]);

  if (!prep) return null;
  const seatOffsetX = isCozyLounge ? 0.72 : 0.56;
  const seatOffsetZ = isCozyLounge ? 0.92 : 0.78;

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <group position={prep.tblFit.offset} scale={prep.tblFit.scale}>
        <primitive object={prep.tbl.instance} />
      </group>
      {prep.s1 && prep.s1Fit && (
        <group position={[-seatOffsetX, 0, seatOffsetZ]} rotation={[0, Math.PI - 0.18, 0]}>
          <group position={prep.s1Fit.offset} scale={prep.s1Fit.scale}>
            <primitive object={prep.s1.instance} />
          </group>
        </group>
      )}
      {prep.s2 && prep.s2Fit && (
        <group position={[seatOffsetX, 0, seatOffsetZ]} rotation={[0, Math.PI + 0.18, 0]}>
          <group position={prep.s2Fit.offset} scale={prep.s2Fit.scale}>
            <primitive object={prep.s2.instance} />
          </group>
        </group>
      )}
      {prep.pile && prep.pileFit && (
        <group
          position={[alcoveIndex % 2 === 0 ? 0.22 : -0.24, prep.topY - 0.01, -0.05]}
          rotation={[0, 0.35 + alcoveIndex * 0.55, 0]}
        >
          <group position={prep.pileFit.offset} scale={prep.pileFit.scale}>
            <primitive object={prep.pile.instance} />
          </group>
        </group>
      )}
    </group>
  );
}

/**
 * Renders Floor 3's airtight two-story Grand Cathedral Library (`starfield_atrium`, `D-023`):
 * real PBR Victorian bookcases packed with real 3D books lining all 4 walls on 2 stories,
 * real library staircase, twin real spiral staircases up to the mezzanine balcony, 4 curated
 * diverse reading lounges/study alcoves (armchairs + oak/antique/artisan tables), curved vault
 * ribs, royal crimson carpet runner, and warm antique-bronze double-tier chandeliers.
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

  const { template: bookcaseTpl } = useLocalGlb(PROP_GLB_URLS.victorianBookcase);
  const { template: stairsTpl } = useLocalGlb(PROP_GLB_URLS.libraryStairs);
  const { template: spiralTpl } = useLocalGlb(PROP_GLB_URLS.spiralStairs);
  const { template: libraryTable } = useLocalGlb(PROP_GLB_URLS.libraryTable);
  const { template: woodenTable } = useLocalGlb(PROP_GLB_URLS.woodenTable);
  const { template: artisanTable } = useLocalGlb(PROP_GLB_URLS.artisanTable);
  const { template: chair } = useLocalGlb(PROP_GLB_URLS.libraryChair);
  const { template: armchair } = useLocalGlb(PROP_GLB_URLS.armchair);
  const { template: pile } = useLocalGlb(PROP_GLB_URLS.bookPile);

  useEffect(() => {
    if (bookcaseTpl || stairsTpl || spiralTpl || libraryTable || woodenTable || artisanTable || chair || armchair || pile) {
      requestRender?.();
    }
  }, [bookcaseTpl, stairsTpl, spiralTpl, libraryTable, woodenTable, artisanTable, chair, armchair, pile, requestRender]);

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

  const alcoveTemplates = useMemo(
    () => ({ libraryTable, woodenTable, artisanTable, chair, armchair, pile }),
    [libraryTable, woodenTable, artisanTable, chair, armchair, pile],
  );

  // Real Grand Library Staircase aligned flush with Floor 3 ramp (X: -3..+3, Z: -12.0 -> -17.5, Y: 0 -> 1.80)
  const mainStairs = useMemo(() => {
    if (!stairsTpl) return null;
    const p = prepareGlbProp(stairsTpl, { maxAniso, hidePattern: HIDE_FRAME });
    const fit = computeFitTransform(p, [6.08, 1.82, 5.52]);
    return { instance: p.instance, ...fit };
  }, [stairsTpl, maxAniso]);

  const spiralPair = useMemo(() => {
    if (!spiralTpl) return null;
    return geoms.spiralStairs.map((sp) => {
      const p = prepareGlbProp(spiralTpl, { maxAniso });
      const fit = computeFitTransform(p, 4.6);
      return { ...sp, instance: p.instance, ...fit };
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
      <mesh geometry={geoms.plasterWall} material={lm.hallWall} receiveShadow />
      <mesh geometry={geoms.woodTrim} material={lm.woodCrown} castShadow receiveShadow />
      <mesh geometry={geoms.brass} material={lm.brassTrim} />
      <mesh geometry={geoms.lampGlow} material={lm.lanternGlow} />
      <mesh geometry={geoms.windowGlass} material={mats.windowGlass} />
      <mesh geometry={geoms.skylightGlass} material={wm.glassDome} />

      {bookcaseTpl &&
        geoms.bookcasePlacements.map((pl, idx) => (
          <VictorianWallBookcase
            key={`vic-bc-${idx}`}
            placement={pl}
            template={bookcaseTpl}
            maxAniso={maxAniso}
          />
        ))}

      {mainStairs && (
        <group position={[0, 0, -14.75]}>
          <group position={mainStairs.offset} scale={mainStairs.scale}>
            <primitive object={mainStairs.instance} />
          </group>
        </group>
      )}

      {spiralPair &&
        spiralPair.map((sp, idx) => (
          <group key={`spiral-${idx}`} position={sp.position} rotation={[0, sp.yaw, 0]}>
            <group position={sp.offset} scale={sp.scale}>
              <primitive object={sp.instance} />
            </group>
          </group>
        ))}

      {geoms.studyAlcoves.map((alc, idx) => (
        <CuratedStudyAlcoveGlb
          key={`alcove-${idx}`}
          alcoveIndex={idx}
          position={alc.position}
          yaw={alc.yaw}
          templates={alcoveTemplates}
          maxAniso={maxAniso}
        />
      ))}

      <mesh position={[0, 0.016, 2.75]} rotation={[-Math.PI / 2, 0, 0]} material={mats.carpet} receiveShadow>
        <planeGeometry args={[4.4, 29.4]} />
      </mesh>
      <mesh position={[0, 1.818, -20.8]} rotation={[-Math.PI / 2, 0, 0]} material={mats.carpet} receiveShadow>
        <planeGeometry args={[4.4, 6.2]} />
      </mesh>

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
