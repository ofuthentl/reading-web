import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export interface MockD1PreparedStatement {
  bind: (...params: unknown[]) => MockD1PreparedStatement;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[]; success: boolean }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
  _sql: string;
  _params: unknown[];
}

export interface MockD1Database {
  raw: DatabaseSync;
  prepare: (sql: string) => MockD1PreparedStatement;
  batch: (
    stmts: MockD1PreparedStatement[],
  ) => Promise<Array<{ results: Record<string, unknown>[]; success: boolean; meta: { changes: number } }>>;
  close: () => void;
}

const MAX_D1_BIND_PARAMS = 100;

function clonePlainRow(row: unknown): Record<string, unknown> {
  return { ...(row as Record<string, unknown>) };
}

function normalizeSqlParams(params: unknown[]): SQLInputValue[] {
  if (params.length > MAX_D1_BIND_PARAMS) {
    throw new Error(`D1 bind parameter cap exceeded: ${params.length} > ${MAX_D1_BIND_PARAMS}`);
  }
  return params.map((p) => (p === undefined ? null : (p as SQLInputValue)));
}

export function createMockD1Database(schemaSql?: string): MockD1Database {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  if (schemaSql) {
    raw.exec(schemaSql);
  }

  const executeStatement = (sql: string, params: unknown[]) => {
    const bound = normalizeSqlParams(params);
    const trimmed = sql.trim().toUpperCase();
    const returnsRows =
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('PRAGMA') ||
      trimmed.includes('RETURNING');

    const stmt = raw.prepare(sql);
    if (returnsRows) {
      const rows = stmt.all(...bound).map(clonePlainRow);
      return { results: rows, success: true, meta: { changes: rows.length } };
    }
    const info = stmt.run(...bound);
    return {
      results: [] as Record<string, unknown>[],
      success: true,
      meta: { changes: Number(info.changes ?? 0) },
    };
  };

  const makeStmt = (sql: string, params: unknown[] = []): MockD1PreparedStatement => ({
    _sql: sql,
    _params: params,
    bind(...nextParams: unknown[]) {
      return makeStmt(sql, nextParams);
    },
    async first<T = Record<string, unknown>>() {
      const res = executeStatement(sql, params);
      return (res.results[0] as T | undefined) ?? null;
    },
    async all<T = Record<string, unknown>>() {
      const res = executeStatement(sql, params);
      return { results: res.results as T[], success: true };
    },
    async run() {
      const res = executeStatement(sql, params);
      return { success: true, meta: res.meta };
    },
  });

  return {
    raw,
    prepare(sql: string) {
      return makeStmt(sql);
    },
    async batch(stmts: MockD1PreparedStatement[]) {
      raw.exec('BEGIN IMMEDIATE;');
      try {
        const out = stmts.map((st) => executeStatement(st._sql, st._params));
        raw.exec('COMMIT;');
        return out;
      } catch (err) {
        try {
          raw.exec('ROLLBACK;');
        } catch {
          // ignore rollback error
        }
        throw err;
      }
    },
    close() {
      raw.close();
    },
  };
}
