// Runs the REAL schema/migrations and the repo's REAL SQL against SQLite (node:sqlite),
// so a typo in a column name or a broken restore is caught in CI instead of on the phone.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, test } from 'node:test';
import type { Driver } from '../src/db/driver';
import { COLUMNS, exportAll, importAll, list, remove, save, setSetting, getSettings } from '../src/db/repo';
import { setDriver } from '../src/db/registry';
import { SCHEMA_VERSION, TABLES, migrations } from '../src/db/schema';
import { parseBackup } from '../src/services/backupFormat';
import { byTerm, neededAverage, weighted } from '../src/lib/gpa';
import { DAY, startOfDay, toGregorian, toJalali } from '../src/lib/jalali';
import { classActiveOn } from '../src/lib/term';

function openDb(): { db: DatabaseSync; driver: Driver } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  // same loop as openNative()
  const ver = (db.prepare('PRAGMA user_version').get() as any).user_version as number;
  for (let v = ver; v < migrations.length; v++) {
    db.exec('BEGIN');
    for (const stmt of migrations[v]) db.exec(stmt);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  }
  const driver: Driver = {
    async query(sql, params = []) {
      return db.prepare(sql).all(...params) as any[];
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...params);
    },
    async transaction(stmts) {
      db.exec('BEGIN');
      try {
        for (const s of stmts) db.prepare(s.sql).run(...(s.params ?? []));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db, driver };
}

let db: DatabaseSync;
beforeEach(() => {
  const o = openDb();
  db = o.db;
  setDriver(o.driver);
});

describe('schema', () => {
  test('migrations set user_version and are not re-run', () => {
    assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version, SCHEMA_VERSION);
  });

  test('every column the repo writes exists in its table (and vice versa)', () => {
    for (const t of TABLES) {
      const real = (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name).sort();
      assert.deepEqual([...COLUMNS[t]].sort(), real, `column mismatch in ${t}`);
    }
  });
});

describe('repo', () => {
  test('JSON columns round-trip and defaults apply', async () => {
    const c: any = await save('courses', { name: 'ریاضی ۱', units: 3, color: '#fff', max_absences: 4 });
    await save('assignments', { course_id: c.id, title: 'تمرین ۱', due: Date.now(), priority: 2, status: 'todo', subtasks: [{ t: 'الف', done: true }], remind: [DAY, 3600000] });
    const [a] = await list<any>('assignments');
    assert.deepEqual(a.subtasks, [{ t: 'الف', done: true }]);
    assert.deepEqual(a.remind, [DAY, 3600000]);
    assert.equal(a.title, 'تمرین ۱');
  });

  test('save with an existing id replaces the row', async () => {
    const r: any = await save('reminders', { title: 'a', at: 1, repeat: 'none', done: 0 });
    await save('reminders', { ...r, title: 'b' });
    const rows = await list<any>('reminders');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'b');
  });

  test('deleting a course cascades / nulls related rows', async () => {
    const c: any = await save('courses', { name: 'فیزیک', units: 3, color: '#000', max_absences: 4 });
    await save('sessions', { course_id: c.id, weekday: 6, start: '08:00', end: '10:00' });
    await save('grades', { course_id: c.id, term: '1405-1', score: 17, units: 3 });
    await save('absences', { course_id: c.id, date: 1, kind: 'unexcused' });
    await save('resources', { course_id: c.id, title: 'کتاب' });
    await save('assignments', { course_id: c.id, title: 'hw', priority: 1, status: 'todo' });
    await save('exams', { course_id: c.id, title: 'میان‌ترم', date: 5 });
    await remove('courses', c.id);
    for (const t of ['sessions', 'grades', 'absences', 'resources'] as const) assert.equal((await list(t)).length, 0, t);
    assert.equal((await list<any>('assignments'))[0].course_id, null);
    assert.equal((await list<any>('exams'))[0].course_id, null);
  });

  test('settings round-trip any JSON value', async () => {
    await setSetting('holidays', [1, 2, 3]);
    await setSetting('pomo', null);
    const s = await getSettings();
    assert.deepEqual(s.holidays, [1, 2, 3]);
    assert.equal(s.pomo, null);
  });
});

