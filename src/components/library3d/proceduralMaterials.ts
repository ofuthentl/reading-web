import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';

export interface Library3DLightingRig {
  hemisphere: { skyColor: string; groundColor: string; intensity: number };
  keyDirectional: { color: string; intensity: number; position: [number, number, number] };
  fillDirectional: { color: string; intensity: number; position: [number, number, number] };
  lanternPoint: { color: string; intensity: number; distance: number; decay: number };
}

export interface Library3DThemePalette {
  theme: AppTheme;
  background: string;
  fog: { color: string; near: number; far: number };
  wood: { cabinet: string; crown: string; backPanel: string; floor: string };
  hall: {
    wall: string;
    column: string;
    windowGlow: string;
    windowGlowIntensity: number;
    brassTrim: string;
    lanternGlow: string;
    lanternGlowIntensity: number;
  };
  book: { pages: string; selectedTint: string; hoveredTint: string };
  nameplate: { bg: string; border: string; text: string; subtext: string };
  lighting: Library3DLightingRig;
}

export interface LibraryMaterialBundle {
  readonly theme: AppTheme;
  readonly palette: Library3DThemePalette;
  readonly textures: {
    woodAlbedo: THREE.CanvasTexture;
    woodBump: THREE.CanvasTexture;
    paper: THREE.CanvasTexture;
  };
  readonly materials: {
    woodCabinet: THREE.MeshStandardMaterial;
    woodCrown: THREE.MeshStandardMaterial;
    woodBackPanel: THREE.MeshStandardMaterial;
    woodFloor: THREE.MeshStandardMaterial;
    hallWall: THREE.MeshStandardMaterial;
    hallColumn: THREE.MeshStandardMaterial;
    windowGlow: THREE.MeshStandardMaterial;
    brassTrim: THREE.MeshStandardMaterial;
    lanternGlow: THREE.MeshStandardMaterial;
    bookBody: THREE.MeshStandardMaterial;
    bookPages: THREE.MeshStandardMaterial;
  };
  applyTheme: (nextTheme: AppTheme) => Library3DThemePalette;
  dispose: () => void;
}

export interface ShelfNameplateItem {
  key: string;
  name: string;
  bookCount: number;
}

export interface NameplateUVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface ShelfNameplateAtlas {
  texture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  uvByKey: Map<string, NameplateUVRect>;
  dispose: () => void;
}

const SYSTEM_SERIF_FONT =
  "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, Cambria, serif";
const SYSTEM_SANS_FONT =
  "'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export const LIBRARY_3D_THEME_PALETTES: Record<AppTheme, Library3DThemePalette> = {
  light: {
    theme: 'light',
    background: '#ece2d0',
    fog: { color: '#ece2d0', near: 15, far: 38 },
    wood: { cabinet: '#96633b', crown: '#6e4324', backPanel: '#5e3c23', floor: '#b98d5f' },
    hall: {
      wall: '#f0e7d6',
      column: '#dfd0b8',
      windowGlow: '#fff9eb',
      windowGlowIntensity: 0.95,
      brassTrim: '#d4a64a',
      lanternGlow: '#ffe5a8',
      lanternGlowIntensity: 0.95,
    },
    book: { pages: '#f4ebd9', selectedTint: '#f5c26b', hoveredTint: '#fff2cf' },
    nameplate: { bg: '#3c2516', border: '#d7aa55', text: '#fbf0d9', subtext: '#d8bc8b' },
    lighting: {
      hemisphere: { skyColor: '#fff6e4', groundColor: '#9b7752', intensity: 1.2 },
      keyDirectional: { color: '#fff0d2', intensity: 1.45, position: [8, 12, 10] },
      fillDirectional: { color: '#dbe8f6', intensity: 0.45, position: [-8, 6, 7] },
      lanternPoint: { color: '#ffd18b', intensity: 0.65, distance: 15, decay: 1.9 },
    },
  },
  dim: {
    theme: 'dim',
    background: '#111722',
    fog: { color: '#111722', near: 13, far: 34 },
    wood: { cabinet: '#6b4229', crown: '#462a1a', backPanel: '#2f1c12', floor: '#3d2a1e' },
    hall: {
      wall: '#1d2534',
      column: '#2c3342',
      windowGlow: '#375380',
      windowGlowIntensity: 0.72,
      brassTrim: '#dca544',
      lanternGlow: '#ffb960',
      lanternGlowIntensity: 2.2,
    },
    book: { pages: '#ded1ba', selectedTint: '#f2b857', hoveredTint: '#ffe4ad' },
    nameplate: { bg: '#22150e', border: '#d9a441', text: '#f5e4c3', subtext: '#bfa273' },
    lighting: {
      hemisphere: { skyColor: '#6781ab', groundColor: '#422a19', intensity: 0.72 },
      keyDirectional: { color: '#8cabde', intensity: 0.65, position: [-7, 11, 8] },
      fillDirectional: { color: '#ffbf7a', intensity: 0.62, position: [6, 8, 9] },
      lanternPoint: { color: '#ffaa4d', intensity: 2.25, distance: 16, decay: 1.65 },
    },
  },
  midnight: {
    theme: 'midnight',
    background: '#07090f',
    fog: { color: '#07090f', near: 12, far: 32 },
    wood: { cabinet: '#694738', crown: '#4a3128', backPanel: '#38251e', floor: '#221f29' },
    hall: {
      wall: '#121622',
      column: '#1f2536',
      windowGlow: '#789ad4',
      windowGlowIntensity: 0.85,
      brassTrim: '#d0be92',
      lanternGlow: '#ffd8a8',
      lanternGlowIntensity: 2.8,
    },
    book: { pages: '#c9c4d4', selectedTint: '#a6c6ff', hoveredTint: '#e4eeff' },
    nameplate: { bg: '#15131a', border: '#c8b68c', text: '#eceaf2', subtext: '#a7a3b5' },
    lighting: {
      hemisphere: { skyColor: '#7697d1', groundColor: '#1d1828', intensity: 0.62 },
      keyDirectional: { color: '#bfd5ff', intensity: 0.98, position: [7, 13, 9] },
      fillDirectional: { color: '#6b7cb0', intensity: 0.42, position: [-8, 6, 6] },
      lanternPoint: { color: '#ffd4a3', intensity: 1.55, distance: 15, decay: 1.75 },
    },
  },
};

