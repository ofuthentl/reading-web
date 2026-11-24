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
};

const VALID_THEMES = new Set<ReaderTheme>(['paper', 'sepia', 'dark', 'midnight']);
const VALID_FONTS = new Set<ReaderFont>(['serif', 'sans', 'mono']);
const VALID_WIDTHS = new Set<ReaderWidth>(['narrow', 'medium', 'wide']);
const VALID_LAYOUTS = new Set<ReaderLayoutMode>(['scroll', 'paginated']);
const VALID_ALIGNS = new Set<ReaderTextAlign>(['justify', 'left']);
const VALID_SPACINGS = new Set<ReaderParagraphSpacing>(['compact', 'normal', 'relaxed']);

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
