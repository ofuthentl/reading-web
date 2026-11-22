import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

type ObserverCallback = () => void;

const preloadCallbacks = new WeakMap<Element, ObserverCallback>();
const revealCallbacks = new WeakMap<Element, ObserverCallback>();

let sharedPreloadObserver: IntersectionObserver | null = null;
let sharedRevealObserver: IntersectionObserver | null = null;

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
 * Hiệu ứng nghiêng 3D (tilt trái/phải/trên/dưới + ánh sáng phản chiếu) theo con trỏ chuột,
 * cập nhật trực tiếp biến CSS (0 React re-render, 60–120 FPS).
 */
export function handleCoverTiltMove(
  event: ReactPointerEvent<HTMLElement>,
  maxDegY = 11.5,
  maxDegX = 9,
): void {
  if (event.pointerType === 'touch' || prefersReducedMotion()) return;
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  const ry = (px - 0.5) * maxDegY * 2;
  const rx = (0.5 - py) * maxDegX * 2;

  el.style.setProperty('--tilt-dur', '85ms');
  el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
  el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
  el.style.setProperty('--tilt-lift', '-5px');
  el.style.setProperty('--tilt-scale', '1.022');
  el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
  el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
  el.style.setProperty('--glare-opacity', '1');
}

export function handleCoverTiltLeave(event: ReactPointerEvent<HTMLElement>): void {
  const el = event.currentTarget;
  el.style.setProperty('--tilt-dur', '440ms');
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
  el.style.setProperty('--tilt-lift', '0px');
  el.style.setProperty('--tilt-scale', '1');
  el.style.setProperty('--glare-opacity', '0');
}
