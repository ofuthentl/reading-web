import type { ReaderFont, ReaderSettings, ReaderTheme, ReaderWidth } from '@/types';

const READER_SETTINGS_KEY = 'ofu-library-reader-settings';

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'sepia',
  font: 'serif',
  fontSizePx: 19,
  lineHeight: 1.8,
  width: 'medium',
  sideTapNavigation: true,
};

export interface ReaderThemePalette {
  label: string;
  swatch: string;
  pageBg: string;
  headerBg: string;
  panelBg: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  hover: string;
  active: string;
  accentRing: string;
  progressBar: string;
  isDark: boolean;
}

export const READER_THEME_STYLES: Record<ReaderTheme, ReaderThemePalette> = {
  paper: {
    label: 'Sáng',
    swatch: 'bg-[#fcfbf8] border-[#cbbca3]',
    pageBg: 'bg-[#fcfbf8]',
    headerBg: 'bg-[#fcfbf8]/92',
    panelBg: 'bg-[#fdfaf4]',
    textPrimary: 'text-[#2b241d]',
    textSecondary: 'text-[#6d6154]',
    border: 'border-[#e5dccb]',
    hover: 'hover:bg-[#efe8da]',
    active: 'bg-[#8c5e35]/12 text-[#734b28] border-[#8c5e35]/35',
    accentRing: 'border-[#8c5e35] ring-2 ring-[#8c5e35]/25',
    progressBar: 'bg-[#8c5e35]',
    isDark: false,
  },
  sepia: {
    label: 'Ban ngày',
    swatch: 'bg-[#f4ecd8] border-[#c8b28a]',
    pageBg: 'bg-[#f4ecd8]',
    headerBg: 'bg-[#f4ecd8]/92',
    panelBg: 'bg-[#efe4ca]',
    textPrimary: 'text-[#3c2f1e]',
    textSecondary: 'text-[#7c664a]',
    border: 'border-[#dfd0b0]',
    hover: 'hover:bg-[#e6d6b4]',
    active: 'bg-[#8c5e35]/15 text-[#3c2f1e] border-[#8c5e35]/35',
    accentRing: 'border-[#8c5e35] ring-2 ring-[#8c5e35]/25',
    progressBar: 'bg-[#8c5e35]',
    isDark: false,
  },
  dark: {
    label: 'Chiều tối',
    swatch: 'bg-[#0d1117] border-[#3b475a]',
    pageBg: 'bg-[#0d1117]',
    headerBg: 'bg-[#0d1117]/92',
    panelBg: 'bg-[#141a23]',
    textPrimary: 'text-[#e6ebf0]',
    textSecondary: 'text-[#8b96a8]',
    border: 'border-[#252e3c]',
    hover: 'hover:bg-white/10',
    active: 'bg-white/12 text-[#eef2f6] border-white/25',
    accentRing: 'border-[#eef2f6] ring-2 ring-white/20',
    progressBar: 'bg-[#eef2f6]',
    isDark: true,
  },
  midnight: {
    label: 'Đêm khuya',
    swatch: 'bg-[#060608] border-[#34343c]',
    pageBg: 'bg-[#060608]',
    headerBg: 'bg-[#060608]/92',
    panelBg: 'bg-[#0e0e11]',
    textPrimary: 'text-[#e4e4e7]',
    textSecondary: 'text-[#9a9aa3]',
    border: 'border-[#1f1f25]',
    hover: 'hover:bg-white/10',
    active: 'bg-white/12 text-[#f2f2f4] border-white/25',
    accentRing: 'border-[#f2f2f4] ring-2 ring-white/20',
    progressBar: 'bg-[#f2f2f4]',
    isDark: true,
  },
};

export const READER_FONT_CLASS: Record<ReaderFont, string> = {
  serif: 'font-reader-serif',
  sans: 'font-reader-sans',
  mono: 'font-reader-mono',
};

export const READER_WIDTH_MAX: Record<ReaderWidth, string> = {
  narrow: '55.4rem',
  medium: '68.6rem',
  wide: '84.5rem',
};

const VALID_THEMES = new Set<ReaderTheme>(['paper', 'sepia', 'dark', 'midnight']);
const VALID_FONTS = new Set<ReaderFont>(['serif', 'sans', 'mono']);
const VALID_WIDTHS = new Set<ReaderWidth>(['narrow', 'medium', 'wide']);

export function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      theme: parsed.theme && VALID_THEMES.has(parsed.theme) ? parsed.theme : DEFAULT_READER_SETTINGS.theme,
      font: parsed.font && VALID_FONTS.has(parsed.font) ? parsed.font : DEFAULT_READER_SETTINGS.font,
      fontSizePx:
        typeof parsed.fontSizePx === 'number' && Number.isFinite(parsed.fontSizePx)
          ? Math.min(28, Math.max(14, Math.round(parsed.fontSizePx)))
          : DEFAULT_READER_SETTINGS.fontSizePx,
      lineHeight:
        typeof parsed.lineHeight === 'number' && Number.isFinite(parsed.lineHeight)
          ? Math.min(2.3, Math.max(1.5, Number(parsed.lineHeight.toFixed(1))))
          : DEFAULT_READER_SETTINGS.lineHeight,
      width: parsed.width && VALID_WIDTHS.has(parsed.width) ? parsed.width : DEFAULT_READER_SETTINGS.width,
      sideTapNavigation:
        typeof parsed.sideTapNavigation === 'boolean'
          ? parsed.sideTapNavigation
          : DEFAULT_READER_SETTINGS.sideTapNavigation,
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / private mode errors
  }
}
