import type {
  GuestBookIllustrationItem,
  GuestChapterPayload,
  GuestTocItem,
} from '@/types';
import { apiFetch, getAuthToken, isCloudMode } from '@/lib/authSession';

export interface DiscordGuestRecord {
  discordUserId: string;
  discordUsername: string;
  sessionExpiresAt: number | null;
  strikes: number;
  isBanned: boolean;
  banReason: string | null;
  updatedAt: number;
}

export interface ForensicSuspectItem {
  discordUserId: string;
  discordUsername: string;
  matchedSlots: number;
  totalSlots: number;
  matchPercent: number;
  toneMatchedSlots: number;
  toneTotalSlots: number;
  toneMatchPercent: number;
  scorePercent: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function resolveSessionTokenSignature(): string {
  const token = getAuthToken();
  if (!token) return 'dev-local';
  const parts = token.split('.');
  return parts.length === 2 && parts[1] ? parts[1] : 'dev-local';
}

async function decryptSessionBytes(
  ciphertext: ArrayBuffer | Uint8Array,
  ivBase64: string,
  nonceHex: string,
  bookId: string,
): Promise<Uint8Array> {
  const tokenSig = resolveSessionTokenSignature();
  const iv = base64ToBytes(ivBase64);
  const keySeed = new TextEncoder().encode(`${tokenSig}:${bookId}:${nonceHex}`);
  const rawKey = await crypto.subtle.digest('SHA-256', keySeed);
  const aesKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plainBuf);
}

async function decryptChapterEnvelope(
  bookId: string,
  iv: string,
  nonce: string,
  dataBase64: string,
): Promise<GuestChapterPayload> {
  const cipherBytes = base64ToBytes(dataBase64);
  const plainBytes = await decryptSessionBytes(cipherBytes, iv, nonce, bookId);
  try {
    const decodedText = new TextDecoder().decode(plainBytes);
    return JSON.parse(decodedText) as GuestChapterPayload;
  } finally {
    // Xoá trắng mảng byte giải mã trong RAM ngay sau khi dựng cấu trúc hiển thị
    plainBytes.fill(0);
    cipherBytes.fill(0);
  }
}

export async function fetchGuestBookToc(
  bookId: string,
  signal?: AbortSignal,
  includeChapter?: { chapterIndex?: number; chapterId?: string },
): Promise<{
  bookId: string;
  watermarkLabel: string;
  chapters: GuestTocItem[];
  initialChapter?: { chapterIndex: number; data: GuestChapterPayload };
}> {
  if (!isCloudMode) {
    throw new Error('Chế độ khách yêu cầu kết nối Cloudflare Worker.');
  }
  const params = new URLSearchParams();
  if (
    typeof includeChapter?.chapterIndex === 'number' &&
    Number.isFinite(includeChapter.chapterIndex) &&
    includeChapter.chapterIndex >= 0
  ) {
    params.set('includeChapter', String(Math.floor(includeChapter.chapterIndex)));
  }
  if (includeChapter?.chapterId) {
    params.set('includeChapterId', includeChapter.chapterId);
  }
  const qs = params.toString();
  const res = await apiFetch(
    `/api/guest/books/${encodeURIComponent(bookId)}/toc${qs ? `?${qs}` : ''}`,
    { signal },
  );
  const body = (await res.json().catch(() => ({}))) as {
    bookId?: string;
    watermarkLabel?: string;
    chapters?: GuestTocItem[];
    initialChapter?: { chapterIndex?: number; iv?: string; nonce?: string; data?: string };
    error?: string;
  };
  if (!res.ok || !Array.isArray(body.chapters)) {
    throw new Error(body.error || 'Không thể tải mục lục sách cho phiên khách.');
  }

  let initialChapter: { chapterIndex: number; data: GuestChapterPayload } | undefined;
  const rawInit = body.initialChapter;
  if (
    rawInit &&
    typeof rawInit.chapterIndex === 'number' &&
    rawInit.iv &&
    rawInit.nonce &&
    rawInit.data
  ) {
    try {
      const decrypted = await decryptChapterEnvelope(
        bookId,
        rawInit.iv,
        rawInit.nonce,
        rawInit.data,
      );
      initialChapter = { chapterIndex: rawInit.chapterIndex, data: decrypted };
    } catch {
      // Bỏ qua gọn nếu lỗi giải mã để client tự tải lại chương riêng lẻ
    }
  }

  return {
    bookId: body.bookId || bookId,
    watermarkLabel: body.watermarkLabel || 'Guest',
    chapters: body.chapters,
    ...(initialChapter ? { initialChapter } : {}),
  };
}

