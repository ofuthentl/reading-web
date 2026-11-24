import { type AuthContext, HttpError } from './auth';

export interface StoredReaderSettings {
  theme: 'paper' | 'sepia' | 'dark' | 'midnight';
  font: 'serif' | 'sans' | 'mono';
  fontSizePx: number;
  lineHeight: number;
  width: 'narrow' | 'medium' | 'wide';
  layoutMode: 'scroll' | 'paginated';
  sideTapNavigation: boolean;
  textAlign: 'justify' | 'left';
  paragraphIndent: boolean;
  paragraphSpacing: 'compact' | 'normal' | 'relaxed';
  nightDimPercent: number;
  readingRuler: boolean;
  dailyGoalMinutes: number;
}

const VALID_THEMES = new Set<StoredReaderSettings['theme']>(['paper', 'sepia', 'dark', 'midnight']);
const VALID_FONTS = new Set<StoredReaderSettings['font']>(['serif', 'sans', 'mono']);
const VALID_WIDTHS = new Set<StoredReaderSettings['width']>(['narrow', 'medium', 'wide']);
const VALID_LAYOUTS = new Set<StoredReaderSettings['layoutMode']>(['scroll', 'paginated']);
const VALID_ALIGNS = new Set<StoredReaderSettings['textAlign']>(['justify', 'left']);
const VALID_SPACINGS = new Set<StoredReaderSettings['paragraphSpacing']>([
  'compact',
  'normal',
  'relaxed',
]);

const ensuredPrefsDbs = new WeakSet<D1Database>();

export async function ensureReaderPrefsTable(db: D1Database): Promise<void> {
  if (ensuredPrefsDbs.has(db)) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS user_reader_prefs (
         user_scope TEXT PRIMARY KEY,
         settings_json TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
    )
    .run();
  ensuredPrefsDbs.add(db);
}

function resolveUserScope(auth: AuthContext): string {
  return auth.role === 'owner' ? 'owner' : `guest:${auth.userId}`;
}

export function sanitizeReaderSettingsPayload(raw: unknown): StoredReaderSettings {
  if (!raw || typeof raw !== 'object') {
    throw new HttpError('Dữ liệu cài đặt trình đọc không hợp lệ.', 400);
  }
  const obj = raw as Record<string, unknown>;

  const theme = VALID_THEMES.has(obj.theme as StoredReaderSettings['theme'])
    ? (obj.theme as StoredReaderSettings['theme'])
    : 'paper';
  const font = VALID_FONTS.has(obj.font as StoredReaderSettings['font'])
    ? (obj.font as StoredReaderSettings['font'])
    : 'serif';

  const rawFontSize = Number(obj.fontSizePx ?? 19);
  const fontSizePx = Number.isFinite(rawFontSize)
    ? Math.min(30, Math.max(14, Math.round(rawFontSize)))
    : 19;

  const rawLineHeight = Number(obj.lineHeight ?? 1.85);
  const lineHeight = Number.isFinite(rawLineHeight)
    ? Math.min(2.3, Math.max(1.35, Math.round(rawLineHeight * 100) / 100))
    : 1.85;

  const width = VALID_WIDTHS.has(obj.width as StoredReaderSettings['width'])
    ? (obj.width as StoredReaderSettings['width'])
    : 'medium';
  const layoutMode = VALID_LAYOUTS.has(obj.layoutMode as StoredReaderSettings['layoutMode'])
    ? (obj.layoutMode as StoredReaderSettings['layoutMode'])
    : 'scroll';
  const sideTapNavigation = obj.sideTapNavigation !== false;

  const textAlign = VALID_ALIGNS.has(obj.textAlign as StoredReaderSettings['textAlign'])
    ? (obj.textAlign as StoredReaderSettings['textAlign'])
    : 'justify';
  const paragraphIndent = Boolean(obj.paragraphIndent);
  const paragraphSpacing = VALID_SPACINGS.has(
    obj.paragraphSpacing as StoredReaderSettings['paragraphSpacing'],
  )
    ? (obj.paragraphSpacing as StoredReaderSettings['paragraphSpacing'])
    : 'normal';

  const rawDim = Number(obj.nightDimPercent ?? 0);
  const nightDimPercent = Number.isFinite(rawDim)
    ? Math.min(50, Math.max(0, Math.round(rawDim)))
    : 0;

  const readingRuler = Boolean(obj.readingRuler);
  const rawGoal = obj.dailyGoalMinutes;
  let dailyGoalMinutes = 30;
  if (rawGoal === 0) {
    dailyGoalMinutes = 0;
  } else if (typeof rawGoal === 'number' && Number.isFinite(rawGoal) && rawGoal > 0) {
    dailyGoalMinutes = Math.min(240, Math.max(10, Math.round(rawGoal)));
  }

  return {
    theme,
    font,
    fontSizePx,
    lineHeight,
    width,
    layoutMode,
    sideTapNavigation,
    textAlign,
    paragraphIndent,
    paragraphSpacing,
    nightDimPercent,
    readingRuler,
    dailyGoalMinutes,
  };
}

export async function getUserReaderPrefs(db: D1Database, auth: AuthContext) {
  await ensureReaderPrefsTable(db);
  const scope = resolveUserScope(auth);
  const row = await db
    .prepare('SELECT settings_json, updated_at FROM user_reader_prefs WHERE user_scope = ?')
    .bind(scope)
    .first<{ settings_json: string; updated_at: number }>();

  if (!row) {
    return { settings: null, updatedAt: null };
  }

  try {
    const parsed = JSON.parse(row.settings_json) as unknown;
    const sanitized = sanitizeReaderSettingsPayload(parsed);
    return { settings: sanitized, updatedAt: Number(row.updated_at) };
  } catch {
    return { settings: null, updatedAt: null };
  }
}

export async function putUserReaderPrefs(db: D1Database, auth: AuthContext, body: unknown) {
  await ensureReaderPrefsTable(db);
  const rawSettings =
    body && typeof body === 'object' && 'settings' in (body as Record<string, unknown>)
      ? (body as Record<string, unknown>).settings
      : body;
  const sanitized = sanitizeReaderSettingsPayload(rawSettings);
  const scope = resolveUserScope(auth);
  const updatedAt = Date.now();
  const settingsJson = JSON.stringify(sanitized);

  await db
    .prepare(
      `INSERT INTO user_reader_prefs (user_scope, settings_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_scope) DO UPDATE SET
         settings_json = excluded.settings_json,
         updated_at = excluded.updated_at`,
    )
    .bind(scope, settingsJson, updatedAt)
    .run();

  return { ok: true, settings: sanitized, updatedAt };
}
