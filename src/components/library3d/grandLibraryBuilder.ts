import * as THREE from 'three';
import { mergeSimpleGeometries } from './geometryUtils';
import { createScaledBox } from './worldGeometryBuilder';

export interface WallBookInstance {
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  d: number;
  tilt: number;
  color: string;
}

export interface GrandLibraryGeometries {
  woodDark: THREE.BufferGeometry;
  woodTrim: THREE.BufferGeometry;
  brass: THREE.BufferGeometry;
  windowGlass: THREE.BufferGeometry;
  lampGlow: THREE.BufferGeometry;
  emeraldShades: THREE.BufferGeometry;
  stoneTrim: THREE.BufferGeometry;
  skylightGlass: THREE.BufferGeometry;
  wallBooks: WallBookInstance[];
  chandelierPositions: Array<[number, number, number]>;
}

const ANTIQUE_SPINE_COLORS = [
  '#6e1f2a',
  '#204634',
  '#1d3358',
  '#62381d',
  '#7c5526',
  '#422548',
  '#2c3947',
  '#7a2e22',
  '#2c4d4a',
  '#523b26',
];

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
    ctx.fillStyle = '#5e1420';
    ctx.fillRect(0, 0, w, h);

    const rand = createSeededRandom(7331);
    for (let i = 0; i < 1600; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,220,170,0.035)' : 'rgba(20,4,8,0.055)';
      ctx.fillRect(rand() * w, rand() * h, 2, 2);
    }

    ctx.fillStyle = '#c89b44';
    ctx.fillRect(10, 0, 8, h);
    ctx.fillRect(w - 18, 0, 8, h);
    ctx.fillStyle = '#3b0b13';
    ctx.fillRect(22, 0, 12, h);
    ctx.fillRect(w - 34, 0, 12, h);
    ctx.fillStyle = '#d9b25f';
    ctx.fillRect(36, 0, 3, h);
    ctx.fillRect(w - 39, 0, 3, h);

    ctx.strokeStyle = 'rgba(222, 184, 102, 0.52)';
    ctx.lineWidth = 2;
    for (let y = 32; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, y - 20);
      ctx.lineTo(w * 0.5 + 32, y);
      ctx.lineTo(w * 0.5, y + 20);
      ctx.lineTo(w * 0.5 - 32, y);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(222, 184, 102, 0.22)';
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

