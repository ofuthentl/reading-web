import { Minus, Plus, X } from 'lucide-react';
import type { ReaderSettings, ReaderTheme } from '@/types';
import { READER_THEME_STYLES, type ReaderThemePalette } from '@/lib/readerConfig';

interface ReaderSettingsPopoverProps {
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
  onClose: () => void;
}

const FONT_OPTIONS = [
  ['serif', 'Văn học'],
  ['sans', 'Hiện đại'],
  ['mono', 'Mono'],
] as const;

const WIDTH_OPTIONS = [
  ['narrow', 'Gọn'],
  ['medium', 'Vừa'],
  ['wide', 'Rộng'],
] as const;

export function ReaderSettingsPopover({
  settings,
  palette,
  onUpdateSettings,
  onClose,
}: ReaderSettingsPopoverProps) {
  return (
    <div
      role="dialog"
      aria-label="Tùy chỉnh giao diện đọc"
      className={`fade-in absolute right-3 top-[3.5rem] z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border p-4 shadow-2xl ${palette.panelBg} ${palette.border}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Tối ưu giao diện đọc
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng tùy chỉnh"
          className={`rounded-lg p-1 ${palette.hover}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Chế độ màu */}
      <div className="mb-4">
        <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Chế độ màu</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(READER_THEME_STYLES) as ReaderTheme[]).map((themeKey) => (
            <button
              key={themeKey}
              type="button"
              onClick={() => onUpdateSettings({ theme: themeKey })}
              className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-medium transition ${
                settings.theme === themeKey
                  ? palette.accentRing
                  : `${palette.border} ${palette.hover}`
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full border ${READER_THEME_STYLES[themeKey].swatch}`}
              />
              {READER_THEME_STYLES[themeKey].label}
            </button>
          ))}
        </div>
      </div>

      {/* Kiểu chữ */}
      <div className="mb-4">
        <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Kiểu chữ</p>
        <div className="grid grid-cols-3 gap-1.5">
          {FONT_OPTIONS.map(([fontKey, label]) => (
            <button
              key={fontKey}
              type="button"
              onClick={() => onUpdateSettings({ font: fontKey })}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                settings.font === fontKey
                  ? palette.active
                  : `${palette.border} ${palette.hover}`
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cỡ chữ */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${palette.textSecondary}`}>
          Cỡ chữ ({settings.fontSizePx}px)
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Giảm cỡ chữ"
            onClick={() => onUpdateSettings({ fontSizePx: Math.max(14, settings.fontSizePx - 1) })}
            className={`rounded-lg border p-1.5 ${palette.border} ${palette.hover}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onUpdateSettings({ fontSizePx: 19 })}
            className={`rounded-lg border px-2 py-1 text-xs ${palette.border} ${palette.hover}`}
          >
            Mặc định
          </button>
          <button
            type="button"
            aria-label="Tăng cỡ chữ"
            onClick={() => onUpdateSettings({ fontSizePx: Math.min(28, settings.fontSizePx + 1) })}
            className={`rounded-lg border p-1.5 ${palette.border} ${palette.hover}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Giãn dòng */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <span className={`text-xs font-medium ${palette.textSecondary}`}>Giãn dòng</span>
          <span className="text-xs tabular-nums">{settings.lineHeight.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={1.5}
          max={2.3}
          step={0.1}
          value={settings.lineHeight}
          onChange={(event) => onUpdateSettings({ lineHeight: Number(event.target.value) })}
          aria-label="Điều chỉnh giãn dòng"
          className="w-full accent-accent"
        />
      </div>

      {/* Độ rộng trang đọc */}
      <div className="mb-4">
        <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Độ rộng trang đọc</p>
        <div className="grid grid-cols-3 gap-1.5">
          {WIDTH_OPTIONS.map(([widthKey, label]) => (
            <button
              key={widthKey}
              type="button"
              onClick={() => onUpdateSettings({ width: widthKey })}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                settings.width === widthKey
                  ? palette.active
                  : `${palette.border} ${palette.hover}`
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chạm lề & phím mũi tên */}
      <label
        className={`flex cursor-pointer items-center justify-between border-t pt-3 text-xs ${palette.border}`}
      >
        <span>Chạm lề trái/phải & phím mũi tên</span>
        <input
          type="checkbox"
          checked={settings.sideTapNavigation}
          onChange={(event) => onUpdateSettings({ sideTapNavigation: event.target.checked })}
          className="h-4 w-4 accent-accent"
        />
      </label>
    </div>
  );
}
