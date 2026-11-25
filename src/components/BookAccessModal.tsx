import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Globe, Layers, ListChecks, Loader2, Lock, X } from 'lucide-react';
import type {
  Book,
  BookAccessMode,
  BookAccessSummary,
  ShelfAccessRuleDetail,
} from '@/types';
import {
  BookChapterLockList,
  type ChapterLockDraftState,
} from '@/components/BookChapterLockList';
import { DiscordPresetPickerBar } from '@/components/DiscordPresetPickerBar';
import { ModalShell } from '@/components/ModalShell';
import {
  type SelectedMemberMeta,
  ShelfAccessMemberList,
} from '@/components/ShelfAccessMemberList';
import type { ToastType } from '@/hooks/useToast';
import { isCloudMode } from '@/lib/api';
import {
  type AdminBookChapterAccessItem,
  fetchAdminBookAccessDetail,
  saveAdminBookAccessConfig,
} from '@/lib/bookAccessApi';
import { getBookSortTitle } from '@/lib/bookMetadata';
import {
  type DiscordAccessPreset,
  fetchAdminDiscordPresets,
} from '@/lib/discordPresetsApi';
import { type DiscordGuestRecord, fetchAdminDiscordGuests } from '@/lib/guestCrypto';
import { normalizeSearchText } from '@/lib/libraryFiltering';
import { fetchAdminShelfAccessRules } from '@/lib/shelfAccessApi';

const DISCORD_ID_RE = /^\d{5,32}$/;

