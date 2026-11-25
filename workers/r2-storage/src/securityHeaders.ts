export const WORKER_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

export function applySecurityHeaders(headers: Headers): Headers {
  for (const [key, value] of Object.entries(WORKER_SECURITY_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  return headers;
}

export function withSecurityHeaders(response: Response): Response {
  let missing = false;
  for (const key of Object.keys(WORKER_SECURITY_HEADERS)) {
    if (!response.headers.has(key)) {
      missing = true;
      break;
    }
  }
  if (!missing) return response;

  const headers = new Headers(response.headers);
  applySecurityHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