export function getLibrary3DThemePalette(theme: AppTheme): Library3DThemePalette {
  return LIBRARY_3D_THEME_PALETTES[theme];
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createCanvas2D(width: number, height: number) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

function buildCanvasTexture(
  canvas: HTMLCanvasElement | null,
  repeat: boolean,
  srgb: boolean,
): THREE.CanvasTexture {
  const safeCanvas =
    canvas ??
    (typeof document !== 'undefined'
      ? Object.assign(document.createElement('canvas'), { width: 2, height: 2 })
      : ({ width: 2, height: 2 } as unknown as HTMLCanvasElement));
  const texture = new THREE.CanvasTexture(safeCanvas);
  const wrap = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function drawWoodGrainWaves(
  ctx: CanvasRenderingContext2D,
  size: number,
  lines: number,
  rand: () => number,
  strokeForLine: () => string,
  maxAmp: number,
  maxWidth: number,
): void {
  const twoPi = Math.PI * 2;
  for (let i = 0; i < lines; i += 1) {
    const baseX = rand() * size;
    const freq = 1 + Math.floor(rand() * 3);
    const amp = 1 + rand() * maxAmp;
    const phase = rand() * twoPi;
    ctx.strokeStyle = strokeForLine();
    ctx.lineWidth = 0.8 + rand() * maxWidth;
    ctx.beginPath();
    for (let y = 0; y <= size; y += 16) {
      const x = baseX + Math.sin((y / size) * twoPi * freq + phase) * amp;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function createWoodAlbedoTexture(): THREE.CanvasTexture {
  const size = 512;
  const surface = createCanvas2D(size, size);
  if (!surface) return buildCanvasTexture(null, true, true);
  const { canvas, ctx } = surface;
  const rand = createSeededRandom(40219);
  const plankW = size / 4;

  // Neutral warm wood base so material.color tints cleanly across all 3 themes
  ctx.fillStyle = '#d9c3a7';
  ctx.fillRect(0, 0, size, size);
  for (let p = 0; p < 4; p += 1) {
    const shade = 212 + Math.floor((rand() - 0.5) * 18);
    ctx.fillStyle = `rgba(${shade}, ${shade - 22}, ${shade - 46}, 0.24)`;
    ctx.fillRect(p * plankW, 0, plankW, size);
  }
  drawWoodGrainWaves(
    ctx,
    size,
    190,
    rand,
    () =>
      rand() > 0.35
        ? `rgba(88, 54, 28, ${(0.045 + rand() * 0.095).toFixed(3)})`
        : `rgba(248, 232, 208, ${(0.035 + rand() * 0.06).toFixed(3)})`,
    5.5,
    2.0,
  );
  for (let i = 0; i < 400; i += 1) {
    ctx.fillStyle = `rgba(74, 44, 22, ${(0.04 + rand() * 0.07).toFixed(3)})`;
    ctx.fillRect(rand() * size, rand() * size, 1, 4 + rand() * 14);
  }
  for (let p = 0; p < 4; p += 1) {
    const seamX = p * plankW;
    ctx.fillStyle = 'rgba(64, 38, 18, 0.16)';
    ctx.fillRect(seamX, 0, 1.5, size);
    ctx.fillStyle = 'rgba(255, 240, 218, 0.08)';
    ctx.fillRect(seamX + 1.5, 0, 1, size);
  }
  return buildCanvasTexture(canvas, true, true);
}

function createWoodBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const surface = createCanvas2D(size, size);
  if (!surface) return buildCanvasTexture(null, true, false);
  const { canvas, ctx } = surface;
  const rand = createSeededRandom(88103);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  drawWoodGrainWaves(
    ctx,
    size,
    110,
    rand,
    () => {
      const lum = Math.floor(104 + rand() * 48);
      return `rgba(${lum}, ${lum}, ${lum}, 0.28)`;
    },
    3.2,
    1.4,
  );
  ctx.fillStyle = 'rgba(42, 42, 42, 0.38)';
  for (let p = 0; p < 4; p += 1) ctx.fillRect(p * (size / 4), 0, 1.5, size);
  return buildCanvasTexture(canvas, true, false);
}

function createPaperGrainTexture(): THREE.CanvasTexture {
  const size = 256;
  const surface = createCanvas2D(size, size);
  if (!surface) return buildCanvasTexture(null, true, true);
  const { canvas, ctx } = surface;
  const rand = createSeededRandom(19477);

  ctx.fillStyle = '#f3ece0';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 3) {
    ctx.fillStyle = `rgba(110, 92, 68, ${(0.04 + rand() * 0.08).toFixed(3)})`;
    ctx.fillRect(0, y, size, 1);
  }
  for (let i = 0; i < 520; i += 1) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255, 250, 240, 0.14)' : 'rgba(120, 102, 78, 0.09)';
    ctx.fillRect(rand() * size, rand() * size, 2, 1.5);
  }
  return buildCanvasTexture(canvas, true, true);
}

function fitTextWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const cleaned = text.trim() || 'Kệ sách';
  if (ctx.measureText(cleaned).width <= maxWidth) return cleaned;
  let end = cleaned.length;
  while (end > 1 && ctx.measureText(`${cleaned.slice(0, end).trimEnd()}…`).width > maxWidth) {
    end -= 1;
  }
  return `${cleaned.slice(0, Math.max(1, end)).trimEnd()}…`;
}

function drawNameplateCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  palette: Library3DThemePalette,
  bookCount?: number,
): void {
  const { bg, border, text, subtext } = palette.nameplate;
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, bg);
  grad.addColorStop(0.55, bg);
  grad.addColorStop(1, '#120b07');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x + 11, y + 11, w - 22, h - 22);
  ctx.globalAlpha = 1;

  ctx.fillStyle = border;
  for (const [cx, cy] of [
    [x + 17, y + 17],
    [x + w - 17, y + 17],
    [x + 17, y + h - 17],
    [x + w - 17, y + h - 17],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  const maxTextW = w - 56;
  const hasSubtitle = typeof bookCount === 'number';
  let fontSize = 28;
  ctx.font = `600 ${fontSize}px ${SYSTEM_SERIF_FONT}`;
  while (fontSize > 20 && ctx.measureText(label).width > maxTextW) {
    fontSize -= 2;
    ctx.font = `600 ${fontSize}px ${SYSTEM_SERIF_FONT}`;
  }

  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    fitTextWithEllipsis(ctx, label, maxTextW),
    x + w * 0.5,
    hasSubtitle ? y + h * 0.43 : y + h * 0.52,
  );
  if (hasSubtitle) {
    ctx.font = `500 14px ${SYSTEM_SANS_FONT}`;
    ctx.fillStyle = subtext;
    ctx.fillText(`${bookCount} cuốn`, x + w * 0.5, y + h * 0.74);
  }
}

/** Generates a standalone procedural nameplate texture using system fonts (0 CDN). */
export function createShelfNameplateTexture(
  label: string,
  theme: AppTheme,
  bookCount?: number,
): THREE.CanvasTexture {
  const surface = createCanvas2D(512, 96);
  if (!surface) return buildCanvasTexture(null, false, true);
  drawNameplateCell(surface.ctx, 0, 0, 512, 96, label, getLibrary3DThemePalette(theme), bookCount);
  return buildCanvasTexture(surface.canvas, false, true);
}

/**
 * Packs ALL shelf nameplates into ONE shared `CanvasTexture` atlas so even 50+ shelves
 * consume only 1 VRAM texture slot (keeping procedural textures <= 4 per D-013).
 */
