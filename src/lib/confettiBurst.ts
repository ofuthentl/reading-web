/**
 * Pháo giấy Canvas 2D thuần nạp lười (~1 kB, 0 thư viện ngoài):
 * - Tự tắt hoàn toàn khi người dùng bật `prefers-reduced-motion: reduce`.
 * - Tự huỷ `requestAnimationFrame` và gỡ thẻ `<canvas>` ngay khi hạt cuối cùng tắt.
 */

const PALETTE = ['#c89b62', '#b22222', '#10b981', '#0ea5e9', '#f59e0b', '#e879f9'];

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vRot: number;
  color: string;
  alpha: number;
  decay: number;
}

let activeCleanup: (() => void) | null = null;

export function triggerConfettiBurst(particleCount = 54): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  activeCleanup?.();

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);
  ctx.scale(dpr, dpr);

  const originX = vw * 0.5;
  const originY = vh * 0.36;
  const particles: ConfettiParticle[] = [];

  for (let i = 0; i < particleCount; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 5.5 + Math.random() * 8.5;
    particles.push({
      x: originX + (Math.random() - 0.5) * 64,
      y: originY + (Math.random() - 0.5) * 24,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 2.5,
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 3.5,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.24,
      color: PALETTE[i % PALETTE.length],
      alpha: 1,
      decay: 0.011 + Math.random() * 0.009,
    });
  }

  let rafId: number | null = null;
  let lastTs = performance.now();

  const cleanup = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    window.removeEventListener('pagehide', cleanup);
    canvas.remove();
    if (activeCleanup === cleanup) activeCleanup = null;
  };
  activeCleanup = cleanup;
  window.addEventListener('pagehide', cleanup, { once: true });

  const step = (now: number) => {
    const dt = Math.min(2.2, Math.max(0.5, (now - lastTs) / 16.67));
    lastTs = now;
    ctx.clearRect(0, 0, vw, vh);

    let alive = 0;
    for (const p of particles) {
      if (p.alpha <= 0.02 || p.y > vh + 24) continue;
      alive += 1;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.24 * dt;
      p.vx *= 0.988;
      p.rot += p.vRot * dt;
      p.alpha = Math.max(0, p.alpha - p.decay * dt);

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (alive > 0) {
      rafId = window.requestAnimationFrame(step);
    } else {
      cleanup();
    }
  };

  rafId = window.requestAnimationFrame(step);
}
