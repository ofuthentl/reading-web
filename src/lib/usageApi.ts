import { isCloudMode } from '@/lib/api';
import { apiFetch, assertApiConfigured } from '@/lib/authSession';
import { getAllLocalProgress, getLocalBooks } from '@/lib/cache';

export type AdminUsageWindowDays = 7 | 14 | 30;

export interface AdminUsageDailyPoint {
  dayKey: string;
  uniqueReaders: number;
  guestReaders: number;
  ownerLogins: number;
  guestLogins: number;
  discordKeysIssued: number;
  loginFailures: number;
  guestChapterReads: number;
  ownerProgressUpdates: number;
  guestSearches: number;
  rateLimitHits: number;
}

export interface AdminUsageTopBook {
  id: string;
  title: string;
  author: string;
  shelf: string;
  fileType: 'epub' | 'docx';
  hasGuestPack: boolean;
  readersTotal: number;
  guestReaders: number;
  readersInWindow: number;
  completedTotal: number;
  avgPercent: number;
  lastReadAt: number;
}

export interface AdminUsageTopShelf {
  shelf: string;
  bookCount: number;
  activeReaders: number;
  completedReads: number;
  lastReadAt: number | null;
}

export interface AdminUsageGuestRow {
  discordUserId: string;
  discordUsername: string;
  tagTail: string;
  sessionActive: boolean;
  sessionExpiresAt: number | null;
  strikes: number;
  isBanned: boolean;
  banReason: string | null;
  startedBooks: number;
  completedBooks: number;
  bookmarkCount: number;
  lastReadAt: number | null;
  lastBookTitle: string | null;
  lastBookShelf: string | null;
  lastChapterTitle: string | null;
  lastChapterIndex: number | null;
  updatedAt: number;
}

export interface AdminUsageReport {
  generatedAt: number;
  timezone: string;
  days: AdminUsageWindowDays;
  overview: {
    totalBooks: number;
    totalShelves: number;
    epubCount: number;
    docxCount: number;
    guestReadyBooks: number;
    restrictedShelves: number;
    favoriteShelves: number;
    taggedShelves: number;
    totalGuests: number;
    activeGuestSessions24h: number;
    bannedGuests: number;
    uniqueReaders7d: number;
    uniqueReaders30d: number;
    guestReaders7d: number;
    guestReaders30d: number;
    ownerCompletedBooks: number;
    ownerStartedBooks: number;
    guestCompletedBooks: number;
    guestStartedBooks: number;
    totalBookmarks: number;
    ownerBookmarks: number;
    guestBookmarks: number;
    windowTotals: {
      guestChapterReads: number;
      ownerProgressUpdates: number;
      guestLogins: number;
      ownerLogins: number;
      discordKeysIssued: number;
      guestSearches: number;
      loginFailures: number;
      rateLimitHits: number;
    };
  };
  storage: {
    usedBytes: number;
    limitBytes: number;
    remainingBytes: number;
    fileBytes: number;
    coverBytes: number;
    packBytes: number;
  };
  security: {
    totalStrikes: number;
    guestsWithStrikes: number;
    bannedGuests: number;
    activeLockedIps: number;
    recentLoginFailures: number;
    recentRateLimitHits: number;
  };
  dailySeries: AdminUsageDailyPoint[];
  topBooks: AdminUsageTopBook[];
  topShelves: AdminUsageTopShelf[];
  guestActivity: AdminUsageGuestRow[];
}

