import { useCallback, useEffect, useState } from 'react';
import type { ViewMode } from '@/types';

export const VIEW_MODE_STORAGE_KEY = 'ofu-library-view-mode';

const MEDIA_VIEWPORT_WIDE = '(min-width: 1024px)';
const MEDIA_FINE_HOVER = '(hover: hover) and (pointer: fine)';
const MEDIA_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const MEDIA_SETTLE_DEBOUNCE_MS = 200;

let cachedWebglSupport: boolean | null = null;

function readMediaMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

function parseStoredViewMode(value: string | null): ViewMode | null {
  return value === '2d' || value === '3d' ? value : null;
}

function readStoredViewMode(): ViewMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseStoredViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Probes hardware-accelerated WebGL support strictly per D-008:
 * MUST only be called after viewport (>= 1024px) AND fine hover pointer checks pass.
 * Releases the probe context immediately and caches the result for the session.
 */
function probeHardwareWebGL(): boolean {
  if (cachedWebglSupport !== null) return cachedWebglSupport;
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const gl =
      (canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl', attrs) as WebGLRenderingContext | null);

    if (!gl) {
      cachedWebglSupport = false;
      return false;
    }

    const loseExt = gl.getExtension('WEBGL_lose_context');
    loseExt?.loseContext();
    cachedWebglSupport = true;
    return true;
  } catch {
    cachedWebglSupport = false;
    return false;
  }
}

function subscribeMediaQuery(query: string, onChange: (matches: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mql = window.matchMedia(query);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }
  mql.addListener(handler);
  return () => mql.removeListener(handler);
}

export interface CanUse3DState {
  canUse3D: boolean;
  preferredMode: ViewMode;
  effectiveMode: ViewMode;
  prefersReducedMotion: boolean;
  session3DFailed: boolean;
  retryKey: number;
  setViewMode: (next: ViewMode) => void;
  mark3DFailed: () => void;
  reset3DFailed: () => void;
}

export function useCanUse3D(): CanUse3DState {
  const [viewportWide, setViewportWide] = useState<boolean>(() =>
    readMediaMatch(MEDIA_VIEWPORT_WIDE),
  );
  const [fineHoverPointer, setFineHoverPointer] = useState<boolean>(() =>
    readMediaMatch(MEDIA_FINE_HOVER),
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    readMediaMatch(MEDIA_REDUCED_MOTION),
  );

  const rawMediaEligible = viewportWide && fineHoverPointer;
  const [settledMediaEligible, setSettledMediaEligible] = useState<boolean>(rawMediaEligible);
  const [webglSupported, setWebglSupported] = useState<boolean | null>(() =>
    rawMediaEligible ? probeHardwareWebGL() : null,
  );
  const [storedMode, setStoredMode] = useState<ViewMode | null>(readStoredViewMode);
  const [session3DFailed, setSession3DFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const unsubViewport = subscribeMediaQuery(MEDIA_VIEWPORT_WIDE, setViewportWide);
    const unsubPointer = subscribeMediaQuery(MEDIA_FINE_HOVER, setFineHoverPointer);
    const unsubMotion = subscribeMediaQuery(MEDIA_REDUCED_MOTION, setPrefersReducedMotion);
    return () => {
      unsubViewport();
      unsubPointer();
      unsubMotion();
    };
  }, []);

  useEffect(() => {
    if (rawMediaEligible === settledMediaEligible) return;
    const timer = window.setTimeout(() => {
      setSettledMediaEligible(rawMediaEligible);
    }, MEDIA_SETTLE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [rawMediaEligible, settledMediaEligible]);

  useEffect(() => {
    if (!settledMediaEligible || webglSupported !== null) return;
    setWebglSupported(probeHardwareWebGL());
  }, [settledMediaEligible, webglSupported]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== VIEW_MODE_STORAGE_KEY) return;
      setStoredMode(parseStoredViewMode(event.newValue));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const mark3DFailed = useCallback(() => {
    setSession3DFailed(true);
  }, []);

  const reset3DFailed = useCallback(() => {
    setSession3DFailed(false);
    setRetryKey((prev) => prev + 1);
  }, []);

  const setViewMode = useCallback((next: ViewMode) => {
    setStoredMode(next);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    } catch {
      // Ignore storage write errors
    }
    if (next === '3d') {
      setSession3DFailed((failed) => {
        if (failed) setRetryKey((prev) => prev + 1);
        return false;
      });
    }
  }, []);

  const canUse3D = settledMediaEligible && webglSupported === true;
  const preferredMode: ViewMode = storedMode ?? (prefersReducedMotion ? '2d' : '3d');
  const effectiveMode: ViewMode =
    canUse3D && !session3DFailed && preferredMode === '3d' ? '3d' : '2d';

  return {
    canUse3D,
    preferredMode,
    effectiveMode,
    prefersReducedMotion,
    session3DFailed,
    retryKey,
    setViewMode,
    mark3DFailed,
    reset3DFailed,
  };
}
