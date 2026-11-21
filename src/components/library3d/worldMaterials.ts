import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import type { BiomeId } from './worldTypes';
import {
  getWorldBiomePalette,
  type WorldBiomeVisualPalette,
} from './worldPalettes';

export { getWorldBiomePalette, type WorldBiomeVisualPalette };

export interface WorldMaterialBundle {
  readonly textures: {
    cobble: THREE.CanvasTexture;
    grass: THREE.CanvasTexture;
    marble: THREE.CanvasTexture;
    water: THREE.CanvasTexture;
    sky: THREE.CanvasTexture;
  };
  readonly materials: {
    ground: THREE.MeshStandardMaterial;
    plaza: THREE.MeshStandardMaterial;
    stone: THREE.MeshStandardMaterial;
    bridgeWood: THREE.MeshStandardMaterial;
    bridgeRed: THREE.MeshStandardMaterial;
    water: THREE.MeshStandardMaterial;
    glassDome: THREE.MeshStandardMaterial;
    foliageMain: THREE.MeshStandardMaterial;
    foliageAlt: THREE.MeshStandardMaterial;
    bark: THREE.MeshStandardMaterial;
    lampGlow: THREE.MeshStandardMaterial;
    portalGlow: THREE.MeshStandardMaterial;
    crystal: THREE.MeshStandardMaterial;
    skyDome: THREE.MeshBasicMaterial;
  };
  applyBiomeTheme: (biomeId: BiomeId, theme: AppTheme, variant?: number) => WorldBiomeVisualPalette;
  dispose: () => void;
}

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w: number, h: number) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

function toTexture(
  canvas: HTMLCanvasElement | null,
  repeat: boolean,
  srgb: boolean,
  repeatCount = 1,
): THREE.CanvasTexture {
  const safe =
    canvas ??
    (typeof document !== 'undefined'
      ? Object.assign(document.createElement('canvas'), { width: 2, height: 2 })
      : ({ width: 2, height: 2 } as unknown as HTMLCanvasElement));
  const tex = new THREE.CanvasTexture(safe);
  const wrap = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  if (repeat && repeatCount > 1) tex.repeat.set(repeatCount, repeatCount);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createCobbleTexture(): THREE.CanvasTexture {
  const size = 512;
  const surf = makeCanvas(size, size);
  if (!surf) return toTexture(null, true, true, 10);
  const { canvas, ctx } = surf;
  const rand = createSeededRandom(31097);

  ctx.fillStyle = '#9a9286';
  ctx.fillRect(0, 0, size, size);
  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r += 1) {
    const cols = 6;
    const colW = size / cols;
    const offset = r % 2 === 0 ? 0 : colW * 0.5;
    for (let c = -1; c <= cols; c += 1) {
      const x = c * colW + offset;
      const y = r * rowH;
      const shade = 196 + Math.floor((rand() - 0.5) * 34);
      const warm = Math.floor((rand() - 0.5) * 14);
      ctx.fillStyle = `rgb(${shade + warm}, ${shade}, ${shade - 8})`;
      ctx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);
      ctx.strokeStyle = 'rgba(72, 66, 58, 0.34)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, colW - 6, rowH - 6);
    }
  }
  for (let i = 0; i < 600; i += 1) {
    const lum = rand() > 0.5 ? 245 : 70;
    ctx.fillStyle = `rgba(${lum}, ${lum}, ${lum}, 0.08)`;
    ctx.fillRect(rand() * size, rand() * size, 3, 3);
  }
  return toTexture(canvas, true, true, 12);
}

function createGrassTexture(): THREE.CanvasTexture {
  const size = 512;
  const surf = makeCanvas(size, size);
  if (!surf) return toTexture(null, true, true, 14);
  const { canvas, ctx } = surf;
  const rand = createSeededRandom(65413);

  ctx.fillStyle = '#b4c9a2';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 8 + rand() * 24;
    const h = 8 + rand() * 24;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(220, 240, 198, 0.14)' : 'rgba(92, 126, 78, 0.15)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 1600; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.strokeStyle = rand() > 0.45 ? 'rgba(76, 110, 64, 0.22)' : 'rgba(232, 246, 206, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 5, y - 5 - rand() * 8);
    ctx.stroke();
  }
  return toTexture(canvas, true, true, 14);
}