function buildLocalFallbackReport(
  days: AdminUsageWindowDays,
  books: Awaited<ReturnType<typeof getLocalBooks>>,
  progress: Awaited<ReturnType<typeof getAllLocalProgress>>,
): AdminUsageReport {
  const now = Date.now();
  const vnOffsetMs = 7 * 3600_000;
  const dayMs = 86_400_000;
  const shelves = new Set<string>();
  let fileBytes = 0;
  let coverBytes = 0;
  let epubCount = 0;
  let docxCount = 0;

  for (const b of books) {
    shelves.add((b.shelf || 'Kho chưa phân loại').trim().toLocaleLowerCase('vi'));
    fileBytes += b.file_size || 0;
    coverBytes += b.cover_size || 0;
    if (b.file_type === 'docx') docxCount += 1;
    else epubCount += 1;
  }

  const progEntries = Object.entries(progress);
  const ownerCompletedBooks = progEntries.filter(([, p]) => p.completed).length;
  const dailySeries: AdminUsageDailyPoint[] = Array.from({ length: days }, (_, idx) => {
    const dayKey = new Date(now - (days - 1 - idx) * dayMs + vnOffsetMs)
      .toISOString()
      .slice(0, 10);
    return {
      dayKey,
      uniqueReaders: 0,
      guestReaders: 0,
      ownerLogins: 0,
      guestLogins: 0,
      discordKeysIssued: 0,
      loginFailures: 0,
      guestChapterReads: 0,
      ownerProgressUpdates: 0,
      guestSearches: 0,
      rateLimitHits: 0,
    };
  });

  const bookMap = new Map(books.map((b) => [b.id, b]));
  const topBooks: AdminUsageTopBook[] = progEntries
    .map(([bookId, p]) => {
      const b = bookMap.get(bookId);
      if (!b) return null;
      const pct = p.completed
        ? 100
        : p.totalChapters && p.totalChapters > 0
          ? Math.round(Math.min(100, ((p.chapterIndex + p.scrollRatio) * 100) / p.totalChapters))
          : Math.round(Math.min(100, p.scrollRatio * 100));
      return {
        id: b.id,
        title: b.title,
        author: b.author,
        shelf: b.shelf,
        fileType: b.file_type,
        hasGuestPack: false,
        readersTotal: 1,
        guestReaders: 0,
        readersInWindow: p.updatedAt >= now - days * dayMs ? 1 : 0,
        completedTotal: p.completed ? 1 : 0,
        avgPercent: pct,
        lastReadAt: p.updatedAt,
      };
    })
    .filter((item): item is AdminUsageTopBook => Boolean(item))
    .sort((a, b) => b.lastReadAt - a.lastReadAt)
    .slice(0, 12);

  const usedBytes = fileBytes + coverBytes;
  const limitBytes = 9 * 1024 ** 3;
  return {
    generatedAt: now,
    timezone: 'UTC+7',
    days,
    overview: {
      totalBooks: books.length,
      totalShelves: shelves.size,
      epubCount,
      docxCount,
      guestReadyBooks: 0,
      restrictedShelves: 0,
      favoriteShelves: 0,
      taggedShelves: 0,
      totalGuests: 0,
      activeGuestSessions24h: 0,
      bannedGuests: 0,
      uniqueReaders7d: progEntries.some(([, p]) => p.updatedAt >= now - 7 * dayMs) ? 1 : 0,
      uniqueReaders30d: progEntries.some(([, p]) => p.updatedAt >= now - 30 * dayMs) ? 1 : 0,
      guestReaders7d: 0,
      guestReaders30d: 0,
      ownerCompletedBooks,
      ownerStartedBooks: progEntries.length,
      guestCompletedBooks: 0,
      guestStartedBooks: 0,
      totalBookmarks: 0,
      ownerBookmarks: 0,
      guestBookmarks: 0,
      windowTotals: {
        guestChapterReads: 0,
        ownerProgressUpdates: 0,
        guestLogins: 0,
        ownerLogins: 0,
        discordKeysIssued: 0,
        guestSearches: 0,
        loginFailures: 0,
        rateLimitHits: 0,
      },
    },
    storage: {
      usedBytes,
      limitBytes,
      remainingBytes: Math.max(0, limitBytes - usedBytes),
      fileBytes,
      coverBytes,
      packBytes: 0,
    },
    security: {
      totalStrikes: 0,
      guestsWithStrikes: 0,
      bannedGuests: 0,
      activeLockedIps: 0,
      recentLoginFailures: 0,
      recentRateLimitHits: 0,
    },
    dailySeries,
    topBooks,
    topShelves: [],
    guestActivity: [],
  };
}

export async function fetchAdminUsageReport(
  days: AdminUsageWindowDays = 14,
  signal?: AbortSignal,
): Promise<AdminUsageReport> {
  assertApiConfigured();
  if (!isCloudMode) {
    const [books, progress] = await Promise.all([getLocalBooks(), getAllLocalProgress()]);
    return buildLocalFallbackReport(days, books, progress);
  }

  const res = await apiFetch(`/api/admin/usage?days=${days}`, { signal });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminUsageReport> & {
    error?: string;
  };
  if (!res.ok || !data.overview || !Array.isArray(data.dailySeries)) {
    throw new Error(data.error || 'Không thể tải báo cáo thống kê hệ thống.');
  }
  return data as AdminUsageReport;
}
