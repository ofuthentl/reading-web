import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import type { FloorWorldLayout3D } from './worldTypes';
import {
  createShelfNameplateAtlas,
  type LibraryMaterialBundle,
} from './proceduralMaterials';
import {
  createWorldMaterialBundle,
  getWorldBiomePalette,
  type WorldMaterialBundle,
} from './worldMaterials';
import {
  buildRotatedNameplateGeometry,
  buildWorldArchitectureGeometries,
} from './worldGeometryBuilder';

export interface WorldBiomeMeshProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  libraryMaterials: LibraryMaterialBundle;
  worldMaterials?: WorldMaterialBundle;
  paused?: boolean;
  prefersReducedMotion?: boolean;
  requestRender?: () => void;
}

/**
 * Renders the active Aincrad floor biome (`D-017`): painted Day/Dusk/Night `SkyDome`,
 * biome-tuned Three.js lighting & fog, terrain/water/bridge/stairs architecture,
 * rotated bookcases, and batched shelf nameplates with full GPU cleanup on unmount.
 */
export function WorldBiomeMesh({
  floor,
  theme,
  libraryMaterials,
  worldMaterials: externalWorldMaterials,
  paused = false,
  prefersReducedMotion = false,
  requestRender,
}: WorldBiomeMeshProps) {
  const internalBundle = useMemo(
    () => (externalWorldMaterials ? null : createWorldMaterialBundle(floor.biomeId, theme)),
    // Created once when no external bundle is injected; updated in place via applyBiomeTheme
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalWorldMaterials],
  );
  const worldBundle = externalWorldMaterials ?? internalBundle!;

  useEffect(() => {
    return () => {
      internalBundle?.dispose();
    };
  }, [internalBundle]);

  const palette = useMemo(
    () => getWorldBiomePalette(floor.biomeId, theme, floor.biomeVariant),
    [floor.biomeId, theme, floor.biomeVariant],
  );

  useEffect(() => {
    worldBundle.applyBiomeTheme(floor.biomeId, theme, floor.biomeVariant);
    requestRender?.();
  }, [worldBundle, floor.biomeId, theme, floor.biomeVariant, requestRender]);

  const archGeometries = useMemo(() => buildWorldArchitectureGeometries(floor), [floor]);

  useEffect(() => {
    return () => {
      archGeometries.ground.dispose();
      archGeometries.plaza.dispose();
      archGeometries.stone.dispose();
      archGeometries.bridgeWood.dispose();
      archGeometries.bridgeRed.dispose();
      archGeometries.water?.dispose();
      archGeometries.glassDome?.dispose();
      archGeometries.woodCabinet.dispose();
      archGeometries.woodCrown.dispose();
      archGeometries.woodBackPanel.dispose();
      archGeometries.brassTrim.dispose();
    };
  }, [archGeometries]);

  const skyGeometry = useMemo(() => new THREE.SphereGeometry(96, 24, 16), []);
  useEffect(() => {
    return () => {
      skyGeometry.dispose();
    };
  }, [skyGeometry]);

  const nameplateBatch = useMemo(() => {
    const items = floor.bookcases.map((bc) => ({
      key: bc.id,
      name: bc.displayLabel,
      bookCount: bc.bookCount,
    }));
    const atlas = createShelfNameplateAtlas(items, theme);
    const geometry = buildRotatedNameplateGeometry(floor, atlas.uvByKey);
    return { atlas, geometry };
  }, [floor, theme]);

  useEffect(() => {
    return () => {
      nameplateBatch.geometry.dispose();
      nameplateBatch.atlas.dispose();
    };
  }, [nameplateBatch]);

  // Subtle living water shimmer when active (0 work when paused or reduced-motion)
  useFrame((_, delta) => {
    if (paused || prefersReducedMotion || !archGeometries.water) return;
    const step = Math.min(delta, 0.05);
    worldBundle.textures.water.offset.x = (worldBundle.textures.water.offset.x + step * 0.035) % 1;
    worldBundle.textures.water.offset.y = (worldBundle.textures.water.offset.y + step * 0.02) % 1;
  });

  const wm = worldBundle.materials;
  const lm = libraryMaterials.materials;
  const portalUp = floor.stations.find((s) => s.kind === 'portal_up');

  return (
    <group name={`world-biome-floor-${floor.floorNumber}`}>
      <color attach="background" args={[palette.fogColor]} />
      <fog attach="fog" args={[palette.fogColor, palette.fogNear, palette.fogFar]} />

      {/* Painted procedural SkyDome synced with Day / Dusk / Starry Night */}
      <mesh geometry={skyGeometry} material={wm.skyDome} frustumCulled={false} />

      {/* Biome-tuned lighting rig (0 CDN HDRI) */}
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, palette.hemiIntensity]} />
      <directionalLight
        color={palette.sunColor}
        intensity={palette.sunIntensity}
        position={palette.sunPosition}
      />
      <directionalLight
        color={palette.fillColor}
        intensity={palette.fillIntensity}
        position={[-palette.sunPosition[0] * 0.7, 10, -palette.sunPosition[2] * 0.6]}
      />
      {portalUp && (
        <pointLight
          color={palette.portalGlow}
          intensity={theme === 'midnight' ? 2.6 : 1.5}
          distance={18}
          decay={1.8}
          position={[portalUp.position[0], portalUp.position[1] + 2.8, portalUp.position[2] + 1.2]}
        />
      )}

      {/* Merged Biome Terrain, Streets, Bridge, Water & Vault Glass */}
      <mesh geometry={archGeometries.ground} material={wm.ground} />
      <mesh geometry={archGeometries.plaza} material={wm.plaza} />
      <mesh geometry={archGeometries.stone} material={wm.stone} />
      {archGeometries.bridgeWood.attributes.position && (
        <mesh geometry={archGeometries.bridgeWood} material={wm.bridgeWood} />
      )}
      {archGeometries.bridgeRed.attributes.position && (
        <mesh geometry={archGeometries.bridgeRed} material={wm.bridgeRed} />
      )}
      {archGeometries.water && <mesh geometry={archGeometries.water} material={wm.water} />}
      {archGeometries.glassDome && (
        <mesh geometry={archGeometries.glassDome} material={wm.glassDome} />
      )}

      {/* Rotated Grand Bookcases & Batched Canvas2D Shelf Nameplates */}
      {floor.bookcases.length > 0 && (
        <group name="world-floor-bookcases">
          <mesh geometry={archGeometries.woodBackPanel} material={lm.woodBackPanel} />
          <mesh geometry={archGeometries.woodCabinet} material={lm.woodCabinet} />
          <mesh geometry={archGeometries.woodCrown} material={lm.woodCrown} />
          <mesh geometry={archGeometries.brassTrim} material={lm.brassTrim} />
          <mesh geometry={nameplateBatch.geometry} material={nameplateBatch.atlas.material} />
        </group>
      )}
    </group>
  );
}
