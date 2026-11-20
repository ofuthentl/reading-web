const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthEnv {
  ACCESS_PASSCODE?: string;
  AUTH_SECRET?: string;
  ALLOW_INSECURE_DEV_NO_AUTH?: string;
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

export async function createAuthToken(env: AuthEnv): Promise<{ token: string; expiresAt: number }> {
  if (!env.ACCESS_PASSCODE?.trim()) {
    throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
  }
  const secret = resolveSigningSecret(env);
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = toBase64Url(JSON.stringify({ sub: 'owner', exp: expiresAt }));
  const sig = await signPayload(payload, secret);
  return { token: `${payload}.${sig}`, expiresAt };
}

export async function authenticatePasscode(
  passcode: string,
  env: AuthEnv,
): Promise<{ token: string; expiresAt: number }> {
  const expectedPasscode = env.ACCESS_PASSCODE?.trim();
  if (!expectedPasscode) {
    throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
  }
  if (!timingSafeEqual(passcode, expectedPasscode)) {
    throw new HttpError('Mật mã thư viện không đúng.', 401);
  }
  return createAuthToken(env);
}

export async function verifyAuth(request: Request, env: AuthEnv): Promise<void> {
  if (isInsecureDevAuthDisabled(env)) return;

  const expectedPasscode = env.ACCESS_PASSCODE?.trim();
  if (!expectedPasscode) {
    throw new HttpError('Máy chủ chưa cấu hình ACCESS_PASSCODE.', 503);
  }

  const url = new URL(request.url);
  const headerToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const queryToken = url.searchParams.get('token')?.trim();
  const token = headerToken || queryToken;
  if (!token) throw new HttpError('Vui lòng đăng nhập để truy cập thư viện.', 401);

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new HttpError('Phiên đăng nhập không hợp lệ.', 401);
  }
  const [payload, signature] = parts;

  const secret = resolveSigningSecret(env);
  const expectedSig = await signPayload(payload, secret);
  if (!timingSafeEqual(signature, expectedSig)) {
    throw new HttpError('Phiên đăng nhập không hợp lệ.', 401);
  }

  try {
    const decoded = JSON.parse(fromBase64Url(payload)) as { exp?: number };
    if (!decoded.exp || decoded.exp < Date.now()) {
      throw new HttpError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError('Phiên đăng nhập bị lỗi.', 401);
  }
}
