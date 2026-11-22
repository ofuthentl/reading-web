import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

type ObserverCallback = () => void;

interface CachedRect {
  left: number;
  top: number;
  width: number;
  height: number;
  ts: number;
}

const preloadCallbacks = new WeakMap<Element, ObserverCallback>();
const revealCallbacks = new WeakMap<Element, ObserverCallback>();
const rectCache = new WeakMap<HTMLElement, CachedRect>();
const resetTimers = new WeakMap<HTMLElement, number>();

let sharedPreloadObserver: IntersectionObserver | null = null;
let sharedRevealObserver: IntersectionObserver | null = null;
let scrollGuardBound = false;
let isPageScrolling = false;
let scrollIdleTimer: number | null = null;
let pendingTiltRaf: number | null = null;
let pendingTiltJob: (() => void) | null = null;

function ensureScrollGuard(): void {
  if (scrollGuardBound || typeof window === 'undefined') return;
  scrollGuardBound = true;
  window.addEventListener(
    'scroll',
    () => {
      isPageScrolling = true;
      if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        isPageScrolling = false;
        scrollIdleTimer = null;
      }, 150);
    },
    { passive: true },
  );
}

function getPreloadObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!sharedPreloadObserver) {
    sharedPreloadObserver = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            const cb = preloadCallbacks.get(entry.target);
            preloadCallbacks.delete(entry.target);
            obs.unobserve(entry.target);
            cb?.();
          }
        }
      },
      { rootMargin: '320px 0px' },
    );
  }
  return sharedPreloadObserver;
}

function getRevealObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!sharedRevealObserver) {
    sharedRevealObserver = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            const cb = revealCallbacks.get(entry.target);
            revealCallbacks.delete(entry.target);
            obs.unobserve(entry.target);
            cb?.();
          }
        }
      },
      { rootMargin: '0px 0px -20px 0px', threshold: 0.04 },
    );
  }
  return sharedRevealObserver;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Dùng chung 2 `IntersectionObserver` cấp module cho toàn bộ thẻ sách/kệ:
 * - `isNearViewport`: tải trước ảnh bìa cách màn hình `320px`.
 * - `isRevealed`: kích hoạt hiệu ứng lướt hiện tuần tự từ trái sang phải khi cuộn tới hàng.
 */
export function useCardReveal<T extends HTMLElement = HTMLDivElement>() {
  const cardRef = useRef<T | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  const [isRevealed, setIsRevealed] = useState(
    () => typeof IntersectionObserver === 'undefined' || prefersReducedMotion(),
  );

  useEffect(() => {
    ensureScrollGuard();
    const node = cardRef.current;
    if (!node) return;

    const preloadObs = !isNearViewport ? getPreloadObserver() : null;
    const revealObs = !isRevealed ? getRevealObserver() : null;

    if (preloadObs) {
      preloadCallbacks.set(node, () => setIsNearViewport(true));
      preloadObs.observe(node);
    }
    if (revealObs) {
      revealCallbacks.set(node, () => setIsRevealed(true));
      revealObs.observe(node);
    }

    return () => {
      if (preloadObs) {
        preloadCallbacks.delete(node);
        preloadObs.unobserve(node);
      }
      if (revealObs) {
        revealCallbacks.delete(node);
        revealObs.unobserve(node);
      }
    };
  }, [isNearViewport, isRevealed]);

  return { cardRef, isNearViewport, isRevealed };
}

/**
 * Hiệu ứng nghiêng 3D theo con trỏ chuột:
 * - Tự khoá khi đang lăn cuộn trang (`isPageScrolling`) để không bị giật Layout Thrashing.
 * - Cache `DOMRect` 240ms + gộp cập nhật theo `requestAnimationFrame` (120–144 FPS).
 * - Chỉ gắn `data-tilting` trên đúng 1 thẻ đang hover (0 GPU layer thừa ở trạng thái nghỉ).
 */
export function handleCoverTiltMove(
  event: ReactPointerEvent<HTMLElement>,
  maxDegY = 11.5,
  maxDegX = 9,
): void {
  ensureScrollGuard();
  if (isPageScrolling || event.pointerType === 'touch' || prefersReducedMotion()) return;

  const el = event.currentTarget;
  const clientX = event.clientX;
  const clientY = event.clientY;

  const prevReset = resetTimers.get(el);
  if (prevReset !== undefined) {
    window.clearTimeout(prevReset);
    resetTimers.delete(el);
  }

  pendingTiltJob = () => {
    if (isPageScrolling) return;
    const now = performance.now();
    let cached = rectCache.get(el);
    if (!cached || now - cached.ts > 240) {
      const r = el.getBoundingClientRect();
      cached = { left: r.left, top: r.top, width: r.width, height: r.height, ts: now };
      rectCache.set(el, cached);
    }
    if (cached.width <= 0 || cached.height <= 0) return;

    const px = Math.min(1, Math.max(0, (clientX - cached.left) / cached.width));
    const py = Math.min(1, Math.max(0, (clientY - cached.top) / cached.height));
    const ry = (px - 0.5) * maxDegY * 2;
    const rx = (0.5 - py) * maxDegX * 2;

    if (!el.hasAttribute('data-tilting')) {
      el.setAttribute('data-tilting', 'true');
    }
    el.style.setProperty('--tilt-dur', '85ms');
    el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    el.style.setProperty('--tilt-lift', '-5px');
    el.style.setProperty('--tilt-scale', '1.022');
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    el.style.setProperty('--glare-opacity', '1');
  };

  if (pendingTiltRaf === null) {
    pendingTiltRaf = window.requestAnimationFrame(() => {
      pendingTiltRaf = null;
      const job = pendingTiltJob;
      pendingTiltJob = null;
      job?.();
    });
  }
}

export function handleCoverTiltLeave(event: ReactPointerEvent<HTMLElement>): void {
  const el = event.currentTarget;
  rectCache.delete(el);
  if (!el.hasAttribute('data-tilting')) return;

  el.style.setProperty('--tilt-dur', '420ms');
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
  el.style.setProperty('--tilt-lift', '0px');
  el.style.setProperty('--tilt-scale', '1');
  el.style.setProperty('--glare-opacity', '0');

  const prevReset = resetTimers.get(el);
  if (prevReset !== undefined) window.clearTimeout(prevReset);
  const tid = window.setTimeout(() => {
    el.removeAttribute('data-tilting');
    resetTimers.delete(el);
  }, 430);
  resetTimers.set(el, tid);
}
