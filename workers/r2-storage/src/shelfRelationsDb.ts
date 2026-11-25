import { type AuthContext, HttpError } from './auth';
import { MAX_SHELF_NAME_LENGTH } from './booksDb';
import { shelfExistsInBooks, toShelfAccessKey } from './shelfAccessDb';

export type CanonicalShelfRelationType = 'sequel' | 'spinoff' | 'same_universe';
export type InputShelfRelationType =
  | CanonicalShelfRelationType
  | 'prequel'
  | 'main_story';

export interface ShelfRelationDto {
  sourceShelfKey: string;
  targetShelfKey: string;
  relationType: CanonicalShelfRelationType;
  createdAt: number;
}

interface ShelfRelationRow {
  source_shelf_key: string;
  target_shelf_key: string;
  relation_type: string;
  created_at: number;
}

const VALID_CANONICAL_TYPES = new Set<CanonicalShelfRelationType>([
  'sequel',
  'spinoff',
  'same_universe',
]);

const MAX_RELATIONS_PER_SHELF = 30;
const RELATION_INSERT_CHUNK_SIZE = 20; // 20 * 4 = 80 <= 80 params (dưới trần 100 bind params D1)
const ensuredRelationsDbs = new WeakSet<D1Database>();

export async function ensureShelfRelationsTable(db: D1Database): Promise<void> {
  if (ensuredRelationsDbs.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shelf_relations (
         source_shelf_key TEXT NOT NULL,
         target_shelf_key TEXT NOT NULL,
         relation_type TEXT NOT NULL CHECK (relation_type IN ('sequel', 'spinoff', 'same_universe')),
         created_at INTEGER NOT NULL,
         PRIMARY KEY (source_shelf_key, target_shelf_key),
         CHECK (source_shelf_key != target_shelf_key)
       )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_shelf_relations_target
       ON shelf_relations(target_shelf_key)`,
    ),
  ]);
  ensuredRelationsDbs.add(db);
}

function normalizeRelationEndpoint(raw: unknown, label: string): string {
  const clean = typeof raw === 'string' ? raw.normalize('NFC').trim() : '';
  if (!clean || clean.length > MAX_SHELF_NAME_LENGTH) {
    throw new HttpError(`${label} không hợp lệ.`, 400);
  }
  return toShelfAccessKey(clean);
}

function canonicalizeRelationInput(
  rawSourceKey: string,
  rawTargetKey: string,
  rawType: unknown,
): {
  sourceKey: string;
  targetKey: string;
  relationType: CanonicalShelfRelationType;
} {
  if (rawType === 'sequel' || rawType === 'spinoff') {
    return { sourceKey: rawSourceKey, targetKey: rawTargetKey, relationType: rawType };
  }
  if (rawType === 'prequel') {
    return { sourceKey: rawTargetKey, targetKey: rawSourceKey, relationType: 'sequel' };
  }
  if (rawType === 'main_story') {
    return { sourceKey: rawTargetKey, targetKey: rawSourceKey, relationType: 'spinoff' };
  }
  if (rawType === 'same_universe') {
    const [first, second] =
      rawSourceKey.localeCompare(rawTargetKey, 'vi') <= 0
        ? [rawSourceKey, rawTargetKey]
        : [rawTargetKey, rawSourceKey];
    return { sourceKey: first, targetKey: second, relationType: 'same_universe' };
  }
  throw new HttpError(
    'Loại liên kết không hợp lệ (chỉ nhận sequel, prequel, spinoff, main_story, same_universe).',
    400,
  );
}

export async function loadVisibleShelfRelations(
  db: D1Database,
  auth: AuthContext,
  existingShelfKeys: ReadonlySet<string>,
  guestLockedShelfKeys: ReadonlySet<string>,
): Promise<ShelfRelationDto[]> {
  await ensureShelfRelationsTable(db);
  const rows = await db
    .prepare(
      `SELECT source_shelf_key, target_shelf_key, relation_type, created_at
       FROM shelf_relations
       ORDER BY created_at ASC`,
    )
    .all<ShelfRelationRow>();

  const isGuest = auth.role === 'guest';
  const out: ShelfRelationDto[] = [];
  const seenPairs = new Set<string>();

  for (const row of rows.results || []) {
    const src = toShelfAccessKey(row.source_shelf_key);
    const dst = toShelfAccessKey(row.target_shelf_key);
    if (!src || !dst || src === dst) continue;
    if (!VALID_CANONICAL_TYPES.has(row.relation_type as CanonicalShelfRelationType)) continue;
    if (!existingShelfKeys.has(src) || !existingShelfKeys.has(dst)) continue;

    // D-030: Với Guest, ẩn sạch mọi liên kết nếu đầu nguồn hoặc đầu đích thuộc bộ bị khoá toàn phần
    if (isGuest && (guestLockedShelfKeys.has(src) || guestLockedShelfKeys.has(dst))) {
      continue;
    }

    const unorderedKey = src < dst ? `${src}\0${dst}` : `${dst}\0${src}`;
    if (seenPairs.has(unorderedKey)) continue;
    seenPairs.add(unorderedKey);

    out.push({
      sourceShelfKey: src,
      targetShelfKey: dst,
      relationType: row.relation_type as CanonicalShelfRelationType,
      createdAt: Number(row.created_at ?? 0),
    });
  }

  return out;
}

export async function upsertShelfRelation(db: D1Database, rawBody: unknown) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    sourceShelfName?: unknown;
    targetShelfName?: unknown;
    relationType?: unknown;
  } | null;

  const rawSourceKey = normalizeRelationEndpoint(body?.sourceShelfName, 'Tên bộ nguồn');
  const rawTargetKey = normalizeRelationEndpoint(body?.targetShelfName, 'Tên bộ đích');
  if (rawSourceKey === rawTargetKey) {
    throw new HttpError('Không thể liên kết một bộ truyện với chính nó.', 400);
  }

  const { sourceKey, targetKey, relationType } = canonicalizeRelationInput(
    rawSourceKey,
    rawTargetKey,
    body?.relationType,
  );

  await ensureShelfRelationsTable(db);
  const [srcExists, dstExists] = await Promise.all([
    shelfExistsInBooks(db, sourceKey),
    shelfExistsInBooks(db, targetKey),
  ]);
  if (!srcExists || !dstExists) {
    throw new HttpError('Cả hai bộ truyện cần liên kết đều phải tồn tại trong thư viện.', 404);
  }

  const [existingEdgeRes, srcCountRes, dstCountRes] = await db.batch([
    db
      .prepare(
        `SELECT 1 AS exists_flag FROM shelf_relations
         WHERE (source_shelf_key = ? AND target_shelf_key = ?)
            OR (source_shelf_key = ? AND target_shelf_key = ?)
         LIMIT 1`,
      )
      .bind(sourceKey, targetKey, targetKey, sourceKey),
    db
      .prepare(
        'SELECT COUNT(*) AS cnt FROM shelf_relations WHERE source_shelf_key = ? OR target_shelf_key = ?',
      )
      .bind(sourceKey, sourceKey),
    db
      .prepare(
        'SELECT COUNT(*) AS cnt FROM shelf_relations WHERE source_shelf_key = ? OR target_shelf_key = ?',
      )
      .bind(targetKey, targetKey),
  ]);
  const alreadyExists = Boolean(existingEdgeRes.results?.[0]);
  if (!alreadyExists) {
    const srcCount = Number((srcCountRes.results?.[0] as { cnt?: number } | undefined)?.cnt ?? 0);
    const dstCount = Number((dstCountRes.results?.[0] as { cnt?: number } | undefined)?.cnt ?? 0);
    if (srcCount >= MAX_RELATIONS_PER_SHELF || dstCount >= MAX_RELATIONS_PER_SHELF) {
      throw new HttpError(`Mỗi bộ truyện tối đa ${MAX_RELATIONS_PER_SHELF} liên kết.`, 400);
    }
  }

  const now = Date.now();
  await db.batch([
    db
      .prepare('DELETE FROM shelf_relations WHERE source_shelf_key = ? AND target_shelf_key = ?')
      .bind(targetKey, sourceKey),
    db
      .prepare(
        `INSERT INTO shelf_relations (source_shelf_key, target_shelf_key, relation_type, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(source_shelf_key, target_shelf_key) DO UPDATE SET
           relation_type = excluded.relation_type,
           created_at = excluded.created_at`,
      )
      .bind(sourceKey, targetKey, relationType, now),
  ]);

  return {
    ok: true,
    relation: {
      sourceShelfKey: sourceKey,
      targetShelfKey: targetKey,
      relationType,
      createdAt: now,
    } satisfies ShelfRelationDto,
  };
}

export async function deleteShelfRelation(
  db: D1Database,
  url: URL,
  rawBody: unknown,
) {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    sourceShelfName?: unknown;
    targetShelfName?: unknown;
  } | null;

  const srcParam = body?.sourceShelfName ?? url.searchParams.get('source');
  const dstParam = body?.targetShelfName ?? url.searchParams.get('target');
  const keyA = normalizeRelationEndpoint(srcParam, 'Tên bộ nguồn');
  const keyB = normalizeRelationEndpoint(dstParam, 'Tên bộ đích');

  await ensureShelfRelationsTable(db);
  await db
    .prepare(
      `DELETE FROM shelf_relations
       WHERE (source_shelf_key = ? AND target_shelf_key = ?)
          OR (source_shelf_key = ? AND target_shelf_key = ?)`,
    )
    .bind(keyA, keyB, keyB, keyA)
    .run();

  return { ok: true, sourceShelfKey: keyA, targetShelfKey: keyB };
}

function toUnorderedPairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/**
 * Tính danh sách cạnh cần chèn mới khi đổi tên/gộp kệ `oldKey` → `newKey` (D-046):
 * - Giữ nguyên các cạnh đã tồn tại trên `newKey`, không tạo cạnh ngược chiều trùng `(A,B)` + `(B,A)`.
 * - Chuẩn hoá lại thứ tự `same_universe` theo `localeCompare('vi') <= 0` và loại bỏ tự liên kết.
 */
export function computeMergedShelfRelationsOnRename(
  rows: readonly ShelfRelationRow[],
  oldKey: string,
  newKey: string,
): ShelfRelationRow[] {
  const normOld = toShelfAccessKey(oldKey);
  const normNew = toShelfAccessKey(newKey);
  if (!normOld || !normNew || normOld === normNew) return [];

  const occupiedPairs = new Set<string>();
  const migratingRows: ShelfRelationRow[] = [];

  for (const row of rows) {
    const src = toShelfAccessKey(row.source_shelf_key);
    const dst = toShelfAccessKey(row.target_shelf_key);
    if (!src || !dst || src === dst) continue;
    if (src === normOld || dst === normOld) {
      migratingRows.push(row);
    } else if (src === normNew || dst === normNew) {
      occupiedPairs.add(toUnorderedPairKey(src, dst));
    }
  }

  const rowsToInsert: ShelfRelationRow[] = [];
  for (const row of migratingRows) {
    const type = row.relation_type as CanonicalShelfRelationType;
    if (!VALID_CANONICAL_TYPES.has(type)) continue;
    const rawSrc = toShelfAccessKey(row.source_shelf_key);
    const rawDst = toShelfAccessKey(row.target_shelf_key);
    let nextSrc = rawSrc === normOld ? normNew : rawSrc;
    let nextDst = rawDst === normOld ? normNew : rawDst;
    if (!nextSrc || !nextDst || nextSrc === nextDst) continue;

    if (type === 'same_universe' && nextSrc.localeCompare(nextDst, 'vi') > 0) {
      [nextSrc, nextDst] = [nextDst, nextSrc];
    }

    const pairKey = toUnorderedPairKey(nextSrc, nextDst);
    if (occupiedPairs.has(pairKey)) continue;
    occupiedPairs.add(pairKey);

    rowsToInsert.push({
      source_shelf_key: nextSrc,
      target_shelf_key: nextDst,
      relation_type: type,
      created_at: Number(row.created_at ?? 0),
    });
  }

  return rowsToInsert;
}

export async function mergeShelfRelationsOnRename(
  db: D1Database,
  oldKey: string,
  newKey: string,
): Promise<void> {
  const normOld = toShelfAccessKey(oldKey);
  const normNew = toShelfAccessKey(newKey);
  if (!normOld || !normNew || normOld === normNew) return;
  await ensureShelfRelationsTable(db);

  const existingRes = await db
    .prepare(
      `SELECT source_shelf_key, target_shelf_key, relation_type, created_at
       FROM shelf_relations
       WHERE source_shelf_key IN (?, ?) OR target_shelf_key IN (?, ?)
       ORDER BY created_at ASC`,
    )
    .bind(normOld, normNew, normOld, normNew)
    .all<ShelfRelationRow>();

  const rowsToInsert = computeMergedShelfRelationsOnRename(
    existingRes.results || [],
    normOld,
    normNew,
  );

  const statements: D1PreparedStatement[] = [
    db
      .prepare('DELETE FROM shelf_relations WHERE source_shelf_key = ? OR target_shelf_key = ?')
      .bind(normOld, normOld),
  ];

  for (let i = 0; i < rowsToInsert.length; i += RELATION_INSERT_CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + RELATION_INSERT_CHUNK_SIZE);
    const valuesSql = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const r of chunk) {
      params.push(r.source_shelf_key, r.target_shelf_key, r.relation_type, r.created_at);
    }
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO shelf_relations (source_shelf_key, target_shelf_key, relation_type, created_at)
           VALUES ${valuesSql}`,
        )
        .bind(...params),
    );
  }

  await db.batch(statements);
}
