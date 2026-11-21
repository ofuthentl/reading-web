import { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { AppTheme } from '@/hooks/useTheme';
import type { FloorWorldLayout3D, WorldTelemetryRefs } from './worldTypes';

export interface MinimapWidgetProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  bossDoorUnlocked: boolean;
  telemetryRefs: WorldTelemetryRefs;
  paused: boolean;
  prefersReducedMotion: boolean;
  /** Non-zero tick/signature to trigger a clean redraw under `prefers-reduced-motion` */
  redrawSignal?: string;
}

const MAP_SIZE_PX = 124;
const DRAW_INTERVAL_MS = 42; // ~24 FPS keeps live Asuna/Kirito smooth with negligible CPU
const MAX_FULL_FIT_HALF_DIAG_M = 38; // Maps wider than ~76m diagonal auto-follow Kirito cleanly

interface MinimapPalette {
  bg: string;
  floorFill: string;
  floorStroke: string;
  grid: string;
  waterFill: string;
  surfaceFill: string;
  bookcaseFill: string;
  bookcaseStroke: string;
  fovFill: string;
  playerFill: string;
  playerStroke: string;
  npcStroke: string;
}

function getMinimapPalette(theme: AppTheme, isBossRoom: boolean): MinimapPalette {
  if (isBossRoom) {
    return {
      bg: '#11131e',
      floorFill: 'rgba(51, 65, 85, 0.42)',
      floorStroke: 'rgba(245, 158, 11, 0.55)',
      grid: 'rgba(148, 163, 184, 0.14)',
      waterFill: 'rgba(56, 189, 248, 0.3)',
      surfaceFill: 'rgba(245, 158, 11, 0.25)',
      bookcaseFill: '#b45309',
      bookcaseStroke: '#fde68a',
      fovFill: 'rgba(56, 189, 248, 0.22)',
      playerFill: '#38bdf8',
      playerStroke: '#ffffff',
      npcStroke: '#0f172a',
    };
  }
  if (theme === 'light') {
    return {
      bg: '#f7f1e5',
      floorFill: 'rgba(180, 154, 118, 0.2)',
      floorStroke: 'rgba(140, 94, 53, 0.42)',
      grid: 'rgba(109, 97, 84, 0.14)',
      waterFill: 'rgba(14, 165, 233, 0.34)',
      surfaceFill: 'rgba(217, 119, 6, 0.22)',
      bookcaseFill: '#8c5e35',
      bookcaseStroke: '#5c3b1e',
      fovFill: 'rgba(14, 165, 233, 0.22)',
      playerFill: '#0284c7',
      playerStroke: '#ffffff',
      npcStroke: '#fdfaf4',
    };
  }
  return {
    bg: theme === 'midnight' ? '#0b0d14' : '#121822',
    floorFill: 'rgba(148, 163, 184, 0.14)',
    floorStroke: 'rgba(148, 163, 184, 0.36)',
    grid: 'rgba(148, 163, 184, 0.12)',
    waterFill: 'rgba(56, 189, 248, 0.28)',
    surfaceFill: 'rgba(251, 191, 36, 0.22)',
    bookcaseFill: '#d97706',
    bookcaseStroke: '#fef3c7',
    fovFill: 'rgba(56, 189, 248, 0.22)',
    playerFill: '#38bdf8',
    playerStroke: '#ffffff',
    npcStroke: '#0f172a',
  };
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
}

function drawMinimapFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  floor: FloorWorldLayout3D,
  theme: AppTheme,
  bossDoorUnlocked: boolean,
  telemetryRefs: WorldTelemetryRefs,
  nowMs: number,
): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const radius = size * 0.5;
  const usableR = radius - 9;
  const palette = getMinimapPalette(theme, Boolean(floor.isBossRoom));

  const motion = telemetryRefs.playerMotionRef.current;
  const [px, , pz] = motion.position;

  // Dynamic auto-scaling to any `floor.bounds` (with player-centered radar for giant maps)
  const { minX, maxX, minZ, maxZ } = floor.bounds;
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const halfDiag = 0.5 * Math.hypot(spanX, spanZ);
  const minRadarScale = usableR / MAX_FULL_FIT_HALF_DIAG_M;
  const fitScale = usableR / Math.max(halfDiag, 1);
  const followPlayer = fitScale < minRadarScale;
  const scale = followPlayer ? minRadarScale : fitScale;
  const originX = followPlayer ? px : (minX + maxX) * 0.5;
  const originZ = followPlayer ? pz : (minZ + maxZ) * 0.5;

  const toX = (wx: number) => cx + (wx - originX) * scale;
  const toY = (wz: number) => cy + (wz - originZ) * scale;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
  ctx.clip();

  // Circular radar backdrop + subtle concentric rings
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, usableR * 0.5, 0, Math.PI * 2);
  ctx.arc(cx, cy, usableR, 0, Math.PI * 2);
  ctx.moveTo(cx, 6);
  ctx.lineTo(cx, size - 6);
  ctx.moveTo(6, cy);
  ctx.lineTo(size - 6, cy);
  ctx.stroke();

  // Floor walkable bounds footprint
  const bx = toX(minX);
  const by = toY(minZ);
  const bw = spanX * scale;
  const bh = spanZ * scale;
  ctx.fillStyle = palette.floorFill;
  ctx.strokeStyle = palette.floorStroke;
  ctx.lineWidth = 1.25;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeRect(bx, by, bw, bh);

  // Water colliders (Sakura lake / Starlight ruins water edges)
  ctx.fillStyle = palette.waterFill;
  for (let i = 0; i < floor.colliders.length; i += 1) {
    const col = floor.colliders[i];
    if (col.tag !== 'water' || col.kind !== 'box') continue;
    ctx.fillRect(
      toX(col.centerX - col.halfWidth),
      toY(col.centerZ - col.halfDepth),
      col.halfWidth * 2 * scale,
      col.halfDepth * 2 * scale,
    );
  }

  // Elevated surfaces (bridges, stairs, summit terraces)
  ctx.fillStyle = palette.surfaceFill;
  for (let i = 0; i < floor.surfaces.length; i += 1) {
    const surf = floor.surfaces[i];
    const szMin = surf.kind === 'flat' ? surf.minZ : Math.min(surf.startZ, surf.endZ);
    const szMax = surf.kind === 'flat' ? surf.maxZ : Math.max(surf.startZ, surf.endZ);
    ctx.fillRect(
      toX(surf.minX),
      toY(szMin),
      (surf.maxX - surf.minX) * scale,
      (szMax - szMin) * scale,
    );
  }

  // Boss Room 360° arena rune & Boss Sentinel marker
  if (floor.isBossRoom) {
    const bossX = toX(floor.bossAnchor[0]);
    const bossY = toY(floor.bossAnchor[2]);
    const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.004);
    ctx.strokeStyle = `rgba(245, 158, 11, ${0.42 + pulse * 0.35})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bossX, bossY, Math.max(8, 3.8 * scale), 0, Math.PI * 2);
    ctx.stroke();
    drawDiamond(ctx, bossX, bossY, 4.8 + pulse * 0.8, '#ef4444', '#fef3c7');
  }

  // Rotated Bookcases
  ctx.fillStyle = palette.bookcaseFill;
  ctx.strokeStyle = palette.bookcaseStroke;
  ctx.lineWidth = 0.7;
  for (let i = 0; i < floor.bookcases.length; i += 1) {
    const bc = floor.bookcases[i];
    const w = Math.max(4.5, bc.width * scale);
    const d = Math.max(2.6, bc.depth * scale);
    ctx.save();
    ctx.translate(toX(bc.position[0]), toY(bc.position[2]));
    ctx.rotate(-bc.facingYaw);
    ctx.fillRect(-w * 0.5, -d * 0.5, w, d);
    ctx.strokeRect(-w * 0.5, -d * 0.5, w, d);
    ctx.restore();
  }

  // Interactive Stations
  for (let i = 0; i < floor.stations.length; i += 1) {
    const st = floor.stations[i];
    const sx = toX(st.position[0]);
    const sy = toY(st.position[2]);
    if (st.kind === 'portal_up' || st.kind === 'portal_down' || st.kind === 'boss_exit') {
      ctx.beginPath();
      ctx.arc(sx, sy, st.kind === 'portal_down' ? 3.5 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (st.kind === 'boss_door') {
      drawDiamond(
        ctx,
        sx,
        sy,
        4.6,
        bossDoorUnlocked ? '#14b8a6' : '#f59e0b',
        bossDoorUnlocked ? '#ccfbf1' : '#78350f',
      );
    } else if (st.kind === 'reading_table') {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
    } else if (st.kind === 'librarian_desk') {
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
    } else if (st.kind === 'weather_shrine') {
      drawDiamond(ctx, sx, sy, 3.5, '#a855f7');
    }
  }

  // Live NPCs (Asuna patrolling, Zhongli, Maid, Silica, Mint)
  const liveNpcs = telemetryRefs.npcPositionsRef.current;
  for (let i = 0; i < floor.npcs.length; i += 1) {
    const npc = floor.npcs[i];
    const pos = liveNpcs.get(npc.id) ?? npc.spawn;
    const nx = toX(pos[0]);
    const ny = toY(pos[2]);
    ctx.beginPath();
    ctx.arc(nx, ny, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = npc.accentColor;
    ctx.fill();
    ctx.strokeStyle = palette.npcStroke;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  // Kirito FOV vision cone + crisp directional arrow
  const kx = toX(px);
  const ky = toY(pz);
  const viewYaw = motion.cameraYaw ?? motion.yaw;
  const viewCanvasAngle = Math.atan2(Math.cos(viewYaw), Math.sin(viewYaw));

  ctx.beginPath();
  ctx.moveTo(kx, ky);
  ctx.arc(kx, ky, 18, viewCanvasAngle - 0.56, viewCanvasAngle + 0.56);
  ctx.closePath();
  ctx.fillStyle = palette.fovFill;
  ctx.fill();

  const playerCanvasAngle = Math.atan2(Math.cos(motion.yaw), Math.sin(motion.yaw));
  ctx.save();
  ctx.translate(kx, ky);
  ctx.rotate(playerCanvasAngle);
  ctx.beginPath();
  ctx.moveTo(6.2, 0);
  ctx.lineTo(-4.0, -3.8);
  ctx.lineTo(-2.1, 0);
  ctx.lineTo(-4.0, 3.8);
  ctx.closePath();
  ctx.fillStyle = palette.playerFill;
  ctx.fill();
  ctx.strokeStyle = palette.playerStroke;
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

const LEGEND_ITEMS: ReadonlyArray<{ label: string; colorClass: string }> = [
  { label: 'Kirito', colorClass: 'bg-sky-500' },
  { label: 'Kệ sách', colorClass: 'bg-amber-700' },
  { label: 'Cổng tầng', colorClass: 'border border-sky-400 bg-sky-400/30' },
  { label: 'Cửa Boss', colorClass: 'bg-amber-500 rotate-45 rounded-[1px]' },
  { label: 'Bàn đọc', colorClass: 'bg-emerald-500 rounded-[1px]' },
  { label: 'Thủ thư', colorClass: 'bg-amber-400' },
  { label: 'NPC', colorClass: 'bg-rose-500' },
];

/**
 * Compact circular radar minimap that dynamically adapts to any `floor.bounds`
 * (including 360° Boss Arena and future 10+ large floors), plotting Kirito + live look cone,
 * rotated bookcases, stations, Boss Door, portals, and live patrolling NPCs.
 * Suspends its Canvas RAF loop cleanly to 0 FPS whenever paused, hidden, or reduced-motion.
 */
export function MinimapWidget({
  floor,
  theme,
  bossDoorUnlocked,
  telemetryRefs,
  paused,
  prefersReducedMotion,
  redrawSignal,
}: MinimapWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVis = () => setIsHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetPx = Math.round(MAP_SIZE_PX * dpr);
    if (canvas.width !== targetPx || canvas.height !== targetPx) {
      canvas.width = targetPx;
      canvas.height = targetPx;
    }

    const renderNow = (nowMs: number) => {
      ctx.save();
      ctx.scale(dpr, dpr);
      drawMinimapFrame(ctx, MAP_SIZE_PX, floor, theme, bossDoorUnlocked, telemetryRefs, nowMs);
      ctx.restore();
    };

    renderNow(performance.now());
    if (paused || isHidden || prefersReducedMotion) return undefined;

    let rafId = 0;
    let lastDraw = performance.now();
    const tick = (now: number) => {
      if (now - lastDraw >= DRAW_INTERVAL_MS) {
        lastDraw = now;
        renderNow(now);
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [floor, theme, bossDoorUnlocked, telemetryRefs, paused, isHidden, prefersReducedMotion, redrawSignal]);

  return (
    <div className="pointer-events-auto relative shrink-0 select-none">
      <div
        className={`relative flex h-[124px] w-[124px] items-center justify-center rounded-full border-2 shadow-lg backdrop-blur-md ${
          floor.isBossRoom
            ? 'border-amber-500/80 bg-[#11131e]/95 shadow-amber-950/35'
            : 'border-line-strong/85 bg-surface/90'
        }`}
        aria-label={`Bản đồ thu nhỏ ${floor.title}`}
      >
        <canvas
          ref={canvasRef}
          style={{ width: MAP_SIZE_PX, height: MAP_SIZE_PX }}
          className="h-full w-full rounded-full"
        />

        {/* North compass badge */}
        <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border border-line-strong bg-surface px-1.5 py-[1px] text-[9px] font-bold tracking-wider text-accent shadow-sm">
          N
        </span>

        {/* Floor number pill */}
        <span className="pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-line-strong/80 bg-surface/95 px-2 py-0.5 text-[10px] font-semibold text-ink shadow-sm">
          {floor.isBossRoom ? `Boss F${floor.floorNumber}` : `F${floor.floorNumber}`}
        </span>

        {/* Compact legend toggle button */}
        <button
          type="button"
          onClick={() => setLegendOpen((prev) => !prev)}
          aria-expanded={legendOpen}
          aria-label="Chú thích bản đồ thu nhỏ"
          title="Chú thích ký hiệu bản đồ"
          className="absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-line-strong/80 bg-surface/95 text-ink-muted shadow transition-colors hover:border-accent hover:text-ink"
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      </div>

      {legendOpen && (
        <div className="absolute left-0 top-[132px] z-20 w-44 rounded-xl border border-line-strong/85 bg-surface/95 p-2.5 text-[11px] shadow-xl backdrop-blur-md">
          <p className="mb-1.5 font-semibold text-ink">Ký hiệu Minimap</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {LEGEND_ITEMS.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${item.colorClass}`} />
                <span className="truncate">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