const guestIllustrationsCache = new Map<string, GuestBookIllustrationItem[]>();
let illustrationsCacheTokenSig: string | null = null;

export function clearGuestIllustrationsCache(): void {
  guestIllustrationsCache.clear();
  illustrationsCacheTokenSig = null;
}

export async function fetchGuestBookIllustrations(
  bookId: string,
  signal?: AbortSignal,
): Promise<GuestBookIllustrationItem[]> {
  const tokenSig = resolveSessionTokenSignature();
  if (illustrationsCacheTokenSig !== tokenSig) {
    guestIllustrationsCache.clear();
    illustrationsCacheTokenSig = tokenSig;
  }
  const cached = guestIllustrationsCache.get(bookId);
  if (cached) return cached;

  const res = await apiFetch(
    `/api/guest/books/${encodeURIComponent(bookId)}/illustrations`,
    { signal },
  );
  const body = (await res.json().catch(() => ({}))) as {
    illustrations?: GuestBookIllustrationItem[];
    error?: string;
  };
  if (!res.ok || !Array.isArray(body.illustrations)) {
    throw new Error(body.error || 'Không thể tải danh sách minh hoạ của tập sách.');
  }
  if (guestIllustrationsCache.size > 24) guestIllustrationsCache.clear();
  guestIllustrationsCache.set(bookId, body.illustrations);
  return body.illustrations;
}

export async function fetchGuestChapterDecrypted(
  bookId: string,
  chapterIndex: number,
  signal?: AbortSignal,
): Promise<GuestChapterPayload> {
  const res = await apiFetch(
    `/api/guest/books/${encodeURIComponent(bookId)}/chapters/${chapterIndex}`,
    { signal },
  );
  const body = (await res.json().catch(() => ({}))) as {
    iv?: string;
    nonce?: string;
    data?: string;
    error?: string;
  };
  if (!res.ok || !body.iv || !body.nonce || !body.data) {
    const err = new Error(body.error || 'Không thể tải nội dung chương.') as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  return decryptChapterEnvelope(bookId, body.iv, body.nonce, body.data);
}

export async function fetchGuestMediaBitmap(
  bookId: string,
  mediaIndex: number,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  const res = await apiFetch(
    `/api/guest/books/${encodeURIComponent(bookId)}/media/${mediaIndex}`,
    { signal },
  );
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || 'Không thể tải minh hoạ chương.');
  }
  const iv = res.headers.get('X-Guest-Iv');
  const nonce = res.headers.get('X-Guest-Nonce');
  const mime = res.headers.get('X-Guest-Mime') || 'image/jpeg';
  if (!iv || !nonce) {
    throw new Error('Phản hồi minh hoạ thiếu khoá phiên hợp lệ.');
  }

  const cipherBuf = await res.arrayBuffer();
  const plainBytes = await decryptSessionBytes(cipherBuf, iv, nonce, bookId);
  try {
    const copyBuffer = new ArrayBuffer(plainBytes.byteLength);
    new Uint8Array(copyBuffer).set(plainBytes);
    const blob = new Blob([copyBuffer], { type: mime });
    return await createImageBitmap(blob);
  } finally {
    plainBytes.fill(0);
  }
}

export async function fetchAdminDiscordGuests(
  signal?: AbortSignal,
): Promise<DiscordGuestRecord[]> {
  const res = await apiFetch('/api/admin/discord-guests', { signal });
  const data = (await res.json().catch(() => ({}))) as {
    guests?: DiscordGuestRecord[];
    error?: string;
  };
  if (!res.ok || !Array.isArray(data.guests)) {
    throw new Error(data.error || 'Không thể tải danh sách khách Discord.');
  }
  return data.guests;
}

export async function setAdminDiscordGuestBan(
  discordUserId: string,
  banned: boolean,
  reason?: string,
): Promise<void> {
  const res = await apiFetch(`/api/admin/discord-guests/${encodeURIComponent(discordUserId)}/ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ banned, reason: reason || null }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể cập nhật trạng thái khoá khách Discord.');
  }
}

export async function runAdminForensicWatermarkCheck(text: string): Promise<{
  totalSlots: number;
  toneSlots: number;
  results: ForensicSuspectItem[];
}> {
  const res = await apiFetch('/api/admin/forensic-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    totalSlots?: number;
    toneSlots?: number;
    results?: ForensicSuspectItem[];
    error?: string;
  };
  if (!res.ok || !Array.isArray(data.results)) {
    throw new Error(data.error || 'Không thể phân tích dấu vân tay văn bản.');
  }
  return {
    totalSlots: data.totalSlots ?? 0,
    toneSlots: data.toneSlots ?? 0,
    results: data.results,
  };
}
