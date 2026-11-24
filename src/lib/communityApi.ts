import type {
  CommunityComment,
  CommunityReactionEmoji,
  CommunitySummary,
  CommunityTargetType,
} from '@/types';
import {
  apiFetch,
  assertApiConfigured,
  getActiveAuthSession,
  isCloudMode,
} from '@/lib/authSession';
import { toShelfPrefKey } from '@/lib/shelfPrefs';

export const MAX_COMMUNITY_COMMENT_LENGTH = 1500;
const LOCAL_COMMUNITY_STORAGE_KEY = 'ofu-library-local-community-v1';
const LOCAL_COOLDOWN_MS = 10_000;

export class CommunityApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CommunityApiError';
  }
}

interface LocalStoredComment {
  id: string;
  userScope: string;
  authorName: string;
  authorRole: 'owner' | 'guest';
  content: string;
  parentId?: string | null;
  chapterNumber?: number | null;
  reactions?: Record<string, string[]>;
  createdAt: number;
  updatedAt: number;
}

interface LocalCommunityStore {
  ratings: Record<string, Record<string, { authorName: string; rating: number; updatedAt: number }>>;
  comments: Record<string, LocalStoredComment[]>;
}

function normalizeTargetKey(targetType: CommunityTargetType, rawKey: string): string {
  return targetType === 'shelf' ? toShelfPrefKey(rawKey) : rawKey.trim();
}

function makeBucketKey(targetType: CommunityTargetType, targetKey: string): string {
  return `${targetType}:${targetKey}`;
}

function readLocalStore(): LocalCommunityStore {
  try {
    const raw = window.localStorage.getItem(LOCAL_COMMUNITY_STORAGE_KEY);
    if (!raw) return { ratings: {}, comments: {} };
    const parsed = JSON.parse(raw) as Partial<LocalCommunityStore>;
    return {
      ratings: parsed.ratings && typeof parsed.ratings === 'object' ? parsed.ratings : {},
      comments: parsed.comments && typeof parsed.comments === 'object' ? parsed.comments : {},
    };
  } catch {
    return { ratings: {}, comments: {} };
  }
}

