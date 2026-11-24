import { useEffect, useRef, useState } from 'react';
import { Bell, Check, FolderKanban, Pencil } from 'lucide-react';

const MAX_SHELF_NAME_LENGTH = 120;

interface UploadBatchShelfBarProps {
  visible: boolean;
  enabled: boolean;
  shelfName: string;
  existingShelves: string[];
  disabled: boolean;
  onToggle: (nextEnabled: boolean) => void;
  onChangeShelfName: (nextName: string) => void;
}

export function UploadBatchShelfBar({
  visible,
  enabled,
  shelfName,
  existingShelves,
  disabled,
  onToggle,
  onChangeShelfName,
}: UploadBatchShelfBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(shelfName);

  useEffect(() => {
    if (!editing) {
      setDraftName(shelfName);
    }
  }, [shelfName, editing]);

  useEffect(() => {
    if (disabled && editing) {
      setEditing(false);
    }
  }, [disabled, editing]);

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  if (!visible) return null;

  const commitDraft = () => {
    const trimmed = draftName.trim().slice(0, MAX_SHELF_NAME_LENGTH);
    if (trimmed) {
      onChangeShelfName(trimmed);
      if (!enabled) onToggle(true);
    } else {
      setDraftName(shelfName);
    }
    setEditing(false);
  };

  return (
    <div
      className={`inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-colors ${
        enabled
          ? 'border-accent/50 bg-accent/10 text-ink'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong'
      } ${disabled ? 'opacity-55' : ''}`}
    >
      <label className="inline-flex min-w-0 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-line text-accent accent-accent focus:ring-accent disabled:cursor-not-allowed"
        />
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="shrink-0 font-medium">Thêm vào kệ</span>
      </label>

      {editing ? (
        <div className="inline-flex min-w-0 max-w-full items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            list="upload-batch-shelves-datalist"
            maxLength={MAX_SHELF_NAME_LENGTH}
            value={draftName}
            disabled={disabled}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setDraftName(shelfName);
                setEditing(false);
              }
            }}
            placeholder="Nhập tên kệ..."
            aria-label="Tên kệ áp dụng cho cả lô"
            className="w-44 max-w-full rounded-lg border border-accent bg-canvas px-2 py-0.5 text-xs font-semibold text-ink outline-none sm:w-72"
          />
          <datalist id="upload-batch-shelves-datalist">
            {existingShelves.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={commitDraft}
            aria-label="Lưu tên kệ"
            title="Lưu tên kệ"
            className="rounded-md p-1 text-accent transition-colors hover:bg-subtle"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="inline-flex min-w-0 max-w-full items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            title={`${shelfName} (Bấm để đổi tên kệ)`}
            className="max-w-[14rem] truncate rounded-md bg-canvas/80 px-2 py-0.5 font-semibold text-accent transition-colors hover:bg-subtle sm:max-w-[26rem] disabled:cursor-not-allowed"
          >
            {shelfName}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            aria-label={`Đổi tên kệ chung ${shelfName}`}
            title="Sửa tên kệ chung"
            className="rounded-md p-1 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:cursor-not-allowed"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

interface UploadDiscordReleaseToggleProps {
  checked: boolean;
  disabled: boolean;
  onChange: (nextChecked: boolean) => void;
}

export function UploadDiscordReleaseToggle({
  checked,
  disabled,
  onChange,
}: UploadDiscordReleaseToggleProps) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs transition-colors ${
        checked
          ? 'border-amber-500/45 bg-amber-500/10 text-ink'
          : 'border-line bg-canvas text-ink-muted hover:border-line-strong'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-line text-accent accent-accent focus:ring-accent disabled:cursor-not-allowed"
      />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <Bell className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Thông báo tập mới lên kênh Discord</span>
        </span>
        <span className="block text-[11px] leading-relaxed text-ink-muted">
          Tự gom các tập cùng bộ thành 1 thẻ thông báo im lặng (0 ping) kèm ảnh bìa &amp; nút mở thư
          viện sau khi tải xong.
        </span>
      </span>
    </label>
  );
}
