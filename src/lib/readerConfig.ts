import type { MouseEvent } from 'react';
import type {
  ReaderFont,
  ReaderLayoutMode,
  ReaderParagraphSpacing,
  ReaderSettings,
  ReaderTextAlign,
  ReaderTheme,
  ReaderWidth,
} from '@/types';
import type { UiTheme } from '@/hooks/useTheme';

const READER_SETTINGS_KEY = 'ofu-library-reader-settings';

export function appThemeToReaderTheme(appTheme: UiTheme): ReaderTheme {
  if (appTheme === 'noon') return 'sepia';
  if (appTheme === 'dim') return 'dark';
  if (appTheme === 'midnight') return 'midnight';
  return 'paper';
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'paper',
  font: 'serif',
  fontSizePx: 19,
  lineHeight: 1.8,
  width: 'medium',
  layoutMode: 'scroll',
  sideTapNavigation: true,
  textAlign: 'justify',
  paragraphIndent: false,
  paragraphSpacing: 'normal',
  nightDimPercent: 0,
  verticalMode: false,
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
    label: 'Ban ngày',
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
    progressBar: 'bg-[#B22222]',
    isDark: false,
  },
  sepia: {
    label: 'Giữa trưa',
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
    progressBar: 'bg-[#B22222]',
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
    progressBar: 'bg-[#dc3838]',
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
    progressBar: 'bg-[#e04040]',
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

export function resolvePaginatedSpreadWidth(
  stageWidth: number,
  widthMode: ReaderWidth,
): number {
  const safeStage = Math.max(260, Math.floor(stageWidth));
  if (safeStage < 640) return safeStage;

  const wideW = Math.min(safeStage, 1820);
  if (widthMode === 'wide') return wideW;

  const mediumRaw = Math.min(Math.round(wideW * 0.84), 1420);
  const mediumW = wideW >= 900 ? Math.max(840, mediumRaw) : mediumRaw;
  if (widthMode === 'medium') return Math.min(wideW, mediumW);

  const narrowRaw = Math.min(Math.round(wideW * 0.68), 1080);
  const narrowW = wideW >= 1040 ? Math.max(820, narrowRaw) : narrowRaw;
  return Math.min(mediumW, narrowW);
}

const VALID_THEMES = new Set<ReaderTheme>(['paper', 'sepia', 'dark', 'midnight']);
const VALID_FONTS = new Set<ReaderFont>(['serif', 'sans', 'mono']);
const VALID_WIDTHS = new Set<ReaderWidth>(['narrow', 'medium', 'wide']);
const VALID_LAYOUTS = new Set<ReaderLayoutMode>(['scroll', 'paginated']);
const VALID_ALIGNS = new Set<ReaderTextAlign>(['justify', 'left']);
const VALID_SPACINGS = new Set<ReaderParagraphSpacing>(['compact', 'normal', 'relaxed']);

export const READER_PARAGRAPH_SPACING_EM: Record<ReaderParagraphSpacing, number> = {
  compact: 0.55,
  normal: 0.95,
  relaxed: 1.4,
};

export function normalizeReaderSettings(
  parsed: Partial<ReaderSettings> | null | undefined,
  fallbackTheme?: ReaderTheme,
): ReaderSettings {
  const baseTheme = fallbackTheme ?? DEFAULT_READER_SETTINGS.theme;
  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_READER_SETTINGS, theme: baseTheme };
  }
  return {
    theme: parsed.theme && VALID_THEMES.has(parsed.theme) ? parsed.theme : baseTheme,
    font: parsed.font && VALID_FONTS.has(parsed.font) ? parsed.font : DEFAULT_READER_SETTINGS.font,
    fontSizePx:
      typeof parsed.fontSizePx === 'number' && Number.isFinite(parsed.fontSizePx)
        ? Math.min(30, Math.max(14, Math.round(parsed.fontSizePx)))
        : DEFAULT_READER_SETTINGS.fontSizePx,
    lineHeight:
      typeof parsed.lineHeight === 'number' && Number.isFinite(parsed.lineHeight)
        ? Math.min(2.3, Math.max(1.35, Math.round(parsed.lineHeight * 100) / 100))
        : DEFAULT_READER_SETTINGS.lineHeight,
    width:
      parsed.width && VALID_WIDTHS.has(parsed.width) ? parsed.width : DEFAULT_READER_SETTINGS.width,
    layoutMode:
      parsed.layoutMode && VALID_LAYOUTS.has(parsed.layoutMode)
        ? parsed.layoutMode
        : DEFAULT_READER_SETTINGS.layoutMode,
    sideTapNavigation:
      typeof parsed.sideTapNavigation === 'boolean'
        ? parsed.sideTapNavigation
        : DEFAULT_READER_SETTINGS.sideTapNavigation,
    textAlign:
      parsed.textAlign && VALID_ALIGNS.has(parsed.textAlign)
        ? parsed.textAlign
        : DEFAULT_READER_SETTINGS.textAlign,
    paragraphIndent: Boolean(parsed.paragraphIndent),
    paragraphSpacing:
      parsed.paragraphSpacing && VALID_SPACINGS.has(parsed.paragraphSpacing)
        ? parsed.paragraphSpacing
        : DEFAULT_READER_SETTINGS.paragraphSpacing,
    nightDimPercent:
      typeof parsed.nightDimPercent === 'number' && Number.isFinite(parsed.nightDimPercent)
        ? Math.min(50, Math.max(0, Math.round(parsed.nightDimPercent)))
        : DEFAULT_READER_SETTINGS.nightDimPercent,
    verticalMode: Boolean(parsed.verticalMode),
  };
}

export function loadReaderSettings(fallbackTheme?: ReaderTheme): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return normalizeReaderSettings(null, fallbackTheme);
    return normalizeReaderSettings(JSON.parse(raw) as Partial<ReaderSettings>, fallbackTheme);
  } catch {
    return normalizeReaderSettings(null, fallbackTheme);
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

/**
 * Chặn điều hướng rời SPA khi bấm link bên trong EPUB/DOCX:
 * - Link ngoài (http/https/mailto): mở tab mới an toàn (`noopener,noreferrer`).
 * - Link neo `#id`: cuộn mượt đến đúng phần tử chú thích trong chương hiện tại.
 * - Link tệp nội bộ `.xhtml` không tồn tại trên SPA: chặn lại để không bị văng về `/locked`.
 */
export function handleReaderContentLinkClick(
  event: MouseEvent,
  container: HTMLElement | null,
): boolean {
  const target = event.target as HTMLElement | null;
  const link = target?.closest('.reading-content a[href]') as HTMLAnchorElement | null;
  if (!link) return false;

  event.preventDefault();
  const rawHref = (link.getAttribute('href') || '').trim();
  if (!rawHref) return true;

  if (/^(?:https?:|mailto:)/i.test(rawHref)) {
    window.open(rawHref, '_blank', 'noopener,noreferrer');
    return true;
  }

  const hashIdx = rawHref.indexOf('#');
  if (hashIdx >= 0 && container) {
    const rawFragment = rawHref.slice(hashIdx + 1);
    let fragment = rawFragment;
    try {
      fragment = decodeURIComponent(rawFragment);
    } catch {
      // Keep raw fragment
    }
    if (fragment) {
      const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(fragment) : fragment;
      const anchor =
        container.querySelector<HTMLElement>(`#${escaped}`) ||
        container.querySelector<HTMLElement>(`[name="${escaped}"]`);
      if (anchor) {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
  return true;
}
