import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { AppTheme } from '@/hooks/useTheme';
import { useLocalGlb, type LoadedGlbTemplate } from './gltfLoader';
import { PROP_GLB_URLS } from './furnitureGlbHelpers';
import { DragonBossDoorGlb, FittedGlb } from './DragonBossDoorGlb';
import type { BiomeId, FloorWorldLayout3D, WorldStation3D } from './worldTypes';

export interface WorldFurnitureGlbsProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  bossDoorUnlocked: boolean;
  paused: boolean;
  prefersReducedMotion: boolean;
  requestRender?: () => void;
}

const ONLY_SMALL = /Small/i;

/**
 * Biome-tailored Reading Table / Librarian Desk:
 * - Floor 1 Town: rustic European oak street table (`wooden-table`) for reading; two-tone
 *   handcrafted `artisan-table` + Victorian archive credenza (`Small` bookcase) for Librarian Desk.
 * - Floor 2 Sakura Shrine: low dark-lacquer Japanese tea-shrine reading table (`wooden-table`
 *   derived variant, 0.58m tall) + warm lantern; cedar-tinted `artisan-table` + wooden chair for Desk.
 * - Floor 3 Grand Library: royal dark `library-table` for reading; mahogany `artisan-table` +
 *   Victorian archive credenza + burgundy velvet `armchair` for Librarian Desk.
 * - Floor 4 Starlight Ruins: carved ancient stone altar desk derived from `stone-platform` + starlight glow.
 */
