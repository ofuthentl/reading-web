import {
  DECAYED_STRIKES_SQL,
  DECAYED_STRIKE_AT_SQL,
  buildStrikeDecayBindParams,
} from './rateLimitDb';

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
  tokenSignature: string;
  sessionId?: string;
  discordUsername?: string;
  watermarkLabel?: string;
}

export interface LoginSessionResult {
  token: string;
  role: AuthRole;
  expiresAt: number;
  watermarkLabel?: string;
}

interface TokenClaims {
  sub?: string;
  role?: string;
  exp?: number;
  sid?: string;
}

interface DiscordAccessRow {
  discord_user_id: string;
  discord_username: string;
  key_expires_at: number | null;
  active_session_id: string | null;
  session_expires_at: number | null;
  ua_hash: string | null;
  is_banned: number | null;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly extraHeaders?: Record<string, string>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const upgradedDbs = new WeakSet<D1Database>();

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

export function resolveSigningSecret(env: AuthEnv): string {
  const authSecret = env.AUTH_SECRET?.trim();
  if (authSecret) return authSecret;
  const passcode = env.ACCESS_PASSCODE?.trim();
  if (passcode) return passcode;
  if (isInsecureDevAuthDisabled(env)) return 'insecure-local-dev-secret';
  throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
}

let ephemeralCompareKeyPromise: Promise<CryptoKey> | null = null;

function getEphemeralCompareKey(): Promise<CryptoKey> {
  if (!ephemeralCompareKeyPromise) {
    const rawKey = new Uint8Array(32);
    crypto.getRandomValues(rawKey);
    ephemeralCompareKeyPromise = crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
  return ephemeralCompareKeyPromise;
}

/**
 * So sánh hằng thời gian (constant-time) không lộ độ dài chuỗi:
 * băm 2 giá trị bằng HMAC-SHA-256 (32 byte cố định, khoá ngẫu nhiên theo isolate)
 * rồi so sánh trực tiếp bằng `crypto.subtle.timingSafeEqual`.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await getEphemeralCompareKey();
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(a)),
    crypto.subtle.sign('HMAC', key, encoder.encode(b)),
  ]);
  const subtleWithTse = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: ArrayBufferView | ArrayBuffer, y: ArrayBufferView | ArrayBuffer) => boolean;
  };
  if (typeof subtleWithTse.timingSafeEqual === 'function') {
    return subtleWithTse.timingSafeEqual(macA, macB);
  }
  const viewA = new Uint8Array(macA);
  const viewB = new Uint8Array(macB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i += 1) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeUserAgentHash(userAgent: string): Promise<string> {
  // Luôn băm kể cả khi User-Agent trống để không bao giờ bỏ qua bước ràng buộc thiết bị (vá M-2)
  const digest = await sha256Hex(`ua-v1:${userAgent.trim()}`);
  return digest.slice(0, 24);
}

export function formatGuestWatermarkLabel(username: string, discordUserId: string): string {
  const clean = username.replace(/\s+/g, ' ').trim().slice(0, 28) || 'Guest';
  const tail = discordUserId.slice(-4).padStart(4, '0');
  return `${clean} · #${tail}`;
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
  if (upgradedDbs.has(db)) return;

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
         ua_hash TEXT,
         rl_tokens REAL NOT NULL DEFAULT 10,
         rl_updated_at INTEGER NOT NULL DEFAULT 0,
         rl_strikes INTEGER NOT NULL DEFAULT 0,
         rl_last_strike_at INTEGER NOT NULL DEFAULT 0,
         is_banned INTEGER NOT NULL DEFAULT 0,
         ban_reason TEXT,
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_discord_access_key_hash
       ON discord_access(key_hash)
       WHERE key_hash IS NOT NULL`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS book_guest_packs (
         book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
         pack_key TEXT NOT NULL,
         pack_size INTEGER NOT NULL DEFAULT 0,
         chapter_count INTEGER NOT NULL DEFAULT 0,
         manifest_json TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
    ),
  ]);

  // Tự động bổ sung cột mới cho bảng discord_access cũ tạo từ migration 0003 (chạy từng ALTER riêng tránh huỷ cả batch)
  const info = await db.prepare('PRAGMA table_info(discord_access)').all<{ name: string }>();
  const cols = new Set((info.results || []).map((c) => c.name));
  const alterSqls: string[] = [];
  if (!cols.has('ua_hash')) alterSqls.push('ALTER TABLE discord_access ADD COLUMN ua_hash TEXT');
  if (!cols.has('rl_tokens')) {
    alterSqls.push('ALTER TABLE discord_access ADD COLUMN rl_tokens REAL NOT NULL DEFAULT 10');
  }
  if (!cols.has('rl_updated_at')) {
    alterSqls.push('ALTER TABLE discord_access ADD COLUMN rl_updated_at INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.has('rl_strikes')) {
    alterSqls.push('ALTER TABLE discord_access ADD COLUMN rl_strikes INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.has('rl_last_strike_at')) {
    alterSqls.push('ALTER TABLE discord_access ADD COLUMN rl_last_strike_at INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.has('is_banned')) {
    alterSqls.push('ALTER TABLE discord_access ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.has('ban_reason')) {
    alterSqls.push('ALTER TABLE discord_access ADD COLUMN ban_reason TEXT');
  }
  for (const sql of alterSqls) {
    try {
      await db.prepare(sql).run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('duplicate column')) throw err;
    }
  }
  upgradedDbs.add(db);
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
  userAgent = '',
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
  if (await timingSafeEqual(trimmed, expectedPasscode)) {
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
      'SELECT discord_user_id, discord_username, key_expires_at, is_banned FROM discord_access WHERE key_hash = ?',
    )
    .bind(keyHash)
    .first<
      Pick<DiscordAccessRow, 'discord_user_id' | 'discord_username' | 'key_expires_at' | 'is_banned'>
    >();

  if (!row) {
    throw new HttpError('Chìa khoá truy cập không đúng hoặc đã được sử dụng.', 401);
  }
  if (row.is_banned === 1) {
    throw new HttpError('Tài khoản Discord của bạn đã bị ngưng quyền truy cập thư viện.', 403);
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
  const uaHash = await computeUserAgentHash(userAgent);
  // QĐ-1 (1A) + D-038 QĐ-2 (2A): Không reset đầy rl_tokens / rl_strikes khi đổi key Discord mới;
  // hồi token tuyến tính theo đồng hồ thực, giảm -1 strike / 30p yên ổn và reset 0 sau >= 24 giờ.
  const updateRes = await db
    .prepare(
      `UPDATE discord_access
       SET key_hash = NULL,
           key_expires_at = NULL,
           active_session_id = ?,
           session_expires_at = ?,
           ua_hash = ?,
           rl_tokens = MIN(10, COALESCE(rl_tokens, 10) + MAX(0, ? - CASE WHEN rl_updated_at > 0 THEN rl_updated_at ELSE ? END) * (1.0 / 6000.0)),
           rl_updated_at = ?,
           rl_strikes = ${DECAYED_STRIKES_SQL},
           rl_last_strike_at = ${DECAYED_STRIKE_AT_SQL},
           updated_at = ?
       WHERE discord_user_id = ? AND key_hash = ? AND key_expires_at >= ? AND COALESCE(is_banned, 0) = 0`,
    )
    .bind(
      sessionId,
      sessionExpiresAt,
      uaHash,
      now,
      now,
      now,
      ...buildStrikeDecayBindParams(now),
      now,
      row.discord_user_id,
      keyHash,
      now,
    )
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

  return {
    token,
    role: 'guest',
    expiresAt: sessionExpiresAt,
    watermarkLabel: formatGuestWatermarkLabel(row.discord_username, row.discord_user_id),
  };
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
      tokenSignature: 'dev-local',
    };
  }

  const expectedPasscode = env.ACCESS_PASSCODE?.trim();
  if (!expectedPasscode) {
    throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
  }

  // Chỉ nhận Bearer token qua Authorization header — bỏ fallback ?token= trên URL (vá M-3)
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError('Vui lòng nhập chìa khoá để truy cập thư viện.', 401);

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new HttpError('Phiên truy cập không hợp lệ.', 401);
  }
  const [payload, signature] = parts;

  const secret = resolveSigningSecret(env);
  const expectedSig = await signPayload(payload, secret);
  if (!(await timingSafeEqual(signature, expectedSig))) {
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
    return {
      role: 'owner',
      userId: 'owner',
      expiresAt: decoded.exp,
      tokenSignature: signature,
    };
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

    await ensureDiscordAccessTable(db);
    let row: Pick<
      DiscordAccessRow,
      'discord_username' | 'active_session_id' | 'session_expires_at' | 'ua_hash' | 'is_banned'
    > | null;
    try {
      row = await db
        .prepare(
          'SELECT discord_username, active_session_id, session_expires_at, ua_hash, is_banned FROM discord_access WHERE discord_user_id = ?',
        )
        .bind(discordUserId)
        .first<
          Pick<
            DiscordAccessRow,
            | 'discord_username'
            | 'active_session_id'
            | 'session_expires_at'
            | 'ua_hash'
            | 'is_banned'
          >
        >();
    } catch {
      // Lỗi D1 tạm thời trả 503 để tránh đá nhầm khách khỏi phiên bằng 401 (vá L-1)
      throw new HttpError('Dịch vụ xác thực đang tạm gián đoạn. Vui lòng thử lại sau giây lát.', 503);
    }

    if (row?.is_banned === 1) {
      throw new HttpError('Tài khoản Discord của bạn đã bị ngưng quyền truy cập thư viện.', 403);
    }
    if (!row?.active_session_id || !(await timingSafeEqual(row.active_session_id, decoded.sid))) {
      throw new HttpError(
        'Phiên truy cập này đã đóng do tài khoản Discord của bạn vừa mở cửa ở nơi khác hoặc bị ngắt phiên.',
        401,
      );
    }
    if (!row.session_expires_at || row.session_expires_at < now) {
      throw new HttpError(
        'Phiên truy cập 24 giờ đã hết hạn. Hãy bấm chuông trên Discord để lấy chìa khoá mới.',
        401,
      );
    }
    if (row.ua_hash) {
      const currentUaHash = await computeUserAgentHash(request.headers.get('User-Agent') || '');
      if (!currentUaHash || !(await timingSafeEqual(row.ua_hash, currentUaHash))) {
        throw new HttpError(
          'Phiên truy cập không khớp trình duyệt đã mở khoá. Hãy lấy chìa khoá mới trên trình duyệt này.',
          401,
        );
      }
    }

    return {
      role: 'guest',
      userId: discordUserId,
      expiresAt: Math.min(decoded.exp, row.session_expires_at),
      tokenSignature: signature,
      sessionId: decoded.sid,
      discordUsername: row.discord_username,
      watermarkLabel: formatGuestWatermarkLabel(row.discord_username, discordUserId),
    };
  }

  throw new HttpError('Phiên truy cập không hợp lệ.', 401);
}
