import type {
  BookAccessMode,
  BookAccessSummary,
  ShelfAccessGrantUser,
} from '@/types';
import { apiFetch, assertApiConfigured, isCloudMode } from '@/lib/api';

export interface AdminBookChapterAccessItem {
  chapterKey: string;
  title: string;
  chapterNumber: number | null;
  partCount: number;
  locked: boolean;
  allowedUsers: ShelfAccessGrantUser[];
}

export interface AdminBookAccessDetail {
  bookId: string;
  shelfKey: string;
  shelfRestricted: boolean;
  hasGuestPack: boolean;
  bookRule: {
    mode: BookAccessMode;
    allowedUsers: ShelfAccessGrantUser[];
  };
  chapters: AdminBookChapterAccessItem[];
}

export interface SaveAdminBookAccessInput {
  bookId: string;
  mode: BookAccessMode;
  allowedUsers: Array<{ discordUserId: string; label?: string | null }>;
  chapters: Array<{
    chapterKey: string;
    allowedUsers: Array<{ discordUserId: string; label?: string | null }>;
  }>;
}

export async function fetchAdminBookAccessDetail(
  bookId: string,
  signal?: AbortSignal,
): Promise<AdminBookAccessDetail> {
  assertApiConfigured();
  if (!isCloudMode) {
    return {
      bookId,
      shelfKey: '',
      shelfRestricted: false,
      hasGuestPack: false,
      bookRule: { mode: 'inherit', allowedUsers: [] },
      chapters: [],
    };
  }

  const res = await apiFetch(`/api/admin/books/${encodeURIComponent(bookId)}/access`, {
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminBookAccessDetail> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải cấu hình phân quyền cho tập sách.');
  }
  return {
    bookId: data.bookId || bookId,
    shelfKey: data.shelfKey || '',
    shelfRestricted: Boolean(data.shelfRestricted),
    hasGuestPack: Boolean(data.hasGuestPack),
    bookRule: {
      mode:
        data.bookRule?.mode === 'public' || data.bookRule?.mode === 'restricted'
          ? data.bookRule.mode
          : 'inherit',
      allowedUsers: Array.isArray(data.bookRule?.allowedUsers) ? data.bookRule.allowedUsers : [],
    },
    chapters: Array.isArray(data.chapters) ? data.chapters : [],
  };
}

export async function saveAdminBookAccessConfig(
  input: SaveAdminBookAccessInput,
): Promise<{ summary: BookAccessSummary | null }> {
  assertApiConfigured();
  if (!isCloudMode) {
    if (input.mode === 'inherit' && input.chapters.length === 0) {
      return { summary: null };
    }
    return {
      summary: {
        mode: input.mode,
        allowedCount: input.mode === 'restricted' ? input.allowedUsers.length : 0,
        lockedChapterCount: input.chapters.length,
      },
    };
  }

  const res = await apiFetch(`/api/admin/books/${encodeURIComponent(input.bookId)}/access`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: input.mode,
      allowedUsers: input.allowedUsers,
      chapters: input.chapters,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    summary?: BookAccessSummary | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể lưu phân quyền tập sách và chương.');
  }
  return { summary: data.summary ?? null };
}
