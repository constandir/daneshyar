import { getDriver } from './registry';
import type { Row } from './driver';
import { TableName, TABLES } from './schema';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** columns that store JSON text */
const JSON_COLS = new Set(['subtasks', 'remind', 'members', 'checklist', 'tags']);

const COLS: Record<TableName, string[]> = {
  courses: ['id', 'name', 'teacher', 'units', 'room', 'online_link', 'color', 'term', 'max_absences', 'created_at'],
  sessions: ['id', 'course_id', 'weekday', 'start', 'end', 'room', 'created_at'],
  assignments: ['id', 'course_id', 'title', 'description', 'due', 'priority', 'status', 'link', 'subtasks', 'remind', 'created_at'],
  presentations: ['id', 'course_id', 'title', 'date', 'members', 'checklist', 'slide_link', 'note', 'remind', 'created_at'],
  exams: ['id', 'course_id', 'title', 'date', 'hall', 'topics', 'remind', 'created_at'],
  grades: ['id', 'course_id', 'term', 'score', 'units', 'created_at'],
  notes: ['id', 'course_id', 'title', 'body', 'tags', 'created_at', 'updated_at'],
  absences: ['id', 'course_id', 'date', 'kind', 'created_at'],
  reminders: ['id', 'title', 'body', 'at', 'repeat', 'done', 'created_at'],
  resources: ['id', 'course_id', 'title', 'url', 'created_at'],
  study_logs: ['id', 'course_id', 'minutes', 'day', 'created_at'],
};

function decode(r: Row): Row {
  const o: Row = { ...r };
  for (const k of Object.keys(o)) {
    if (JSON_COLS.has(k) && typeof o[k] === 'string') {
      try {
        o[k] = JSON.parse(o[k]);
      } catch {
        o[k] = [];
      }
    }
  }
  return o;
}

function encode(v: any, col: string) {
  if (JSON_COLS.has(col)) return JSON.stringify(v ?? []);
  return v === undefined ? null : v;
}

export async function list<T = any>(t: TableName): Promise<T[]> {
  const d = await getDriver();
  return (await d.query(`SELECT * FROM ${t}`)).map(decode) as T[];
}

export async function save(t: TableName, item: Row): Promise<Row> {
  const d = await getDriver();
  const now = Date.now();
  const row = { ...item };
  if (!row.id) row.id = uid();
  if (!row.created_at) row.created_at = now;
  if (t === 'notes') row.updated_at = now;
  const cols = COLS[t];
  await d.run(
    `INSERT OR REPLACE INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
    cols.map((c) => encode(row[c], c)),
  );
  return row;
}

export async function remove(t: TableName, id: string) {
  const d = await getDriver();
  await d.run(`DELETE FROM ${t} WHERE id = ?`, [id]);
}

// ---- settings (key/value) ----
export async function getSettings(): Promise<Record<string, any>> {
  const d = await getDriver();
  const rows = await d.query('SELECT * FROM settings');
  const o: Record<string, any> = {};
  rows.forEach((r) => {
    try {
      o[r.key] = JSON.parse(r.value);
    } catch {
      o[r.key] = r.value;
    }
  });
  return o;
}

export async function setSetting(key: string, value: any) {
  const d = await getDriver();
  await d.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [key, JSON.stringify(value)]);
}

// ---- whole-database snapshot for backup / restore ----
export async function exportAll() {
  const data: Record<string, any[]> = {};
  for (const t of TABLES) data[t] = await list(t);
  return { data, settings: await getSettings() };
}

export async function importAll(data: Record<string, Row[]>, settings: Record<string, any>) {
  const d = await getDriver();
  const stmts: { sql: string; params?: any[] }[] = [];
  // children first so foreign keys never complain
  for (const t of [...TABLES].reverse()) stmts.push({ sql: `DELETE FROM ${t}` });
  stmts.push({ sql: 'DELETE FROM settings' });
  for (const t of TABLES) {
    const cols = COLS[t];
    for (const row of data[t] ?? []) {
      stmts.push({
        sql: `INSERT OR REPLACE INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
        params: cols.map((c) => encode(row[c], c)),
      });
    }
  }
  for (const [k, v] of Object.entries(settings))
    stmts.push({ sql: 'INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', params: [k, JSON.stringify(v)] });
  await d.transaction(stmts);
}

export const COLUMNS = COLS;
