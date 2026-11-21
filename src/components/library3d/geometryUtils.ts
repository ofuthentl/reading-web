import * as THREE from 'three';

/**
 * Lightweight merger for homogeneous Three.js geometries (identical position/normal/uv
 * attributes and consistent indexed vs non-indexed layout). Always disposes input parts.
 */
export function mergeSimpleGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) return new THREE.BufferGeometry();
  if (parts.length === 1) return parts[0];

  const allIndexed = parts.every((part) => part.index !== null);
  const normalized: THREE.BufferGeometry[] = allIndexed
    ? parts
    : parts.map((part) => {
        if (part.index === null) return part;
        const expanded = part.toNonIndexed();
        part.dispose();
        return expanded;
      });

  const hasIndex = allIndexed;
  let totalVerts = 0;
  let totalIndices = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    const pos = normalized[i].attributes.position;
    if (!pos) continue;
    totalVerts += pos.count;
    if (hasIndex && normalized[i].index) {
      totalIndices += normalized[i].index!.count;
    }
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = hasIndex
    ? totalVerts > 65535
      ? new Uint32Array(totalIndices)
      : new Uint16Array(totalIndices)
    : null;

  let vertOffset = 0;
  let idxOffset = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    const geom = normalized[i];
    const pos = geom.attributes.position as THREE.BufferAttribute | undefined;
    const norm = geom.attributes.normal as THREE.BufferAttribute | undefined;
    const uv = geom.attributes.uv as THREE.BufferAttribute | undefined;
    if (!pos) {
      geom.dispose();
      continue;
    }

    positions.set(pos.array as Float32Array, vertOffset * 3);
    if (norm) normals.set(norm.array as Float32Array, vertOffset * 3);
    if (uv) uvs.set(uv.array as Float32Array, vertOffset * 2);

    if (indices && geom.index) {
      const src = geom.index.array;
      for (let j = 0; j < src.length; j += 1) {
        indices[idxOffset + j] = src[j] + vertOffset;
      }
      idxOffset += src.length;
    }

    vertOffset += pos.count;
    geom.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (indices) {
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
  }
  return merged;
}