export function createShelfNameplateAtlas(
  shelves: readonly ShelfNameplateItem[],
  theme: AppTheme,
): ShelfNameplateAtlas {
  const cellW = 512;
  const cellH = 96;
  const cols = shelves.length > 40 ? 4 : 2;
  const rows = Math.max(1, Math.ceil(Math.max(1, shelves.length) / cols));
  const canvasW = cols * cellW;
  const canvasH = Math.min(2048, Math.max(256, Math.pow(2, Math.ceil(Math.log2(rows * cellH)))));

  const palette = getLibrary3DThemePalette(theme);
  const uvByKey = new Map<string, NameplateUVRect>();
  const surface = createCanvas2D(canvasW, canvasH);

  if (surface) {
    surface.ctx.fillStyle = palette.nameplate.bg;
    surface.ctx.fillRect(0, 0, canvasW, canvasH);
    const maxCells = Math.floor(canvasH / cellH) * cols;
    const renderCount = Math.min(shelves.length, maxCells);
    const gutter = 1.5;

    for (let i = 0; i < renderCount; i += 1) {
      const shelf = shelves[i];
      const px = (i % cols) * cellW;
      const py = Math.floor(i / cols) * cellH;
      drawNameplateCell(surface.ctx, px, py, cellW, cellH, shelf.name, palette, shelf.bookCount);
      uvByKey.set(shelf.key, {
        u0: (px + gutter) / canvasW,
        u1: (px + cellW - gutter) / canvasW,
        v1: 1 - (py + gutter) / canvasH,
        v0: 1 - (py + cellH - gutter) / canvasH,
      });
    }
  }

  const texture = buildCanvasTexture(surface?.canvas ?? null, false, true);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: new THREE.Color('#ffefc8'),
    emissiveIntensity: theme === 'midnight' ? 0.5 : theme === 'dim' ? 0.3 : 0.08,
    roughness: 0.42,
    metalness: 0.18,
  });

  let disposed = false;
  return {
    texture,
    material,
    uvByKey,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      material.dispose();
      texture.dispose();
    },
  };
}

/**
 * Creates the shared procedural material & texture bundle (3 VRAM textures: wood albedo,
 * wood bump, archival paper) with in-place theme switching and full GPU disposal.
 */
export function createLibraryMaterialBundle(initialTheme: AppTheme): LibraryMaterialBundle {
  const woodAlbedo = createWoodAlbedoTexture();
  const woodBump = createWoodBumpTexture();
  const paper = createPaperGrainTexture();
  let currentTheme: AppTheme = initialTheme;
  let currentPalette = getLibrary3DThemePalette(initialTheme);

  const woodMat = (roughness: number, metalness: number, bumpScale = 0) =>
    new THREE.MeshStandardMaterial({
      map: woodAlbedo,
      bumpMap: bumpScale > 0 ? woodBump : null,
      bumpScale,
      roughness,
      metalness,
    });

  const materials = {
    woodCabinet: woodMat(0.62, 0.05, 0.015),
    woodCrown: woodMat(0.56, 0.08, 0.018),
    woodBackPanel: woodMat(0.78, 0.02),
    woodFloor: woodMat(0.42, 0.08, 0.012),
    hallWall: new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9, metalness: 0.02 }),
    hallColumn: new THREE.MeshStandardMaterial({ roughness: 0.76, metalness: 0.04 }),
    windowGlow: new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.05 }),
    brassTrim: new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.74 }),
    lanternGlow: new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.05 }),
    bookBody: new THREE.MeshStandardMaterial({ color: '#ffffff', map: paper, roughness: 0.78, metalness: 0.05 }),
    bookPages: new THREE.MeshStandardMaterial({ map: paper, roughness: 0.92, metalness: 0 }),
  };

  const applyTheme = (nextTheme: AppTheme): Library3DThemePalette => {
    currentTheme = nextTheme;
    currentPalette = getLibrary3DThemePalette(nextTheme);
    const { wood, hall, book } = currentPalette;
    materials.woodCabinet.color.set(wood.cabinet);
    materials.woodCrown.color.set(wood.crown);
    materials.woodBackPanel.color.set(wood.backPanel);
    materials.woodFloor.color.set(wood.floor);
    materials.hallWall.color.set(hall.wall);
    materials.hallColumn.color.set(hall.column);
    materials.windowGlow.color.set(hall.windowGlow);
    materials.windowGlow.emissive.set(hall.windowGlow);
    materials.windowGlow.emissiveIntensity = hall.windowGlowIntensity;
    materials.brassTrim.color.set(hall.brassTrim);
    materials.lanternGlow.color.set(hall.lanternGlow);
    materials.lanternGlow.emissive.set(hall.lanternGlow);
    materials.lanternGlow.emissiveIntensity = hall.lanternGlowIntensity;
    materials.bookPages.color.set(book.pages);
    return currentPalette;
  };

  applyTheme(initialTheme);
  let disposed = false;

  return {
    get theme() {
      return currentTheme;
    },
    get palette() {
      return currentPalette;
    },
    textures: { woodAlbedo, woodBump, paper },
    materials,
    applyTheme,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      Object.values(materials).forEach((mat) => mat.dispose());
      woodAlbedo.dispose();
      woodBump.dispose();
      paper.dispose();
    },
  };
}