function writeLocalStore(store: LocalCommunityStore): void {
  try {
    window.localStorage.setItem(LOCAL_COMMUNITY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Bỏ qua nếu localStorage đầy trong Local Dev
  }
}

function computeLocalRatingSummary(
  store: LocalCommunityStore,
  bucketKey: string,
  userScope: string,
): { averageRating: number | null; ratingCount: number; myRating: number | null } {
  const entries = Object.entries(store.ratings[bucketKey] || {});
  if (entries.length === 0) {
    return { averageRating: null, ratingCount: 0, myRating: null };
  }
  const sum = entries.reduce((acc, [, item]) => acc + item.rating, 0);
  const mine = store.ratings[bucketKey]?.[userScope]?.rating ?? null;
  return {
    averageRating: Math.round((sum / entries.length) * 10) / 10,
    ratingCount: entries.length,
    myRating: mine,
  };
}

function getLocalIdentity() {
  const session = getActiveAuthSession();
  const isOwner = session.role === 'owner';
  return {
    role: session.role,
    userScope: isOwner ? 'owner' : 'guest:local',
    authorName: isOwner ? 'Owner' : session.watermarkLabel || 'Thành viên Discord',
  };
}

function mapLocalComment(
  item: LocalStoredComment,
  userScope: string,
  role: 'owner' | 'guest',
): CommunityComment {
  const isMine = item.userScope === userScope;
  const reactions: Partial<Record<CommunityReactionEmoji, number>> = {};
  const myReactions: CommunityReactionEmoji[] = [];
  for (const [emoji, scopes] of Object.entries(item.reactions || {})) {
    if (Array.isArray(scopes) && scopes.length > 0) {
      reactions[emoji as CommunityReactionEmoji] = scopes.length;
      if (scopes.includes(userScope)) myReactions.push(emoji as CommunityReactionEmoji);
    }
  }
  return {
    id: item.id,
    authorName: item.authorName,
    authorRole: item.authorRole,
    content: item.content,
    parentId: item.parentId ?? null,
    chapterNumber: item.chapterNumber ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    isEdited: item.updatedAt > item.createdAt,
    isMine,
    canEdit: isMine,
    canDelete: role === 'owner' || isMine,
    reactions,
    myReactions,
  };
}

export function syncLocalCommunityOnShelfRenamed(oldName: string, newName: string): void {
  const oldKey = toShelfPrefKey(oldName);
  const newKey = toShelfPrefKey(newName);
  if (!oldKey || !newKey || oldKey === newKey) return;
  const store = readLocalStore();
  const oldBucket = makeBucketKey('shelf', oldKey);
  const newBucket = makeBucketKey('shelf', newKey);
  let changed = false;
  if (store.ratings[oldBucket]) {
    store.ratings[newBucket] = { ...(store.ratings[oldBucket] || {}), ...(store.ratings[newBucket] || {}) };
    delete store.ratings[oldBucket];
    changed = true;
  }
  if (store.comments[oldBucket]) {
    store.comments[newBucket] = [...(store.comments[newBucket] || []), ...store.comments[oldBucket]];
    delete store.comments[oldBucket];
    changed = true;
  }
  if (changed) writeLocalStore(store);
}

export function syncLocalCommunityOnBooksDeleted(
  deletedBookIds: ReadonlySet<string>,
  remainingShelfKeys: ReadonlySet<string>,
): void {
  const store = readLocalStore();
  let changed = false;
  for (const id of deletedBookIds) {
    const bk = makeBucketKey('book', id);
    if (bk in store.ratings) {
      delete store.ratings[bk];
      changed = true;
    }
    if (bk in store.comments) {
      delete store.comments[bk];
      changed = true;
    }
  }
  for (const bucketKey of [...Object.keys(store.ratings), ...Object.keys(store.comments)]) {
    if (!bucketKey.startsWith('shelf:')) continue;
    const shelfKey = bucketKey.slice('shelf:'.length);
    if (!remainingShelfKeys.has(shelfKey)) {
      if (bucketKey in store.ratings) {
        delete store.ratings[bucketKey];
        changed = true;
      }
      if (bucketKey in store.comments) {
        delete store.comments[bucketKey];
        changed = true;
      }
    }
  }
  if (changed) writeLocalStore(store);
}

export async function fetchCommunitySummary(
  targetType: CommunityTargetType,
  rawKey: string,
  signal?: AbortSignal,
): Promise<CommunitySummary> {
  assertApiConfigured();
  const targetKey = normalizeTargetKey(targetType, rawKey);

  if (!isCloudMode) {
    const store = readLocalStore();
    const id = getLocalIdentity();
    const bucketKey = makeBucketKey(targetType, targetKey);
    const ratingSummary = computeLocalRatingSummary(store, bucketKey, id.userScope);
    const list = (store.comments[bucketKey] || [])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
    const comments = list.map((item) => mapLocalComment(item, id.userScope, id.role));
    return {
      targetType,
      targetKey,
      ...ratingSummary,
      comments,
      totalComments: comments.length,
    };
  }

  const params = new URLSearchParams({ type: targetType, key: targetKey });
  const res = await apiFetch(`/api/community?${params.toString()}`, { signal });
  const data = (await res.json().catch(() => ({}))) as Partial<CommunitySummary> & {
    error?: string;
  };
  if (!res.ok) {
    throw new CommunityApiError(
      data.error || 'Không thể tải đánh giá và bình luận.',
      res.status,
    );
  }
  return {
    targetType: data.targetType === 'book' ? 'book' : 'shelf',
    targetKey: data.targetKey || targetKey,
    averageRating: typeof data.averageRating === 'number' ? data.averageRating : null,
    ratingCount: Number(data.ratingCount ?? 0),
    myRating: typeof data.myRating === 'number' ? data.myRating : null,
    comments: Array.isArray(data.comments) ? data.comments : [],
    totalComments: Number(data.totalComments ?? 0),
  };
}

export async function saveCommunityRating(
  targetType: CommunityTargetType,
  rawKey: string,
  rating: number | null,
): Promise<{ averageRating: number | null; ratingCount: number; myRating: number | null }> {
  assertApiConfigured();
  const targetKey = normalizeTargetKey(targetType, rawKey);

  if (!isCloudMode) {
    const store = readLocalStore();
    const id = getLocalIdentity();
    const bucketKey = makeBucketKey(targetType, targetKey);
    if (!store.ratings[bucketKey]) store.ratings[bucketKey] = {};
    if (rating === null || rating === 0) {
      delete store.ratings[bucketKey][id.userScope];
    } else {
      const half = Math.round(Number(rating) * 2);
      if (!Number.isFinite(rating) || Math.abs(Number(rating) * 2 - half) > 1e-6 || half < 1 || half > 10) {
        throw new CommunityApiError('Điểm sao phải từ 0.5 đến 5.0 (bước 0.5 sao).', 400);
      }
      store.ratings[bucketKey][id.userScope] = {
        authorName: id.authorName,
        rating: half / 2,
        updatedAt: Date.now(),
      };
    }
    writeLocalStore(store);
    return computeLocalRatingSummary(store, bucketKey, id.userScope);
  }

  const res = await apiFetch('/api/community/rating', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetKey, rating }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    averageRating?: number | null;
    ratingCount?: number;
    myRating?: number | null;
    error?: string;
  };
  if (!res.ok) {
    throw new CommunityApiError(data.error || 'Không thể lưu điểm đánh giá.', res.status);
  }
  return {
    averageRating: typeof data.averageRating === 'number' ? data.averageRating : null,
    ratingCount: Number(data.ratingCount ?? 0),
    myRating: typeof data.myRating === 'number' ? data.myRating : null,
  };
}

