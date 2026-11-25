import { useState } from 'react';
import { BookmarkPlus, Layers, Loader2, Plus, Trash2, Users } from 'lucide-react';
import type { SelectedMemberMeta } from '@/components/ShelfAccessMemberList';
import {
  type DiscordAccessPreset,
  createAdminDiscordPreset,
  deleteAdminDiscordPreset,
  updateAdminDiscordPreset,
} from '@/lib/discordPresetsApi';
import type { ToastType } from '@/hooks/useToast';

export interface DiscordPresetPickerBarProps {
  presets: readonly DiscordAccessPreset[];
  selectedMap: ReadonlyMap<string, SelectedMemberMeta>;
  disabled?: boolean;
  onApplyPreset: (preset: DiscordAccessPreset, mode: 'replace' | 'merge') => void;
  onPresetsChanged: (nextPresets: DiscordAccessPreset[]) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function DiscordPresetPickerBar({
  presets,
  selectedMap,
  disabled = false,
  onApplyPreset,
  onPresetsChanged,
  onApiError,
  onNotify,
}: DiscordPresetPickerBarProps) {
  const [applyMode, setApplyMode] = useState<'replace' | 'merge'>('replace');
  const [creating, setCreating] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyPresetId, setBusyPresetId] = useState<string | null>(null);

  const handleSaveNewPreset = async () => {
    const cleanName = presetName.trim();
    if (!cleanName || saving) return;
    if (selectedMap.size === 0) {
      onNotify?.('Hãy chọn ít nhất 1 thành viên trước khi lưu thành nhóm quyền.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const members = Array.from(selectedMap.values()).map((m) => ({
        discordUserId: m.discordUserId,
        label: m.label,
      }));
      const existingByName = presets.find(
        (p) => p.name.trim().toLocaleLowerCase('vi') === cleanName.toLocaleLowerCase('vi'),
      );
      if (existingByName) {
        const updated = await updateAdminDiscordPreset(existingByName.id, {
          name: cleanName,
          description: existingByName.description,
          members,
        });
        onPresetsChanged(presets.map((p) => (p.id === updated.id ? updated : p)));
        onNotify?.(`Đã cập nhật nhóm "${updated.name}" (${updated.members.length} người).`, 'success');
      } else {
        const created = await createAdminDiscordPreset({ name: cleanName, members });
        onPresetsChanged(
          [...presets, created].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
        );
        onNotify?.(`Đã lưu nhóm quyền "${created.name}" (${created.members.length} người).`, 'success');
      }
      setPresetName('');
      setCreating(false);
    } catch (err) {
      onApiError?.(err, 'Không thể lưu nhóm quyền Discord.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePreset = async (preset: DiscordAccessPreset) => {
    if (busyPresetId || disabled) return;
    setBusyPresetId(preset.id);
    try {
      await deleteAdminDiscordPreset(preset.id);
      onPresetsChanged(presets.filter((p) => p.id !== preset.id));
      onNotify?.(`Đã xoá nhóm quyền "${preset.name}".`, 'info');
    } catch (err) {
      onApiError?.(err, 'Không thể xoá nhóm quyền Discord.');
    } finally {
      setBusyPresetId(null);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
          <Users className="h-3.5 w-3.5 text-crimson-accent" />
          <span>Nhóm quyền bạn bè (Presets · {presets.length})</span>
        </p>

        <div className="flex items-center gap-1.5 text-[11px]">
          {presets.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setApplyMode((m) => (m === 'replace' ? 'merge' : 'replace'))}
              title="Chuyển giữa Thay thế danh sách hoặc Cộng gộp thêm"
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-0.5 text-[10.5px] font-medium text-ink-muted hover:border-line-strong hover:text-ink"
            >
              <Layers className="h-3 w-3" />
              <span>{applyMode === 'replace' ? 'Thay thế' : '+ Gộp thêm'}</span>
            </button>
          )}
          <button
            type="button"
            disabled={disabled || selectedMap.size === 0}
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
          >
            <BookmarkPlus className="h-3 w-3" />
            <span>Lưu thành Preset</span>
          </button>
        </div>
      </div>

      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="inline-flex max-w-full items-center overflow-hidden rounded-lg border border-line bg-surface text-[11px]"
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onApplyPreset(preset, applyMode)}
                title={
                  preset.description
                    ? `${preset.description} — Bấm để ${applyMode === 'replace' ? 'áp dụng thay thế' : 'gộp thêm'}`
                    : `Bấm để ${applyMode === 'replace' ? 'áp dụng thay thế' : 'gộp thêm'} ${preset.members.length} thành viên`
                }
                className="inline-flex min-w-0 items-center gap-1 px-2.5 py-1 font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-45"
              >
                <span className="max-w-[11rem] truncate">{preset.name}</span>
                <span className="shrink-0 text-ink-faint">({preset.members.length})</span>
              </button>
              <button
                type="button"
                disabled={disabled || busyPresetId === preset.id}
                onClick={() => void handleDeletePreset(preset)}
                aria-label={`Xoá nhóm ${preset.name}`}
                title="Xoá nhóm này"
                className="border-l border-line px-1.5 py-1 text-ink-faint transition-colors hover:bg-rose-500/15 hover:text-rose-600 disabled:opacity-40"
              >
                {busyPresetId === preset.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-ink-faint">
          Chưa có nhóm Preset nào. Tick chọn nhóm bạn bên dưới rồi bấm &ldquo;Lưu thành Preset&rdquo;
          để dùng lại 1 chạm cho các bộ và tập khác.
        </p>
      )}

      {creating && (
        <div className="flex flex-col gap-2 border-t border-line/70 pt-2 sm:flex-row">
          <input
            type="text"
            maxLength={60}
            value={presetName}
            disabled={saving}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSaveNewPreset();
              }
            }}
            placeholder={`Tên nhóm (lưu ${selectedMap.size} người đang chọn)...`}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={saving || !presetName.trim()}
            onClick={() => void handleSaveNewPreset()}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:opacity-45"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>Lưu nhóm</span>
          </button>
        </div>
      )}
    </div>
  );
}
