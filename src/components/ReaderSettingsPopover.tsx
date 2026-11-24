import { useEffect, useState } from 'react';
import {
  AlignJustify,
  AlignLeft,
  BookOpen,
  Cloud,
  Eye,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  ScrollText,
  X,
} from 'lucide-react';
import type {
  ReaderEyeBreakMinutes,
  ReaderFontWeight,
  ReaderLayoutMode,
  ReaderParagraphSpacing,
  ReaderSettings,
  ReaderTextAlign,
  ReaderTheme,
} from '@/types';
import { READER_THEME_STYLES, type ReaderThemePalette } from '@/lib/readerConfig';
import {
  DEFAULT_ADAPTIVE_WPM,
  readLearnedWpm,
  resetLearnedWpm,
  subscribeLearnedWpm,
} from '@/lib/readingSpeedTracker';

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

const FONT_WEIGHT_OPTIONS: ReadonlyArray<[ReaderFontWeight, string]> = [
  ['normal', 'Thường'],
  ['semibold', 'Vừa'],
  ['bold', 'Đậm'],
];

const EYE_BREAK_OPTIONS: ReadonlyArray<[ReaderEyeBreakMinutes, string]> = [
  [0, 'Tắt'],
  [30, '30p'],
  [45, '45p'],
  [60, '60p'],
];

const WIDTH_OPTIONS = [
  ['narrow', 'Gọn'],
  ['medium', 'Vừa'],
  ['wide', 'Rộng'],
] as const;

const SPACING_OPTIONS: ReadonlyArray<[ReaderParagraphSpacing, string]> = [
  ['compact', 'Khít'],
  ['normal', 'Vừa'],
  ['relaxed', 'Thoáng'],
];

const ALIGN_OPTIONS: ReadonlyArray<{
  id: ReaderTextAlign;
  label: string;
  icon: typeof AlignJustify;
}> = [
  { id: 'justify', label: 'Căn đều', icon: AlignJustify },
  { id: 'left', label: 'Căn trái', icon: AlignLeft },
];

const LAYOUT_OPTIONS: ReadonlyArray<{
  id: ReaderLayoutMode;
  label: string;
  icon: typeof ScrollText;
}> = [
  { id: 'scroll', label: 'Cuộn dọc', icon: ScrollText },
  { id: 'paginated', label: 'Lật trang (2 cột)', icon: BookOpen },
];