export interface BookAccessModalProps {
  book: Book | null;
  allShelfNames: ReadonlyMap<string, string>;
  onClose: () => void;
  onBookAccessSaved: (bookId: string, summary: BookAccessSummary | null) => void;
  onOpenProtection?: () => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function BookAccessModal({
  book,
  allShelfNames,
  onClose,
  onBookAccessSaved,
  onOpenProtection,
  onApiError,
  onNotify,
}: BookAccessModalProps) {
  const [activeTab, setActiveTab] = useState<'book' | 'chapters'>('book');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<BookAccessMode>('inherit');
  const [shelfRestricted, setShelfRestricted] = useState(false);
  const [hasGuestPack, setHasGuestPack] = useState(false);
  const [guests, setGuests] = useState<DiscordGuestRecord[]>([]);
  const [presets, setPresets] = useState<DiscordAccessPreset[]>([]);
  const [shelfRules, setShelfRules] = useState<ShelfAccessRuleDetail[]>([]);
  const [selectedBookMembers, setSelectedBookMembers] = useState<Map<string, SelectedMemberMeta>>(
    () => new Map(),
  );
  const [chapters, setChapters] = useState<AdminBookChapterAccessItem[]>([]);
  const [chapterDrafts, setChapterDrafts] = useState<Map<string, ChapterLockDraftState>>(
    () => new Map(),
  );
  const [memberQuery, setMemberQuery] = useState('');
  const [manualId, setManualId] = useState('');
  const [manualLabel, setManualLabel] = useState('');

  const bookId = book?.id ?? null;

  useEffect(() => {
    if (!bookId) return;
    const controller = new AbortController();
    setActiveTab('book');
    setMemberQuery('');
    setManualId('');
    setManualLabel('');

    if (!isCloudMode) {
      setMode('inherit');
      setShelfRestricted(false);
      setHasGuestPack(false);
      setGuests([]);
      setPresets([]);
      setShelfRules([]);
      setSelectedBookMembers(new Map());
      setChapters([]);
      setChapterDrafts(new Map());
      return () => controller.abort();
    }

    setLoading(true);
    void Promise.all([
      fetchAdminBookAccessDetail(bookId, controller.signal),
      fetchAdminDiscordGuests(),
      fetchAdminShelfAccessRules(),
      fetchAdminDiscordPresets(controller.signal).catch(() => [] as DiscordAccessPreset[]),
    ])
      .then(([detail, guestList, rules, presetList]) => {
        if (controller.signal.aborted) return;
        setMode(detail.bookRule.mode);
        setShelfRestricted(detail.shelfRestricted);
        setHasGuestPack(detail.hasGuestPack);
        setGuests(guestList);
        setPresets(presetList);
        setShelfRules(rules);

        const bookMemberMap = new Map<string, SelectedMemberMeta>();
        for (const u of detail.bookRule.allowedUsers) {
          bookMemberMap.set(u.discordUserId, {
            discordUserId: u.discordUserId,
            label: u.discordUsername || u.label || null,
          });
        }
        setSelectedBookMembers(bookMemberMap);
        setChapters(detail.chapters);

        const drafts = new Map<string, ChapterLockDraftState>();
        for (const ch of detail.chapters) {
          const allowedMap = new Map<string, SelectedMemberMeta>();
          for (const u of ch.allowedUsers) {
            allowedMap.set(u.discordUserId, {
              discordUserId: u.discordUserId,
              label: u.discordUsername || u.label || null,
            });
          }
          drafts.set(ch.chapterKey, { locked: ch.locked, allowedMap });
        }
        setChapterDrafts(drafts);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          onApiError?.(err, 'Không thể tải cấu hình phân quyền tập và chương.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bookId, onApiError]);

  const knownGuestIds = useMemo(() => new Set(guests.map((g) => g.discordUserId)), [guests]);
  const preGrantedOnlyUsers = useMemo(
    () =>
      Array.from(selectedBookMembers.values()).filter(
        (item) => !knownGuestIds.has(item.discordUserId),
      ),
    [knownGuestIds, selectedBookMembers],
  );
  const rulesWithUsers = useMemo(
    () => shelfRules.filter((r) => r.allowedUsers.length > 0),
    [shelfRules],
  );
  const filteredGuests = useMemo(() => {
    const norm = normalizeSearchText(memberQuery);
    if (!norm) return guests;
    return guests.filter((g) =>
      normalizeSearchText(`${g.discordUsername} ${g.discordUserId}`).includes(norm),
    );
  }, [guests, memberQuery]);

  if (!book) return null;

  const lockedChapterCount = chapters.reduce(
    (acc, ch) => acc + (chapterDrafts.get(ch.chapterKey)?.locked ? 1 : 0),
    0,
  );

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const lockedChaptersPayload = chapters
        .filter((ch) => chapterDrafts.get(ch.chapterKey)?.locked)
        .map((ch) => ({
          chapterKey: ch.chapterKey,
          allowedUsers: Array.from(chapterDrafts.get(ch.chapterKey)?.allowedMap.values() ?? []),
        }));

      const res = await saveAdminBookAccessConfig({
        bookId: book.id,
        mode,
        allowedUsers: mode === 'restricted' ? Array.from(selectedBookMembers.values()) : [],
        chapters: lockedChaptersPayload,
      });
      onBookAccessSaved(book.id, res.summary);
      onNotify?.(
        `Đã lưu phân quyền cho "${getBookSortTitle(book)}"${
          lockedChaptersPayload.length > 0 ? ` (${lockedChaptersPayload.length} chương khoá)` : ''
        }.`,
        'success',
      );
      onClose();
    } catch (err) {
      onApiError?.(err, 'Không thể lưu phân quyền tập sách và chương.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      closeDisabled={saving}
      ariaLabelledBy="book-access-modal-title"
      zIndexClass="z-50"
      panelClassName="moonlit-card fade-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
    >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson-accent">
              PHÂN QUYỀN TẬP SÁCH &amp; TỪNG CHƯƠNG
            </p>
            <h2
              id="book-access-modal-title"
              className="mt-0.5 truncate font-display text-lg font-semibold text-ink"
            >
              {getBookSortTitle(book)}
            </h2>
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              Kệ: {book.shelf || 'Kho chưa phân loại'} · 0 B R2 re-pack
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Đóng phân quyền tập sách"
            className="rounded-lg p-1.5 text-ink-muted transition hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5 border-b border-line bg-canvas/60 px-5 py-2.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('book')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 font-semibold transition ${
              activeTab === 'book'
                ? 'border-accent bg-accent/12 text-accent'
                : 'border-line bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Quyền đọc Tập này</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 font-semibold transition ${
              activeTab === 'chapters'
                ? 'border-crimson-accent/50 bg-crimson-accent/12 text-crimson-accent'
                : 'border-line bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            <span>Khoá từng Chương</span>
            {lockedChapterCount > 0 && (
              <span className="rounded-full bg-crimson-accent px-1.5 py-0.5 text-[10px] text-white">
                {lockedChapterCount}
              </span>
            )}
          </button>
        </div>

        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-canvas py-12 text-xs text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span>Đang tải cấu hình tập sách &amp; mục lục chương...</span>
            </div>
          ) : activeTab === 'book' ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setMode('inherit')}
                  className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${
                    mode === 'inherit'
                      ? 'border-accent bg-accent/10 text-ink shadow-sm'
                      : 'border-line bg-canvas text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Layers className="h-3.5 w-3.5 text-accent" />
                    Theo bộ (Mặc định)
                  </span>
                  <span className="text-[11px] leading-snug text-ink-muted">
                    {shelfRestricted
                      ? 'Kệ đang giới hạn — tập này thừa kế nhóm người đọc của kệ.'
                      : 'Kệ đang mở công khai — mọi thành viên Discord đọc được.'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('public')}
                  className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${
                    mode === 'public'
                      ? 'border-emerald-500/55 bg-emerald-500/10 text-ink shadow-sm'
                      : 'border-line bg-canvas text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Globe className="h-3.5 w-3.5 text-emerald-500" />
                    Mở công khai đọc thử
                  </span>
                  <span className="text-[11px] leading-snug text-ink-muted">
                    Mở riêng tập này cho mọi thành viên dù cả bộ đang khoá.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('restricted')}
                  className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${
                    mode === 'restricted'
                      ? 'border-crimson-accent/55 bg-crimson-accent/10 text-ink shadow-sm'
                      : 'border-line bg-canvas text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Lock className="h-3.5 w-3.5 text-crimson-accent" />
                    Khoá riêng tập này
                  </span>
                  <span className="text-[11px] leading-snug text-ink-muted">
                    Chỉ thành viên chọn bên dưới đọc được (0 người = Chỉ Admin).
                  </span>
                </button>
              </div>

              {mode === 'restricted' && (
                <div className="space-y-3.5">
                  {isCloudMode && (
                    <DiscordPresetPickerBar
                      presets={presets}
                      selectedMap={selectedBookMembers}
                      disabled={saving}
                      onApplyPreset={(preset, applyMode) => {
                        setSelectedBookMembers((prev) => {
                          const next =
                            applyMode === 'merge' ? new Map(prev) : new Map<string, SelectedMemberMeta>();
                          for (const m of preset.members) {
                            next.set(m.discordUserId, {
                              discordUserId: m.discordUserId,
                              label: m.discordUsername || m.label || null,
                            });
                          }
                          return next;
                        });
                        onNotify?.(
                          applyMode === 'merge'
                            ? `Đã cộng gộp ${preset.members.length} thành viên từ nhóm "${preset.name}".`
                            : `Đã chọn ${preset.members.length} thành viên theo nhóm "${preset.name}".`,
                          'info',
                        );
                      }}
                      onPresetsChanged={setPresets}
                      onApiError={onApiError}
                      onNotify={onNotify}
                    />
                  )}
                  <ShelfAccessMemberList
                    guests={guests} filteredGuests={filteredGuests} preGrantedOnlyUsers={preGrantedOnlyUsers}
                    otherRulesWithUsers={rulesWithUsers} allShelfNames={allShelfNames}
                    selectedMap={selectedBookMembers} memberQuery={memberQuery}
                    manualId={manualId} manualLabel={manualLabel}
                    onMemberQueryChange={setMemberQuery} onManualIdChange={setManualId}
                    onManualLabelChange={setManualLabel}
                    onToggleMember={(id, label) => {
                      setSelectedBookMembers((prev) => {
                        const next = new Map(prev);
                        if (next.has(id)) next.delete(id);
                        else next.set(id, { discordUserId: id, label });
                        return next;
                      });
                    }}
                    onSelectAllActiveGuests={() => {
                      setSelectedBookMembers((prev) => {
                        const next = new Map(prev);
                        for (const g of guests) {
                          if (!g.isBanned) next.set(g.discordUserId, { discordUserId: g.discordUserId, label: g.discordUsername });
                        }
                        return next;
                      });
                    }}
                    onClearAll={() => setSelectedBookMembers(new Map())}
                    onCopyFromRule={(rule) => {
                      const next = new Map<string, SelectedMemberMeta>();
                      for (const u of rule.allowedUsers) {
                        next.set(u.discordUserId, { discordUserId: u.discordUserId, label: u.discordUsername || u.label || null });
                      }
                      setSelectedBookMembers(next);
                      onNotify?.(`Đã sao chép ${next.size} thành viên.`, 'info');
                    }}
                    onAddManualId={() => {
                      const cleanId = manualId.trim();
                      if (!DISCORD_ID_RE.test(cleanId)) {
                        onNotify?.('Discord User ID phải là dãy số hợp lệ.', 'warning');
                        return;
                      }
                      const matched = guests.find((g) => g.discordUserId === cleanId);
                      const label = matched?.discordUsername || manualLabel.trim() || null;
                      setSelectedBookMembers((prev) => {
                        const next = new Map(prev);
                        next.set(cleanId, { discordUserId: cleanId, label });
                        return next;
                      });
                      setManualId('');
                      setManualLabel('');
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <BookChapterLockList
              hasGuestPack={hasGuestPack}
              chapters={chapters}
              draftByKey={chapterDrafts}
              guests={guests}
              onToggleChapterLock={(chapterKey) => {
                setChapterDrafts((prev) => {
                  const next = new Map(prev);
                  const cur = next.get(chapterKey) ?? { locked: false, allowedMap: new Map() };
                  next.set(chapterKey, { ...cur, locked: !cur.locked });
                  return next;
                });
              }}
              onLockFromIndex={(startIdx) => {
                setChapterDrafts((prev) => {
                  const next = new Map(prev);
                  for (let i = startIdx; i < chapters.length; i += 1) {
                    const k = chapters[i].chapterKey;
                    const cur = next.get(k) ?? { locked: false, allowedMap: new Map() };
                    next.set(k, { ...cur, locked: true });
                  }
                  return next;
                });
              }}
              onUnlockAllChapters={() => {
                setChapterDrafts((prev) => {
                  const next = new Map(prev);
                  for (const [k, cur] of next.entries()) {
                    next.set(k, { ...cur, locked: false });
                  }
                  return next;
                });
              }}
              onToggleChapterMember={(chapterKey, discordUserId, label) => {
                setChapterDrafts((prev) => {
                  const next = new Map(prev);
                  const cur = next.get(chapterKey) ?? { locked: true, allowedMap: new Map() };
                  const allowedMap = new Map(cur.allowedMap);
                  if (allowedMap.has(discordUserId)) allowedMap.delete(discordUserId);
                  else allowedMap.set(discordUserId, { discordUserId, label });
                  next.set(chapterKey, { locked: true, allowedMap });
                  return next;
                });
              }}
              onApplyMembersToAllLocked={(sourceMap) => {
                setChapterDrafts((prev) => {
                  const next = new Map(prev);
                  for (const [k, cur] of next.entries()) {
                    if (cur.locked) {
                      next.set(k, { locked: true, allowedMap: new Map(sourceMap) });
                    }
                  }
                  return next;
                });
                onNotify?.(
                  `Đã áp dụng danh sách ${sourceMap.size} thành viên cho mọi chương đang khoá.`,
                  'info',
                );
              }}
              onOpenProtection={
                onOpenProtection
                  ? () => {
                      onClose();
                      onOpenProtection();
                    }
                  : undefined
              }
              onInvalidDiscordId={() =>
                onNotify?.('Discord User ID phải là dãy số hợp lệ.', 'warning')
              }
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-45"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover disabled:opacity-45"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{saving ? 'Đang lưu...' : 'Lưu phân quyền'}</span>
          </button>
        </div>
    </ModalShell>
  );
}
