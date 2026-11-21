import * as THREE from 'three';
import { mergeSimpleGeometries } from './geometryUtils';
import { createScaledBox } from './worldGeometryBuilder';

export interface GlbPlacement3D {
  position: [number, number, number];
  yaw: number;
  width: number;
  height: number;
  depth: number;
}

export interface GrandLibraryGeometries {
  plasterWall: THREE.BufferGeometry;
  woodTrim: THREE.BufferGeometry;
  brass: THREE.BufferGeometry;
  windowGlass: THREE.BufferGeometry;
  lampGlow: THREE.BufferGeometry;
  skylightGlass: THREE.BufferGeometry;
  bookcasePlacements: GlbPlacement3D[];
  studyAlcoves: Array<{ position: [number, number, number]; yaw: number }>;
  spiralStairs: Array<{ position: [number, number, number]; yaw: number }>;
  chandelierPositions: Array<[number, number, number]>;
}

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createRoyalCarpetTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  if (typeof document === 'undefined') {
    return new THREE.CanvasTexture({ width: 2, height: 2 } as unknown as HTMLCanvasElement);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#52151f';
    ctx.fillRect(0, 0, w, h);

    const rand = createSeededRandom(7331);
    for (let i = 0; i < 1600; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,220,170,0.03)' : 'rgba(18,4,8,0.055)';
      ctx.fillRect(rand() * w, rand() * h, 2, 2);
    }

    ctx.fillStyle = '#9e7d43';
    ctx.fillRect(10, 0, 8, h);
    ctx.fillRect(w - 18, 0, 8, h);
    ctx.fillStyle = '#360b12';
    ctx.fillRect(22, 0, 12, h);
    ctx.fillRect(w - 34, 0, 12, h);
    ctx.fillStyle = '#b69354';
    ctx.fillRect(36, 0, 3, h);
    ctx.fillRect(w - 39, 0, 3, h);

    ctx.strokeStyle = 'rgba(196, 164, 98, 0.44)';
    ctx.lineWidth = 2;
    for (let y = 32; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, y - 20);
      ctx.lineTo(w * 0.5 + 32, y);
      ctx.lineTo(w * 0.5, y + 20);
      ctx.lineTo(w * 0.5 - 32, y);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(196, 164, 98, 0.18)';
      ctx.beginPath();
      ctx.arc(w * 0.5, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 5);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function addLocalBox(
  target: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  lx: number,
  ly: number,
  lz: number,
  cx: number,
  by: number,
  cz: number,
  yaw: number,
): void {
  const g = createScaledBox(w, h, d, lx, ly, lz, 0.55);
  if (yaw !== 0) g.rotateY(yaw);
  g.translate(cx, by, cz);
  target.push(g);
}

function addCathedralWindow(
  woodTrim: THREE.BufferGeometry[],
  brass: THREE.BufferGeometry[],
  windowGlass: THREE.BufferGeometry[],
  cx: number,
  by: number,
  cz: number,
  yaw: number,
  w: number,
  h: number,
): void {
  const pane = new THREE.PlaneGeometry(w - 0.24, h - 0.2);
  pane.translate(0, h * 0.5, 0.08);
  if (yaw !== 0) pane.rotateY(yaw);
  pane.translate(cx, by, cz);
  windowGlass.push(pane);

  addLocalBox(woodTrim, 0.26, h + 0.2, 0.42, -w * 0.5, h * 0.5, 0.06, cx, by, cz, yaw);
  addLocalBox(woodTrim, 0.26, h + 0.2, 0.42, w * 0.5, h * 0.5, 0.06, cx, by, cz, yaw);
  addLocalBox(woodTrim, w + 0.34, 0.24, 0.48, 0, 0.06, 0.08, cx, by, cz, yaw);
  addLocalBox(woodTrim, w + 0.34, 0.26, 0.48, 0, h, 0.08, cx, by, cz, yaw);
  for (const mx of [-w * 0.22, 0, w * 0.22]) {
    addLocalBox(brass, 0.055, h - 0.2, 0.08, mx, h * 0.5, 0.12, cx, by, cz, yaw);
  }
  for (let t = 1; t <= 3; t += 1) {
    addLocalBox(brass, w - 0.2, 0.05, 0.08, 0, (h * t) / 4, 0.12, cx, by, cz, yaw);
  }
}