export async function postCommunityComment(
  targetType: CommunityTargetType,
  rawKey: string,
  content: string,
  options?: { parentId?: string | null; chapterNumber?: number | null },
): Promise<CommunityComment> {
  assertApiConfigured();
  const targetKey = normalizeTargetKey(targetType, rawKey);
  const trimmed = content.replace(/\r\n/g, '\n').trim();
  if (trimmed.length < 1 || trimmed.length > MAX_COMMUNITY_COMMENT_LENGTH) {
    throw new CommunityApiError(
      `Bình luận phải từ 1 đến ${MAX_COMMUNITY_COMMENT_LENGTH} ký tự.`,
      400,
    );
  }

  const parentId = options?.parentId || null;
  const chapterNumber =
    targetType === 'book' && options?.chapterNumber && options.chapterNumber > 0
      ? Math.floor(options.chapterNumber)
      : null;

  if (!isCloudMode) {
    const store = readLocalStore();
    const id = getLocalIdentity();
    const bucketKey = makeBucketKey(targetType, targetKey);
    const now = Date.now();
    const bucketList = store.comments[bucketKey] || [];
    if (parentId) {
      const parent = bucketList.find((c) => c.id === parentId);
      if (!parent) throw new CommunityApiError('Không tìm thấy bình luận gốc để trả lời.', 404);
      if (parent.parentId) throw new CommunityApiError('Chỉ hỗ trợ trả lời tối đa 1 cấp.', 400);
    }
    const allMine = Object.values(store.comments)
      .flat()
      .filter((c) => c.userScope === id.userScope);
    const latest = allMine.reduce((max, c) => Math.max(max, c.createdAt), 0);
    if (latest > 0 && now - latest < LOCAL_COOLDOWN_MS) {
      const waitSec = Math.max(1, Math.ceil((LOCAL_COOLDOWN_MS - (now - latest)) / 1000));
      throw new CommunityApiError(
        `Bạn đang gửi bình luận quá nhanh. Vui lòng đợi ${waitSec} giây rồi thử lại.`,
        429,
      );
    }
    const created: LocalStoredComment = {
      id: crypto.randomUUID().replace(/-/g, ''),
      userScope: id.userScope,
      authorName: id.authorName,
      authorRole: id.role,
      content: trimmed,
      parentId,
      chapterNumber,
      reactions: {},
      createdAt: now,
      updatedAt: now,
    };
    store.comments[bucketKey] = [created, ...bucketList];
    writeLocalStore(store);
    return mapLocalComment(created, id.userScope, id.role);
  }

  const res = await apiFetch('/api/community/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetKey, content: trimmed, parentId, chapterNumber }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    comment?: CommunityComment;
    error?: string;
  };
  if (!res.ok || !data.comment) {
    throw new CommunityApiError(data.error || 'Không thể gửi bình luận.', res.status);
  }
  return data.comment;
}

