export interface BuildCspOptions {
  apiUrl?: string;
  isDev?: boolean;
}

export function extractSafeOrigin(rawUrl: string | undefined): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Xây dựng Content-Security-Policy chặt chẽ cho Frontend (`<meta http-equiv="Content-Security-Policy">`):
 * - `script-src 'self'` tuyệt đối không `'unsafe-inline'` / `'unsafe-eval'` ở bản production (tách `theme-init.js`).
 * - Hỗ trợ đủ `blob:` / `data:` cho bìa sách, ảnh minh hoạ EPUB/DOCX, Canvas, audio tự host & font `.woff2` cục bộ.
 * - `connect-src` cho phép Worker API (`VITE_API_URL` + `https://*.workers.dev`) & AniList browser fallback (`https://graphql.anilist.co`).
 * - Chỉ nới `unsafe-inline` + `ws:` ở `vite dev` để giữ HMR / Fast Refresh hoạt động.
 */
export function buildContentSecurityPolicy(options: BuildCspOptions = {}): string {
  const isDev = Boolean(options.isDev);
  const apiOrigin = extractSafeOrigin(options.apiUrl);

  const scriptSources = ["'self'"];
  if (isDev) {
    scriptSources.push("'unsafe-inline'");
  }

  const connectSources = [
    "'self'",
    'blob:',
    'data:',
    'https://graphql.anilist.co',
    'https://*.workers.dev',
  ];
  if (apiOrigin && !connectSources.includes(apiOrigin)) {
    connectSources.push(apiOrigin);
  }
  if (isDev) {
    connectSources.push('ws:', 'wss:', 'http://localhost:*', 'http://127.0.0.1:*');
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    `connect-src ${connectSources.join(' ')}`,
  ];

  return directives.join('; ');
}

export const PRODUCTION_BASE_CSP = buildContentSecurityPolicy({ isDev: false });
