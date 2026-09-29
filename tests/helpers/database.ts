import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';

// Executes the actual D1 SQL with SQLite transactions, including rollback of a failed CAS.
export function database(trace?: (sql: string, values: (string | number)[]) => void) {
  const sqlite = new DatabaseSync(':memory:');
  class Statement {
    values: (string | number)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: (string | number)[]) { this.values = values; return this; }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.values), success: true, meta: {} }; }
  }
  const db = {
    prepare(sql: string) { return new Statement(sql); },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(s => { trace?.(s.sql, s.values); return { results: sqlite.prepare(s.sql).all(...s.values), success: true, meta: {} }; });
        sqlite.exec('COMMIT'); return result;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  } as unknown as D1Database;
  return db;
}