function addWallBookcaseBay(
  woodDark: THREE.BufferGeometry[],
  woodTrim: THREE.BufferGeometry[],
  brass: THREE.BufferGeometry[],
  books: WallBookInstance[],
  cx: number,
  by: number,
  cz: number,
  yaw: number,
  bayWidth: number,
  bayHeight: number,
  tiers: number,
  rand: () => number,
  withLadder = false,
): void {
  const depth = 0.56;
  const frontZ = depth * 0.5;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  addLocalBox(woodDark, bayWidth, bayHeight, 0.08, 0, bayHeight * 0.5, -depth * 0.5 + 0.04, cx, by, cz, yaw);
  addLocalBox(woodTrim, bayWidth + 0.08, 0.24, depth + 0.08, 0, 0.12, 0.03, cx, by, cz, yaw);
  addLocalBox(woodTrim, bayWidth + 0.14, 0.28, depth + 0.18, 0, bayHeight - 0.14, 0.07, cx, by, cz, yaw);
  addLocalBox(brass, bayWidth + 0.16, 0.04, 0.04, 0, bayHeight - 0.26, frontZ + 0.09, cx, by, cz, yaw);

  const subBays = Math.max(2, Math.round(bayWidth / 1.55));
  for (let p = 0; p <= subBays; p += 1) {
    const px = -bayWidth * 0.5 + (p / subBays) * bayWidth;
    const isOuter = p === 0 || p === subBays;
    addLocalBox(
      isOuter ? woodTrim : woodDark,
      isOuter ? 0.22 : 0.1,
      bayHeight - 0.3,
      depth + (isOuter ? 0.08 : 0),
      px,
      bayHeight * 0.5,
      isOuter ? 0.04 : 0,
      cx,
      by,
      cz,
      yaw,
    );
  }

  const usableBottom = 0.3;
  const usableTop = bayHeight - 0.36;
  const tierStep = (usableTop - usableBottom) / tiers;
  for (let t = 0; t < tiers; t += 1) {
    const plankY = usableBottom + t * tierStep;
    addLocalBox(woodDark, bayWidth - 0.2, 0.055, depth - 0.04, 0, plankY, 0, cx, by, cz, yaw);

    const subW = (bayWidth - 0.24) / subBays;
    for (let sb = 0; sb < subBays; sb += 1) {
      const startX = -bayWidth * 0.5 + 0.14 + sb * subW + 0.06;
      const endX = startX + subW - 0.16;
      let cursorX = startX;
      while (cursorX < endX - 0.07) {
        if (rand() < 0.06) {
          cursorX += 0.07;
          continue;
        }
        const bw = 0.072 + rand() * 0.052;
        const bh = Math.min(tierStep - 0.08, 0.26 + rand() * 0.14);
        const bd = 0.24 + rand() * 0.09;
        const lx = cursorX + bw * 0.5;
        const ly = plankY + 0.028 + bh * 0.5;
        const lz = frontZ - bd * 0.5 - 0.04 - rand() * 0.04;
        books.push({
          x: cx + lx * cos + lz * sin,
          y: by + ly,
          z: cz - lx * sin + lz * cos,
          yaw,
          w: bw,
          h: bh,
          d: bd,
          tilt: rand() < 0.08 ? (rand() - 0.5) * 0.22 : 0,
          color: ANTIQUE_SPINE_COLORS[Math.floor(rand() * ANTIQUE_SPINE_COLORS.length)],
        });
        cursorX += bw + 0.008;
      }
    }
  }

  if (withLadder) {
    addLocalBox(brass, bayWidth - 0.1, 0.04, 0.04, 0, bayHeight - 0.45, frontZ + 0.14, cx, by, cz, yaw);
    const ladderX = bayWidth * 0.18;
    for (const side of [-0.22, 0.22]) {
      const rail = createScaledBox(0.045, bayHeight - 0.35, 0.045, 0, 0, 0, 0.5);
      rail.rotateX(-0.12);
      rail.translate(ladderX + side, (bayHeight - 0.35) * 0.5, frontZ + 0.28);
      if (yaw !== 0) rail.rotateY(yaw);
      rail.translate(cx, by, cz);
      brass.push(rail);
    }
    const rungs = Math.floor((bayHeight - 0.6) / 0.38);
    for (let r = 0; r < rungs; r += 1) {
      const ry = 0.38 + r * 0.38;
      const rz = frontZ + 0.48 - (ry / bayHeight) * 0.38;
      addLocalBox(brass, 0.44, 0.032, 0.032, ladderX, ry, rz, cx, by, cz, yaw);
    }
  }
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
  pane.translate(0, h * 0.5, 0.06);
  if (yaw !== 0) pane.rotateY(yaw);
  pane.translate(cx, by, cz);
  windowGlass.push(pane);

  addLocalBox(woodTrim, 0.26, h + 0.2, 0.42, -w * 0.5, h * 0.5, 0.05, cx, by, cz, yaw);
  addLocalBox(woodTrim, 0.26, h + 0.2, 0.42, w * 0.5, h * 0.5, 0.05, cx, by, cz, yaw);
  addLocalBox(woodTrim, w + 0.34, 0.24, 0.48, 0, 0.06, 0.08, cx, by, cz, yaw);
  addLocalBox(woodTrim, w + 0.34, 0.26, 0.48, 0, h, 0.08, cx, by, cz, yaw);
  for (const mx of [-w * 0.22, 0, w * 0.22]) {
    addLocalBox(brass, 0.06, h - 0.2, 0.08, mx, h * 0.5, 0.1, cx, by, cz, yaw);
  }
  for (let t = 1; t <= 3; t += 1) {
    addLocalBox(brass, w - 0.2, 0.055, 0.08, 0, (h * t) / 4, 0.1, cx, by, cz, yaw);
  }
}

