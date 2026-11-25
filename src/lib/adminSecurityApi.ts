import type { AuthSessionInfo } from '@/types';
import { apiFetch, isCloudMode, parseTokenSession, setAuthToken } from '@/lib/authSession';

export interface RevokeOwnerSessionsResult {
  ok: boolean;
  revokedBefore: number;
  session?: AuthSessionInfo;
}

export async function revokeAllAdminSessionsApi(
  reissueCurrent = false,
): Promise<RevokeOwnerSessionsResult> {
  if (!isCloudMode) {
    return { ok: true, revokedBefore: Date.now() };
  }
  const res = await apiFetch('/api/admin/sessions/revoke-owner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reissueCurrent }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    revokedBefore?: number;
    session?: { token?: string; role?: 'owner' | 'guest'; expiresAt?: number };
    error?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || 'Không thể thu hồi các phiên đăng nhập Admin.');
  }

  let nextSession: AuthSessionInfo | undefined;
  if (reissueCurrent && body.session?.token) {
    setAuthToken(body.session.token);
    const parsed = parseTokenSession(body.session.token);
    nextSession = {
      role: 'owner',
      expiresAt:
        typeof body.session.expiresAt === 'number'
          ? body.session.expiresAt
          : (parsed?.expiresAt ?? null),
    };
  }

  return {
    ok: true,
    revokedBefore: typeof body.revokedBefore === 'number' ? body.revokedBefore : Date.now(),
    ...(nextSession ? { session: nextSession } : {}),
  };
}
