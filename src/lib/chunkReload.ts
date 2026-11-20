const STALE_CHUNK_RELOAD_KEY = 'arcane-library-stale-chunk-reloaded-at';
const RELOAD_COOLDOWN_MS = 30_000;

const CHUNK_LOAD_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported module',
];

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return '';
}

export function isChunkLoadError(err: unknown): boolean {
  const message = extractErrorMessage(err).toLowerCase();
  if (!message) return false;
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Reloads the page at most once within the cooldown window when a stale hashed
 * chunk is missing after a fresh deploy. Never reloads while offline.
 */
export function reloadOnceForStaleChunk(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    const now = Date.now();
    const lastReloadAt = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) || '0');
    if (Number.isFinite(lastReloadAt) && lastReloadAt > 0 && now - lastReloadAt < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function recoverFromChunkError(err: unknown): boolean {
  if (!isChunkLoadError(err)) return false;
  return reloadOnceForStaleChunk();
}
