import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedGlbTemplate {
  url: string;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
}

let sharedLoader: GLTFLoader | null = null;
let cacheGeneration = 0;
const templateCache = new Map<string, Promise<LoadedGlbTemplate>>();
const resolvedTemplates = new Map<string, LoadedGlbTemplate>();

async function getConfiguredLoader(): Promise<GLTFLoader> {
  if (!sharedLoader) {
    // Strictly local MeshoptDecoder bundled from `three` — 0 external CDN (D-010)
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    sharedLoader = loader;
  }
  return sharedLoader;
}

function computeSceneBoundingBox(root: THREE.Object3D): LoadedGlbTemplate['bbox'] {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
    size: [size.x, size.y, size.z],
  };
}

function disposeMaterialAndMaps(material: THREE.Material): void {
  const mat = material as unknown as Record<string, unknown>;
  const mapKeys = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
    'bumpMap',
    'alphaMap',
  ];
  for (let i = 0; i < mapKeys.length; i += 1) {
    const tex = mat[mapKeys[i]];
    if (tex instanceof THREE.Texture) {
      tex.dispose();
    }
  }
  material.dispose();
}

/**
 * Disposes GPU geometries/materials of an Object3D subtree.
 * Keep `disposeResources = false` when tearing down clones that share cached template geometry/textures.
 */
export function disposeObject3D(root: THREE.Object3D, disposeResources = false): void {
  if (!disposeResources) return;
  const seenGeom = new Set<THREE.BufferGeometry>();
  const seenMat = new Set<THREE.Material>();

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry instanceof THREE.BufferGeometry && !seenGeom.has(obj.geometry)) {
        seenGeom.add(obj.geometry);
        obj.geometry.dispose();
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < mats.length; i += 1) {
        const m = mats[i];
        if (m && !seenMat.has(m)) {
          seenMat.add(m);
          disposeMaterialAndMaps(m);
        }
      }
    }
  });
}

export function hasCachedLocalGlb(url: string): boolean {
  return resolvedTemplates.has(url);
}

/**
 * Loads and caches a local `.glb` from `public/models/` using Three.js `GLTFLoader`
 * + local `MeshoptDecoder` (zero external CDN requests, zero remote Draco decoder).
 */
export function loadLocalGlb(url: string): Promise<LoadedGlbTemplate> {
  const existing = templateCache.get(url);
  if (existing) return existing;

  const generation = cacheGeneration;
  const pending = getConfiguredLoader()
    .then((loader) => loader.loadAsync(url))
    .then((gltf: GLTF) => {
      const scene = gltf.scene;
      // Chống rò VRAM nếu rời 3D (clearLocalGlbCache) trong khi file GLB vẫn đang giải mã
      if (generation !== cacheGeneration) {
        disposeObject3D(scene, true);
        throw new Error('GLB cache cleared while loading');
      }
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
          obj.frustumCulled = true;
        }
      });
      const template: LoadedGlbTemplate = {
        url,
        scene,
        animations: gltf.animations ?? [],
        bbox: computeSceneBoundingBox(scene),
      };
      resolvedTemplates.set(url, template);
      return template;
    })
    .catch((err) => {
      if (templateCache.get(url) === pending) {
        templateCache.delete(url);
      }
      throw err;
    });

  templateCache.set(url, pending);
  return pending;
}

/**
 * Creates an independent scene-graph instance from a cached GLB template while sharing
 * immutable GPU geometry & WebP texture buffers across instances.
 */
export function cloneGlbTemplate(template: LoadedGlbTemplate): THREE.Object3D {
  return cloneSkinned(template.scene);
}

/**
 * Disposes all cached GLB templates & textures (call only when tearing down 3D completely).
 */
export function clearLocalGlbCache(): void {
  cacheGeneration += 1;
  for (const template of resolvedTemplates.values()) {
    disposeObject3D(template.scene, true);
  }
  resolvedTemplates.clear();
  templateCache.clear();
}

export function useLocalGlb(url: string | null): {
  template: LoadedGlbTemplate | null;
  error: string | null;
} {
  const [template, setTemplate] = useState<LoadedGlbTemplate | null>(() =>
    url ? (resolvedTemplates.get(url) ?? null) : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setTemplate(null);
      setError(null);
      return undefined;
    }

    const cached = resolvedTemplates.get(url);
    if (cached) {
      setTemplate(cached);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    loadLocalGlb(url)
      .then((loaded) => {
        if (!cancelled) {
          setTemplate(loaded);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTemplate(null);
          setError(err instanceof Error ? err.message : 'Failed to load local GLB model');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { template, error };
}
