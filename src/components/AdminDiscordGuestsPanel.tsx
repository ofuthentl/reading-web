import { Ban, Loader2, LockOpen, RefreshCw } from 'lucide-react';
import type { DiscordGuestRecord } from '@/lib/guestCrypto';

export interface AdminDiscordGuestsPanelProps {
  guests: DiscordGuestRecord[];
  loading: boolean;
  togglingUserId: string | null;
  onRefresh: () => void;
  onToggleBan: (userId: string, nextBanned: boolean, username: string) => void;
}

export function AdminDiscordGuestsPanel({
  guests,
  loading,
  togglingUserId,
  onRefresh,
  onToggleBan,
}: AdminDiscordGuestsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">
          Danh sách thành viên Discord đã từng nhận chìa khoá ({guests.length})
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : guests.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-muted">
          Chưa có thành viên Discord nào nhận chìa khoá.
        </p>
      ) : (
        <div className="space-y-2">
          {guests.map((g) => {
            const activeNow =
              !g.isBanned &&
              typeof g.sessionExpiresAt === 'number' &&
              g.sessionExpiresAt > Date.now();
            return (
              <div
                key={g.discordUserId}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="truncate">{g.discordUsername}</span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      #{g.discordUserId.slice(-4)}
                    </span>
                    {g.isBanned ? (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-300">
                        Đã khoá
                      </span>
                    ) : activeNow ? (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                        Đang mở cửa
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    ID: {g.discordUserId}
                    {g.strikes > 0 ? ` · Cảnh báo tốc độ: ${g.strikes}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={togglingUserId === g.discordUserId}
                  onClick={() => onToggleBan(g.discordUserId, !g.isBanned, g.discordUsername)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    g.isBanned
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-red-500/35 bg-red-500/10 text-red-600 dark:text-red-300'
                  }`}
                >
                  {g.isBanned ? (
                    <>
                      <LockOpen className="h-3 w-3" />
                      Mở khoá
                    </>
                  ) : (
                    <>
                      <Ban className="h-3 w-3" />
                      Khoá
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
