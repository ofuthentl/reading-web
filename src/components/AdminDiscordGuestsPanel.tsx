import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, ChevronDown, ChevronUp, KeyRound, Loader2, LockOpen, RefreshCw } from 'lucide-react';
import { AdminGuestAccessMatrixPanel } from '@/components/AdminGuestAccessMatrixPanel';
import {
  type DiscordGuestAccessMatrix,
  fetchAdminGuestAccessMatrix,
} from '@/lib/discordPresetsApi';
import type { DiscordGuestRecord } from '@/lib/guestCrypto';
import type { ToastType } from '@/hooks/useToast';

export interface AdminDiscordGuestsPanelProps {
  guests: DiscordGuestRecord[];
  loading: boolean;
  togglingUserId: string | null;
  onRefresh: () => void;
  onToggleBan: (userId: string, nextBanned: boolean, username: string) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function AdminDiscordGuestsPanel({
  guests,
  loading,
  togglingUserId,
  onRefresh,
  onToggleBan,
  onApiError,
  onNotify,
}: AdminDiscordGuestsPanelProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [matrixByUserId, setMatrixByUserId] = useState<Record<string, DiscordGuestAccessMatrix>>({});
  const [loadingMatrixUserId, setLoadingMatrixUserId] = useState<string | null>(null);
  const matrixAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      matrixAbortRef.current?.abort();
      matrixAbortRef.current = null;
    };
  }, []);

  const loadMatrix = useCallback(
    async (userId: string) => {
      matrixAbortRef.current?.abort();
      const controller = new AbortController();
      matrixAbortRef.current = controller;
      setLoadingMatrixUserId(userId);
      try {
        const data = await fetchAdminGuestAccessMatrix(userId, controller.signal);
        if (!controller.signal.aborted) {
          setMatrixByUserId((prev) => ({ ...prev, [userId]: data }));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          onApiError?.(err, 'Không thể tải ma trận quyền của thành viên Discord.');
        }
      } finally {
        if (matrixAbortRef.current === controller) matrixAbortRef.current = null;
        if (!controller.signal.aborted) {
          setLoadingMatrixUserId((cur) => (cur === userId ? null : cur));
        }
      }
    },
    [onApiError],
  );

  const handleToggleMatrix = (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);
    void loadMatrix(userId);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">
          Danh sách thành viên Discord đã từng nhận chìa khoá ({guests.length})
        </p>
        <button
          type="button"
          onClick={() => {
            setMatrixByUserId({});
            setExpandedUserId(null);
            onRefresh();
          }}
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
            const isExpanded = expandedUserId === g.discordUserId;
            return (
              <div
                key={g.discordUserId}
                className="overflow-hidden rounded-xl border border-line bg-canvas text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
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

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleMatrix(g.discordUserId)}
                      aria-expanded={isExpanded}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                        isExpanded
                          ? 'border-accent bg-accent/12 text-accent'
                          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                      }`}
                    >
                      <KeyRound className="h-3 w-3" />
                      <span>Quyền</span>
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={togglingUserId === g.discordUserId}
                      onClick={() => onToggleBan(g.discordUserId, !g.isBanned, g.discordUsername)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
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
                </div>

                {isExpanded && (
                  <AdminGuestAccessMatrixPanel
                    matrix={matrixByUserId[g.discordUserId] ?? null}
                    loading={loadingMatrixUserId === g.discordUserId}
                    username={g.discordUsername}
                    onRevoked={() => {
                      void loadMatrix(g.discordUserId);
                      onRefresh();
                    }}
                    onApiError={onApiError}
                    onNotify={onNotify}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
