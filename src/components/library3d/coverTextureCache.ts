import * as THREE from 'three';
import { fetchCoverBlobCached } from '@/lib/api';

export const MAX_COVER_TEXTURES = 36;
export const MAX_CONCURRENT_COVER_LOADS = 4;
export const COVER_DECODE_WIDTH = 256;
export const COVER_DECODE_HEIGHT = 384;

const FAILED_RETRY_COOLDOWN_MS = 15_000;

export type CoverTextureListener = (texture: THREE.Texture | null) => void;

export interface CoverTextureRequestOptions {
  /** Shelf key owning the book slot (used to cancel when shelf exits visible window) */
  shelfKey?: string;
  /** Lower number = higher priority (e.g. 0 for selected/hovered, distance for showcase) */
  priority?: number;
  /** Invoked once texture is decoded & cached, or null if unavailable */
  onReady?: CoverTextureListener;
}

export interface CoverTextureCacheStats {
  cachedCount: number;
  activeLoads: number;
  queuedCount: number;
  maxTextures: number;
  maxConcurrent: number;
}

interface CachedCoverEntry {
  texture: THREE.Texture;
  bitmap: ImageBitmap | null;
}

interface PendingCoverTask {
  coverKey: string;
  shelfKeys: Set<string>;
  priority: number;
  listeners: Set<CoverTextureListener>;
  subscribers: number;
  cancelled: boolean;
  generation: number;
}

interface DecodedCoverAsset {
  texture: THREE.Texture;
  bitmap: ImageBitmap | null;
}

function configureCoverTexture(texture: THREE.Texture, flipY: boolean): THREE.Texture {
  texture.flipY = flipY;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function drawSourceToCoverCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined' || sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = COVER_DECODE_WIDTH;
  canvas.height = COVER_DECODE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const scale = Math.max(COVER_DECODE_WIDTH / sourceWidth, COVER_DECODE_HEIGHT / sourceHeight);
  const drawW = sourceWidth * scale;
  const drawH = sourceHeight * scale;
  const dx = (COVER_DECODE_WIDTH - drawW) * 0.5;
  const dy = (COVER_DECODE_HEIGHT - drawH) * 0.5;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(source, dx, dy, drawW, drawH);

  const texture = new THREE.CanvasTexture(canvas);
  configureCoverTexture(texture, true);
  return texture;
}

/**
 * Fallback decoder used only when `createImageBitmap` is unavailable.
 * Guarantees immediate `URL.revokeObjectURL` inside both `onload` and `onerror`.
 */
function decodeViaObjectUrlFallback(blob: Blob): Promise<DecodedCoverAsset | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise<DecodedCoverAsset | null>((resolve) => {
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(blob);
    } catch {
      resolve(null);
      return;
    }

    const img = new Image();
    const revokeNow = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    img.onload = () => {
      try {
        const texture = drawSourceToCoverCanvas(
          img,
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
        );
        resolve(texture ? { texture, bitmap: null } : null);
      } finally {
        revokeNow();
      }
    };

    img.onerror = () => {
      revokeNow();
      resolve(null);
    };

    img.src = objectUrl;
  });
}

async function decodeCoverBlob(blob: Blob): Promise<DecodedCoverAsset | null> {
  if (typeof createImageBitmap === 'function') {
    // Primary path: zero ObjectURL, pre-resized to 256x384 with flipY baked into ImageBitmap
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'flipY',
        resizeWidth: COVER_DECODE_WIDTH,
        resizeHeight: COVER_DECODE_HEIGHT,
        resizeQuality: 'medium',
      });
      const texture = configureCoverTexture(new THREE.Texture(bitmap), false);
      return { texture, bitmap };
    } catch {
      // Fallback 1: browser rejects resize options, still keep flipY orientation
      try {
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
        const texture = configureCoverTexture(new THREE.Texture(bitmap), false);
        return { texture, bitmap };
      } catch {
        // Fallback 2: plain ImageBitmap drawn to a 256x384 CanvasTexture and immediately closed
        try {
          const bitmap = await createImageBitmap(blob);
          try {
            const texture = drawSourceToCoverCanvas(bitmap, bitmap.width, bitmap.height);
            return texture ? { texture, bitmap: null } : null;
          } finally {
            bitmap.close();
          }
        } catch {
          return null;
        }
      }
    }
  }

  return decodeViaObjectUrlFallback(blob);
}

function disposeEntry(entry: CachedCoverEntry): void {
  entry.texture.dispose();
  if (entry.bitmap) {
    entry.bitmap.close();
  }
}

/**
 * VRAM-bounded LRU cache & concurrency-capped loader for 3D book cover textures (D-013).
 * Reuses `fetchCoverBlobCached` (IndexedDB -> R2) and guarantees full GPU/ImageBitmap cleanup.
 */
