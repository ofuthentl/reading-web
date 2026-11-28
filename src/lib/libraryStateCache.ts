import type { AuthRole, AuthSessionInfo } from '@/types';

const SESSION_CACHE_KEY = 'ofu-library-books-etag-v1';
const MAX_SESSION_STORAGE_CHARS = 1_800_000;

export interface CachedBooksEntry<T = unknown> {
  scopeKey: string;
  etag: string;
  payload: T;
}

let memoryEntry: CachedBooksEntry | null = null;

/**
 * Tạo khoá phân tách phiên nhẹ cho cache ETag (không lưu nguyên token bí mật).
 */
export function deriveTokenScopeKey(token: string | null): string {
  if (!token) return 'anon';
  const dot = token.indexOf('.');
  const payloadPart = dot > 0 ? token.slice(0, dot) : token;
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${payloadPart.slice(0, 24)}:${(hash >>> 0).toString(36)}`;
}

export function readCachedBooksResponse<T>(scopeKey: string): CachedBooksEntry<T> | null {
  if (memoryEntry && memoryEntry.scopeKey === scopeKey) {
    return memoryEntry as CachedBooksEntry<T>;
  }
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedBooksEntry<T>>;
    if (
      parsed &&
      typeof parsed.scopeKey === 'string' &&
      parsed.scopeKey === scopeKey &&
      typeof parsed.etag === 'string' &&
      parsed.etag.length > 0 &&
      parsed.payload &&
      typeof parsed.payload === 'object'
    ) {
      const hydrated: CachedBooksEntry<T> = {
        scopeKey: parsed.scopeKey,
        etag: parsed.etag,
        payload: parsed.payload,
      };
      memoryEntry = hydrated;
      return hydrated;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedBooksResponse<T>(scopeKey: string, etag: string, payload: T): void {
  if (!etag) return;
  const entry: CachedBooksEntry<T> = { scopeKey, etag, payload };
  memoryEntry = entry;
  if (typeof sessionStorage === 'undefined') return;
  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length <= MAX_SESSION_STORAGE_CHARS) {
      sessionStorage.setItem(SESSION_CACHE_KEY, serialized);
    } else {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
    }
  } catch {
    // Bỏ qua khi sessionStorage đầy hoặc bị chặn ở chế độ ẩn danh — vẫn giữ bản nhớ RAM
  }
}

export function clearLibraryStateCache(): void {
  memoryEntry = null;
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Ignore privacy mode errors
  }
}

export interface RawBooksSessionHint {
  role?: AuthRole;
  expiresAt?: number | null;
  watermarkLabel?: string | null;
}

/**
 * Hợp nhất metadata phiên từ phản hồi `GET /api/books` với phiên token đang hoạt động:
 * không bao giờ cho phép payload `304` hoặc cache cũ hạ `expiresAt` về quá khứ gây đá phiên nhầm.
 */
export function resolveBooksResponseSession(
  rawSession: RawBooksSessionHint | undefined,
  fallbackSession: AuthSessionInfo,
  responseStatus: number,
  now = Date.now(),
): AuthSessionInfo {
  const rawServerExpiresAt =
    typeof rawSession?.expiresAt === 'number' && Number.isFinite(rawSession.expiresAt)
      ? rawSession.expiresAt
      : null;
  const resolvedExpiresAt =
    responseStatus === 304 && fallbackSession.expiresAt !== null
      ? fallbackSession.expiresAt
      : rawServerExpiresAt !== null &&
          (fallbackSession.expiresAt === null || rawServerExpiresAt > now)
        ? rawServerExpiresAt
        : fallbackSession.expiresAt;
  return {
    role:
      rawSession?.role === 'owner'
        ? 'owner'
        : rawSession?.role === 'guest'
          ? 'guest'
          : fallbackSession.role,
    expiresAt: resolvedExpiresAt,
    watermarkLabel:
      typeof rawSession?.watermarkLabel === 'string'
        ? rawSession.watermarkLabel
        : (fallbackSession.watermarkLabel ?? null),
  };
}
