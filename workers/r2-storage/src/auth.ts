export const OWNER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DISCORD_KEY_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const DISCORD_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DISCORD_KEY_LENGTH = 12;

export type AuthRole = 'owner' | 'guest';

export interface AuthEnv {
  ACCESS_PASSCODE?: string;
  AUTH_SECRET?: string;
  ALLOW_INSECURE_DEV_NO_AUTH?: string;
}

export interface AuthContext {
  role: AuthRole;
  userId: string;
  expiresAt: number;
  sessionId?: string;
}

export interface LoginSessionResult {
  token: string;
  role: AuthRole;
  expiresAt: number;
}

interface TokenClaims {
  sub?: string;
  role?: string;
  exp?: number;
  sid?: string;
}

interface DiscordAccessRow {
  discord_user_id: string;
  key_expires_at: number | null;
  active_session_id: string | null;
  session_expires_at: number | null;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function isInsecureDevAuthDisabled(env: AuthEnv): boolean {
  return env.ALLOW_INSECURE_DEV_NO_AUTH === 'true' && !env.ACCESS_PASSCODE?.trim();
}

export function isAuthRequired(env: AuthEnv): boolean {
  return !isInsecureDevAuthDisabled(env);
}

export function requireOwner(auth: AuthContext): void {
  if (auth.role !== 'owner') {
    throw new HttpError('Chỉ quản trị viên mới có quyền thực hiện thao tác này.', 403);
  }
}

function toBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

function resolveSigningSecret(env: AuthEnv): string {
  const authSecret = env.AUTH_SECRET?.trim();
  if (authSecret) return authSecret;
  const passcode = env.ACCESS_PASSCODE?.trim();
  if (passcode) return passcode;
  throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
}

export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const maxLen = Math.max(bufA.length, bufB.length);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeDiscordAccessKey(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s-]+/g, '').toUpperCase();
  return /^[A-HJ-NP-Z2-9]{12}$/.test(cleaned) ? cleaned : null;
}

export function generateDiscordAccessKey(): string {
  const bytes = new Uint8Array(DISCORD_KEY_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < DISCORD_KEY_LENGTH; i += 1) {
    code += DISCORD_KEY_ALPHABET[bytes[i] & 31];
  }
  return code;
}

