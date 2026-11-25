const encoder = new TextEncoder();

/**
 * Sinh Weak ETag (`W/"v1-<role>-<32hex>"`) từ nội dung phản hồi `GET /api/books`
 * gắn chặt vai trò & danh tính người dùng (`owner` vs `guest:<id>`).
 */
export async function computeWeakBooksEtag(
  serializedStateJson: string,
  role: string,
  userId: string,
): Promise<string> {
  const scopePrefix = `${role}:${userId}\u0000`;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(scopePrefix + serializedStateJson),
  );
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 16; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `W/"v1-${role}-${hex}"`;
}

function normalizeWeakEtagToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutWeak = trimmed.startsWith('W/') || trimmed.startsWith('w/') ? trimmed.slice(2).trim() : trimmed;
  if (withoutWeak.length < 2 || !withoutWeak.startsWith('"') || !withoutWeak.endsWith('"')) {
    return null;
  }
  return withoutWeak;
}

/**
 * So khớp header `If-None-Match` theo chuẩn so sánh yếu RFC 9110 §8.8.3.2.
 */
export function matchesIfNoneMatch(
  ifNoneMatchHeader: string | null,
  currentEtag: string,
): boolean {
  if (!ifNoneMatchHeader) return false;
  const trimmedHeader = ifNoneMatchHeader.trim();
  if (!trimmedHeader) return false;
  if (trimmedHeader === '*') return true;

  const targetNormalized = normalizeWeakEtagToken(currentEtag);
  if (!targetNormalized) return false;

  // Tách danh sách entity-tag ngăn cách bởi dấu phẩy (ngoài dấu ngoặc kép)
  const parts = trimmedHeader.split(',');
  for (const part of parts) {
    const candidate = normalizeWeakEtagToken(part);
    if (candidate && candidate === targetNormalized) return true;
  }
  return false;
}
