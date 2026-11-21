import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
import { createProceduralSkyEnvironment } from './skyEnvironment';
import { TownWorldGlb } from './TownWorldGlb';
import { BossArenaMesh } from './BossArenaMesh';
import { WorldHorizonVista } from './WorldHorizonVista';
import { GrandLibraryHallMesh } from './GrandLibraryHallMesh';

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
  const { gl, scene } = useThree();
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

  // Zero-CDN PMREM Sky/Sun IBL environment so wet cobblestones, European windows,
  // metallic trims, and anime models reflect natural daylight/dusk/moonlight (`D-010`/`D-019`)
  useEffect(() => {
    const env = createProceduralSkyEnvironment(gl, palette, theme);
    if (!env) return undefined;
    scene.environment = env.texture;
    scene.environmentIntensity = env.intensity;
    requestRender?.();
    return () => {
      if (scene.environment === env.texture) {
        scene.environment = null;
      }
      env.dispose();
    };
  }, [gl, scene, palette, theme, requestRender]);

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
      archGeometries.bookcaseLampGlow.dispose();
    };
  }, [archGeometries]);

  const skyGeometry = useMemo(() => new THREE.SphereGeometry(460, 28, 18), []);
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

  if (floor.isBossRoom) {
    return (
      <BossArenaMesh
        floor={floor}
        worldMaterials={worldBundle}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
        requestRender={requestRender}
      />
    );
  }

  return (
    <group name={`world-biome-floor-${floor.floorNumber}`}>
      <color attach="background" args={[palette.fogColor]} />
      <fog attach="fog" args={[palette.fogColor, palette.fogNear, palette.fogFar]} />

      {/* Painted 2K equirectangular SkyDome synced with Day / Dusk / Starry Night */}
      <mesh geometry={skyGeometry} material={wm.skyDome} frustumCulled={false} />

      {/* 360-degree Aincrad outside horizon vista: cloud sea, mountains, floating islands & upper citadel ring */}
      <WorldHorizonVista
        biomeId={floor.biomeId}
        theme={theme}
        biomeVariant={floor.biomeVariant}
        paused={paused}
        prefersReducedMotion={prefersReducedMotion}
      />

      {/* Biome-tuned lighting rig + soft directional shadows (0 CDN HDRI) */}
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, palette.hemiIntensity]} />
      <directionalLight
        color={palette.sunColor}
        intensity={palette.sunIntensity}
        position={palette.sunPosition}
        castShadow={!prefersReducedMotion}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={2}
        shadow-camera-far={95}
        shadow-bias={-0.0005}
        shadow-normalBias={0.035}
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

      {/* Floor 1 Real GLB European Cobblestone Town Scenery (`D-019`) */}
      {floor.biomeId === 'town_of_beginnings' && (
        <TownWorldGlb
          theme={theme}
          prefersReducedMotion={prefersReducedMotion}
          requestRender={requestRender}
        />
      )}

      {/* Floor 3 Two-Story Cathedral Grand Library with Real PBR GLBs (`D-023`) */}
      {floor.biomeId === 'starfield_atrium' && (
        <GrandLibraryHallMesh
          theme={theme}
          libraryMaterials={libraryMaterials}
          worldMaterials={worldBundle}
          requestRender={requestRender}
        />
      )}

      {/* Merged Biome Terrain, Streets, Bridge, Water & Vault Glass */}
      {archGeometries.ground.attributes.position && (
        <mesh geometry={archGeometries.ground} material={wm.ground} receiveShadow />
      )}
      {archGeometries.plaza.attributes.position && (
        <mesh geometry={archGeometries.plaza} material={wm.plaza} receiveShadow />
      )}
      {archGeometries.stone.attributes.position && (
        <mesh geometry={archGeometries.stone} material={wm.stone} castShadow receiveShadow />
      )}
      {archGeometries.bridgeWood.attributes.position && (
        <mesh geometry={archGeometries.bridgeWood} material={wm.bridgeWood} castShadow receiveShadow />
      )}
      {archGeometries.bridgeRed.attributes.position && (
        <mesh geometry={archGeometries.bridgeRed} material={wm.bridgeRed} castShadow receiveShadow />
      )}
      {archGeometries.water && <mesh geometry={archGeometries.water} material={wm.water} />}
      {archGeometries.glassDome && (
        <mesh geometry={archGeometries.glassDome} material={wm.glassDome} />
      )}
      {archGeometries.brassTrim.attributes.position && (
        <mesh geometry={archGeometries.brassTrim} material={lm.brassTrim} />
      )}

      {/* Rotated Grand Bookcases, Twin Brass Sconce Lamps & Batched Shelf Nameplates */}
      {floor.bookcases.length > 0 && (
        <group name="world-floor-bookcases">
          <mesh geometry={archGeometries.woodBackPanel} material={lm.woodBackPanel} receiveShadow />
          <mesh geometry={archGeometries.woodCabinet} material={lm.woodCabinet} castShadow receiveShadow />
          <mesh geometry={archGeometries.woodCrown} material={lm.woodCrown} receiveShadow />
          {archGeometries.bookcaseLampGlow.attributes.position && (
            <mesh geometry={archGeometries.bookcaseLampGlow} material={lm.lanternGlow} />
          )}
          <mesh geometry={nameplateBatch.geometry} material={nameplateBatch.atlas.material} />
          {floor.bookcases.map((bc) => {
            const nx = Math.sin(bc.facingYaw);
            const nz = Math.cos(bc.facingYaw);
            const lightColor =
              theme === 'midnight' ? '#ffd591' : theme === 'dim' ? '#ffcb7d' : '#ffebc2';
            const lightIntensity = theme === 'midnight' ? 6.4 : theme === 'dim' ? 4.2 : 1.15;
            return (
              <pointLight
                key={`lamp-${bc.id}`}
                color={lightColor}
                intensity={lightIntensity}
                distance={7.8}
                decay={1.48}
                position={[
                  bc.position[0] + nx * 0.95,
                  bc.position[1] + 2.38,
                  bc.position[2] + nz * 0.95,
                ]}
              />
            );
          })}
        </group>
      )}
    </group>
  );
}
