import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CopyCheck,
  Lock,
  LockOpen,
  Plus,
  ShieldAlert,
  Unlock,
  Users,
} from 'lucide-react';
import type { SelectedMemberMeta } from '@/components/ShelfAccessMemberList';
import type { AdminBookChapterAccessItem } from '@/lib/bookAccessApi';
import type { DiscordGuestRecord } from '@/lib/guestCrypto';

const DISCORD_ID_RE = /^\d{5,32}$/;

export interface ChapterLockDraftState {
  locked: boolean;
  allowedMap: Map<string, SelectedMemberMeta>;
}

export interface BookChapterLockListProps {
  hasGuestPack: boolean;
  chapters: readonly AdminBookChapterAccessItem[];
  draftByKey: ReadonlyMap<string, ChapterLockDraftState>;
  guests: readonly DiscordGuestRecord[];
  onToggleChapterLock: (chapterKey: string) => void;
  onLockFromIndex: (startIndex: number) => void;
  onUnlockAllChapters: () => void;
  onToggleChapterMember: (
    chapterKey: string,
    discordUserId: string,
    label: string | null,
  ) => void;
  onApplyMembersToAllLocked: (members: ReadonlyMap<string, SelectedMemberMeta>) => void;
  onOpenProtection?: () => void;
  onInvalidDiscordId?: () => void;
}

