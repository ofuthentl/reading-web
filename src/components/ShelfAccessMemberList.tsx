import { Check, Copy, Plus, Search, ShieldAlert, UserPlus, Users } from 'lucide-react';
import type { ShelfAccessRuleDetail } from '@/types';
import type { DiscordGuestRecord } from '@/lib/guestCrypto';

export interface SelectedMemberMeta {
  discordUserId: string;
  label: string | null;
}

export interface ShelfAccessMemberListProps {
  guests: DiscordGuestRecord[];
  filteredGuests: DiscordGuestRecord[];
  preGrantedOnlyUsers: SelectedMemberMeta[];
  otherRulesWithUsers: ShelfAccessRuleDetail[];
  allShelfNames: ReadonlyMap<string, string>;
  selectedMap: ReadonlyMap<string, SelectedMemberMeta>;
  memberQuery: string;
  manualId: string;
  manualLabel: string;
  onMemberQueryChange: (value: string) => void;
  onManualIdChange: (value: string) => void;
  onManualLabelChange: (value: string) => void;
  onToggleMember: (discordUserId: string, preferredLabel: string | null) => void;
  onSelectAllActiveGuests: () => void;
  onClearAll: () => void;
  onCopyFromRule: (rule: ShelfAccessRuleDetail) => void;
  onAddManualId: () => void;
}

export function ShelfAccessMemberList({
  guests,
  filteredGuests,
  preGrantedOnlyUsers,
  otherRulesWithUsers,
  allShelfNames,
  selectedMap,
  memberQuery,
  manualId,
  manualLabel,
  onMemberQueryChange,
  onManualIdChange,
  onManualLabelChange,
  onToggleMember,
  onSelectAllActiveGuests,
  onClearAll,
  onCopyFromRule,
  onAddManualId,
}: ShelfAccessMemberListProps) {
  return (
    <div className="space-y-3.5">
      {otherRulesWithUsers.length > 0 && (
        <div className="rounded-xl border border-line bg-canvas px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
            <Copy className="h-3 w-3 text-accent" />
            <span>Sao chép nhanh nhóm người đọc từ bộ khác:</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {otherRulesWithUsers.slice(0, 6).map((rule) => {
              const title = allShelfNames.get(rule.shelfKey) || rule.shelfKey;
              return (
                <button
                  key={rule.shelfKey}
                  type="button"
                  onClick={() => onCopyFromRule(rule)}
                  className="inline-flex max-w-[14rem] items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
                >
                  <span className="truncate">{title}</span>
                  <span className="shrink-0 text-ink-faint">({rule.allowedUsers.length})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
          <Users className="h-3.5 w-3.5 text-crimson-accent" />
          <span>
            Được phép đọc: <strong className="text-crimson-accent">{selectedMap.size}</strong> thành
            viên
          </span>
        </span>

        <div className="flex items-center gap-1.5 text-[11px]">
          {guests.length > 0 && (
            <button
              type="button"
              onClick={onSelectAllActiveGuests}
              className="rounded-lg border border-line bg-canvas px-2.5 py-1 font-medium text-ink transition-colors hover:border-line-strong"
            >
              Chọn tất cả
            </button>
          )}
          {selectedMap.size > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-lg border border-line bg-canvas px-2.5 py-1 font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              Bỏ chọn hết (Chỉ Admin)
            </button>
          )}
        </div>
      </div>

      {guests.length > 4 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={memberQuery}
            onChange={(e) => onMemberQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
            placeholder="Tìm theo tên Discord hoặc ID..."
            className="w-full rounded-xl border border-line bg-canvas py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
          />
        </div>
      )}

      <div className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-canvas">
        {preGrantedOnlyUsers.map((u) => (
          <label
            key={`pre-${u.discordUserId}`}
            className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-subtle/60"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">
                {u.label || `Discord ID ${u.discordUserId}`}
              </p>
              <p className="truncate text-[11px] text-ink-faint">
                ID: {u.discordUserId} · Chờ lấy key lần đầu
              </p>
            </div>
            <input
              type="checkbox"
              checked
              onChange={() => onToggleMember(u.discordUserId, u.label)}
              className="h-4 w-4 shrink-0 accent-[#B22222]"
            />
          </label>
        ))}

        {filteredGuests.length === 0 && preGrantedOnlyUsers.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-muted">
            {guests.length === 0
              ? 'Chưa có thành viên Discord nào lấy chìa khoá. Bạn có thể dán trước Discord User ID bên dưới.'
              : 'Không tìm thấy thành viên nào khớp từ khoá.'}
          </p>
        ) : (
          filteredGuests.map((guest) => {
            const checked = selectedMap.has(guest.discordUserId);
            const tail = guest.discordUserId.slice(-4).padStart(4, '0');
            return (
              <label
                key={guest.discordUserId}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-subtle/60 ${
                  checked ? 'bg-crimson-accent/[0.06]' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-ink">
                      {guest.discordUsername}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint">#{tail}</span>
                    {guest.isBanned && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-red-600/15 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
                        <ShieldAlert className="h-2.5 w-2.5" />
                        Đã khoá
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-ink-faint">ID: {guest.discordUserId}</p>
                </div>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={(e) => {
                    e.preventDefault();
                    onToggleMember(guest.discordUserId, guest.discordUsername);
                  }}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    checked
                      ? 'border-crimson-accent bg-crimson-accent text-white'
                      : 'border-line-strong bg-surface text-transparent'
                  }`}
                >
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                </button>
              </label>
            );
          })
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-dashed border-line-strong/80 bg-canvas/70 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <UserPlus className="h-3.5 w-3.5 text-accent" />
          <span>Cấp trước bằng Discord User ID (cho bạn chưa bấm nhận key lần nào):</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            inputMode="numeric"
            value={manualId}
            onChange={(e) => onManualIdChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (manualId.trim()) onAddManualId();
              }
            }}
            placeholder="Discord User ID (dãy số)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
          />
          <input
            type="text"
            value={manualLabel}
            onChange={(e) => onManualLabelChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (manualId.trim()) onAddManualId();
              }
            }}
            placeholder="Tên gợi nhớ (tuỳ chọn)"
            className="min-w-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent sm:w-40"
          />
          <button
            type="button"
            onClick={onAddManualId}
            disabled={!manualId.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-45"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Thêm</span>
          </button>
        </div>
      </div>
    </div>
  );
}