/**
 * Pure geometry builder for Floor 3's two-story European Cathedral Grand Library (`D-022`):
 * perimeter two-tier walnut bookshelves, 1,800+ instanced antique books, mezzanine balconies,
 * stained-glass windows + rose window, curved parabolic vault arches, hanging brass chandeliers,
 * and study alcoves with emerald banker's lamps.
 */
export function buildGrandLibraryGeometries(): GrandLibraryGeometries {
  const rand = createSeededRandom(202603);
  const woodDark: THREE.BufferGeometry[] = [];
  const woodTrim: THREE.BufferGeometry[] = [];
  const brass: THREE.BufferGeometry[] = [];
  const windowGlass: THREE.BufferGeometry[] = [];
  const lampGlow: THREE.BufferGeometry[] = [];
  const emeraldShades: THREE.BufferGeometry[] = [];
  const stoneTrim: THREE.BufferGeometry[] = [];
  const skylightGlass: THREE.BufferGeometry[] = [];
  const wallBooks: WallBookInstance[] = [];

  // 1. West & East 2-Story Cathedral Library Walls (5 bays each)
  const sideZs = [-10, -5, 0, 5, 10];
  for (const side of [-1, 1]) {
    const wallX = side * 19.25;
    const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;

    stoneTrim.push(createScaledBox(0.32, 9.6, 26.2, side * 19.65, 4.8, 0, 0.2));
    woodTrim.push(createScaledBox(1.85, 0.24, 25.6, side * 18.4, 4.42, 0, 0.45));
    const railX = side * 17.56;
    woodTrim.push(createScaledBox(0.14, 0.1, 25.6, railX, 5.48, 0, 0.5));
    brass.push(createScaledBox(0.08, 0.06, 25.6, railX, 4.6, 0, 0.5));
    for (let z = -12.4; z <= 12.4; z += 0.95) {
      brass.push(createScaledBox(0.045, 0.88, 0.045, railX, 5.04, z, 0.5));
    }
    for (let z = -12.5; z <= 12.5; z += 5.0) {
      woodTrim.push(createScaledBox(1.6, 0.32, 0.26, side * 18.45, 4.18, z, 0.5));
      stoneTrim.push(createScaledBox(0.55, 9.5, 0.55, side * 19.05, 4.75, z, 0.3));
      lampGlow.push(createScaledBox(0.14, 0.24, 0.14, side * 18.6, 3.35, z, 0.5));
      brass.push(createScaledBox(0.24, 0.08, 0.12, side * 18.75, 3.2, z, 0.5));
    }

    for (let idx = 0; idx < sideZs.length; idx += 1) {
      const bz = sideZs[idx];
      addWallBookcaseBay(woodDark, woodTrim, brass, wallBooks, wallX, 0, bz, yaw, 4.35, 4.28, 7, rand, idx === 1 || idx === 3);
      if (idx === 1 || idx === 3) {
        addCathedralWindow(woodTrim, brass, windowGlass, side * 19.35, 4.65, bz, yaw, 3.8, 4.45);
      } else {
        addWallBookcaseBay(woodDark, woodTrim, brass, wallBooks, wallX, 4.56, bz, yaw, 4.35, 4.55, 7, rand, false);
      }
    }
  }

  // 2. South Entrance Wall (Z = +19.55): flanking 2-story bookcases + giant Rose Window
  stoneTrim.push(createScaledBox(28.0, 9.6, 0.35, 0, 4.8, 20.0, 0.2));
  woodTrim.push(createScaledBox(26.5, 0.24, 1.7, 0, 4.42, 18.75, 0.45));
  woodTrim.push(createScaledBox(26.5, 0.1, 0.14, 0, 5.48, 17.95, 0.5));
  for (let x = -12.6; x <= 12.6; x += 0.95) {
    brass.push(createScaledBox(0.045, 0.88, 0.045, x, 5.04, 17.95, 0.5));
  }
  for (const sx of [-9.4, -4.6, 4.6, 9.4]) {
    addWallBookcaseBay(woodDark, woodTrim, brass, wallBooks, sx, 0, 19.52, Math.PI, 4.2, 4.28, 7, rand, Math.abs(sx) > 7);
    addWallBookcaseBay(woodDark, woodTrim, brass, wallBooks, sx, 4.56, 19.52, Math.PI, 4.2, 4.55, 7, rand, false);
  }
  const rosePane = new THREE.CircleGeometry(2.15, 24);
  rosePane.rotateY(Math.PI);
  rosePane.translate(0, 7.0, 19.72);
  windowGlass.push(rosePane);
  const roseRing = new THREE.TorusGeometry(2.2, 0.14, 8, 24);
  roseRing.translate(0, 7.0, 19.68);
  brass.push(roseRing);
  for (let s = 0; s < 8; s += 1) {
    const spoke = createScaledBox(4.3, 0.06, 0.08, 0, 0, 0, 0.5);
    spoke.rotateZ((s * Math.PI) / 8);
    spoke.translate(0, 7.0, 19.65);
    brass.push(spoke);
  }

  // 3. North Grand Apse Wall (Z = -24.25): towering flanks + Triplet Lancet Windows
  stoneTrim.push(createScaledBox(28.0, 11.4, 0.35, 0, 5.7, -24.55, 0.2));
  for (const nx of [-10.2, 10.2]) {
    addWallBookcaseBay(woodDark, woodTrim, brass, wallBooks, nx, 0, -24.08, 0, 4.4, 8.8, 12, rand, true);
  }
  for (const wx of [-4.6, 0, 4.6]) {
    addCathedralWindow(woodTrim, brass, windowGlass, wx, 5.9, -24.25, 0, 3.2, 4.7);
  }

  // 4. Beveled Corner Piers with 2-story inward-facing bookcases
  const corners: Array<[number, number, number, number]> = [
    [-16.8, 16.8, Math.PI / 4, (3 * Math.PI) / 4],
    [16.8, 16.8, -Math.PI / 4, (-3 * Math.PI) / 4],
    [-16.8, -14.8, -Math.PI / 4, Math.PI / 4],
    [16.8, -14.8, Math.PI / 4, -Math.PI / 4],
  ];
  for (const [cx, cz, wallYaw, inwardYaw] of corners) {
    stoneTrim.push(createScaledBox(8.6, 9.6, 0.55, cx, 4.8, cz, 0.25, wallYaw));
    const bx = cx + Math.sin(inwardYaw) * 0.55;
    const bz = cz + Math.cos(inwardYaw) * 0.55;
    addWallBookcaseBay(woodDark, woodTrim, brass, wallBooks, bx, 0, bz, inwardYaw, 4.2, 4.28, 7, rand, false);
    addWallBookcaseBay(woodDark, woodTrim, brass, wallBooks, bx, 4.56, bz, inwardYaw, 4.2, 4.55, 7, rand, false);
  }

  // 5. Curved Parabolic Cathedral Vault Arches + Translucent Starlight Skylight Vault
  const archZs = [-18, -12, -6, 0, 6, 12, 18];
  const archSegs = 12;
  const halfSpan = 19.2;
  const springY = 9.45;
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
      const rib = createScaledBox(len, 0.36, 0.38, 0, 0, 0, 0.45);
      rib.rotateZ(angle);
      rib.translate((x0 + x1) * 0.5, (y0 + y1) * 0.5, az);
      woodTrim.push(rib);

      const trim = createScaledBox(len, 0.1, 0.44, 0, 0, 0, 0.5);
      trim.rotateZ(angle);
      trim.translate((x0 + x1) * 0.5, (y0 + y1) * 0.5 - 0.18, az);
      brass.push(trim);
    }
  }
  for (const frac of [0.22, 0.5, 0.78]) {
    const px = -halfSpan + frac * halfSpan * 2;
    const py = springY + Math.sin(frac * Math.PI) * crownLift;
    brass.push(createScaledBox(0.22, 0.22, 42.0, px, py + 0.05, -1.0, 0.5));
  }
  const vaultGlass = new THREE.CylinderGeometry(19.3, 19.3, 44.0, 18, 1, true, -Math.PI / 2, Math.PI);
  vaultGlass.rotateX(-Math.PI / 2);
  vaultGlass.scale(1, 0.265, 1);
  vaultGlass.translate(0, springY + 0.12, -2.0);
  skylightGlass.push(vaultGlass);

  // 6. Four Double-Tier Hanging Brass Chandeliers down the central nave
  const chandelierPositions: Array<[number, number, number]> = [
    [0, 8.2, 11.0],
    [0, 8.2, 2.5],
    [0, 8.2, -5.5],
    [0, 8.2, -14.5],
  ];
  for (const [cx, cy, cz] of chandelierPositions) {
    const chain = new THREE.CylinderGeometry(0.045, 0.045, 6.2, 8);
    chain.translate(cx, cy + 3.1, cz);
    brass.push(chain);
    const hub = new THREE.OctahedronGeometry(0.28, 1);
    hub.translate(cx, cy - 0.25, cz);
    brass.push(hub);

    for (const [ringR, ringY, count] of [
      [1.95, cy, 10],
      [1.15, cy + 0.85, 6],
    ] as const) {
      const hoop = new THREE.TorusGeometry(ringR, 0.055, 8, 28);
      hoop.rotateX(Math.PI / 2);
      hoop.translate(cx, ringY, cz);
      brass.push(hoop);
      for (let k = 0; k < count; k += 1) {
        const ang = (k / count) * Math.PI * 2;
        const lx = cx + Math.cos(ang) * ringR;
        const lz = cz + Math.sin(ang) * ringR;
        const bulb = new THREE.OctahedronGeometry(0.115, 1);
        bulb.translate(lx, ringY + 0.18, lz);
        lampGlow.push(bulb);
        if (k % 2 === 0) {
          const strut = createScaledBox(ringR, 0.035, 0.035, 0, 0, 0, 0.5);
          strut.rotateY(-ang);
          strut.translate(cx + Math.cos(ang) * ringR * 0.5, ringY, cz + Math.sin(ang) * ringR * 0.5);
          brass.push(strut);
        }
      }
    }
  }

  // 7. Classic Reading Study Desks + Emerald Banker's Lamps in 4 outer alcoves
  const studyAlcoves: Array<[number, number, number]> = [
    [-9.6, 11.4, 0.2],
    [9.6, 11.4, -0.2],
    [-9.6, -10.4, -0.2],
    [9.6, -10.4, 0.2],
  ];
  for (const [ax, az, ayaw] of studyAlcoves) {
    addLocalBox(woodTrim, 2.5, 0.1, 1.15, 0, 0.78, 0, ax, 0, az, ayaw);
    addLocalBox(woodDark, 2.2, 0.74, 0.9, 0, 0.37, 0, ax, 0, az, ayaw);
    addLocalBox(brass, 0.08, 0.32, 0.08, 0, 0.96, 0, ax, 0, az, ayaw);
    addLocalBox(emeraldShades, 0.34, 0.13, 0.2, 0, 1.15, 0, ax, 0, az, ayaw);
    addLocalBox(lampGlow, 0.24, 0.06, 0.12, 0, 1.07, 0, ax, 0, az, ayaw);
  }

  return {
    woodDark: mergeSimpleGeometries(woodDark),
    woodTrim: mergeSimpleGeometries(woodTrim),
    brass: mergeSimpleGeometries(brass),
    windowGlass: mergeSimpleGeometries(windowGlass),
    lampGlow: mergeSimpleGeometries(lampGlow),
    emeraldShades: mergeSimpleGeometries(emeraldShades),
    stoneTrim: mergeSimpleGeometries(stoneTrim),
    skylightGlass: mergeSimpleGeometries(skylightGlass),
    wallBooks,
    chandelierPositions,
  };
}