function createMarbleTexture(): THREE.CanvasTexture {
  const size = 512;
  const surf = makeCanvas(size, size);
  if (!surf) return toTexture(null, true, true, 10);
  const { canvas, ctx } = surf;
  const rand = createSeededRandom(92147);

  ctx.fillStyle = '#e7e1d5';
  ctx.fillRect(0, 0, size, size);
  const step = size / 4;
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const shade = 228 + Math.floor((rand() - 0.5) * 14);
      ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 10})`;
      ctx.fillRect(c * step + 2, r * step + 2, step - 4, step - 4);
      ctx.strokeStyle = 'rgba(130, 118, 102, 0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(c * step + 1, r * step + 1, step - 2, step - 2);
    }
  }
  for (let i = 0; i < 40; i += 1) {
    ctx.strokeStyle = 'rgba(165, 152, 136, 0.14)';
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    let x = rand() * size;
    let y = rand() * size;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k += 1) {
      x += (rand() - 0.3) * 45;
      y += (rand() - 0.5) * 28;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(canvas, true, true, 10);
}

function createWaterTexture(): THREE.CanvasTexture {
  const size = 256;
  const surf = makeCanvas(size, size);
  if (!surf) return toTexture(null, true, true, 8);
  const { canvas, ctx } = surf;
  const rand = createSeededRandom(44201);

  ctx.fillStyle = '#9ecbe0';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 180; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 18 + rand() * 38;
    ctx.strokeStyle = rand() > 0.4 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(65, 112, 145, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w * 0.5, y + (rand() - 0.5) * 6, x + w, y);
    ctx.stroke();
  }
  return toTexture(canvas, true, true, 8);
}

function paintSkyCanvas(canvas: HTMLCanvasElement, palette: WorldBiomeVisualPalette): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, palette.skyTop);
  grad.addColorStop(0.52, palette.skyHorizon);
  grad.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const rand = createSeededRandom(palette.showStars ? 7711 : 5503);
  if (palette.showStars) {
    const neb = ctx.createRadialGradient(w * 0.65, h * 0.26, 8, w * 0.65, h * 0.26, w * 0.34);
    neb.addColorStop(0, 'rgba(139, 92, 246, 0.24)');
    neb.addColorStop(0.5, 'rgba(56, 189, 248, 0.12)');
    neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, h * 0.65);

    for (let i = 0; i < palette.starDensity; i += 1) {
      const x = rand() * w;
      const y = rand() * h * 0.54;
      const r = 0.6 + rand() * 1.6;
      ctx.fillStyle = `rgba(244, 248, 255, ${(0.35 + rand() * 0.65).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const moon = ctx.createRadialGradient(w * 0.28, h * 0.2, 4, w * 0.28, h * 0.2, 42);
    moon.addColorStop(0, 'rgba(255, 252, 236, 0.96)');
    moon.addColorStop(0.32, 'rgba(218, 232, 255, 0.45)');
    moon.addColorStop(1, 'rgba(218, 232, 255, 0)');
    ctx.fillStyle = moon;
    ctx.fillRect(w * 0.16, h * 0.04, 120, 120);
  } else {
    const sun = ctx.createRadialGradient(w * 0.72, h * 0.28, 6, w * 0.72, h * 0.28, 86);
    sun.addColorStop(0, palette.sunColor);
    sun.addColorStop(0.45, 'rgba(255, 236, 198, 0.28)');
    sun.addColorStop(1, 'rgba(255, 236, 198, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(w * 0.5, 0, 220, 180);

    for (let i = 0; i < 24; i += 1) {
      const cx = rand() * w;
      const cy = h * (0.14 + rand() * 0.28);
      ctx.fillStyle = 'rgba(255, 250, 242, 0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 24 + rand() * 54, 8 + rand() * 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 64;
  const surf = makeCanvas(size, size);
  if (!surf) return toTexture(null, false, false);
  const { canvas, ctx } = surf;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(10, 14, 24, 0.42)');
  grad.addColorStop(0.6, 'rgba(10, 14, 24, 0.18)');
  grad.addColorStop(1, 'rgba(10, 14, 24, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, false, false);
}

export function createSoftParticleTexture(
  kind: 'leaves' | 'petals' | 'dust_motes' | 'fireflies',
): THREE.CanvasTexture {
  const size = 64;
  const surf = makeCanvas(size, size);
  if (!surf) return toTexture(null, false, false);
  const { canvas, ctx } = surf;

  ctx.clearRect(0, 0, size, size);
  if (kind === 'petals' || kind === 'leaves') {
    ctx.save();
    ctx.translate(32, 32);
    ctx.rotate(-0.45);
    const grad = ctx.createRadialGradient(0, -4, 2, 0, 0, 26);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.65)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return toTexture(canvas, false, false);
}

export function createWorldMaterialBundle(
  initialBiome: BiomeId,
  initialTheme: AppTheme,
): WorldMaterialBundle {
  const cobble = createCobbleTexture();
  const grass = createGrassTexture();
  const marble = createMarbleTexture();
  const water = createWaterTexture();
  const skySurf = makeCanvas(512, 256);
  const sky = toTexture(skySurf?.canvas ?? null, false, true);

  const materials = {
    ground: new THREE.MeshStandardMaterial({ map: grass, roughness: 0.92, metalness: 0.02 }),
    plaza: new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.84, metalness: 0.04 }),
    stone: new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.88, metalness: 0.05 }),
    bridgeWood: new THREE.MeshStandardMaterial({ color: '#7a4b2a', roughness: 0.72, metalness: 0.05 }),
    bridgeRed: new THREE.MeshStandardMaterial({ color: '#b5392e', roughness: 0.56, metalness: 0.08 }),
    water: new THREE.MeshStandardMaterial({
      map: water,
      roughness: 0.16,
      metalness: 0.25,
      transparent: true,
      opacity: 0.86,
    }),
    glassDome: new THREE.MeshStandardMaterial({
      color: '#d8eeff',
      roughness: 0.12,
      metalness: 0.15,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
    }),
    foliageMain: new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02 }),
    foliageAlt: new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.02 }),
    bark: new THREE.MeshStandardMaterial({ color: '#5c3f2b', roughness: 0.9, metalness: 0.02 }),
    lampGlow: new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.05 }),
    portalGlow: new THREE.MeshStandardMaterial({
      roughness: 0.18,
      metalness: 0.1,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    }),
    crystal: new THREE.MeshStandardMaterial({
      color: '#a78bfa',
      emissive: '#7c3aed',
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.15,
    }),
    skyDome: new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, depthWrite: false, fog: false }),
  };

  const applyBiomeTheme = (
    biomeId: BiomeId,
    theme: AppTheme,
    variant = 0,
  ): WorldBiomeVisualPalette => {
    const pal = getWorldBiomePalette(biomeId, theme, variant);
    if (skySurf) {
      paintSkyCanvas(skySurf.canvas, pal);
      sky.needsUpdate = true;
    }
    materials.ground.map =
      biomeId === 'starfield_atrium' ? marble : biomeId === 'starlight_ruins' ? cobble : grass;
    materials.ground.needsUpdate = true;
    materials.ground.color.set(pal.groundTint);

    materials.plaza.map = biomeId === 'starfield_atrium' ? marble : cobble;
    materials.plaza.needsUpdate = true;
    materials.plaza.color.set(pal.plazaTint);

    materials.stone.color.set(pal.accentStone);
    materials.foliageMain.color.set(pal.foliagePrimary);
    materials.foliageAlt.color.set(pal.foliageSecondary);
    materials.water.color.set(pal.waterColor);
    materials.lampGlow.color.set(pal.lampGlow);
    materials.lampGlow.emissive.set(pal.lampGlow);
    materials.lampGlow.emissiveIntensity = pal.lampEmissiveIntensity;
    materials.portalGlow.color.set(pal.portalGlow);
    materials.portalGlow.emissive.set(pal.portalGlow);
    materials.portalGlow.emissiveIntensity = 1.25;
    materials.crystal.emissiveIntensity =
      theme === 'midnight' ? 1.45 : theme === 'dim' ? 1.1 : 0.72;
    return pal;
  };

  applyBiomeTheme(initialBiome, initialTheme, 0);
  let disposed = false;

  return {
    textures: { cobble, grass, marble, water, sky },
    materials,
    applyBiomeTheme,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      Object.values(materials).forEach((m) => m.dispose());
      cobble.dispose();
      grass.dispose();
      marble.dispose();
      water.dispose();
      sky.dispose();
    },
  };
}
