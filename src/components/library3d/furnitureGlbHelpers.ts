import * as THREE from 'three';
import { cloneGlbTemplate, type LoadedGlbTemplate } from './gltfLoader';

const BASE = import.meta.env.BASE_URL ?? '/';

export const PROP_GLB_URLS = {
  victorianBookcase: `${BASE}models/prop-bookcase-victorian.glb`,
  libraryTable: `${BASE}models/prop-library-table.glb`,
  woodenTable: `${BASE}models/prop-wooden-table.glb`,
  artisanTable: `${BASE}models/prop-artisan-table.glb`,
  libraryChair: `${BASE}models/prop-library-chair.glb`,
  armchair: `${BASE}models/prop-armchair.glb`,
  bookPile: `${BASE}models/prop-book-pile.glb`,
  dragonDoor: `${BASE}models/prop-dragon-door.glb`,
  libraryStairs: `${BASE}models/prop-library-stairs.glb`,
  spiralStairs: `${BASE}models/prop-spiral-stairs.glb`,
  stoneWell: `${BASE}models/prop-stone-well.glb`,
  stonePlatform: `${BASE}models/prop-stone-platform.glb`,
} as const;

export interface PreparedGlbProp {
  instance: THREE.Object3D;
  size: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
  clonedMaterials: THREE.Material[];
}

export interface PrepareGlbOptions {
  maxAniso: number;
  hidePattern?: RegExp;
  onlyPattern?: RegExp;
  /** Optional material color multiplier by material-name regex (clones material safely for disposal) */
  tints?: Array<{ match: RegExp; color: string; roughness?: number }>;
}

/**
 * Clones a cached local `.glb` template, optionally filters sub-meshes or applies safe
 * cloned-material color tints (for wood/cushion variety), and returns exact grounding bounds.
 */
export function prepareGlbProp(
  template: LoadedGlbTemplate,
  options: PrepareGlbOptions,
): PreparedGlbProp {
  const { maxAniso, hidePattern, onlyPattern, tints } = options;
  const instance = cloneGlbTemplate(template);
  instance.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const clonedMaterials: THREE.Material[] = [];

  instance.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (hidePattern && hidePattern.test(obj.name)) {
      obj.visible = false;
      return;
    }
    if (onlyPattern && !onlyPattern.test(obj.name)) {
      obj.visible = false;
      return;
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
    meshBox.setFromObject(obj);
    box.union(meshBox);

    const applyMat = (src: THREE.Material): THREE.Material => {
      const std = src as THREE.MeshStandardMaterial;
      if (std.map) std.map.anisotropy = maxAniso;
      if (!tints || tints.length === 0) return src;
      const rule = tints.find((t) => t.match.test(src.name || obj.name));
      if (!rule) return src;
      const cloned = src.clone() as THREE.MeshStandardMaterial;
      if (cloned.color) cloned.color.set(rule.color);
      if (rule.roughness !== undefined && typeof cloned.roughness === 'number') {
        cloned.roughness = rule.roughness;
      }
      clonedMaterials.push(cloned);
      return cloned;
    };

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map(applyMat);
    } else if (obj.material) {
      obj.material = applyMat(obj.material);
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
    clonedMaterials,
  };
}

export function disposeClonedMaterials(materials: readonly THREE.Material[]): void {
  for (let i = 0; i < materials.length; i += 1) {
    materials[i].dispose();
  }
}

export function computeFitTransform(
  prep: PreparedGlbProp,
  target: [number, number, number] | number,
): { scale: [number, number, number]; offset: [number, number, number] } {
  let sx: number;
  let sy: number;
  let sz: number;
  if (typeof target === 'number') {
    const s = target / Math.max(0.01, prep.size.y);
    sx = s;
    sy = s;
    sz = s;
  } else {
    sx = target[0] / Math.max(0.01, prep.size.x);
    sy = target[1] / Math.max(0.01, prep.size.y);
    sz = target[2] / Math.max(0.01, prep.size.z);
  }
  return {
    scale: [sx, sy, sz],
    offset: [-prep.center.x * sx, -prep.minY * sy, -prep.center.z * sz],
  };
}

/**
 * Loads the seamless local PBR wood grain texture (`public/textures/pbr-wood-albedo.webp`, 0 CDN)
 * and applies it onto the target wood materials with clean cancellation on disposal.
 */
export function attachLocalWoodAlbedo(
  targets: readonly THREE.MeshStandardMaterial[],
  isDisposed: () => boolean,
  onReady: (tex: THREE.Texture) => void,
): void {
  if (typeof window === 'undefined') return;
  new THREE.TextureLoader().load(
    `${BASE}textures/pbr-wood-albedo.webp`,
    (tex) => {
      if (isDisposed()) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      for (let i = 0; i < targets.length; i += 1) {
        targets[i].map = tex;
        targets[i].needsUpdate = true;
      }
      onReady(tex);
    },
    undefined,
    () => undefined,
  );
}
