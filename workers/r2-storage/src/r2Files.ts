import { type AuthContext, HttpError, requireOwner } from './auth';
import type { Env } from './booksDb';
import { applySecurityHeaders } from './securityHeaders';

type ParsedByteRange =
  | { kind: 'valid'; start: number; length: number }
  | { kind: 'unsatisfiable' }
  | { kind: 'ignore' };

function parseSingleByteRange(header: string, totalSize: number): ParsedByteRange {
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bytes=')) return { kind: 'ignore' };
  const spec = trimmed.slice('bytes='.length).trim();
  if (!spec || spec.includes(',')) return { kind: 'ignore' };
  const match = spec.match(/^(\d*)-(\d*)$/);
  if (!match) return { kind: 'ignore' };
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { kind: 'ignore' };
  if (totalSize <= 0) return { kind: 'unsatisfiable' };

  if (!rawStart) {
    const suffix = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return { kind: 'unsatisfiable' };
    const length = Math.min(suffix, totalSize);
    return { kind: 'valid', start: totalSize - length, length };
  }

  const start = Number.parseInt(rawStart, 10);
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) {
    return { kind: 'unsatisfiable' };
  }
  if (!rawEnd) {
    return { kind: 'valid', start, length: totalSize - start };
  }
  const end = Number.parseInt(rawEnd, 10);
  if (!Number.isFinite(end) || end < start) return { kind: 'unsatisfiable' };
  const clampedEnd = Math.min(end, totalSize - 1);
  return { kind: 'valid', start, length: clampedEnd - start + 1 };
}

export async function streamR2FileResponse(
  request: Request,
  pathname: string,
  env: Env,
  auth: AuthContext,
  applyCors: (headers: Headers) => void,
): Promise<Response> {
  let key = '';
  try {
    key = decodeURIComponent(pathname.slice('/api/files/'.length));
  } catch {
    throw new HttpError('Đường dẫn tệp không hợp lệ.', 400);
  }
  if (!key || key.includes('..') || (!key.startsWith('books/') && !key.startsWith('covers/'))) {
    throw new HttpError('Đường dẫn tệp không hợp lệ.', 400);
  }
  // Chốt chặn cứng D-028: Khách tuyệt đối không bao giờ tải được file sách gốc (.epub/.docx)
  if (key.startsWith('books/')) {
    requireOwner(auth);
  }

  // Với HEAD chỉ đọc metadata R2 (không kéo body) để tiết kiệm băng thông (vá M-6)
  if (request.method === 'HEAD') {
    const headObj = await env.BOOKS_BUCKET.head(key);
    if (!headObj) throw new HttpError('Không tìm thấy tệp trong R2.', 404);
    const headers = new Headers();
    headObj.writeHttpMetadata(headers);
    headers.set('ETag', headObj.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'private, max-age=31536000, immutable');
    headers.set('Content-Length', String(headObj.size));
    applySecurityHeaders(headers);
    applyCors(headers);
    return new Response(null, { status: 200, headers });
  }

  const rangeHeader = request.headers.get('Range');
  const object = await env.BOOKS_BUCKET.get(key, {
    range: request.headers,
    onlyIf: request.headers,
  });
  if (!object) throw new HttpError('Không tìm thấy tệp trong R2.', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  applySecurityHeaders(headers);
  applyCors(headers);

  if (!('body' in object) || !object.body) {
    const hasPreconditionFailure =
      Boolean(request.headers.get('If-Match')) ||
      Boolean(request.headers.get('If-Unmodified-Since'));
    return new Response(null, { status: hasPreconditionFailure ? 412 : 304, headers });
  }

  if (rangeHeader) {
    const parsed = parseSingleByteRange(rangeHeader, object.size);
    if (parsed.kind === 'unsatisfiable') {
      await object.body.cancel().catch(() => undefined);
      headers.set('Content-Range', `bytes */${object.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (parsed.kind === 'valid') {
      const end = parsed.start + parsed.length - 1;
      headers.set('Content-Range', `bytes ${parsed.start}-${end}/${object.size}`);
      headers.set('Content-Length', String(parsed.length));
      return new Response(object.body, { status: 206, headers });
    }
  }

  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}