/**
 * Pure geometry & real-GLB placement blueprint for Floor 3's airtight two-story Grand Cathedral
 * Library (`starfield_atrium`, `D-023`): zero corner gaps, real Victorian PBR bookcases lining all
 * 4 walls on 2 stories, mezzanine gallery + twin spiral stairs, real library staircase, glowing
 * Gothic stained-glass windows, parabolic timber-and-bronze vault ribs, and hanging chandeliers.
 */
export function buildGrandLibraryGeometries(): GrandLibraryGeometries {
  const plasterWall: THREE.BufferGeometry[] = [];
  const woodTrim: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];
  const windowGlass: THREE.BufferGeometry[] = [];
  const lampGlow: THREE.BufferGeometry[] = [];
  const skylightGlass: THREE.BufferGeometry[] = [];
  const bookcasePlacements: GlbPlacement3D[] = [];

  // 1. 100% Airtight 4-Wall Cathedral Enclosure (X: -19.65..+19.65, Z: -24.6..+20.0, zero corner holes!)
  plasterWall.push(
    // Full-length West & East walls (44.8 m continuous span)
    createScaledBox(0.42, 10.1, 45.0, -19.68, 5.05, -2.3, 0.18),
    createScaledBox(0.42, 10.1, 45.0, 19.68, 5.05, -2.3, 0.18),
    // Full-width North & South walls closing cleanly right up to the curved barrel vault apex (Y = 14.4 m)
    createScaledBox(39.8, 14.5, 0.45, 0, 7.25, -24.65, 0.18),
    createScaledBox(39.8, 14.5, 0.45, 0, 7.25, 20.05, 0.18),
  );
  // Warm walnut wainscoting cornice bands around all 4 walls
  woodTrim.push(
    createScaledBox(0.32, 0.36, 44.6, -19.4, 9.48, -2.3, 0.4),
    createScaledBox(0.32, 0.36, 44.6, 19.4, 9.48, -2.3, 0.4),
    createScaledBox(39.2, 0.36, 0.32, 0, 9.48, -24.38, 0.4),
    createScaledBox(39.2, 0.36, 0.32, 0, 9.48, 19.78, 0.4),
  );

  // 2. Mezzanine 2nd-Floor Gallery Balcony (Y = 4.38 m) wrapping West, East & South continuously
  for (const side of [-1, 1]) {
    const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const deckX = side * 18.45;
    const railX = side * 17.56;

    // Continuous timber balcony deck from North upper terrace (Z = -17.5) all the way to South wall (Z = +19.8)
    woodTrim.push(createScaledBox(2.05, 0.24, 37.3, deckX, 4.38, 1.15, 0.42));
    woodTrim.push(createScaledBox(0.14, 0.11, 37.3, railX, 5.42, 1.15, 0.45));
    brass.push(createScaledBox(0.08, 0.06, 37.3, railX, 4.56, 1.15, 0.45));
    for (let z = -17.2; z <= 19.4; z += 1.05) {
      brass.push(createScaledBox(0.042, 0.84, 0.042, railX, 4.98, z, 0.45));
    }
    for (let z = -17.5; z <= 18.5; z += 6.0) {
      woodTrim.push(createScaledBox(1.85, 0.32, 0.28, side * 18.52, 4.14, z, 0.45));
      woodTrim.push(createScaledBox(0.46, 9.5, 0.46, side * 19.22, 4.75, z, 0.35));
      lampGlow.push(createScaledBox(0.12, 0.22, 0.12, side * 18.84, 3.3, z, 0.5));
      brass.push(createScaledBox(0.22, 0.08, 0.1, side * 18.96, 3.16, z, 0.5));
    }

    // Real Victorian PBR Bookcases along West & East Ground Floor (skip Z = 12.2 for spiral stairs)
    const groundZs = [-15.2, -12.8, -10.4, -8.0, -5.6, -3.2, -0.8, 1.6, 4.0, 6.4, 8.8, 15.8, 18.0];
    for (const gz of groundZs) {
      bookcasePlacements.push({
        position: [side * 19.05, 0, gz],
        yaw,
        width: 2.26,
        height: 4.18,
        depth: 0.62,
      });
    }

    // Mezzanine Upper Tier (Y = 4.50 m): glowing Gothic Cathedral Windows at Z = -9.2, -0.8, +7.6 & real Victorian bookcases between them
    const windowZs = [-9.2, -0.8, 7.6];
    for (const wz of windowZs) {
      addCathedralWindow(woodTrim, brass, windowGlass, side * 19.32, 4.65, wz, yaw, 3.8, 4.45);
    }
    const upperZs = [-15.2, -12.8, -5.6, -3.4, 2.8, 5.0, 11.4, 13.8, 16.2];
    for (const uz of upperZs) {
      bookcasePlacements.push({
        position: [side * 19.05, 4.5, uz],
        yaw,
        width: 2.26,
        height: 4.45,
        depth: 0.62,
      });
    }
  }

  // 3. South Entrance Wall (Z = +19.8): continuous mezzanine deck, flanking Victorian bookcases & Giant Rose Window
  woodTrim.push(createScaledBox(35.2, 0.24, 2.05, 0, 4.38, 18.85, 0.42));
  woodTrim.push(createScaledBox(35.2, 0.11, 0.14, 0, 5.42, 17.86, 0.45));
  for (let x = -17.0; x <= 17.0; x += 1.05) {
    brass.push(createScaledBox(0.042, 0.84, 0.042, x, 4.98, 17.86, 0.45));
  }
  for (const sx of [-15.2, -12.6, -10.0, -7.4, -4.8, 4.8, 7.4, 10.0, 12.6, 15.2]) {
    bookcasePlacements.push({ position: [sx, 0, 19.45], yaw: Math.PI, width: 2.38, height: 4.18, depth: 0.62 });
    bookcasePlacements.push({ position: [sx, 4.5, 19.45], yaw: Math.PI, width: 2.38, height: 4.45, depth: 0.62 });
  }
  const rosePane = new THREE.CircleGeometry(2.25, 28);
  rosePane.rotateY(Math.PI);
  rosePane.translate(0, 7.1, 19.72);
  windowGlass.push(rosePane);
  const roseRing = new THREE.TorusGeometry(2.3, 0.14, 8, 28);
  roseRing.translate(0, 7.1, 19.66);
  brass.push(roseRing);
  for (let s = 0; s < 8; s += 1) {
    const spoke = createScaledBox(4.5, 0.055, 0.08, 0, 0, 0, 0.5);
    spoke.rotateZ((s * Math.PI) / 8);
    spoke.translate(0, 7.1, 19.62);
    brass.push(spoke);
  }

  // 4. North Grand Apse Wall (Z = -24.4, behind Y = 1.8 upper terrace): flanking towering Victorian bookcases + Triplet Lancet Windows
  for (const nx of [-16.6, -14.0, -11.4, -8.8, 8.8, 11.4, 14.0, 16.6]) {
    bookcasePlacements.push({ position: [nx, 1.8, -24.05], yaw: 0, width: 2.4, height: 4.15, depth: 0.62 });
    bookcasePlacements.push({ position: [nx, 5.95, -24.05], yaw: 0, width: 2.4, height: 3.45, depth: 0.62 });
  }
  for (const wx of [-4.6, 0, 4.6]) {
    addCathedralWindow(woodTrim, brass, windowGlass, wx, 6.2, -24.3, 0, 3.2, 4.8);
  }

  // 5. Seven Smooth Curved Parabolic Cathedral Vault Arches + Translucent Starlight Skylight
  const archZs = [-20, -14, -8, -2, 4, 10, 16];
  const archSegs = 14;
  const halfSpan = 19.5;
  const springY = 9.5;
  const crownLift = 4.95;
  for (const az of archZs) {
    for (let s = 0; s < archSegs; s += 1) {
      const t0 = s / archSegs;
      const t1 = (s + 1) / archSegs;
      const x0 = -halfSpan + t0 * halfSpan * 2;
      const x1 = -halfSpan + t1 * halfSpan * 2;
      const y0 = springY + Math.sin(t0 * Math.PI) * crownLift;
      const y1 = springY + Math.sin(t1 * Math.PI) * crownLift;
      const len = Math.hypot(x1 - x0, y1 - y0) + 0.14;
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const rib = createScaledBox(len, 0.36, 0.36, 0, 0, 0, 0.45);
      rib.rotateZ(angle);
      rib.translate((x0 + x1) * 0.5, (y0 + y1) * 0.5, az);
      woodTrim.push(rib);

      const trim = createScaledBox(len, 0.08, 0.4, 0, 0, 0, 0.5);
      trim.rotateZ(angle);
      trim.translate((x0 + x1) * 0.5, (y0 + y1) * 0.5 - 0.18, az);
      brass.push(trim);
    }
  }
  for (const frac of [0.22, 0.5, 0.78]) {
    const px = -halfSpan + frac * halfSpan * 2;
    const py = springY + Math.sin(frac * Math.PI) * crownLift;
    brass.push(createScaledBox(0.2, 0.2, 44.6, px, py + 0.05, -2.3, 0.5));
  }
  const vaultGlass = new THREE.CylinderGeometry(19.55, 19.55, 44.8, 20, 1, true, -Math.PI / 2, Math.PI);
  vaultGlass.rotateX(-Math.PI / 2);
  vaultGlass.scale(1, 0.26, 1);
  vaultGlass.translate(0, springY + 0.12, -2.3);
  skylightGlass.push(vaultGlass);

  // 6. Four Double-Tier Hanging Antique-Bronze Chandeliers down the central nave
  const chandelierPositions: Array<[number, number, number]> = [
    [0, 8.3, 11.0],
    [0, 8.3, 2.5],
    [0, 8.3, -5.5],
    [0, 8.3, -14.5],
  ];
  for (const [cx, cy, cz] of chandelierPositions) {
    const chain = new THREE.CylinderGeometry(0.04, 0.04, 6.2, 8);
    chain.translate(cx, cy + 3.1, cz);
    brass.push(chain);
    const hub = new THREE.OctahedronGeometry(0.26, 1);
    hub.translate(cx, cy - 0.24, cz);
    brass.push(hub);

    for (const [ringR, ringY, count] of [
      [1.9, cy, 10],
      [1.1, cy + 0.85, 6],
    ] as const) {
      const hoop = new THREE.TorusGeometry(ringR, 0.05, 8, 28);
      hoop.rotateX(Math.PI / 2);
      hoop.translate(cx, ringY, cz);
      brass.push(hoop);
      for (let k = 0; k < count; k += 1) {
        const ang = (k / count) * Math.PI * 2;
        const lx = cx + Math.cos(ang) * ringR;
        const lz = cz + Math.sin(ang) * ringR;
        const bulb = new THREE.OctahedronGeometry(0.11, 1);
        bulb.translate(lx, ringY + 0.17, lz);
        lampGlow.push(bulb);
        if (k % 2 === 0) {
          const strut = createScaledBox(ringR, 0.032, 0.032, 0, 0, 0, 0.5);
          strut.rotateY(-ang);
          strut.translate(cx + Math.cos(ang) * ringR * 0.5, ringY, cz + Math.sin(ang) * ringR * 0.5);
          brass.push(strut);
        }
      }
    }
  }

  return {
    plasterWall: mergeSimpleGeometries(plasterWall),
    woodTrim: mergeSimpleGeometries(woodTrim),
    brass: mergeSimpleGeometries(brass),
    windowGlass: mergeSimpleGeometries(windowGlass),
    lampGlow: mergeSimpleGeometries(lampGlow),
    skylightGlass: mergeSimpleGeometries(skylightGlass),
    bookcasePlacements,
    studyAlcoves: [
      { position: [-9.6, 0, 11.4], yaw: 0.2 },
      { position: [9.6, 0, 11.4], yaw: -0.2 },
      { position: [-9.6, 0, -10.4], yaw: -0.2 },
      { position: [9.6, 0, -10.4], yaw: 0.2 },
    ],
    spiralStairs: [
      { position: [-16.6, 0, 12.2], yaw: Math.PI * 0.5 },
      { position: [16.6, 0, 12.2], yaw: -Math.PI * 0.5 },
    ],
    chandelierPositions,
  };
}
