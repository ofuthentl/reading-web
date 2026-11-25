import { HttpError, ensureDiscordAccessTable } from './auth';

export const MAX_DISCORD_PRESETS = 30;
export const MAX_DISCORD_PRESET_NAME_LENGTH = 60;
export const MAX_DISCORD_PRESET_DESC_LENGTH = 200;
export const MAX_DISCORD_PRESET_MEMBERS = 100;
const DISCORD_USER_ID_RE = /^\d{5,32}$/;

const ensuredPresetDbs = new WeakSet<D1Database>();

export interface DiscordPresetMemberInput {
  discordUserId: string;
  label: string | null;
}

export interface ValidatedDiscordPresetInput {
  name: string;
  description: string | null;
  members: DiscordPresetMemberInput[];
}

export interface DiscordPresetMemberDto {
  discordUserId: string;
  label: string | null;
  discordUsername: string | null;
}

export interface DiscordAccessPresetDto {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  members: DiscordPresetMemberDto[];
}

export async function ensureDiscordPresetsTables(db: D1Database): Promise<void> {
  if (ensuredPresetDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS discord_access_presets (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         description TEXT,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS discord_access_preset_members (
         preset_id TEXT NOT NULL REFERENCES discord_access_presets(id) ON DELETE CASCADE,
         discord_user_id TEXT NOT NULL,
         member_label TEXT,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (preset_id, discord_user_id)
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_discord_preset_members_user
       ON discord_access_preset_members(discord_user_id)`,
    ),
  ]);
  ensuredPresetDbs.add(db);
}

export function validateDiscordPresetInput(rawBody: unknown): ValidatedDiscordPresetInput {
  if (!rawBody || typeof rawBody !== 'object') {
    throw new HttpError('Dữ liệu nhóm quyền Discord không hợp lệ.', 400);
  }
  const body = rawBody as {
    name?: unknown;
    description?: unknown;
    members?: unknown;
  };
  const rawName = typeof body.name === 'string' ? body.name.normalize('NFC').trim() : '';
  if (!rawName) {
    throw new HttpError('Tên nhóm quyền Discord không được để trống.', 400);
  }
  if (rawName.length > MAX_DISCORD_PRESET_NAME_LENGTH) {
    throw new HttpError(
      `Tên nhóm quyền tối đa ${MAX_DISCORD_PRESET_NAME_LENGTH} ký tự.`,
      400,
    );
  }

  let description: string | null = null;
  if (typeof body.description === 'string') {
    const cleanDesc = body.description.normalize('NFC').trim();
    if (cleanDesc.length > MAX_DISCORD_PRESET_DESC_LENGTH) {
      throw new HttpError(
        `Mô tả nhóm quyền tối đa ${MAX_DISCORD_PRESET_DESC_LENGTH} ký tự.`,
        400,
      );
    }
    description = cleanDesc || null;
  } else if (body.description !== undefined && body.description !== null) {
    throw new HttpError('Mô tả nhóm quyền không hợp lệ.', 400);
  }

  if (!Array.isArray(body.members)) {
    throw new HttpError('Danh sách thành viên nhóm quyền phải là mảng.', 400);
  }

  const dedup = new Map<string, string | null>();
  for (const item of body.members) {
    if (!item || typeof item !== 'object') {
      throw new HttpError('Thành viên trong nhóm quyền không hợp lệ.', 400);
    }
    const rec = item as { discordUserId?: unknown; label?: unknown };
    const id = typeof rec.discordUserId === 'string' ? rec.discordUserId.trim() : '';
    if (!DISCORD_USER_ID_RE.test(id)) {
      throw new HttpError(`Discord User ID "${id}" không hợp lệ.`, 400);
    }
    const rawLabel =
      typeof rec.label === 'string' ? rec.label.normalize('NFC').trim().slice(0, 60) : '';
    if (!dedup.has(id) || (rawLabel && !dedup.get(id))) {
      dedup.set(id, rawLabel || null);
    }
    if (dedup.size > MAX_DISCORD_PRESET_MEMBERS) {
      throw new HttpError(
        `Mỗi nhóm quyền chứa tối đa ${MAX_DISCORD_PRESET_MEMBERS} thành viên.`,
        400,
      );
    }
  }

  return {
    name: rawName,
    description,
    members: Array.from(dedup.entries()).map(([discordUserId, label]) => ({
      discordUserId,
      label,
    })),
  };
}

function buildInsertPresetMembersStatements(
  db: D1Database,
  presetId: string,
  members: readonly DiscordPresetMemberInput[],
  now: number,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  const CHUNK_SIZE = 20; // 20 * 4 = 80 bind params (< 100 giới hạn D1)
  for (let i = 0; i < members.length; i += CHUNK_SIZE) {
    const slice = members.slice(i, i + CHUNK_SIZE);
    const placeholders = slice.map(() => '(?, ?, ?, ?)').join(', ');
    const params: Array<string | number | null> = [];
    for (const m of slice) {
      params.push(presetId, m.discordUserId, m.label, now);
    }
    stmts.push(
      db
        .prepare(
          `INSERT INTO discord_access_preset_members (preset_id, discord_user_id, member_label, created_at)
           VALUES ${placeholders}`,
        )
        .bind(...params),
    );
  }
  return stmts;
}

export async function listDiscordAccessPresets(
  db: D1Database,
): Promise<{ presets: DiscordAccessPresetDto[] }> {
  await Promise.all([ensureDiscordPresetsTables(db), ensureDiscordAccessTable(db)]);

  const [presetsRes, membersRes] = await db.batch([
    db.prepare(
      `SELECT id, name, description, created_at, updated_at
       FROM discord_access_presets
       ORDER BY LOWER(name) ASC, created_at ASC`,
    ),
    db.prepare(
      `SELECT m.preset_id, m.discord_user_id, m.member_label, d.discord_username
       FROM discord_access_preset_members m
       LEFT JOIN discord_access d ON d.discord_user_id = m.discord_user_id
       ORDER BY m.created_at ASC, m.discord_user_id ASC`,
    ),
  ]);

  const membersByPreset = new Map<string, DiscordPresetMemberDto[]>();
  for (const row of (membersRes.results || []) as Array<{
    preset_id: string;
    discord_user_id: string;
    member_label: string | null;
    discord_username: string | null;
  }>) {
    const list = membersByPreset.get(row.preset_id) ?? [];
    list.push({
      discordUserId: row.discord_user_id,
      label: row.member_label ?? null,
      discordUsername: row.discord_username ?? null,
    });
    membersByPreset.set(row.preset_id, list);
  }

  const presets: DiscordAccessPresetDto[] = (
    (presetsRes.results || []) as Array<{
      id: string;
      name: string;
      description: string | null;
      created_at: number;
      updated_at: number;
    }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    members: membersByPreset.get(row.id) ?? [],
  }));

  return { presets };
}

async function loadSinglePresetById(
  db: D1Database,
  presetId: string,
): Promise<DiscordAccessPresetDto | null> {
  const [presetRes, membersRes] = await db.batch([
    db
      .prepare(
        'SELECT id, name, description, created_at, updated_at FROM discord_access_presets WHERE id = ?',
      )
      .bind(presetId),
    db
      .prepare(
        `SELECT m.discord_user_id, m.member_label, d.discord_username
         FROM discord_access_preset_members m
         LEFT JOIN discord_access d ON d.discord_user_id = m.discord_user_id
         WHERE m.preset_id = ?
         ORDER BY m.created_at ASC, m.discord_user_id ASC`,
      )
      .bind(presetId),
  ]);
  const row = (presetRes.results?.[0] ?? null) as {
    id: string;
    name: string;
    description: string | null;
    created_at: number;
    updated_at: number;
  } | null;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    members: (
      (membersRes.results || []) as Array<{
        discord_user_id: string;
        member_label: string | null;
        discord_username: string | null;
      }>
    ).map((m) => ({
      discordUserId: m.discord_user_id,
      label: m.member_label ?? null,
      discordUsername: m.discord_username ?? null,
    })),
  };
}

export async function createDiscordAccessPreset(
  db: D1Database,
  rawBody: unknown,
): Promise<{ preset: DiscordAccessPresetDto }> {
  const input = validateDiscordPresetInput(rawBody);
  await Promise.all([ensureDiscordPresetsTables(db), ensureDiscordAccessTable(db)]);

  const countRow = await db
    .prepare('SELECT COUNT(*) AS cnt FROM discord_access_presets')
    .first<{ cnt: number }>();
  if ((countRow?.cnt ?? 0) >= MAX_DISCORD_PRESETS) {
    throw new HttpError(`Chỉ hỗ trợ tối đa ${MAX_DISCORD_PRESETS} nhóm quyền Discord.`, 400);
  }

  const now = Date.now();
  const id = `preset-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO discord_access_presets (id, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, input.name, input.description, now, now),
    ...buildInsertPresetMembersStatements(db, id, input.members, now),
  ]);

  const created = await loadSinglePresetById(db, id);
  if (!created) throw new HttpError('Không thể đọc lại nhóm quyền vừa tạo.', 500);
  return { preset: created };
}

export async function updateDiscordAccessPreset(
  db: D1Database,
  presetId: string,
  rawBody: unknown,
): Promise<{ preset: DiscordAccessPresetDto }> {
  const cleanId = presetId.trim();
  if (!cleanId || cleanId.length > 64) {
    throw new HttpError('ID nhóm quyền không hợp lệ.', 400);
  }
  const input = validateDiscordPresetInput(rawBody);
  await Promise.all([ensureDiscordPresetsTables(db), ensureDiscordAccessTable(db)]);

  const existing = await db
    .prepare('SELECT id FROM discord_access_presets WHERE id = ?')
    .bind(cleanId)
    .first<{ id: string }>();
  if (!existing) {
    throw new HttpError('Không tìm thấy nhóm quyền Discord này.', 404);
  }

  const now = Date.now();
  await db.batch([
    db
      .prepare(
        'UPDATE discord_access_presets SET name = ?, description = ?, updated_at = ? WHERE id = ?',
      )
      .bind(input.name, input.description, now, cleanId),
    db.prepare('DELETE FROM discord_access_preset_members WHERE preset_id = ?').bind(cleanId),
    ...buildInsertPresetMembersStatements(db, cleanId, input.members, now),
  ]);

  const updated = await loadSinglePresetById(db, cleanId);
  if (!updated) throw new HttpError('Không thể đọc lại nhóm quyền vừa cập nhật.', 500);
  return { preset: updated };
}

export async function deleteDiscordAccessPreset(
  db: D1Database,
  presetId: string,
): Promise<{ ok: true; id: string }> {
  const cleanId = presetId.trim();
  if (!cleanId || cleanId.length > 64) {
    throw new HttpError('ID nhóm quyền không hợp lệ.', 400);
  }
  await ensureDiscordPresetsTables(db);
  const existing = await db
    .prepare('SELECT id FROM discord_access_presets WHERE id = ?')
    .bind(cleanId)
    .first<{ id: string }>();
  if (!existing) {
    throw new HttpError('Không tìm thấy nhóm quyền Discord này.', 404);
  }
  await db.batch([
    db.prepare('DELETE FROM discord_access_preset_members WHERE preset_id = ?').bind(cleanId),
    db.prepare('DELETE FROM discord_access_presets WHERE id = ?').bind(cleanId),
  ]);
  return { ok: true, id: cleanId };
}