function BiomeDeskStationGlb({
  station,
  biomeId,
  theme,
  templates,
  maxAniso,
}: {
  station: WorldStation3D;
  biomeId: BiomeId;
  theme: AppTheme;
  templates: {
    libraryTable: LoadedGlbTemplate | null;
    woodenTable: LoadedGlbTemplate | null;
    artisanTable: LoadedGlbTemplate | null;
    chair: LoadedGlbTemplate | null;
    armchair: LoadedGlbTemplate | null;
    bookcase: LoadedGlbTemplate | null;
    pile: LoadedGlbTemplate | null;
    platform: LoadedGlbTemplate | null;
  };
  maxAniso: number;
}) {
  const isLibrarian = station.kind === 'librarian_desk';
  const tints = useMemo(() => {
    if (biomeId === 'sakura_shrine') {
      return isLibrarian
        ? [{ match: /.*/, color: '#b57b66', roughness: 0.72 }]
        : [{ match: /.*/, color: '#6b4c3d', roughness: 0.62 }];
    }
    if (biomeId === 'starfield_atrium' && isLibrarian) {
      return [{ match: /.*/, color: '#9c7863', roughness: 0.72 }];
    }
    if (biomeId === 'starlight_ruins') {
      return [{ match: /.*/, color: '#8f98b8', roughness: 0.84 }];
    }
    return undefined;
  }, [biomeId, isLibrarian]);

  const burgundyCushion = useMemo(
    () => [{ match: /pillow/i, color: '#8f3b4a', roughness: 0.9 }],
    [],
  );

  // Floor 4 Starlight Ruins -> Ancient Carved Stone Altar Desk (fits starry ruins, never indoor dining table!)
  if (biomeId === 'starlight_ruins' && templates.platform) {
    const topH = isLibrarian ? 0.94 : 0.78;
    return (
      <group position={station.position} rotation={[0, station.facingYaw, 0]}>
        <FittedGlb
          template={templates.platform}
          position={[0, 0, 0]}
          targetSize={[1.55, topH * 0.76, 0.76]}
          maxAniso={maxAniso}
          tints={tints}
        />
        <FittedGlb
          template={templates.platform}
          position={[0, topH * 0.74, 0]}
          targetSize={[1.95, topH * 0.28, 1.04]}
          maxAniso={maxAniso}
          tints={tints}
        />
        {templates.pile && (
          <FittedGlb
            template={templates.pile}
            position={[0.16, topH - 0.01, -0.04]}
            rotationY={isLibrarian ? -0.45 : 0.35}
            targetSize={[0.62, 0.24, 0.32]}
            maxAniso={maxAniso}
          />
        )}
        <pointLight
          color="#a5b4fc"
          intensity={theme === 'midnight' ? 3.2 : 1.5}
          distance={6}
          decay={1.8}
          position={[0, topH + 0.55, 0]}
        />
      </group>
    );
  }

  // Pick distinct base table model per biome & station role
  let chosenTable: LoadedGlbTemplate | null = templates.libraryTable;
  let deskSize: [number, number, number] = [1.95, 0.78, 1.0];

  if (biomeId === 'town_of_beginnings') {
    if (isLibrarian && templates.artisanTable) {
      chosenTable = templates.artisanTable;
      deskSize = [1.88, 0.94, 0.98];
    } else if (templates.woodenTable) {
      chosenTable = templates.woodenTable;
      deskSize = [1.72, 0.78, 0.96];
    }
  } else if (biomeId === 'sakura_shrine') {
    if (isLibrarian && templates.artisanTable) {
      chosenTable = templates.artisanTable;
      deskSize = [1.85, 0.92, 0.96];
    } else if (templates.woodenTable) {
      // Authentic lower Japanese tea-shrine reading table overlooking Sakura Lake
      chosenTable = templates.woodenTable;
      deskSize = [1.82, 0.58, 1.02];
    }
  } else if (biomeId === 'starfield_atrium') {
    if (isLibrarian && templates.artisanTable) {
      chosenTable = templates.artisanTable;
      deskSize = [2.04, 0.95, 1.04];
    } else {
      chosenTable = templates.libraryTable;
      deskSize = [2.02, 0.78, 1.04];
    }
  }

  const topY = deskSize[1];

  return (
    <group position={station.position} rotation={[0, station.facingYaw, 0]}>
      {chosenTable && (
        <FittedGlb
          template={chosenTable}
          position={[0, 0, 0]}
          targetSize={deskSize}
          maxAniso={maxAniso}
          tints={tints}
        />
      )}
      {templates.pile && (
        <FittedGlb
          template={templates.pile}
          position={[isLibrarian ? -0.26 : 0.22, topY - 0.01, -0.04]}
          rotationY={isLibrarian ? -0.55 : 0.4}
          targetSize={[0.6, 0.22, 0.3]}
          maxAniso={maxAniso}
        />
      )}

      {/* Floor 1 & Floor 3 Librarian Desks gain a carved Victorian low archive credenza beside the counter */}
      {isLibrarian && templates.bookcase && (biomeId === 'town_of_beginnings' || biomeId === 'starfield_atrium') && (
        <FittedGlb
          template={templates.bookcase}
          position={[1.45, 0, -0.35]}
          rotationY={-0.38}
          targetSize={[0.92, 1.15, 0.75]}
          maxAniso={maxAniso}
          onlyPattern={ONLY_SMALL}
        />
      )}

      {/* Floor 2 Sakura Reading Table gets cozy low wooden tea-stools */}
      {biomeId === 'sakura_shrine' && !isLibrarian && templates.chair && (
        <>
          <FittedGlb
            template={templates.chair}
            position={[-0.5, 0, -0.82]}
            rotationY={0.12}
            targetSize={[0.42, 0.72, 0.48]}
            maxAniso={maxAniso}
            tints={tints}
          />
          <FittedGlb
            template={templates.chair}
            position={[0.5, 0, -0.82]}
            rotationY={-0.12}
            targetSize={[0.42, 0.72, 0.48]}
            maxAniso={maxAniso}
            tints={tints}
          />
        </>
      )}

      {/* Floor 3 Grand Library Desk gets a plush royal burgundy reading armchair behind the counter */}
      {biomeId === 'starfield_atrium' && isLibrarian && templates.armchair && (
        <FittedGlb
          template={templates.armchair}
          position={[-0.78, 0, -0.95]}
          rotationY={0.35}
          targetSize={1.0}
          maxAniso={maxAniso}
          tints={burgundyCushion}
        />
      )}
    </group>
  );
}

