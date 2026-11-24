import type {
  AniListNovelCandidate,
  CustomCollection,
  ShelfRelation,
  ShelfRelationType,
} from '@/types';
import {
  LOCAL_COLLECTIONS_STORAGE_KEY,
  LOCAL_PTR_BOOKS_STORAGE_KEY,
  LOCAL_PTR_STORAGE_KEY,
  LOCAL_SHELF_RELATIONS_STORAGE_KEY,
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

export function syncLocalCatalogOnShelfRenamed(oldName: string, newName: string): void {
  const oldKey = toShelfPrefKey(oldName);
  const newKey = toShelfPrefKey(newName);
  if (!oldKey || !newKey || oldKey === newKey) return;

  const ptrShelves = readLocalJson<string[]>(LOCAL_PTR_STORAGE_KEY, []).map(toShelfPrefKey);
  if (ptrShelves.includes(oldKey)) {
    writeLocalJson(
      LOCAL_PTR_STORAGE_KEY,
      Array.from(new Set(ptrShelves.map((k) => (k === oldKey ? newKey : k)))),
    );
  }

  const cols = readLocalJson<CustomCollection[]>(LOCAL_COLLECTIONS_STORAGE_KEY, []);
  let colChanged = false;
  const nextCols = cols.map((col) => {
    const normalized = col.shelfKeys.map(toShelfPrefKey);
    if (!normalized.includes(oldKey)) return col;
    colChanged = true;
    return {
      ...col,
      shelfKeys: Array.from(new Set(normalized.map((k) => (k === oldKey ? newKey : k)))),
    };
  });
  if (colChanged) writeLocalJson(LOCAL_COLLECTIONS_STORAGE_KEY, nextCols);

  const rels = readLocalJson<ShelfRelation[]>(LOCAL_SHELF_RELATIONS_STORAGE_KEY, []);
  if (rels.some((r) => r.sourceShelfKey === oldKey || r.targetShelfKey === oldKey)) {
    const byPair = new Map<string, ShelfRelation>();
    for (const r of rels) {
      const src = r.sourceShelfKey === oldKey ? newKey : r.sourceShelfKey;
      const dst = r.targetShelfKey === oldKey ? newKey : r.targetShelfKey;
      if (!src || !dst || src === dst) continue;
      const pk = src < dst ? `${src}\u0000${dst}` : `${dst}\u0000${src}`;
      const existing = byPair.get(pk);
      if (!existing || r.createdAt >= existing.createdAt) {
        byPair.set(pk, { ...r, sourceShelfKey: src, targetShelfKey: dst });
      }
    }
    writeLocalJson(LOCAL_SHELF_RELATIONS_STORAGE_KEY, Array.from(byPair.values()));
  }
}

export function syncLocalCatalogOnBooksDeleted(
  deletedBookIds: ReadonlySet<string>,
  remainingShelfKeys: ReadonlySet<string>,
): void {
  const ptrBooks = readLocalJson<string[]>(LOCAL_PTR_BOOKS_STORAGE_KEY, []);
  const nextPtrBooks = ptrBooks.filter((id) => !deletedBookIds.has(id));
  if (nextPtrBooks.length !== ptrBooks.length) {
    writeLocalJson(LOCAL_PTR_BOOKS_STORAGE_KEY, nextPtrBooks);
  }

  const ptrShelves = readLocalJson<string[]>(LOCAL_PTR_STORAGE_KEY, []).map(toShelfPrefKey);
  const nextPtrShelves = ptrShelves.filter((k) => remainingShelfKeys.has(k));
  if (nextPtrShelves.length !== ptrShelves.length) {
    writeLocalJson(LOCAL_PTR_STORAGE_KEY, nextPtrShelves);
  }

  const cols = readLocalJson<CustomCollection[]>(LOCAL_COLLECTIONS_STORAGE_KEY, []);
  let colChanged = false;
  const nextCols = cols.map((col) => {
    const filtered = col.shelfKeys.filter((k) => remainingShelfKeys.has(toShelfPrefKey(k)));
    if (filtered.length !== col.shelfKeys.length) {
      colChanged = true;
      return { ...col, shelfKeys: filtered };
    }
    return col;
  });
  if (colChanged) writeLocalJson(LOCAL_COLLECTIONS_STORAGE_KEY, nextCols);

  const rels = readLocalJson<ShelfRelation[]>(LOCAL_SHELF_RELATIONS_STORAGE_KEY, []);
  const nextRels = rels.filter(
    (r) =>
      remainingShelfKeys.has(toShelfPrefKey(r.sourceShelfKey)) &&
      remainingShelfKeys.has(toShelfPrefKey(r.targetShelfKey)),
  );
  if (nextRels.length !== rels.length) {
    writeLocalJson(LOCAL_SHELF_RELATIONS_STORAGE_KEY, nextRels);
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
    const { searchAniListDirectBrowser } = await import('@/lib/anilistDirect');
    return searchAniListDirectBrowser(trimmed);
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
  if (res.ok) {
    return Array.isArray(data.candidates) ? data.candidates : [];
  }

  // Nếu Cloudflare WAF phía AniList chặn IP Worker (502/504), fallback trực tiếp từ trình duyệt Admin (CORS ACAO: *)
  if (res.status === 502 || res.status === 504) {
    const { searchAniListDirectBrowser } = await import('@/lib/anilistDirect');
    return searchAniListDirectBrowser(trimmed);
  }

  throw new Error(
    data.error || 'AniList tạm thời không phản hồi. Bạn vẫn có thể nhập thông tin thủ công.',
  );
}

export async function saveShelfRelationApi(
  sourceShelfName: string,
  targetShelfName: string,
  relationType: ShelfRelationType,
): Promise<ShelfRelation> {
  assertApiConfigured();
  const srcKey = toShelfPrefKey(sourceShelfName);
  const dstKey = toShelfPrefKey(targetShelfName);
  if (!srcKey || !dstKey || srcKey === dstKey) {
    throw new Error('Vui lòng chọn hai bộ truyện khác nhau để liên kết.');
  }

  if (!isCloudMode) {
    const saved: ShelfRelation = {
      sourceShelfKey: relationType === 'same_universe' && srcKey > dstKey ? dstKey : srcKey,
      targetShelfKey: relationType === 'same_universe' && srcKey > dstKey ? srcKey : dstKey,
      relationType,
      createdAt: Date.now(),
    };
    const pk = srcKey < dstKey ? `${srcKey}\u0000${dstKey}` : `${dstKey}\u0000${srcKey}`;
    const existing = readLocalJson<ShelfRelation[]>(LOCAL_SHELF_RELATIONS_STORAGE_KEY, []);
    const filtered = existing.filter((r) => {
      const k =
        r.sourceShelfKey < r.targetShelfKey
          ? `${r.sourceShelfKey}\u0000${r.targetShelfKey}`
          : `${r.targetShelfKey}\u0000${r.sourceShelfKey}`;
      return k !== pk;
    });
    writeLocalJson(LOCAL_SHELF_RELATIONS_STORAGE_KEY, [...filtered, saved]);
    return saved;
  }

  const res = await apiFetch('/api/shelves/relations', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceShelfName: sourceShelfName.trim(),
      targetShelfName: targetShelfName.trim(),
      relationType,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    relation?: ShelfRelation;
    error?: string;
  };
  if (!res.ok || !data.relation) {
    throw new Error(data.error || 'Không thể lưu liên kết giữa hai bộ truyện.');
  }
  return data.relation;
}

export async function deleteShelfRelationApi(
  sourceShelfName: string,
  targetShelfName: string,
): Promise<void> {
  assertApiConfigured();
  const srcKey = toShelfPrefKey(sourceShelfName);
  const dstKey = toShelfPrefKey(targetShelfName);
  if (!srcKey || !dstKey) return;

  if (!isCloudMode) {
    const pk = srcKey < dstKey ? `${srcKey}\u0000${dstKey}` : `${dstKey}\u0000${srcKey}`;
    const existing = readLocalJson<ShelfRelation[]>(LOCAL_SHELF_RELATIONS_STORAGE_KEY, []);
    writeLocalJson(
      LOCAL_SHELF_RELATIONS_STORAGE_KEY,
      existing.filter((r) => {
        const k =
          r.sourceShelfKey < r.targetShelfKey
            ? `${r.sourceShelfKey}\u0000${r.targetShelfKey}`
            : `${r.targetShelfKey}\u0000${r.sourceShelfKey}`;
        return k !== pk;
      }),
    );
    return;
  }

  const res = await apiFetch('/api/shelves/relations', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceShelfName: sourceShelfName.trim(),
      targetShelfName: targetShelfName.trim(),
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Không thể xoá liên kết bộ truyện.');
  }
}
