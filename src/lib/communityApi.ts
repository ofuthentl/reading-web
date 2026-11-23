import type {
  CommunityComment,
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

interface LocalCommunityStore {
  ratings: Record<string, Record<string, { authorName: string; rating: number; updatedAt: number }>>;
  comments: Record<
    string,
    Array<{
      id: string;
      userScope: string;
      authorName: string;
      authorRole: 'owner' | 'guest';
      content: string;
      createdAt: number;
      updatedAt: number;
    }>
  >;
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
    const comments: CommunityComment[] = list.map((item) => {
      const isMine = item.userScope === id.userScope;
      return {
        id: item.id,
        authorName: item.authorName,
        authorRole: item.authorRole,
        content: item.content,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        isMine,
        canDelete: id.role === 'owner' || isMine,
      };
    });
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
      store.ratings[bucketKey][id.userScope] = {
        authorName: id.authorName,
        rating,
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

  if (!isCloudMode) {
    const store = readLocalStore();
    const id = getLocalIdentity();
    const bucketKey = makeBucketKey(targetType, targetKey);
    const now = Date.now();
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
    const created = {
      id: crypto.randomUUID().replace(/-/g, ''),
      userScope: id.userScope,
      authorName: id.authorName,
      authorRole: id.role,
      content: trimmed,
      createdAt: now,
      updatedAt: now,
    };
    store.comments[bucketKey] = [created, ...(store.comments[bucketKey] || [])];
    writeLocalStore(store);
    return {
      id: created.id,
      authorName: created.authorName,
      authorRole: created.authorRole,
      content: created.content,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      isMine: true,
      canDelete: true,
    };
  }

  const res = await apiFetch('/api/community/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetKey, content: trimmed }),
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

export async function deleteCommunityCommentApi(commentId: string): Promise<void> {
  assertApiConfigured();
  if (!isCloudMode) {
    const store = readLocalStore();
    for (const key of Object.keys(store.comments)) {
      store.comments[key] = store.comments[key].filter((c) => c.id !== commentId);
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