/**
 * Location-aware Seating Group replacing old blocky benches:
 * - Floor 1 (`town_of_beginnings`): 1 carved wooden chair + 1 warm cream plush reading armchair!
 * - Floor 3 (`p-bench-1` beside reading table): pair of classic carved library chairs.
 * - Floor 3 (`p-bench-2` east lounge): cozy reading lounge with 2 velvet armchairs + oak side table!
 */
function BiomeSeatingGroupGlb({
  propId,
  biomeId,
  position,
  rotationY,
  chairTpl,
  armchairTpl,
  sideTableTpl,
  pileTpl,
  maxAniso,
}: {
  propId: string;
  biomeId: BiomeId;
  position: [number, number, number];
  rotationY: number;
  chairTpl: LoadedGlbTemplate | null;
  armchairTpl: LoadedGlbTemplate | null;
  sideTableTpl: LoadedGlbTemplate | null;
  pileTpl: LoadedGlbTemplate | null;
  maxAniso: number;
}) {
  const warmCream = useMemo(() => [{ match: /pillow/i, color: '#dfd2bc', roughness: 0.92 }], []);
  const royalTeal = useMemo(() => [{ match: /pillow/i, color: '#3b6e68', roughness: 0.9 }], []);
  const royalWine = useMemo(() => [{ match: /pillow/i, color: '#8a3c4b', roughness: 0.9 }], []);

  // Floor 3 East Lounge (`p-bench-2`): twin plush velvet armchairs framing a cozy oak side tea table
  if (biomeId === 'starfield_atrium' && propId === 'p-bench-2' && armchairTpl) {
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        <FittedGlb template={armchairTpl} position={[-1.08, 0, 0.08]} rotationY={0.42} targetSize={1.0} maxAniso={maxAniso} tints={royalTeal} />
        <FittedGlb template={armchairTpl} position={[1.08, 0, 0.08]} rotationY={-0.42} targetSize={1.0} maxAniso={maxAniso} tints={royalWine} />
        {sideTableTpl && (
          <FittedGlb template={sideTableTpl} position={[0, 0, -0.05]} targetSize={[0.92, 0.62, 0.62]} maxAniso={maxAniso} />
        )}
        {pileTpl && (
          <FittedGlb template={pileTpl} position={[0, 0.61, -0.05]} rotationY={0.28} targetSize={[0.45, 0.16, 0.24]} maxAniso={maxAniso} />
        )}
      </group>
    );
  }

  // Floor 1 Boulevard Reading Spot: mix 1 carved wooden chair + 1 inviting plush reading armchair
  if (biomeId === 'town_of_beginnings' && armchairTpl && chairTpl) {
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        <FittedGlb template={chairTpl} position={[-0.5, 0, 0]} rotationY={0.08} targetSize={0.94} maxAniso={maxAniso} />
        <FittedGlb template={armchairTpl} position={[0.48, 0, -0.04]} rotationY={-0.16} targetSize={0.98} maxAniso={maxAniso} tints={warmCream} />
      </group>
    );
  }

  if (!chairTpl) return null;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <FittedGlb template={chairTpl} position={[-0.48, 0, 0]} rotationY={0.08} targetSize={0.94} maxAniso={maxAniso} />
      <FittedGlb template={chairTpl} position={[0.48, 0, 0]} rotationY={-0.08} targetSize={0.94} maxAniso={maxAniso} />
    </group>
  );
}

