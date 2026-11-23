import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Lock, Search, ShieldAlert, Users } from 'lucide-react';
import type { AdminUsageGuestRow } from '@/lib/usageApi';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';

type GuestFilterMode = 'all' | 'active' | 'strikes' | 'banned';

export interface AdminUsageGuestTableProps {
  guests: readonly AdminUsageGuestRow[];
  formatRelativeTime: (timestampMs: number | null) => string;
}

export function AdminUsageGuestTable({
  guests,
  formatRelativeTime,
}: AdminUsageGuestTableProps) {
  const [guestQuery, setGuestQuery] = useState('');
  const [guestFilter, setGuestFilter] = useState<GuestFilterMode>('all');

  const normalizedQuery = useMemo(() => normalizeSearchText(guestQuery), [guestQuery]);

  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      if (guestFilter === 'active' && !g.sessionActive) return false;
      if (guestFilter === 'strikes' && g.strikes <= 0) return false;
      if (guestFilter === 'banned' && !g.isBanned) return false;
      if (!normalizedQuery) return true;
      const hay = normalizeSearchText(
        `${g.discordUsername} ${g.discordUserId} ${g.lastBookTitle ?? ''} ${g.lastBookShelf ?? ''}`,
      );
      return hay.includes(normalizedQuery);
    });
  }, [guestFilter, guests, normalizedQuery]);

  return (
    <section className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
            <Users className="h-4 w-4 text-accent" />
            <span>Hoạt động thành viên Discord ({guests.length})</span>
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Chỉ hiển thị thông tin quản trị an toàn · Không lưu khoá bí mật hay IP
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={guestQuery}
              onChange={(e) => setGuestQuery(e.target.value)}
              placeholder="Tìm tên, ID hoặc sách..."
              className="w-48 rounded-xl border border-line bg-canvas py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent sm:w-56"
            />
          </div>
          <div className="inline-flex rounded-xl border border-line bg-canvas p-1 text-[11px]">
            {(
              [
                ['all', 'Tất cả'],
                ['active', 'Đang mở'],
                ['strikes', 'Cảnh báo'],
                ['banned', 'Đã khoá'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setGuestFilter(id)}
                className={`rounded-lg px-2 py-1 font-medium transition-colors ${
                  guestFilter === id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredGuests.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-muted">
          Không có thành viên Discord nào khớp bộ lọc hiện tại.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] font-semibold text-ink-muted">
                <th className="py-2 pr-3">Thành viên</th>
                <th className="py-2 pr-3">Trạng thái</th>
                <th className="py-2 pr-3">Đọc / Xong / Lưu</th>
                <th className="py-2 pr-3">Đang đọc gần nhất</th>
                <th className="py-2 pr-3 text-right">Cảnh báo</th>
                <th className="py-2 text-right">Hoạt động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filteredGuests.map((g) => (
                <tr key={g.discordUserId} className="hover:bg-canvas/60">
                  <td className="py-2.5 pr-3">
                    <p className="font-semibold text-ink">
                      {g.discordUsername}{' '}
                      <span className="font-normal text-ink-faint">#{g.tagTail}</span>
                    </p>
                    <p className="font-mono text-[10px] text-ink-faint">{g.discordUserId}</p>
                  </td>
                  <td className="py-2.5 pr-3">
                    {g.isBanned ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-600/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
                        <Lock className="h-3 w-3" />
                        Đã khoá
                      </span>
                    ) : g.sessionActive ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        Đang mở 24h
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                        <Clock className="h-3 w-3" />
                        Hết phiên
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-ink">
                    {g.startedBooks} / {g.completedBooks} / {g.bookmarkCount}
                  </td>
                  <td className="max-w-[260px] py-2.5 pr-3">
                    {g.lastBookTitle ? (
                      <>
                        <p className="truncate font-medium text-ink">{g.lastBookTitle}</p>
                        <p className="truncate text-[11px] text-ink-muted">
                          {g.lastChapterTitle ||
                            (g.lastChapterIndex !== null
                              ? `Chương ${g.lastChapterIndex + 1}`
                              : g.lastBookShelf || '')}
                        </p>
                      </>
                    ) : (
                      <span className="text-ink-faint">Chưa mở sách</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {g.strikes > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
                        <ShieldAlert className="h-3 w-3" />
                        {g.strikes}
                      </span>
                    ) : (
                      <span className="text-ink-faint">0</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-ink-muted">
                    {formatRelativeTime(g.lastReadAt ?? g.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
