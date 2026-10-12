// Schema + migrations. Each migration runs once, in order; user_version tracks progress.
// NEVER edit an old migration after release: append a new one instead.

export const TABLES = [
  'courses',
  'sessions',
  'assignments',
  'presentations',
  'exams',
  'grades',
  'notes',
  'absences',
  'reminders',
  'resources',
  'study_logs',
] as const;
export type TableName = (typeof TABLES)[number];

export const migrations: string[][] = [
  // v1
  [
    `CREATE TABLE IF NOT EXISTS courses(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, teacher TEXT, units INTEGER NOT NULL DEFAULT 3,
      room TEXT, online_link TEXT, color TEXT, term TEXT, max_absences INTEGER NOT NULL DEFAULT 4,
      created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions(
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, room TEXT,
      created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS assignments(
      id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL, description TEXT, due INTEGER, priority INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'todo', link TEXT, subtasks TEXT NOT NULL DEFAULT '[]',
      remind TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS presentations(
      id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL, date INTEGER, members TEXT NOT NULL DEFAULT '[]',
      checklist TEXT NOT NULL DEFAULT '[]', slide_link TEXT, note TEXT,
      remind TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS exams(
      id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL, date INTEGER NOT NULL, hall TEXT, topics TEXT,
      remind TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS grades(
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      term TEXT NOT NULL, score REAL, units INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS notes(
      id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL, body TEXT, tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS absences(
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      date INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'unexcused', created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS reminders(
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, at INTEGER NOT NULL,
      repeat TEXT NOT NULL DEFAULT 'none', done INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS resources(
      id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL, url TEXT, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS study_logs(
      id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      minutes INTEGER NOT NULL, day INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id)`,
    `CREATE INDEX IF NOT EXISTS idx_assign_due ON assignments(due)`,
    `CREATE INDEX IF NOT EXISTS idx_assign_course ON assignments(course_id)`,
    `CREATE INDEX IF NOT EXISTS idx_exams_date ON exams(date)`,
    `CREATE INDEX IF NOT EXISTS idx_abs_course ON absences(course_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notes_course ON notes(course_id)`,
  ],
];

export const SCHEMA_VERSION = migrations.length;