export function BookChapterLockList({
  hasGuestPack,
  chapters,
  draftByKey,
  guests,
  onToggleChapterLock,
  onLockFromIndex,
  onUnlockAllChapters,
  onToggleChapterMember,
  onApplyMembersToAllLocked,
  onOpenProtection,
  onInvalidDiscordId,
}: BookChapterLockListProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [manualLabel, setManualLabel] = useState('');

  if (!hasGuestPack) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-amber-500/45 bg-amber-500/[0.07] px-5 py-9 text-center">
        <ShieldAlert className="h-7 w-7 text-amber-500" />
        <div className="space-y-1">
          <p className="font-display text-sm font-semibold text-ink">
            Tập sách này chưa có gói bảo mật chế độ khách
          </p>
          <p className="max-w-md text-xs leading-relaxed text-ink-muted">
            Danh sách mục lục chương được đọc trực tiếp từ gói mã hoá khách trên D1 (0 tốn băng
            thông R2). Hãy đồng bộ gói bảo mật cho tập này trước khi khoá từng chương.
          </p>
        </div>
        {onOpenProtection && (
          <button
            type="button"
            onClick={onOpenProtection}
            className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover"
          >
            Mở đồng bộ gói bảo mật khách
          </button>
        )}
      </div>
    );
  }

  if (chapters.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-canvas px-4 py-8 text-center text-xs text-ink-muted">
        Không tìm thấy chương nào trong mục lục của tập sách này.
      </p>
    );
  }

  const lockedCount = chapters.reduce(
    (acc, ch) => acc + (draftByKey.get(ch.chapterKey)?.locked ? 1 : 0),
    0,
  );

  const handleAddManualForChapter = (chapterKey: string) => {
    const cleanId = manualId.trim();
    if (!DISCORD_ID_RE.test(cleanId)) {
      onInvalidDiscordId?.();
      return;
    }
    const matched = guests.find((g) => g.discordUserId === cleanId);
    const label = matched?.discordUsername || manualLabel.trim() || null;
    if (!draftByKey.get(chapterKey)?.allowedMap.has(cleanId)) {
      onToggleChapterMember(chapterKey, cleanId, label);
    }
    setManualId('');
    setManualLabel('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs">
        <span className="font-medium text-ink">
          Đang khoá:{' '}
          <strong className="text-crimson-accent">
            {lockedCount} / {chapters.length}
          </strong>{' '}
          chương
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {chapters.length > 1 && (
            <button
              type="button"
              onClick={() => onLockFromIndex(Math.min(1, chapters.length - 1))}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-line-strong hover:bg-subtle"
            >
              Khoá từ Ch.2 trở đi
            </button>
          )}
          {lockedCount > 0 && (
            <button
              type="button"
              onClick={onUnlockAllChapters}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
            >
              <Unlock className="h-3 w-3" />
              <span>Mở khoá tất cả</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-canvas">
        {chapters.map((ch, idx) => {
          const state = draftByKey.get(ch.chapterKey);
          const isLocked = Boolean(state?.locked);
          const allowedCount = state?.allowedMap.size ?? 0;
          const isExpanded = isLocked && expandedKey === ch.chapterKey;
          const knownIds = new Set(guests.map((g) => g.discordUserId));
          const manualOnly = state
            ? Array.from(state.allowedMap.values()).filter((u) => !knownIds.has(u.discordUserId))
            : [];

          return (
            <div
              key={ch.chapterKey}
              className={isLocked ? 'bg-crimson-accent/[0.04]' : undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                <button
                  type="button"
                  onClick={() => onToggleChapterLock(ch.chapterKey)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${
                      isLocked
                        ? 'border-crimson-accent/50 bg-crimson-accent text-white'
                        : 'border-line bg-surface text-ink-muted'
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <LockOpen className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink">
                      {ch.title || `Chương ${idx + 1}`}
                    </p>
                    <p className="truncate text-[11px] text-ink-muted">
                      {isLocked
                        ? allowedCount > 0
                          ? `Mở cho ${allowedCount} thành viên chỉ định`
                          : 'Chỉ mình Admin đọc được'
                        : 'Mở cho mọi người vào được tập này'}
                      {ch.partCount > 1 ? ` · Gộp ${ch.partCount} phần` : ''}
                    </p>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!isLocked && idx < chapters.length - 1 && (
                    <button
                      type="button"
                      onClick={() => onLockFromIndex(idx)}
                      title="Khoá từ chương này đến hết tập"
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
                    >
                      Khoá từ đây
                    </button>
                  )}

                  {isLocked && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedKey((cur) => (cur === ch.chapterKey ? null : ch.chapterKey))
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink transition hover:border-line-strong"
                    >
                      <Users className="h-3 w-3 text-crimson-accent" />
                      <span>{allowedCount}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && state && (
                <div className="space-y-2.5 border-t border-line/70 bg-surface/80 px-3.5 py-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-ink-muted">
                      Chọn thành viên Discord được đọc riêng chương này:
                    </span>
                    {lockedCount > 1 && (
                      <button
                        type="button"
                        onClick={() => onApplyMembersToAllLocked(state.allowedMap)}
                        className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
                      >
                        <CopyCheck className="h-3 w-3" />
                        <span>Áp dụng cho mọi chương đang khoá</span>
                      </button>
                    )}
                  </div>

                  {(guests.length > 0 || manualOnly.length > 0) && (
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                      {manualOnly.map((u) => (
                        <button
                          key={`m-${u.discordUserId}`}
                          type="button"
                          onClick={() =>
                            onToggleChapterMember(ch.chapterKey, u.discordUserId, u.label)
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-crimson-accent bg-crimson-accent/15 px-2 py-1 text-[11px] font-medium text-crimson-accent"
                        >
                          <Check className="h-3 w-3" />
                          <span>{u.label || u.discordUserId}</span>
                        </button>
                      ))}
                      {guests.map((g) => {
                        const checked = state.allowedMap.has(g.discordUserId);
                        return (
                          <button
                            key={g.discordUserId}
                            type="button"
                            onClick={() =>
                              onToggleChapterMember(
                                ch.chapterKey,
                                g.discordUserId,
                                g.discordUsername,
                              )
                            }
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                              checked
                                ? 'border-crimson-accent bg-crimson-accent/15 text-crimson-accent'
                                : 'border-line bg-canvas text-ink-muted hover:text-ink'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                            <span>{g.discordUsername}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5 sm:flex-row">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualId}
                      onChange={(e) => setManualId(e.target.value)}
                      placeholder="Dán Discord User ID..."
                      className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs outline-none focus:border-accent"
                    />
                    <input
                      type="text"
                      value={manualLabel}
                      onChange={(e) => setManualLabel(e.target.value)}
                      placeholder="Tên gợi nhớ"
                      className="min-w-0 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs outline-none focus:border-accent sm:w-32"
                    />
                    <button
                      type="button"
                      disabled={!manualId.trim()}
                      onClick={() => handleAddManualForChapter(ch.chapterKey)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-line-strong bg-canvas px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle disabled:opacity-45"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Thêm</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
