import type { AppTheme } from '@/hooks/useTheme';
import type { WorldBiomeVisualPalette } from './worldPalettes';
import type { BiomeId } from './worldTypes';

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawWrappedEllipse(
  ctx: CanvasRenderingContext2D,
  w: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot = 0,
): void {
  for (const offset of [-w, 0, w]) {
    const x = cx + offset;
    if (x + rx < -10 || x - rx > w + 10) continue;
    ctx.beginPath();
    ctx.ellipse(x, cy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStarSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, 0.5, 0, 0, radius * 2.2);
  glow.addColorStop(0, color);
  glow.addColorStop(0.35, 'rgba(224, 240, 255, 0.45)');
  glow.addColorStop(1, 'rgba(224, 240, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, radius * 0.22);
  ctx.beginPath();
  ctx.moveTo(-radius * 1.9, 0);
  ctx.lineTo(radius * 1.9, 0);
  ctx.moveTo(0, -radius * 1.9);
  ctx.lineTo(0, radius * 1.9);
  ctx.stroke();
  ctx.restore();
}

function drawMilkyWayAndAurora(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  biomeId: BiomeId,
  rand: () => number,
): void {
  // Diagonal sweeping Milky Way nebula band across upper hemisphere
  ctx.save();
  for (let i = 0; i < 42; i += 1) {
    const t = i / 41;
    const cx = (w * (0.08 + t * 0.88) + Math.sin(t * Math.PI * 2) * 55) % w;
    const cy = h * (0.09 + 0.26 * Math.sin(t * Math.PI) + (rand() - 0.5) * 0.05);
    const rx = 68 + rand() * 110;
    const ry = 24 + rand() * 44;
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
    const hueA = biomeId === 'starlight_ruins' ? '139, 92, 246' : '96, 165, 250';
    const hueB = biomeId === 'sakura_shrine' ? '244, 114, 182' : '56, 189, 248';
    grad.addColorStop(0, `rgba(${i % 2 === 0 ? hueA : hueB}, ${(0.08 + rand() * 0.08).toFixed(3)})`);
    grad.addColorStop(0.55, `rgba(${hueB}, 0.035)`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    drawWrappedEllipse(ctx, w, cx, cy, rx, ry, -0.35);
  }

  // Subtle vertical Aurora curtains dancing above the northern & eastern horizon
  const auroraTint =
    biomeId === 'starlight_ruins'
      ? ['rgba(167, 139, 250, 0.16)', 'rgba(56, 189, 248, 0.12)']
      : biomeId === 'sakura_shrine'
        ? ['rgba(244, 114, 182, 0.14)', 'rgba(129, 140, 248, 0.11)']
        : ['rgba(52, 211, 153, 0.13)', 'rgba(56, 189, 248, 0.1)'];
  for (let i = 0; i < 28; i += 1) {
    const x = w * (0.12 + (i / 28) * 0.76) + Math.sin(i * 0.7) * 18;
    const topY = h * (0.28 + Math.sin(i * 0.55) * 0.05);
    const botY = h * 0.49;
    const colW = 24 + rand() * 42;
    const aGrad = ctx.createLinearGradient(x, topY, x, botY);
    aGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    aGrad.addColorStop(0.38, auroraTint[i % 2]);
    aGrad.addColorStop(0.82, auroraTint[(i + 1) % 2]);
    aGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aGrad;
    ctx.fillRect(x - colW * 0.5, topY, colW, botY - topY);
  }
  ctx.restore();
}

function drawMoon(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const mx = w * 0.24;
  const my = h * 0.22;
  const r = 34;

  // Wide atmospheric halo
  const halo = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 5.2);
  halo.addColorStop(0, 'rgba(255, 252, 238, 0.85)');
  halo.addColorStop(0.24, 'rgba(214, 230, 255, 0.34)');
  halo.addColorStop(0.6, 'rgba(147, 197, 253, 0.1)');
  halo.addColorStop(1, 'rgba(147, 197, 253, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(mx, my, r * 5.2, 0, Math.PI * 2);
  ctx.fill();

  // Crisp luminous moon disc
  const disc = ctx.createRadialGradient(mx - 8, my - 8, 4, mx, my, r);
  disc.addColorStop(0, '#fffef5');
  disc.addColorStop(0.75, '#f4f0dc');
  disc.addColorStop(1, '#d9dfeb');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fill();

  // Subtle lunar maria craters
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, r - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
  const craters: Array<[number, number, number]> = [
    [-10, -6, 10],
    [8, -11, 7],
    [12, 6, 9],
    [-4, 11, 8],
    [-16, 7, 6],
  ];
  for (const [dx, dy, cr] of craters) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, cr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAnimeClouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: AppTheme,
  rand: () => number,
): void {
  const isDusk = theme === 'dim';

  // Soft feathered multi-puff painterly cloud wisps wrapping seamlessly around the horizon
  for (let i = 0; i < 32; i += 1) {
    const cx = rand() * w;
    const cy = h * (0.24 + rand() * 0.21);
    const span = 65 + rand() * 125;
    const puffH = 14 + rand() * 24;

    const puffs = 4 + Math.floor(rand() * 4);
    for (let p = 0; p < puffs; p += 1) {
      const px = cx + (p / Math.max(1, puffs - 1) - 0.5) * span * 1.15;
      const py = cy - Math.sin((p / Math.max(1, puffs - 1)) * Math.PI) * puffH * 0.45;
      const rx = span * (0.28 + rand() * 0.16);
      const ry = puffH * (0.62 + rand() * 0.35);
      const grad = ctx.createRadialGradient(px, py - ry * 0.2, rx * 0.1, px, py, rx);
      grad.addColorStop(0, isDusk ? 'rgba(255, 226, 194, 0.26)' : 'rgba(255, 255, 255, 0.34)');
      grad.addColorStop(0.55, isDusk ? 'rgba(176, 126, 146, 0.14)' : 'rgba(220, 236, 250, 0.16)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      drawWrappedEllipse(ctx, w, px, py, rx, ry);
    }
  }
}

function drawDistantHorizonBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: WorldBiomeVisualPalette,
  theme: AppTheme,
): void {
  // Soft atmospheric horizon mist glow so the 3D mountain/cloud rings blend effortlessly into the sky
  const eqY = h * 0.5;
  const mist = ctx.createLinearGradient(0, eqY - h * 0.08, 0, eqY + h * 0.12);
  mist.addColorStop(0, 'rgba(0, 0, 0, 0)');
  mist.addColorStop(0.45, theme === 'dim' ? 'rgba(244, 162, 118, 0.34)' : `${palette.fogColor}99`);
  mist.addColorStop(0.6, `${palette.fogColor}cc`);
  mist.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, eqY - h * 0.08, w, h * 0.2);

  // Subtle painted far mountain ridge right along the equator (seamless periodic harmonics)
  ctx.beginPath();
  ctx.moveTo(0, eqY + 24);
  const steps = 160;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const ang = u * Math.PI * 2;
    const ridge =
      Math.sin(ang * 3 + 0.5) * 16 +
      Math.sin(ang * 7 + 1.8) * 9 +
      Math.cos(ang * 13 + 0.2) * 5 +
      Math.sin(ang * 23) * 2.5;
    const y = eqY - 12 - Math.max(0, ridge + 14);
    ctx.lineTo(u * w, y);
  }
  ctx.lineTo(w, eqY + 24);
  ctx.closePath();
  ctx.fillStyle =
    theme === 'midnight'
      ? 'rgba(13, 18, 40, 0.52)'
      : theme === 'dim'
        ? 'rgba(72, 46, 74, 0.42)'
        : 'rgba(132, 164, 198, 0.34)';
  ctx.fill();
}

/**
 * Paints a high-resolution (2048x1024) 0-CDN equirectangular sky panorama with Milky Way,
 * Aurora curtains, detailed Moon / Sun bloom, sculpted anime cumulus clouds, and seamless
 * horizon mist synced to the active Aincrad biome & theme (`D-022`).
 */
export function paintSkyPanorama(
  canvas: HTMLCanvasElement,
  palette: WorldBiomeVisualPalette,
  biomeId: BiomeId,
  theme: AppTheme,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, palette.skyTop);
  grad.addColorStop(0.36, palette.skyTop);
  grad.addColorStop(0.5, palette.skyHorizon);
  grad.addColorStop(0.62, palette.skyBottom);
  grad.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const seed = (palette.showStars ? 7711 : 5503) + biomeId.length * 131;
  const rand = createSeededRandom(seed);

  if (palette.showStars) {
    drawMilkyWayAndAurora(ctx, w, h, biomeId, rand);

    // Rich crisp starfield (multi-tint anime stars + denser Milky Way belt)
    const totalStars = Math.max(650, palette.starDensity * 3);
    const tints = ['248, 250, 255', '196, 224, 255', '255, 244, 214', '232, 210, 255'];
    for (let i = 0; i < totalStars; i += 1) {
      const x = rand() * w;
      const y = rand() * h * 0.49;
      const r = 0.55 + Math.pow(rand(), 2.2) * 1.9;
      const alpha = (0.35 + rand() * 0.65).toFixed(2);
      ctx.fillStyle = `rgba(${tints[i % tints.length]}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 18; i += 1) {
      drawStarSparkle(
        ctx,
        rand() * w,
        h * (0.06 + rand() * 0.36),
        3.2 + rand() * 4.2,
        i % 3 === 0 ? 'rgba(255, 246, 214, 0.92)' : 'rgba(224, 242, 255, 0.95)',
      );
    }
    drawMoon(ctx, w, h);
  } else {
    // Luminous sun disc + golden horizon bloom
    const sx = w * 0.72;
    const sy = theme === 'dim' ? h * 0.42 : h * 0.24;
    const sunRadius = theme === 'dim' ? 240 : 185;
    const sun = ctx.createRadialGradient(sx, sy, 10, sx, sy, sunRadius);
    sun.addColorStop(0, '#fffef4');
    sun.addColorStop(0.16, palette.sunColor);
    sun.addColorStop(0.45, theme === 'dim' ? 'rgba(255, 166, 108, 0.32)' : 'rgba(255, 240, 206, 0.28)');
    sun.addColorStop(1, 'rgba(255, 236, 198, 0)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(sx, sy, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    drawAnimeClouds(ctx, w, h, theme, rand);
  }

  drawDistantHorizonBand(ctx, w, h, palette, theme);
}
