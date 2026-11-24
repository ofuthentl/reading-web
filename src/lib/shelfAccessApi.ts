import type {
  ShelfAccessGrantUser,
  ShelfAccessMode,
  ShelfAccessRuleDetail,
  ShelfAccessSummary,
} from '@/types';
import { apiFetch, assertApiConfigured, isCloudMode } from '@/lib/authSession';
import {
  patchShelfAccessSummary,
  readLocalShelfPrefs,
  toShelfPrefKey,
  writeLocalShelfPrefs,
} from '@/lib/shelfPrefs';

export async function fetchAdminShelfAccessRules(): Promise<ShelfAccessRuleDetail[]> {
  assertApiConfigured();
  if (!isCloudMode) return [];

  const res = await apiFetch('/api/admin/shelves/access');
  const data = (await res.json().catch(() => ({}))) as {
    rules?: ShelfAccessRuleDetail[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải cấu hình phân quyền bộ truyện.');
  }
  return Array.isArray(data.rules) ? data.rules : [];
}

export async function saveAdminShelfAccessRule(input: {
  shelfName: string;
  mode: ShelfAccessMode;
  allowedUsers: Array<{ discordUserId: string; label?: string | null }>;
}): Promise<{
  shelfKey: string;
  summary: ShelfAccessSummary | null;
  allowedUsers: ShelfAccessGrantUser[];
}> {
  assertApiConfigured();
  if (!isCloudMode) {
    const shelfKey = toShelfPrefKey(input.shelfName);
    if (input.mode === 'public') {
      writeLocalShelfPrefs(patchShelfAccessSummary(readLocalShelfPrefs(), input.shelfName, null));
      return { shelfKey, summary: null, allowedUsers: [] };
    }
    const allowedUsers: ShelfAccessGrantUser[] = input.allowedUsers.map((u) => ({
      discordUserId: u.discordUserId.trim(),
      label: u.label?.trim() || null,
    }));
    const summary: ShelfAccessSummary = {
      mode: 'restricted',
      allowedCount: allowedUsers.length,
    };
    writeLocalShelfPrefs(patchShelfAccessSummary(readLocalShelfPrefs(), input.shelfName, summary));
    return {
      shelfKey,
      summary,
      allowedUsers,
    };
  }

  const res = await apiFetch('/api/admin/shelves/access', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    shelfKey?: string;
    summary?: ShelfAccessSummary | null;
    allowedUsers?: ShelfAccessGrantUser[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể lưu phân quyền bộ truyện.');
  }
  return {
    shelfKey: data.shelfKey || input.shelfName.trim().toLocaleLowerCase('vi'),
    summary: data.summary ?? null,
    allowedUsers: Array.isArray(data.allowedUsers) ? data.allowedUsers : [],
  };
}
