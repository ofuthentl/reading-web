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
  // Chốt chặn cứng D-028: Khách tuyệt đối không bao giờ tải được file sách gốc (.epub/.pdf/.docx)
  if (key.startsWith('books/')) {
    requireOwner(auth);
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
  applyCors(headers,);

  if (!('body' in object) || !object.body) {
    return new Response(null, { status: 304, headers });
  }

  if (rangeHeader && object.range) {
    let start: number | null = null;
    let length: number | null = null;
    if ('suffix' in object.range && typeof object.range.suffix === 'number') {
      length = Math.min(object.range.suffix, object.size);
      start = Math.max(0, object.size - length);
    } else if ('offset' in object.range || 'length' in object.range) {
      start = object.range.offset ?? 0;
      length = object.range.length ?? Math.max(0, object.size - start);
    }
    if (start !== null && length !== null && length > 0) {
      const end = start + length - 1;
      headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
      headers.set('Content-Length', String(length));
      return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
    }
  }

  headers.set('Content-Length', String(object.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}