export async function ensureDiscordAccessTable(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS discord_access (
         discord_user_id TEXT PRIMARY KEY,
         discord_username TEXT NOT NULL,
         key_hash TEXT,
         key_issued_at INTEGER,
         key_expires_at INTEGER,
         active_session_id TEXT,
         session_expires_at INTEGER,
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_discord_access_key_hash
       ON discord_access(key_hash)
       WHERE key_hash IS NOT NULL`,
    ),
  ]);
}

export async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(String.fromCharCode(...new Uint8Array(sig)));
}

export async function createSignedToken(
  env: AuthEnv,
  claims: { sub: string; role: AuthRole; exp: number; sid?: string },
): Promise<string> {
  if (!env.ACCESS_PASSCODE?.trim()) {
    throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
  }
  const secret = resolveSigningSecret(env);
  const payload = toBase64Url(JSON.stringify(claims));
  const sig = await signPayload(payload, secret);
  return `${payload}.${sig}`;
}

export async function createAuthToken(env: AuthEnv): Promise<LoginSessionResult> {
  const expiresAt = Date.now() + OWNER_TOKEN_TTL_MS;
  const token = await createSignedToken(env, { sub: 'owner', role: 'owner', exp: expiresAt });
  return { token, role: 'owner', expiresAt };
}

export async function authenticatePasscodeOrKey(
  rawInput: string,
  env: AuthEnv,
  db: D1Database,
): Promise<LoginSessionResult> {
  const expectedPasscode = env.ACCESS_PASSCODE?.trim();
  if (!expectedPasscode) {
    throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new HttpError('Vui lòng nhập chìa khoá truy cập hoặc mật mã.', 400);
  }

  // Always check Admin passcode first in constant time
  if (timingSafeEqual(trimmed, expectedPasscode)) {
    return createAuthToken(env);
  }

  // Otherwise attempt 12-char one-time Discord key redemption (5m TTL -> 24h guest session)
  const normalizedKey = normalizeDiscordAccessKey(trimmed);
  if (!normalizedKey) {
    throw new HttpError('Chìa khoá truy cập hoặc mật mã không đúng.', 401);
  }

  await ensureDiscordAccessTable(db);
  const keyHash = await sha256Hex(normalizedKey);
  const row = await db
    .prepare(
      'SELECT discord_user_id, key_expires_at FROM discord_access WHERE key_hash = ?',
    )
    .bind(keyHash)
    .first<Pick<DiscordAccessRow, 'discord_user_id' | 'key_expires_at'>>();

  if (!row) {
    throw new HttpError('Chìa khoá truy cập không đúng hoặc đã được sử dụng.', 401);
  }

  const now = Date.now();
  if (!row.key_expires_at || row.key_expires_at < now) {
    await db
      .prepare(
        'UPDATE discord_access SET key_hash = NULL, key_expires_at = NULL, updated_at = ? WHERE discord_user_id = ? AND key_hash = ?',
      )
      .bind(now, row.discord_user_id, keyHash)
      .run();
    throw new HttpError(
      'Chìa khoá 5 phút đã hết hạn. Hãy bấm chuông trên Discord để lấy chìa khoá mới.',
      401,
    );
  }

  const sessionId = crypto.randomUUID().replace(/-/g, '');
  const sessionExpiresAt = now + GUEST_SESSION_TTL_MS;
  const updateRes = await db
    .prepare(
      `UPDATE discord_access
       SET key_hash = NULL,
           key_expires_at = NULL,
           active_session_id = ?,
           session_expires_at = ?,
           updated_at = ?
       WHERE discord_user_id = ? AND key_hash = ? AND key_expires_at >= ?`,
    )
    .bind(sessionId, sessionExpiresAt, now, row.discord_user_id, keyHash, now)
    .run();

  if ((updateRes.meta?.changes ?? 0) !== 1) {
    throw new HttpError('Chìa khoá truy cập đã được sử dụng.', 401);
  }

  const token = await createSignedToken(env, {
    sub: `discord:${row.discord_user_id}`,
    role: 'guest',
    sid: sessionId,
    exp: sessionExpiresAt,
  });

  return { token, role: 'guest', expiresAt: sessionExpiresAt };
}

export async function verifyAuth(
  request: Request,
  env: AuthEnv,
  db: D1Database,
): Promise<AuthContext> {
  if (isInsecureDevAuthDisabled(env)) {
    return {
      role: 'owner',
      userId: 'owner',
      expiresAt: Date.now() + OWNER_TOKEN_TTL_MS,
    };
  }

  const expectedPasscode = env.ACCESS_PASSCODE?.trim();
  if (!expectedPasscode) {
    throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
  }

  const url = new URL(request.url);
  const headerToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const queryToken = url.searchParams.get('token')?.trim();
  const token = headerToken || queryToken;
  if (!token) throw new HttpError('Vui lòng nhập chìa khoá để truy cập thư viện.', 401);

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new HttpError('Phiên truy cập không hợp lệ.', 401);
  }
  const [payload, signature] = parts;

  const secret = resolveSigningSecret(env);
  const expectedSig = await signPayload(payload, secret);
  if (!timingSafeEqual(signature, expectedSig)) {
    throw new HttpError('Phiên truy cập không hợp lệ.', 401);
  }

  let decoded: TokenClaims;
  try {
    decoded = JSON.parse(fromBase64Url(payload)) as TokenClaims;
  } catch {
    throw new HttpError('Phiên truy cập bị lỗi.', 401);
  }

  const now = Date.now();
  if (!decoded.exp || decoded.exp < now) {
    throw new HttpError(
      decoded.role === 'guest'
        ? 'Phiên truy cập 24 giờ đã hết hạn. Hãy bấm chuông trên Discord để lấy chìa khoá mới.'
        : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      401,
    );
  }

  // Backward-compatible with existing owner tokens ({ sub: 'owner', exp })
  if (decoded.sub === 'owner' && (!decoded.role || decoded.role === 'owner')) {
    return { role: 'owner', userId: 'owner', expiresAt: decoded.exp };
  }

  if (
    decoded.role === 'guest' &&
    typeof decoded.sub === 'string' &&
    decoded.sub.startsWith('discord:') &&
    typeof decoded.sid === 'string' &&
    decoded.sid.length >= 16
  ) {
    const discordUserId = decoded.sub.slice('discord:'.length);
    if (!/^\d{5,32}$/.test(discordUserId)) {
      throw new HttpError('Phiên truy cập không hợp lệ.', 401);
    }

    const row = await db
      .prepare(
        'SELECT active_session_id, session_expires_at FROM discord_access WHERE discord_user_id = ?',
      )
      .bind(discordUserId)
      .first<Pick<DiscordAccessRow, 'active_session_id' | 'session_expires_at'>>()
      .catch(() => null);

    if (!row?.active_session_id || !timingSafeEqual(row.active_session_id, decoded.sid)) {
      throw new HttpError(
        'Phiên truy cập này đã đóng do tài khoản Discord của bạn vừa mở cửa ở nơi khác.',
        401,
      );
    }
    if (!row.session_expires_at || row.session_expires_at < now) {
      throw new HttpError(
        'Phiên truy cập 24 giờ đã hết hạn. Hãy bấm chuông trên Discord để lấy chìa khoá mới.',
        401,
      );
    }

    return {
      role: 'guest',
      userId: discordUserId,
      expiresAt: Math.min(decoded.exp, row.session_expires_at),
      sessionId: decoded.sid,
    };
  }

  throw new HttpError('Phiên truy cập không hợp lệ.', 401);
}
