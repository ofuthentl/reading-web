import type {
  ShelfAccessGrantUser,
  ShelfAccessMode,
  ShelfAccessRuleDetail,
  ShelfAccessSummary,
} from '@/types';
import { apiFetch, assertApiConfigured, isCloudMode } from '@/lib/authSession';

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
    const shelfKey = input.shelfName.trim().toLocaleLowerCase('vi');
    if (input.mode === 'public') {
      return { shelfKey, summary: null, allowedUsers: [] };
    }
    const allowedUsers: ShelfAccessGrantUser[] = input.allowedUsers.map((u) => ({
      discordUserId: u.discordUserId.trim(),
      label: u.label?.trim() || null,
    }));
    return {
      shelfKey,
      summary: { mode: 'restricted', allowedCount: allowedUsers.length },
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
