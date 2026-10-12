import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { migrations, TABLES } from './schema';

export type Row = Record<string, any>;

/** Minimal storage interface so the UI is independent of the engine. */
export interface Driver {
  query(sql: string, params?: any[]): Promise<Row[]>;
  run(sql: string, params?: any[]): Promise<void>;
  /** replace everything (used by restore): runs inside one transaction */
  transaction(stmts: { sql: string; params?: any[] }[]): Promise<void>;
}

const DB_NAME = 'daneshyar';

/** Real SQLite on the device (Android). */
class NativeDriver implements Driver {
  constructor(private db: SQLiteDBConnection) {}
  async query(sql: string, params: any[] = []) {
    const r = await this.db.query(sql, params);
    return (r.values ?? []) as Row[];
  }
  async run(sql: string, params: any[] = []) {
    await this.db.run(sql, params, false);
  }
  async transaction(stmts: { sql: string; params?: any[] }[]) {
    await this.db.executeSet(
      stmts.map((s) => ({ statement: s.sql, values: s.params ?? [] })),
      true,
    );
  }
}

/**
 * Browser fallback (npm run dev only): keeps rows in localStorage and
 * understands just the handful of statements Repo emits. Not used on Android.
 */
class WebDriver implements Driver {
  private key = 'daneshyar_web_db';
  private load(): Record<string, Row[]> {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '{}');
    } catch {
      return {};
    }
  }
  private save(d: Record<string, Row[]>) {
    localStorage.setItem(this.key, JSON.stringify(d));
  }
  private apply(d: Record<string, Row[]>, sql: string, p: any[]) {
    let m: RegExpMatchArray | null;
    if ((m = sql.match(/^INSERT OR REPLACE INTO (\w+)\(([^)]+)\)/))) {
      const t = m[1];
      const cols = m[2].split(',').map((s) => s.trim());
      const row: Row = {};
      cols.forEach((c, i) => (row[c] = p[i]));
      const pk = t === 'settings' ? 'key' : 'id';
      d[t] = (d[t] || []).filter((r) => r[pk] !== row[pk]);
      d[t].push(row);
    } else if ((m = sql.match(/^DELETE FROM (\w+) WHERE (\w+) = \?/))) {
      d[m[1]] = (d[m[1]] || []).filter((r) => r[m![2]] !== p[0]);
      // emulate ON DELETE CASCADE / SET NULL for course removal
      if (m[1] === 'courses') {
        for (const t of ['sessions', 'grades', 'absences', 'resources']) {
          d[t] = (d[t] || []).filter((r) => r.course_id !== p[0]);
        }
        for (const t of ['assignments', 'presentations', 'exams', 'notes', 'study_logs']) {
          (d[t] || []).forEach((r) => {
            if (r.course_id === p[0]) r.course_id = null;
          });
        }
      }
    } else if ((m = sql.match(/^DELETE FROM (\w+)$/))) {
      d[m[1]] = [];
    }
  }
  async query(sql: string) {
    const m = sql.match(/FROM (\w+)/);
    return m ? [...(this.load()[m[1]] || [])] : [];
  }
  async run(sql: string, params: any[] = []) {
    const d = this.load();
    this.apply(d, sql, params);
    this.save(d);
  }
  async transaction(stmts: { sql: string; params?: any[] }[]) {
    const d = this.load();
    stmts.forEach((s) => this.apply(d, s.sql, s.params ?? []));
    this.save(d);
  }
}

async function openNative(): Promise<Driver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  const db =
    consistent && exists
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();
  await db.execute('PRAGMA foreign_keys = ON;', false);

  // run pending migrations
  const ver = (await db.query('PRAGMA user_version;')).values?.[0]?.user_version ?? 0;
  for (let v = ver; v < migrations.length; v++) {
    await db.executeSet(
      migrations[v].map((statement) => ({ statement, values: [] })),
      true,
    );
    await db.execute(`PRAGMA user_version = ${v + 1};`, false);
  }
  return new NativeDriver(db);
}

export async function createDriver(): Promise<Driver> {
  return Capacitor.isNativePlatform() ? await openNative() : new WebDriver();
}

export { TABLES };
