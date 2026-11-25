import { useState } from 'react';
import { BookOpen, FolderLock, ListChecks, Loader2, ShieldOff, Users } from 'lucide-react';
import {
  type DiscordGuestAccessMatrix,
  revokeAllAdminGuestAccess,
} from '@/lib/discordPresetsApi';
import type { ToastType } from '@/hooks/useToast';

export interface AdminGuestAccessMatrixPanelProps {
  matrix: DiscordGuestAccessMatrix | null;
  loading: boolean;
  username: string;
  onRevoked: () => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function AdminGuestAccessMatrixPanel({
  matrix,
  loading,
  username,
  onRevoked,
  onApiError,
  onNotify,
}: AdminGuestAccessMatrixPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [includePresets, setIncludePresets] = useState(false);
  const [closeSession, setCloseSession] = useState(false);
  const [revoking, setRevoking] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-line/70 py-4 text-[11px] text-ink-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        <span>Đang tải ma trận quyền của {username}...</span>
      </div>
    );
  }

  if (!matrix) return null;

  const hasAnyGrant = matrix.totalGrants > 0 || matrix.presets.length > 0;

  const handleRevokeAll = async () => {
    if (revoking) return;
    setRevoking(true);
    try {
      const res = await revokeAllAdminGuestAccess(matrix.discordUserId, {
        includePresets,
        closeSession,
      });
      setConfirmOpen(false);
      const total = res.removedShelves + res.removedBooks + res.removedChapters;
      onNotify?.(
        `Đã thu hồi ${total} quyền đọc (${res.removedShelves} bộ, ${res.removedBooks} tập, ${res.removedChapters} chương)${
          res.removedPresets > 0 ? ` và gỡ khỏi ${res.removedPresets} Preset` : ''
        }${res.sessionClosed ? ', đồng thời đóng phiên 24h' : ''}.`,
        'warning',
      );
      onRevoked();
    } catch (err) {
      onApiError?.(err, 'Không thể thu hồi hàng loạt quyền của thành viên.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-line/80 bg-surface/60 px-3.5 py-3 text-[11px]">
      {!hasAnyGrant ? (
        <p className="text-ink-muted">
          Thành viên này chưa được cấp quyền riêng nào trên các bộ/tập/chương giới hạn (chỉ đọc các
          bộ mở công khai).
        </p>
      ) : (
        <div className="space-y-2.5">
          {matrix.shelves.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 font-semibold text-ink">
                <FolderLock className="h-3 w-3 text-crimson-accent" />
                <span>Bộ truyện được cấp ({matrix.shelves.length})</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {matrix.shelves.map((s) => (
                  <span
                    key={s.shelfKey}
                    className="rounded-md border border-line bg-canvas px-2 py-0.5 text-ink"
                  >
                    {s.shelfName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {matrix.books.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 font-semibold text-ink">
                <BookOpen className="h-3 w-3 text-accent" />
                <span>Tập sách được cấp riêng ({matrix.books.length})</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {matrix.books.map((b) => (
                  <span
                    key={b.bookId}
                    className="rounded-md border border-line bg-canvas px-2 py-0.5 text-ink"
                  >
                    {b.bookTitle}
                  </span>
                ))}
              </div>
            </div>
          )}

          {matrix.chapters.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 font-semibold text-ink">
                <ListChecks className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span>Chương khoá được mở riêng ({matrix.chapters.length})</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {matrix.chapters.slice(0, 12).map((c) => (
                  <span
                    key={`${c.bookId}:${c.chapterKey}`}
                    className="rounded-md border border-line bg-canvas px-2 py-0.5 text-ink"
                  >
                    {c.bookTitle} · <span className="font-mono text-[10px]">{c.chapterKey}</span>
                  </span>
                ))}
                {matrix.chapters.length > 12 && (
                  <span className="px-1 text-ink-faint">+{matrix.chapters.length - 12} chương</span>
                )}
              </div>
            </div>
          )}

          {matrix.presets.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 font-semibold text-ink">
                <Users className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span>Thuộc nhóm Preset ({matrix.presets.length})</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {matrix.presets.map((p) => (
                  <span
                    key={p.presetId}
                    className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-800 dark:text-emerald-300"
                  >
                    {p.presetName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(hasAnyGrant || matrix.sessionExpiresAt) && (
        <div className="border-t border-line/60 pt-2.5">
          {!confirmOpen ? (
            <button
              type="button"
              onClick={() => {
                setIncludePresets(false);
                setCloseSession(false);
                setConfirmOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-700 transition hover:bg-rose-500/20 dark:text-rose-300"
            >
              <ShieldOff className="h-3 w-3" />
              <span>Thu hồi toàn bộ quyền đọc</span>
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-rose-500/35 bg-rose-500/10 p-2.5">
              <p className="font-semibold text-rose-800 dark:text-rose-200">
                Thu hồi mọi quyền Bộ / Tập / Chương của {username}?
              </p>
              <div className="flex flex-wrap gap-3 text-[11px] text-ink">
                {matrix.presets.length > 0 && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={includePresets}
                      disabled={revoking}
                      onChange={(e) => setIncludePresets(e.target.checked)}
                      className="h-3.5 w-3.5 rounded accent-current"
                    />
                    <span>Gỡ luôn khỏi các nhóm Preset</span>
                  </label>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={closeSession}
                    disabled={revoking}
                    onChange={(e) => setCloseSession(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-current"
                  />
                  <span>Đóng ngay phiên 24h đang mở</span>
                </label>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={revoking}
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-md border border-line bg-surface px-2.5 py-1 font-medium text-ink-muted hover:text-ink"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={revoking}
                  onClick={() => void handleRevokeAll()}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {revoking && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Xác nhận thu hồi</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