describe('backup / restore', () => {
  async function seed() {
    const c: any = await save('courses', { name: 'ریاضی', units: 3, color: '#123', max_absences: 4 });
    await save('sessions', { course_id: c.id, weekday: 0, start: '10:00', end: '12:00' });
    await save('assignments', { course_id: c.id, title: 'hw', due: 100, priority: 0, status: 'doing', subtasks: [{ t: 'x', done: false }], remind: [60000] });
    await save('presentations', { course_id: c.id, title: 'ارائه', date: 9, members: ['علی', 'سارا'], checklist: [{ t: 'اسلاید', done: true }], remind: [] });
    await save('notes', { course_id: c.id, title: 'n', body: 'متن', tags: ['مهم'] });
    await save('grades', { course_id: c.id, term: '1405-1', score: 18.5, units: 3 });
    await setSetting('termStart', 123);
  }

  test('export → import into a fresh database is lossless', async () => {
    await seed();
    const snap = await exportAll();
    const text = JSON.stringify({ app: 'daneshyar', schema: SCHEMA_VERSION, data: snap.data, settings: snap.settings });

    const o = openDb();
    setDriver(o.driver);
    const parsed = parseBackup(text);
    await importAll(parsed.data, parsed.settings);
    const again = await exportAll();
    assert.deepEqual(again, snap);
  });

  test('restore replaces existing data instead of merging', async () => {
    await seed();
    const snap = await exportAll();
    await save('courses', { name: 'اضافه', units: 1, color: '#000', max_absences: 1 });
    await importAll(snap.data, snap.settings);
    const names = (await list<any>('courses')).map((c) => c.name);
    assert.deepEqual(names, ['ریاضی']);
  });

  test('a broken restore rolls back and keeps the old data', async () => {
    await seed();
    const bad: any = { courses: [{ id: 'x', name: 'x', units: 1, color: 'c', max_absences: 1, created_at: 1 }], grades: [{ id: 'g', course_id: 'does-not-exist', term: 't', units: 1, created_at: 1 }] };
    await assert.rejects(importAll(bad, {}));
    assert.equal((await list<any>('courses'))[0].name, 'ریاضی');
  });

  test('parseBackup rejects bad files with a Persian message', () => {
    assert.throws(() => parseBackup('not json'), /JSON/);
    assert.throws(() => parseBackup(JSON.stringify({ app: 'other', schema: 1, data: {} })), /دانشیار/);
    assert.throws(() => parseBackup(JSON.stringify({ app: 'daneshyar', schema: SCHEMA_VERSION + 1, data: {} })), /جدیدتری/);
    assert.throws(() => parseBackup(JSON.stringify({ app: 'daneshyar', schema: 1, data: { courses: [{ name: 'no id' }] } })), /نامعتبر/);
    assert.equal(parseBackup(JSON.stringify({ app: 'daneshyar', schema: 1, data: {} })).counts.courses, 0);
  });
});

describe('logic', () => {
  test('jalali conversion: known dates and round-trip', () => {
    const j = toJalali(new Date(2026, 9, 12));
    assert.deepEqual([j.jy, j.jm, j.jd], [1405, 7, 20]);
    assert.deepEqual(Object.values(toJalali(new Date(2026, 2, 21))), [1405, 1, 1]);
    for (let i = 0; i < 4000; i++) {
      const d = new Date(2015, 0, 1 + i);
      const x = toJalali(d);
      assert.equal(toGregorian(x.jy, x.jm, x.jd).getTime(), d.getTime());
    }
  });

  test('GPA is unit-weighted and ignores ungraded courses', () => {
    const g: any[] = [
      { term: 'a', score: 20, units: 3 },
      { term: 'a', score: 10, units: 1 },
      { term: 'b', score: null, units: 3 },
    ];
    assert.equal(weighted(g).gpa, 17.5);
    assert.equal(weighted(g).units, 4);
    assert.deepEqual(byTerm(g).map((t) => t.term), ['a', 'b']);
    // target 18 over 4 + 4 units: need (18*8 - 17.5*4)/4 = 18.5
    assert.equal(neededAverage(g, 4, 18), 18.5);
  });

  test('classes respect term dates and holidays', () => {
    const day = (n: number) => startOfDay(new Date(2026, 9, 1).getTime() + n * DAY);
    assert.equal(classActiveOn({}, day(0)), true);
    const s = { termStart: day(2), termEnd: day(10), holidays: [day(5)] };
    assert.equal(classActiveOn(s, day(1)), false); // before term
    assert.equal(classActiveOn(s, day(2)), true);
    assert.equal(classActiveOn(s, day(5)), false); // holiday
    assert.equal(classActiveOn(s, day(10)), true); // last day counts
    assert.equal(classActiveOn(s, day(11)), false); // after term
  });
});
