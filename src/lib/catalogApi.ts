import type { AniListNovelCandidate, CustomCollection } from '@/types';
import {
  LOCAL_COLLECTIONS_STORAGE_KEY,
  LOCAL_PTR_BOOKS_STORAGE_KEY,
  LOCAL_PTR_STORAGE_KEY,
  MAX_SHELF_NAME_LENGTH,
  apiFetch,
  assertApiConfigured,
  isCloudMode,
} from '@/lib/api';
import {
  normalizeClientAltTitles,
  patchShelfAltTitles,
  readLocalShelfPrefs,
  toShelfPrefKey,
  writeLocalShelfPrefs,
} from '@/lib/shelfPrefs';

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore private mode / quota errors
  }
}

export async function setShelfAltTitles(
  shelfName: string,
  rawAltTitles: readonly string[],
): Promise<string[]> {
  assertApiConfigured();
  const trimmed = shelfName.trim();
  if (!trimmed || trimmed.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error(`Tên kệ sách không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`);
  }
  const normalized = normalizeClientAltTitles(rawAltTitles);
  if (!isCloudMode) {
    writeLocalShelfPrefs(patchShelfAltTitles(readLocalShelfPrefs(), trimmed, normalized));
    return normalized;
  }

  const res = await apiFetch('/api/shelves/alt-titles', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelfName: trimmed, altTitles: normalized }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    altTitles?: string[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể lưu tên gọi khác cho bộ truyện.');
  }
  const saved = Array.isArray(data.altTitles) ? data.altTitles : normalized;
  writeLocalShelfPrefs(patchShelfAltTitles(readLocalShelfPrefs(), trimmed, saved));
  return saved;
}

export async function setPlanToReadShelf(
  shelfName: string,
  planToRead: boolean,
): Promise<void> {
  assertApiConfigured();
  const trimmed = shelfName.trim();
  if (!trimmed || trimmed.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error(`Tên bộ truyện không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`);
  }
  const key = toShelfPrefKey(trimmed);

  if (!isCloudMode) {
    const current = new Set(
      readLocalJson<string[]>(LOCAL_PTR_STORAGE_KEY, []).map(toShelfPrefKey),
    );
    if (planToRead) current.add(key);
    else current.delete(key);
    writeLocalJson(LOCAL_PTR_STORAGE_KEY, Array.from(current));
    return;
  }

  const res = await apiFetch('/api/plan-to-read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelfName: trimmed, planToRead }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể cập nhật danh sách Đọc sau.');
  }
}

export async function setPlanToReadBook(
  bookId: string,
  planToRead: boolean,
): Promise<void> {
  assertApiConfigured();
  const id = bookId.trim();
  if (!id) throw new Error('ID tập sách không hợp lệ.');

  if (!isCloudMode) {
    const current = new Set(readLocalJson<string[]>(LOCAL_PTR_BOOKS_STORAGE_KEY, []));
    if (planToRead) current.add(id);
    else current.delete(id);
    writeLocalJson(LOCAL_PTR_BOOKS_STORAGE_KEY, Array.from(current));
    return;
  }

  const res = await apiFetch('/api/plan-to-read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId: id, planToRead }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể cập nhật trạng thái Đọc sau cho tập sách.');
  }
}

export interface UpsertCollectionInput {
  name: string;
  description?: string | null;
  sortOrder?: number;
  shelfKeys: string[];
}

export async function createCustomCollection(
  input: UpsertCollectionInput,
): Promise<CustomCollection> {
  assertApiConfigured();
  const name = input.name.trim();
  if (!name || name.length > 80) {
    throw new Error('Tên tuyển tập không hợp lệ (tối đa 80 ký tự).');
  }
  const description = input.description?.trim() ? input.description.trim().slice(0, 300) : null;
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.floor(input.sortOrder!) : 0;
  const shelfKeys = Array.from(
    new Set(input.shelfKeys.map(toShelfPrefKey).filter(Boolean)),
  );

  if (!isCloudMode) {
    const now = Date.now();
    const created: CustomCollection = {
      id: `col_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      description,
      sortOrder,
      shelfKeys,
      createdAt: now,
      updatedAt: now,
    };
    const existing = readLocalJson<CustomCollection[]>(LOCAL_COLLECTIONS_STORAGE_KEY, []);
    writeLocalJson(LOCAL_COLLECTIONS_STORAGE_KEY, [...existing, created]);
    return created;
  }

  const res = await apiFetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, sortOrder, shelfKeys }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    collection?: CustomCollection;
    error?: string;
  };
  if (!res.ok || !data.collection) {
    throw new Error(data.error || 'Không thể tạo bộ sưu tập mới.');
  }
  return data.collection;
}

export async function updateCustomCollection(
  collectionId: string,
  input: UpsertCollectionInput,
): Promise<CustomCollection> {
  assertApiConfigured();
  const name = input.name.trim();
  if (!name || name.length > 80) {
    throw new Error('Tên tuyển tập không hợp lệ (tối đa 80 ký tự).');
  }
  const description = input.description?.trim() ? input.description.trim().slice(0, 300) : null;
  const sortOrder = Number.isFinite(input.sortOrder) ? Math.floor(input.sortOrder!) : 0;
  const shelfKeys = Array.from(
    new Set(input.shelfKeys.map(toShelfPrefKey).filter(Boolean)),
  );

  if (!isCloudMode) {
    const now = Date.now();
    const existing = readLocalJson<CustomCollection[]>(LOCAL_COLLECTIONS_STORAGE_KEY, []);
    const prev = existing.find((c) => c.id === collectionId);
    const updated: CustomCollection = {
      id: collectionId,
      name,
      description,
      sortOrder,
      shelfKeys,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    writeLocalJson(
      LOCAL_COLLECTIONS_STORAGE_KEY,
      existing.some((c) => c.id === collectionId)
        ? existing.map((c) => (c.id === collectionId ? updated : c))
        : [...existing, updated],
    );
    return updated;
  }

  const res = await apiFetch(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, sortOrder, shelfKeys }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    collection?: CustomCollection;
    error?: string;
  };
  if (!res.ok || !data.collection) {
    throw new Error(data.error || 'Không thể cập nhật bộ sưu tập.');
  }
  return data.collection;
}

export async function deleteCustomCollection(collectionId: string): Promise<void> {
  assertApiConfigured();
  if (!isCloudMode) {
    const existing = readLocalJson<CustomCollection[]>(LOCAL_COLLECTIONS_STORAGE_KEY, []);
    writeLocalJson(
      LOCAL_COLLECTIONS_STORAGE_KEY,
      existing.filter((c) => c.id !== collectionId),
    );
    return;
  }

  const res = await apiFetch(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể xoá bộ sưu tập.');
  }
}

export async function searchAniListLightNovelsApi(
  query: string,
): Promise<AniListNovelCandidate[]> {
  assertApiConfigured();
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw new Error('Từ khoá tìm kiếm AniList cần ít nhất 2 ký tự.');
  }
  if (!isCloudMode) {
    throw new Error('Gợi ý AniList chỉ hoạt động khi kết nối Cloudflare Worker.');
  }

  const res = await apiFetch('/api/admin/anilist/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: trimmed }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    candidates?: AniListNovelCandidate[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      data.error || 'AniList tạm thời không phản hồi. Bạn vẫn có thể nhập thông tin thủ công.',
    );
  }
  return Array.isArray(data.candidates) ? data.candidates : [];
}