/**
 * Populates every Aincrad floor with diverse, location-appropriate real PBR `.glb` furniture &
 * monuments (4 distinct desk/table types, wooden chairs + velvet armchairs, Victorian archive
 * credenzas, carved dragon Boss doors, medieval stone well & summit platforms, `D-023`).
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

  const { template: libraryTable } = useLocalGlb(PROP_GLB_URLS.libraryTable);
  const { template: woodenTable } = useLocalGlb(PROP_GLB_URLS.woodenTable);
  const { template: artisanTable } = useLocalGlb(PROP_GLB_URLS.artisanTable);
  const { template: chair } = useLocalGlb(PROP_GLB_URLS.libraryChair);
  const { template: armchair } = useLocalGlb(PROP_GLB_URLS.armchair);
  const { template: bookcase } = useLocalGlb(
    floor.biomeId === 'town_of_beginnings' || floor.biomeId === 'starfield_atrium'
      ? PROP_GLB_URLS.victorianBookcase
      : null,
  );
  const { template: pile } = useLocalGlb(PROP_GLB_URLS.bookPile);
  const { template: dragonDoor } = useLocalGlb(PROP_GLB_URLS.dragonDoor);
  const { template: well } = useLocalGlb(
    floor.biomeId === 'sakura_shrine' ? PROP_GLB_URLS.stoneWell : null,
  );
  const { template: platform } = useLocalGlb(
    floor.biomeId === 'sakura_shrine' || floor.biomeId === 'starlight_ruins'
      ? PROP_GLB_URLS.stonePlatform
      : null,
  );

  useEffect(() => {
    if (
      libraryTable ||
      woodenTable ||
      artisanTable ||
      chair ||
      armchair ||
      bookcase ||
      pile ||
      dragonDoor ||
      well ||
      platform
    ) {
      requestRender?.();
    }
  }, [
    libraryTable,
    woodenTable,
    artisanTable,
    chair,
    armchair,
    bookcase,
    pile,
    dragonDoor,
    well,
    platform,
    requestRender,
  ]);

  const templates = useMemo(
    () => ({ libraryTable, woodenTable, artisanTable, chair, armchair, bookcase, pile, platform }),
    [libraryTable, woodenTable, artisanTable, chair, armchair, bookcase, pile, platform],
  );
  const deskStations = useMemo(
    () => floor.stations.filter((s) => s.kind === 'reading_table' || s.kind === 'librarian_desk'),
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
      {deskStations.map((st) => (
        <BiomeDeskStationGlb
          key={st.id}
          station={st}
          biomeId={floor.biomeId}
          theme={theme}
          templates={templates}
          maxAniso={maxAniso}
        />
      ))}

      {benchProps.map((bp) => (
        <BiomeSeatingGroupGlb
          key={bp.id}
          propId={bp.id}
          biomeId={floor.biomeId}
          position={bp.position}
          rotationY={bp.rotationY}
          chairTpl={chair}
          armchairTpl={armchair}
          sideTableTpl={woodenTable}
          pileTpl={pile}
          maxAniso={maxAniso}
        />
      ))}

      {dragonDoor &&
        bossDoors.map((bd) => (
          <DragonBossDoorGlb
            key={bd.id}
            position={bd.position}
            facingYaw={bd.facingYaw}
            template={dragonDoor}
            maxAniso={maxAniso}
            unlocked={bossDoorUnlocked}
            theme={theme}
            paused={paused}
            prefersReducedMotion={prefersReducedMotion}
          />
        ))}

      {well && floor.biomeId === 'sakura_shrine' && (
        <FittedGlb
          template={well}
          position={[8.2, 0, -13.6]}
          rotationY={-Math.PI * 0.3}
          targetSize={1.95}
          maxAniso={maxAniso}
        />
      )}

      {platform && floor.biomeId === 'starlight_ruins' && (
        <FittedGlb
          template={platform}
          position={[0, 1.76, -25.0]}
          targetSize={[17.8, 0.65, 8.4]}
          maxAniso={maxAniso}
        />
      )}
      {platform && floor.biomeId === 'sakura_shrine' && (
        <FittedGlb
          template={platform}
          position={[0, 1.76, -25.6]}
          targetSize={[16.8, 0.65, 6.2]}
          maxAniso={maxAniso}
        />
      )}
    </group>
  );
}
