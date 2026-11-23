import type { AuthRole, AuthSessionInfo } from '@/types';

const API_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const TOKEN_STORAGE_KEY = 'arcane-library-auth-token';

export const isMissingProductionApi = !import.meta.env.DEV && !API_BASE;
export const isLocalDevMode = import.meta.env.DEV && !API_BASE;
export const isCloudMode = Boolean(API_BASE);

export function assertApiConfigured() {
  if (isMissingProductionApi) {
    throw new Error(
      'Thiếu cấu hình VITE_API_URL trên bản production. Vui lòng thiết lập secret VITE_API_URL trỏ về Cloudflare Worker và deploy lại.',
    );
  }
}

interface RawTokenClaims {
  sub?: unknown;
  role?: unknown;
  exp?: unknown;
}

export const DEFAULT_OWNER_SESSION: AuthSessionInfo = {
  role: 'owner',
  expiresAt: null,
};

export const DEFAULT_GUEST_SESSION: AuthSessionInfo = {
  role: 'guest',
  expiresAt: null,
};

function decodeBase64UrlJson(segment: string): RawTokenClaims | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as RawTokenClaims;
  } catch {
    return null;
  }
}

export function parseTokenSession(token: string | null): AuthSessionInfo | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0]) return null;
  const claims = decodeBase64UrlJson(parts[0]);
  if (!claims) return null;

  const expiresAt =
    typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp : null;
  const role: AuthRole = claims.role === 'guest' ? 'guest' : 'owner';
  return { role, expiresAt };
}

export function readRawAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function getAuthToken(): string | null {
  const token = readRawAuthToken();
  if (!token) return null;
  const parsed = parseTokenSession(token);
  if (parsed !== null && parsed.expiresAt !== null && parsed.expiresAt <= Date.now()) {
    setAuthToken(null);
    return null;
  }
  return token;
}

export function inspectStoredSession():
  | { status: 'none' }
  | { status: 'expired'; role: AuthRole }
  | { status: 'active'; session: AuthSessionInfo } {
  const rawToken = readRawAuthToken();
  if (!rawToken) return { status: 'none' };
  const parsed = parseTokenSession(rawToken);
  if (!parsed) {
    setAuthToken(null);
    return { status: 'none' };
  }
  if (parsed.expiresAt !== null && parsed.expiresAt <= Date.now()) {
    setAuthToken(null);
    return { status: 'expired', role: parsed.role };
  }
  return { status: 'active', session: parsed };
}

export function getActiveAuthSession(): AuthSessionInfo {
  const inspected = inspectStoredSession();
  if (inspected.status === 'active') return inspected.session;
  // Vá H-02: ở Cloud Mode khi chưa có token hợp lệ tuyệt đối không fallback về 'owner'
  return isCloudMode ? DEFAULT_GUEST_SESSION : DEFAULT_OWNER_SESSION;
}

export function formatRemainingSessionTime(expiresAt: number, now = Date.now()): string {
  const remainingMs = expiresAt - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Đã hết hạn';
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (totalMinutes < 60) {
    return `Còn ${totalMinutes} phút`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `Còn ${hours}g ${minutes}p` : `Còn ${hours} giờ`;
}

class ApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export function isAuthError(err: unknown): boolean {
  return err instanceof ApiAuthError;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401) {
    setAuthToken(null);
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiAuthError(body.error || 'Vui lòng đăng nhập lại.');
  }
  return response;
}

export async function checkHealth(): Promise<{ ok: boolean; authRequired: boolean }> {
  assertApiConfigured();
  if (!isCloudMode) return { ok: true, authRequired: false };
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) throw new Error('Không thể kết nối máy chủ Cloudflare Worker.');
  return (await response.json()) as { ok: boolean; authRequired: boolean };
}

export async function loginWithPasscode(passcode: string): Promise<AuthSessionInfo> {
  assertApiConfigured();
  if (!isCloudMode) return DEFAULT_OWNER_SESSION;
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    token?: string;
    role?: AuthRole;
    expiresAt?: number;
    watermarkLabel?: string;
    error?: string;
  };
  if (!response.ok || !body.token) {
    throw new Error(body.error || 'Đăng nhập thất bại.');
  }
  setAuthToken(body.token);
  const parsed = parseTokenSession(body.token);
  return {
    role: body.role === 'guest' ? 'guest' : (parsed?.role ?? 'owner'),
    expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : (parsed?.expiresAt ?? null),
    watermarkLabel: typeof body.watermarkLabel === 'string' ? body.watermarkLabel : null,
  };
}
