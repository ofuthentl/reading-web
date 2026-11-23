import { type AuthContext, HttpError, requireOwner } from './auth';
import type { Env } from './booksDb';

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
  applyCors(headers);

  if (!('body' in object) || !object.body) {
    const hasPreconditionFailure =
      Boolean(request.headers.get('If-Match')) ||
      Boolean(request.headers.get('If-Unmodified-Since'));
    return new Response(null, { status: hasPreconditionFailure ? 412 : 304, headers });
  }

  if (rangeHeader) {
    let start: number | null = null;
    let length: number | null = null;
    if (object.range) {
      if ('suffix' in object.range && typeof object.range.suffix === 'number') {
        length = Math.min(object.range.suffix, object.size);
        start = Math.max(0, object.size - length);
      } else if ('offset' in object.range || 'length' in object.range) {
        start = object.range.offset ?? 0;
        length = object.range.length ?? Math.max(0, object.size - start);
      }
    }
    if (
      start === null ||
      length === null ||
      object.size <= 0 ||
      start < 0 ||
      start >= object.size ||
      length <= 0
    ) {
      await object.body.cancel().catch(() => undefined);
      headers.set('Content-Range', `bytes */${object.size}`);
      return new Response(null, { status: 416, headers });
    }
    const clampedLength = Math.min(length, object.size - start);
    const end = start + clampedLength - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
    headers.set('Content-Length', String(clampedLength));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}
