import { apiFetch, isCloudMode } from '@/lib/authSession';

export interface DiscordAccessPresetMember {
  discordUserId: string;
  label: string | null;
  discordUsername: string | null;
}

export interface DiscordAccessPreset {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  members: DiscordAccessPresetMember[];
}

export interface DiscordGuestAccessMatrix {
  discordUserId: string;
  discordUsername: string | null;
  isBanned: boolean;
  strikes: number;
  sessionExpiresAt: number | null;
  shelves: Array<{
    shelfKey: string;
    shelfName: string;
    accessMode: 'public' | 'restricted';
    grantedAt: number;
  }>;
  books: Array<{
    bookId: string;
    bookTitle: string;
    shelfName: string;
    accessMode: 'public' | 'restricted' | 'inherit';
    grantedAt: number;
  }>;
  chapters: Array<{
    bookId: string;
    bookTitle: string;
    shelfName: string;
    chapterKey: string;
    grantedAt: number;
  }>;
  presets: Array<{
    presetId: string;
    presetName: string;
  }>;
  totalGrants: number;
}

export interface RevokeGuestAccessResult {
  ok: true;
  discordUserId: string;
  removedShelves: number;
  removedBooks: number;
  removedChapters: number;
  removedPresets: number;
  sessionClosed: boolean;
}

export interface AdminRecentComment {
  id: string;
  targetType: 'shelf' | 'book';
  targetKey: string;
  targetLabel: string;
  shelfName: string | null;
  authorName: string;
  authorRole: 'owner' | 'guest';
  content: string;
  parentId: string | null;
  chapterNumber: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdminRecentRating {
  targetType: 'shelf' | 'book';
  targetKey: string;
  targetLabel: string;
  shelfName: string | null;
  authorName: string;
  userScope: string;
  rating: number;
  updatedAt: number;
}

export interface AdminRecentCommunityReport {
  generatedAt: number;
  comments: AdminRecentComment[];
  ratings: AdminRecentRating[];
}

export async function fetchAdminDiscordPresets(
  signal?: AbortSignal,
): Promise<DiscordAccessPreset[]> {
  if (!isCloudMode) return [];
  const res = await apiFetch('/api/admin/discord-presets', { signal });
  const body = (await res.json().catch(() => ({}))) as {
    presets?: DiscordAccessPreset[];
    error?: string;
  };
  if (!res.ok || !Array.isArray(body.presets)) {
    throw new Error(body.error || 'Không thể tải danh sách nhóm quyền Discord.');
  }
  return body.presets;
}

export async function createAdminDiscordPreset(input: {
  name: string;
  description?: string | null;
  members: Array<{ discordUserId: string; label?: string | null }>;
}): Promise<DiscordAccessPreset> {
  const res = await apiFetch('/api/admin/discord-presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    preset?: DiscordAccessPreset;
    error?: string;
  };
  if (!res.ok || !body.preset) {
    throw new Error(body.error || 'Không thể tạo nhóm quyền Discord.');
  }
  return body.preset;
}

export async function updateAdminDiscordPreset(
  presetId: string,
  input: {
    name: string;
    description?: string | null;
    members: Array<{ discordUserId: string; label?: string | null }>;
  },
): Promise<DiscordAccessPreset> {
  const res = await apiFetch(`/api/admin/discord-presets/${encodeURIComponent(presetId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    preset?: DiscordAccessPreset;
    error?: string;
  };
  if (!res.ok || !body.preset) {
    throw new Error(body.error || 'Không thể cập nhật nhóm quyền Discord.');
  }
  return body.preset;
}

export async function deleteAdminDiscordPreset(presetId: string): Promise<void> {
  const res = await apiFetch(`/api/admin/discord-presets/${encodeURIComponent(presetId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Không thể xoá nhóm quyền Discord.');
  }
}

export async function fetchAdminGuestAccessMatrix(
  discordUserId: string,
  signal?: AbortSignal,
): Promise<DiscordGuestAccessMatrix> {
  const res = await apiFetch(
    `/api/admin/discord-guests/${encodeURIComponent(discordUserId)}/access-matrix`,
    { signal },
  );
  const body = (await res.json().catch(() => ({}))) as DiscordGuestAccessMatrix & {
    error?: string;
  };
  if (!res.ok || !body.discordUserId) {
    throw new Error(body.error || 'Không thể tải ma trận quyền của thành viên Discord.');
  }
  return body;
}

export async function revokeAllAdminGuestAccess(
  discordUserId: string,
  options?: { includePresets?: boolean; closeSession?: boolean },
): Promise<RevokeGuestAccessResult> {
  const res = await apiFetch(
    `/api/admin/discord-guests/${encodeURIComponent(discordUserId)}/revoke-all`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includePresets: Boolean(options?.includePresets),
        closeSession: Boolean(options?.closeSession),
      }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as RevokeGuestAccessResult & {
    error?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || 'Không thể thu hồi quyền của thành viên Discord.');
  }
  return body;
}

export async function fetchAdminRecentCommunity(
  limit = 30,
  signal?: AbortSignal,
): Promise<AdminRecentCommunityReport> {
  if (!isCloudMode) {
    return { generatedAt: Date.now(), comments: [], ratings: [] };
  }
  const res = await apiFetch(`/api/admin/usage/recent-community?limit=${limit}`, { signal });
  const body = (await res.json().catch(() => ({}))) as AdminRecentCommunityReport & {
    error?: string;
  };
  if (!res.ok || !Array.isArray(body.comments)) {
    throw new Error(body.error || 'Không thể tải danh sách bình luận và đánh giá mới nhất.');
  }
  return body;
}