export async function editCommunityCommentApi(
  commentId: string,
  content: string,
): Promise<CommunityComment> {
  assertApiConfigured();
  const trimmed = content.replace(/\r\n/g, '\n').trim();
  if (trimmed.length < 1 || trimmed.length > MAX_COMMUNITY_COMMENT_LENGTH) {
    throw new CommunityApiError(
      `Bình luận phải từ 1 đến ${MAX_COMMUNITY_COMMENT_LENGTH} ký tự.`,
      400,
    );
  }

  if (!isCloudMode) {
    const store = readLocalStore();
    const id = getLocalIdentity();
    for (const bucketKey of Object.keys(store.comments)) {
      const target = store.comments[bucketKey]?.find((c) => c.id === commentId);
      if (target) {
        if (target.userScope !== id.userScope) {
          throw new CommunityApiError('Chỉ chính chủ mới có thể sửa bình luận này.', 403);
        }
        target.content = trimmed;
        target.updatedAt = Math.max(Date.now(), target.createdAt + 1);
        writeLocalStore(store);
        return mapLocalComment(target, id.userScope, id.role);
      }
    }
    throw new CommunityApiError('Không tìm thấy bình luận.', 404);
  }

  const res = await apiFetch(`/api/community/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: trimmed }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    comment?: CommunityComment;
    error?: string;
  };
  if (!res.ok || !data.comment) {
    throw new CommunityApiError(data.error || 'Không thể cập nhật bình luận.', res.status);
  }
  return data.comment;
}

export async function toggleCommunityReactionApi(
  commentId: string,
  emoji: CommunityReactionEmoji,
): Promise<{
  reactions: Partial<Record<CommunityReactionEmoji, number>>;
  myReactions: CommunityReactionEmoji[];
}> {
  assertApiConfigured();
  if (!isCloudMode) {
    const store = readLocalStore();
    const id = getLocalIdentity();
    for (const bucketKey of Object.keys(store.comments)) {
      const target = store.comments[bucketKey]?.find((c) => c.id === commentId);
      if (target) {
        if (!target.reactions) target.reactions = {};
        const prev = target.reactions[emoji] || [];
        target.reactions[emoji] = prev.includes(id.userScope)
          ? prev.filter((s) => s !== id.userScope)
          : [...prev, id.userScope];
        writeLocalStore(store);
        const mapped = mapLocalComment(target, id.userScope, id.role);
        return { reactions: mapped.reactions ?? {}, myReactions: mapped.myReactions ?? [] };
      }
    }
    throw new CommunityApiError('Không tìm thấy bình luận.', 404);
  }

  const res = await apiFetch(`/api/community/comments/${commentId}/reaction`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    reactions?: Partial<Record<CommunityReactionEmoji, number>>;
    myReactions?: CommunityReactionEmoji[];
    error?: string;
  };
  if (!res.ok) {
    throw new CommunityApiError(data.error || 'Không thể thả biểu cảm.', res.status);
  }
  return {
    reactions: data.reactions ?? {},
    myReactions: Array.isArray(data.myReactions) ? data.myReactions : [],
  };
}

export async function deleteCommunityCommentApi(commentId: string): Promise<void> {
  assertApiConfigured();
  if (!isCloudMode) {
    const store = readLocalStore();
    for (const key of Object.keys(store.comments)) {
      store.comments[key] = store.comments[key].filter(
        (c) => c.id !== commentId && c.parentId !== commentId,
      );
    }
    writeLocalStore(store);
    return;
  }

  const res = await apiFetch(`/api/community/comments/${commentId}`, {
    method: 'DELETE',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new CommunityApiError(data.error || 'Không thể xoá bình luận.', res.status);
  }
}