export function ReaderSettingsPopover({
  settings,
  palette,
  onUpdateSettings,
  onClose,
}: ReaderSettingsPopoverProps) {
  const [wpmState, setWpmState] = useState(readLearnedWpm);

  useEffect(() => {
    return subscribeLearnedWpm(() => {
      setWpmState(readLearnedWpm());
    });
  }, []);
  return (
    <div
      role="dialog"
      aria-label="Tùy chỉnh giao diện đọc"
      className={`fade-in scrollbar-thin absolute right-3 top-[3.5rem] z-40 max-h-[calc(100dvh-4.5rem)] w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-y-contain rounded-2xl border p-4 shadow-2xl ${palette.panelBg} ${palette.border}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
            Tối ưu giao diện đọc
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${palette.border} ${palette.textSecondary}`}
            title="Tự động đồng bộ cài đặt đọc lên tài khoản"
          >
            <Cloud className="h-2.5 w-2.5" />
            Đồng bộ
          </span>
        </div>
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
      <div className="mb-3.5">
        <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Chế độ màu</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(READER_THEME_STYLES) as ReaderTheme[]).map((themeKey) => (
            <button
              key={themeKey}
              type="button"
              onClick={() => onUpdateSettings({ theme: themeKey })}
              className={`flex flex-col items-center gap-1 whitespace-nowrap rounded-xl border px-1 py-2 text-[11px] font-medium transition ${
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

      {/* Lớp phủ dịu mắt ban đêm */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${palette.textSecondary}`}>
            <Moon className="h-3.5 w-3.5 opacity-80" />
            <span>Dịu mắt ban đêm</span>
          </span>
          <span className="text-xs tabular-nums">
            {settings.nightDimPercent > 0 ? `${settings.nightDimPercent}%` : 'Tắt'}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          step={5}
          value={settings.nightDimPercent}
          onChange={(event) => onUpdateSettings({ nightDimPercent: Number(event.target.value) })}
          aria-label="Điều chỉnh lớp phủ dịu mắt ban đêm"
          className={`w-full ${palette.sliderAccent}`}
        />
      </div>

      {/* Kiểu chữ */}
      <div className="mb-3.5">
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

      {/* Độ đậm chữ (C12) */}
      <div className="mb-3.5">
        <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Độ đậm chữ</p>
        <div className="grid grid-cols-3 gap-1.5">
          {FONT_WEIGHT_OPTIONS.map(([weightKey, label]) => (
            <button
              key={weightKey}
              type="button"
              onClick={() => onUpdateSettings({ fontWeight: weightKey })}
              className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                weightKey === 'bold'
                  ? 'font-bold'
                  : weightKey === 'semibold'
                    ? 'font-semibold'
                    : 'font-normal'
              } ${
                (settings.fontWeight ?? 'normal') === weightKey
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
      <div className="mb-3.5 flex items-center justify-between gap-2">
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
            onClick={() => onUpdateSettings({ fontSizePx: Math.min(30, settings.fontSizePx + 1) })}
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
          <span className="text-xs tabular-nums">{settings.lineHeight.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={1.4}
          max={2.3}
          step={0.05}
          value={settings.lineHeight}
          onChange={(event) => onUpdateSettings({ lineHeight: Number(event.target.value) })}
          aria-label="Điều chỉnh giãn dòng"
          className={`w-full ${palette.sliderAccent}`}
        />
      </div>

      {/* Căn lề & Giãn đoạn (Mục 6) */}
      <div className="mb-3.5 grid grid-cols-2 gap-2">
        <div>
          <p className={`mb-1.5 text-xs font-medium ${palette.textSecondary}`}>Căn lề chữ</p>
          <div className="grid grid-cols-2 gap-1">
            {ALIGN_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onUpdateSettings({ textAlign: id })}
                className={`inline-flex items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-[11px] font-medium transition ${
                  settings.textAlign === id
                    ? palette.active
                    : `${palette.border} ${palette.hover}`
                }`}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={`mb-1.5 text-xs font-medium ${palette.textSecondary}`}>Giãn đoạn</p>
          <div className="grid grid-cols-3 gap-1">
            {SPACING_OPTIONS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onUpdateSettings({ paragraphSpacing: id })}
                className={`rounded-lg border px-1 py-1.5 text-[11px] font-medium transition ${
                  settings.paragraphSpacing === id
                    ? palette.active
                    : `${palette.border} ${palette.hover}`
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Thụt đầu dòng & Thanh dẫn mắt */}
      <label className="mb-2.5 flex cursor-pointer items-center justify-between gap-2 text-xs">
        <span>Thụt đầu dòng đoạn văn (kiểu sách in)</span>
        <input
          type="checkbox"
          checked={settings.paragraphIndent}
          onChange={(event) => onUpdateSettings({ paragraphIndent: event.target.checked })}
          className={`h-4 w-4 shrink-0 ${palette.sliderAccent}`}
        />
      </label>

      <label
        className="mb-3.5 flex cursor-pointer items-center justify-between gap-2 text-xs"
        title="Cuộn dọc: giữ nét đoạn trung tâm. Lật trang 2 cột: khoá từng cột theo chuột hoặc phím ↑/↓"
      >
        <span>Thanh dẫn mắt (tập trung đoạn đang đọc)</span>
        <input
          type="checkbox"
          checked={settings.readingRuler}
          onChange={(event) => onUpdateSettings({ readingRuler: event.target.checked })}
          className={`h-4 w-4 shrink-0 ${palette.sliderAccent}`}
        />
      </label>

      {/* Kiểu trang đọc */}
      <div className="mb-3.5">
        <p className={`mb-2 text-xs font-medium ${palette.textSecondary}`}>Kiểu trang đọc</p>
        <div className="grid grid-cols-2 gap-1.5">
          {LAYOUT_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onUpdateSettings({ layoutMode: id })}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                settings.layoutMode === id ? palette.active : `${palette.border} ${palette.hover}`
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Độ rộng trang đọc */}
      <div className="mb-3.5">
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

      {/* Nhắc nghỉ mắt & Tốc độ đọc cá nhân (C13) */}
      <div className={`mb-3.5 border-t pt-3 ${palette.border}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${palette.textSecondary}`}>
            <Eye className="h-3.5 w-3.5 opacity-80" />
            <span>Nhắc nghỉ mắt</span>
          </span>
          <span className={`text-[11px] ${palette.textSecondary}`}>
            {settings.eyeBreakMinutes > 0 ? `Mỗi ${settings.eyeBreakMinutes} phút` : 'Đang tắt'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {EYE_BREAK_OPTIONS.map(([mins, label]) => (
            <button
              key={mins}
              type="button"
              onClick={() => onUpdateSettings({ eyeBreakMinutes: mins })}
              className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                (settings.eyeBreakMinutes ?? 0) === mins
                  ? palette.active
                  : `${palette.border} ${palette.hover}`
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`mt-2.5 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${palette.border} ${palette.surfaceSubtle}`}>
          <span className={palette.textSecondary}>
            Tốc độ đọc:{' '}
            <strong className={`tabular-nums ${palette.textPrimary}`}>
              ~{wpmState.wpm} từ/phút
            </strong>
          </span>
          <button
            type="button"
            disabled={wpmState.wpm === DEFAULT_ADAPTIVE_WPM && wpmState.sampleCount === 0}
            onClick={() => resetLearnedWpm()}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium transition disabled:opacity-40 ${palette.hover}`}
            title="Đặt lại tốc độ đọc mặc định 220 từ/phút"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Đặt lại 220</span>
          </button>
        </div>
      </div>

      {/* Chạm lề & phím mũi tên */}
      <label
        className={`flex cursor-pointer items-center justify-between gap-2 border-t pt-3 text-xs ${palette.border}`}
      >
        <span>Chạm lề trái/phải &amp; phím mũi tên để qua trang</span>
        <input
          type="checkbox"
          checked={settings.sideTapNavigation}
          onChange={(event) => onUpdateSettings({ sideTapNavigation: event.target.checked })}
          className={`h-4 w-4 shrink-0 ${palette.sliderAccent}`}
        />
      </label>
    </div>
  );
}