export class CoverTextureCache {
  private readonly maxTextures: number;
  private readonly maxConcurrent: number;
  private readonly cache = new Map<string, CachedCoverEntry>();
  private readonly queued = new Map<string, PendingCoverTask>();
  private readonly inFlight = new Map<string, PendingCoverTask>();
  private readonly failedAt = new Map<string, number>();
  private pinnedKeys = new Set<string>();
  private generation = 0;

  constructor(
    maxTextures = MAX_COVER_TEXTURES,
    maxConcurrent = MAX_CONCURRENT_COVER_LOADS,
  ) {
    this.maxTextures = Math.max(1, maxTextures);
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  /** Synchronously reads a cached texture and refreshes its LRU recency. */
  getCached(coverKey: string): THREE.Texture | null {
    const entry = this.cache.get(coverKey);
    if (!entry) return null;
    this.touch(coverKey, entry);
    return entry.texture;
  }

  /**
   * Requests a cover texture (LRU -> queue -> IndexedDB/R2 -> createImageBitmap).
   * Returns an unsubscribe/cancel handle that aborts pending work if no subscribers remain.
   */
  request(coverKey: string, options: CoverTextureRequestOptions = {}): () => void {
    const { shelfKey, priority = 100, onReady } = options;

    const existing = this.cache.get(coverKey);
    if (existing) {
      this.touch(coverKey, existing);
      onReady?.(existing.texture);
      return () => undefined;
    }

    const failedTimestamp = this.failedAt.get(coverKey);
    if (failedTimestamp !== undefined && Date.now() - failedTimestamp < FAILED_RETRY_COOLDOWN_MS) {
      onReady?.(null);
      return () => undefined;
    }

    const pending = this.inFlight.get(coverKey) ?? this.queued.get(coverKey);
    if (pending) {
      pending.cancelled = false;
      pending.subscribers += 1;
      if (shelfKey) pending.shelfKeys.add(shelfKey);
      if (priority < pending.priority) pending.priority = priority;
      if (onReady) pending.listeners.add(onReady);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        this.unsubscribeTask(pending, onReady);
      };
    }

    const task: PendingCoverTask = {
      coverKey,
      shelfKeys: shelfKey ? new Set([shelfKey]) : new Set(),
      priority,
      listeners: onReady ? new Set([onReady]) : new Set(),
      subscribers: 1,
      cancelled: false,
      generation: this.generation,
    };

    this.queued.set(coverKey, task);
    this.pumpQueue();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.unsubscribeTask(task, onReady);
    };
  }

  /** Marks cover keys currently mounted on active CoverPlanes so LRU avoids evicting them. */
  setPinnedKeys(pinnedCoverKeys: ReadonlySet<string>): void {
    this.pinnedKeys = new Set(pinnedCoverKeys);
  }

  /**
   * Cancels queued and in-flight requests whose shelves have scrolled outside the visible window
   * (preserving any explicitly pinned cover keys such as hovered/selected books).
   */
  pruneOutsideShelves(
    visibleShelfKeys: ReadonlySet<string>,
    pinnedCoverKeys?: ReadonlySet<string>,
  ): void {
    if (pinnedCoverKeys) {
      this.pinnedKeys = new Set(pinnedCoverKeys);
    }

    const shouldCancel = (task: PendingCoverTask): boolean => {
      if (this.pinnedKeys.has(task.coverKey)) return false;
      if (task.shelfKeys.size === 0) return false;
      for (const shelfKey of task.shelfKeys) {
        if (visibleShelfKeys.has(shelfKey)) return false;
      }
      return true;
    };

    for (const [key, task] of this.queued) {
      if (shouldCancel(task)) {
        task.cancelled = true;
        task.subscribers = 0;
        task.listeners.clear();
        this.queued.delete(key);
      }
    }

    for (const task of this.inFlight.values()) {
      if (shouldCancel(task)) {
        task.cancelled = true;
        task.subscribers = 0;
        task.listeners.clear();
      }
    }
  }

  /** Evicts a single cover key (e.g. after updating a book's cover image) and frees GPU memory. */
  evict(coverKey: string): void {
    this.failedAt.delete(coverKey);
    const queuedTask = this.queued.get(coverKey);
    if (queuedTask) {
      queuedTask.cancelled = true;
      queuedTask.listeners.clear();
      this.queued.delete(coverKey);
    }
    const activeTask = this.inFlight.get(coverKey);
    if (activeTask) {
      activeTask.cancelled = true;
      activeTask.subscribers = 0;
      activeTask.listeners.clear();
      this.inFlight.delete(coverKey);
    }
    const cached = this.cache.get(coverKey);
    if (cached) {
      this.cache.delete(coverKey);
      disposeEntry(cached);
    }
  }

  /** Clears temporary failure cooldowns (e.g. when user manually triggers Refresh). */
  clearFailedCache(): void {
    this.failedAt.clear();
  }

  /**
   * Disposes every cached texture + closes every ImageBitmap and invalidates all pending loads.
   * Safe to call on unmount; the instance remains clean and reusable if mounted again.
   */
  disposeAll(): void {
    this.generation += 1;

    for (const task of this.queued.values()) {
      task.cancelled = true;
      task.listeners.clear();
    }
    this.queued.clear();

    for (const task of this.inFlight.values()) {
      task.cancelled = true;
      task.listeners.clear();
    }
    this.inFlight.clear();

    for (const entry of this.cache.values()) {
      disposeEntry(entry);
    }
    this.cache.clear();
    this.failedAt.clear();
    this.pinnedKeys.clear();
  }

  getStats(): CoverTextureCacheStats {
    return {
      cachedCount: this.cache.size,
      activeLoads: this.inFlight.size,
      queuedCount: this.queued.size,
      maxTextures: this.maxTextures,
      maxConcurrent: this.maxConcurrent,
    };
  }

  private unsubscribeTask(task: PendingCoverTask, listener?: CoverTextureListener): void {
    if (listener) {
      task.listeners.delete(listener);
    }
    task.subscribers = Math.max(0, task.subscribers - 1);
    if (task.subscribers > 0) return;

    task.cancelled = true;
    if (this.queued.get(task.coverKey) === task) {
      this.queued.delete(task.coverKey);
    }
  }

  private touch(coverKey: string, entry: CachedCoverEntry): void {
    this.cache.delete(coverKey);
    this.cache.set(coverKey, entry);
  }

  private evictIfOverBudget(): void {
    while (this.cache.size >= this.maxTextures) {
      let victimKey: string | null = null;

      // Prefer evicting the oldest unpinned texture first
      for (const key of this.cache.keys()) {
        if (!this.pinnedKeys.has(key)) {
          victimKey = key;
          break;
        }
      }

      // Hard safety fallback: enforce VRAM cap even if all entries were pinned
      if (victimKey === null) {
        const oldest = this.cache.keys().next();
        if (oldest.done) break;
        victimKey = oldest.value;
      }

      const victim = this.cache.get(victimKey);
      this.cache.delete(victimKey);
      if (victim) {
        disposeEntry(victim);
      }
    }
  }

  private pickNextQueuedTask(): PendingCoverTask | null {
    let bestTask: PendingCoverTask | null = null;
    for (const task of this.queued.values()) {
      if (task.cancelled) {
        this.queued.delete(task.coverKey);
        continue;
      }
      if (!bestTask || task.priority < bestTask.priority) {
        bestTask = task;
      }
    }
    return bestTask;
  }

  private pumpQueue(): void {
    while (this.inFlight.size < this.maxConcurrent && this.queued.size > 0) {
      const next = this.pickNextQueuedTask();
      if (!next) break;
      this.queued.delete(next.coverKey);
      this.inFlight.set(next.coverKey, next);
      void this.runTask(next);
    }
  }

  private async runTask(task: PendingCoverTask): Promise<void> {
    let decoded: DecodedCoverAsset | null = null;
    try {
      const blob = await fetchCoverBlobCached(task.coverKey);
      if (task.cancelled || task.generation !== this.generation) {
        return;
      }

      if (blob) {
        decoded = await decodeCoverBlob(blob);
      }

      if (task.cancelled || task.generation !== this.generation) {
        if (decoded) {
          disposeEntry(decoded);
          decoded = null;
        }
        return;
      }

      if (!decoded) {
        this.failedAt.set(task.coverKey, Date.now());
        this.notifyListeners(task, null);
        return;
      }

      this.failedAt.delete(task.coverKey);
      this.evictIfOverBudget();

      const existing = this.cache.get(task.coverKey);
      if (existing) {
        this.cache.delete(task.coverKey);
        disposeEntry(existing);
      }

      const entry: CachedCoverEntry = decoded;
      decoded = null;
      this.cache.set(task.coverKey, entry);
      this.notifyListeners(task, entry.texture);
    } catch {
      if (decoded) {
        disposeEntry(decoded);
      }
      if (!task.cancelled && task.generation === this.generation) {
        this.failedAt.set(task.coverKey, Date.now());
        this.notifyListeners(task, null);
      }
    } finally {
      if (this.inFlight.get(task.coverKey) === task) {
        this.inFlight.delete(task.coverKey);
      }
      if (task.generation === this.generation) {
        this.pumpQueue();
      }
    }
  }

  private notifyListeners(task: PendingCoverTask, texture: THREE.Texture | null): void {
    const callbacks = Array.from(task.listeners);
    task.listeners.clear();
    for (const listener of callbacks) {
      listener(texture);
    }
  }
}

export function createCoverTextureCache(
  maxTextures = MAX_COVER_TEXTURES,
  maxConcurrent = MAX_CONCURRENT_COVER_LOADS,
): CoverTextureCache {
  return new CoverTextureCache(maxTextures, maxConcurrent);
}
