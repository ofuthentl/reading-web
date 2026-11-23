import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Loader2, Lock, X } from 'lucide-react';
import type {
  ShelfAccessMode,
  ShelfAccessRuleDetail,
  ShelfAccessSummary,
  ShelfGroup,
} from '@/types';
import {
  type SelectedMemberMeta,
  ShelfAccessMemberList,
} from '@/components/ShelfAccessMemberList';
import { isCloudMode } from '@/lib/api';
import { type DiscordGuestRecord, fetchAdminDiscordGuests } from '@/lib/guestCrypto';
import {
  fetchAdminShelfAccessRules,
  saveAdminShelfAccessRule,
} from '@/lib/shelfAccessApi';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';
import type { ToastType } from '@/hooks/useToast';

const DISCORD_ID_RE = /^\d{5,32}$/;

export interface ShelfAccessModalProps {
  shelf: ShelfGroup | null;
  allShelfNames: ReadonlyMap<string, string>;
  onClose: () => void;
  onAccessSaved: (shelfName: string, summary: ShelfAccessSummary | null) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function ShelfAccessModal({
  shelf,
  allShelfNames,
  onClose,
  onAccessSaved,
  onApiError,
  onNotify,
}: ShelfAccessModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ShelfAccessMode>('public');
  const [guests, setGuests] = useState<DiscordGuestRecord[]>([]);
  const [allRules, setAllRules] = useState<ShelfAccessRuleDetail[]>([]);
  const [selectedMap, setSelectedMap] = useState<Map<string, SelectedMemberMeta>>(() => new Map());
  const [memberQuery, setMemberQuery] = useState('');
  const [manualId, setManualId] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const shelfKey = shelf?.key ?? null;

  // Chỉ tải/reset khi mở sang bộ khác (theo shelfKey) để đồng bộ bìa nền không xoá danh sách đang tick (vá M-07)
  useEffect(() => {
    if (!shelfKey) return;
    let cancelled = false;
    setMemberQuery('');
    setManualId('');
    setManualLabel('');

    if (!isCloudMode) {
      setMode('public');
      setGuests([]);
      setAllRules([]);
      setSelectedMap(new Map());
      return;
    }

    setLoading(true);
    void Promise.all([fetchAdminDiscordGuests(), fetchAdminShelfAccessRules()])
      .then(([guestList, rules]) => {
        if (cancelled) return;
        setGuests(guestList);
        setAllRules(rules);
        const currentRule = rules.find((r) => r.shelfKey === shelfKey);
        if (currentRule) {
          setMode('restricted');
          const next = new Map<string, SelectedMemberMeta>();
          for (const u of currentRule.allowedUsers) {
            next.set(u.discordUserId, {
              discordUserId: u.discordUserId,
              label: u.discordUsername || u.label || null,
            });
          }
          setSelectedMap(next);
        } else {
          setMode('public');
          setSelectedMap(new Map());
        }
      })
      .catch((err) => {
        if (!cancelled) onApiError?.(err, 'Không thể tải danh sách thành viên Discord.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onApiError, shelfKey]);

  useEffect(() => {
    if (!shelf) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving, shelf]);

  const knownGuestIds = useMemo(() => new Set(guests.map((g) => g.discordUserId)), [guests]);

  const preGrantedOnlyUsers = useMemo(() => {
    const out: SelectedMemberMeta[] = [];
    for (const item of selectedMap.values()) {
      if (!knownGuestIds.has(item.discordUserId)) out.push(item);
    }
    return out;
  }, [knownGuestIds, selectedMap]);

  const otherRulesWithUsers = useMemo(
    () => allRules.filter((r) => shelf && r.shelfKey !== shelf.key && r.allowedUsers.length > 0),
    [allRules, shelf],
  );

  const normalizedQuery = useMemo(() => normalizeSearchText(memberQuery), [memberQuery]);

  const filteredGuests = useMemo(() => {
    if (!normalizedQuery) return guests;
    return guests.filter((g) =>
      normalizeSearchText(`${g.discordUsername} ${g.discordUserId}`).includes(normalizedQuery),
    );
  }, [guests, normalizedQuery]);

  if (!shelf) return null;

  const toggleMember = (discordUserId: string, preferredLabel: string | null) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(discordUserId)) next.delete(discordUserId);
      else next.set(discordUserId, { discordUserId, label: preferredLabel });
      return next;
    });
  };

  const handleSelectAllActiveGuests = () => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      for (const g of guests) {
        if (!g.isBanned) {
          next.set(g.discordUserId, { discordUserId: g.discordUserId, label: g.discordUsername });
        }
      }
      return next;
    });
  };

  const handleCopyFromRule = (rule: ShelfAccessRuleDetail) => {
    const next = new Map<string, SelectedMemberMeta>();
    for (const u of rule.allowedUsers) {
      next.set(u.discordUserId, {
        discordUserId: u.discordUserId,
        label: u.discordUsername || u.label || null,
      });
    }
    setSelectedMap(next);
    const sourceLabel = allShelfNames.get(rule.shelfKey) || rule.shelfKey;
    onNotify?.(`Đã sao chép ${next.size} thành viên từ bộ "${sourceLabel}".`, 'info');
  };

  const handleAddManualId = () => {
    const cleanId = manualId.trim();
    if (!DISCORD_ID_RE.test(cleanId)) {
      onNotify?.('Discord User ID phải là dãy số (ví dụ: 885867086893678612).', 'warning');
      return;
    }
    const matchedGuest = guests.find((g) => g.discordUserId === cleanId);
    const label = matchedGuest?.discordUsername || manualLabel.trim() || null;
    setSelectedMap((prev) => {
      const next = new Map(prev);
      next.set(cleanId, { discordUserId: cleanId, label });
      return next;
    });
    setManualId('');
    setManualLabel('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const allowedUsers = Array.from(selectedMap.values());
      const res = await saveAdminShelfAccessRule({
        shelfName: shelf.name,
        mode,
        allowedUsers,
      });
      onAccessSaved(shelf.name, res.summary);
      if (mode === 'public') {
        onNotify?.(`Đã mở bộ "${shelf.name}" cho mọi thành viên Discord.`, 'success');
      } else if (allowedUsers.length > 0) {
        onNotify?.(
          `Đã giới hạn bộ "${shelf.name}" cho ${allowedUsers.length} thành viên chỉ định.`,
          'success',
        );
      } else {
        onNotify?.(
          `Đã khoá bộ "${shelf.name}" (chỉ Admin đọc được, khách thấy bìa gắn ổ khoá).`,
          'success',
        );
      }
      onClose();
    } catch (err) {
      onApiError?.(err, 'Không thể lưu phân quyền cho bộ sách.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shelf-access-modal-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson-accent">
              PHÂN QUYỀN ĐỌC THEO BỘ
            </p>
            <h2
              id="shelf-access-modal-title"
              title={shelf.name}
              className="mt-0.5 truncate font-display text-lg font-semibold text-ink sm:text-xl"
            >
              {shelf.name}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {shelf.books.length} tập · Thành viên bị chặn vẫn thấy bìa kèm ổ khoá 🔒
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Đóng cửa sổ phân quyền"
            className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-45"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setMode('public')}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                  mode === 'public'
                    ? 'border-accent bg-accent/10 text-ink shadow-sm'
                    : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <Globe
                  className={`mt-0.5 h-4 w-4 shrink-0 ${mode === 'public' ? 'text-accent' : ''}`}
                />
                <div>
                  <p className="text-xs font-semibold text-ink">Mọi thành viên Discord</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                    Ai nhận chìa khoá trên Discord đều đọc được bộ này.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => setMode('restricted')}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                  mode === 'restricted'
                    ? 'border-crimson-accent/55 bg-crimson-accent/10 text-ink shadow-sm'
                    : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <Lock
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    mode === 'restricted' ? 'text-crimson-accent' : ''
                  }`}
                />
                <div>
                  <p className="text-xs font-semibold text-ink">Chỉ thành viên được chọn</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                    Người khác chỉ thấy bìa gắn 🔒 (chọn 0 người = Chỉ mình Admin).
                  </p>
                </div>
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-canvas py-10 text-xs text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                <span>Đang tải danh sách thành viên Discord...</span>
              </div>
            ) : mode === 'restricted' ? (
              <ShelfAccessMemberList
                guests={guests}
                filteredGuests={filteredGuests}
                preGrantedOnlyUsers={preGrantedOnlyUsers}
                otherRulesWithUsers={otherRulesWithUsers}
                allShelfNames={allShelfNames}
                selectedMap={selectedMap}
                memberQuery={memberQuery}
                manualId={manualId}
                manualLabel={manualLabel}
                onMemberQueryChange={setMemberQuery}
                onManualIdChange={setManualId}
                onManualLabelChange={setManualLabel}
                onToggleMember={toggleMember}
                onSelectAllActiveGuests={handleSelectAllActiveGuests}
                onClearAll={() => setSelectedMap(new Map())}
                onCopyFromRule={handleCopyFromRule}
                onAddManualId={handleAddManualId}
              />
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-45"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-45"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{saving ? 'Đang lưu...' : 'Lưu phân quyền'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
