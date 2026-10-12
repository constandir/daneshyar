import { SCHEMA_VERSION, TABLES } from '../db/schema';

export const APP_ID = 'daneshyar';

export interface ParsedBackup {
  data: Record<string, any[]>;
  settings: Record<string, any>;
  counts: Record<string, number>;
}

/** Validates the JSON structure before anything is touched. Throws a Persian error message. */
export function parseBackup(text: string): ParsedBackup {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('فایل معتبر نیست (JSON خراب است).');
  }
  if (!obj || obj.app !== APP_ID) throw new Error('این فایل بکاپ دانشیار نیست.');
  if (typeof obj.schema !== 'number' || obj.schema > SCHEMA_VERSION) throw new Error('این بکاپ از نسخه جدیدتری از برنامه است. ابتدا برنامه را به‌روز کنید.');
  if (!obj.data || typeof obj.data !== 'object') throw new Error('داده‌ای در فایل پیدا نشد.');
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = obj.data[t] ?? [];
    if (!Array.isArray(rows)) throw new Error(`بخش «${t}» نامعتبر است.`);
    for (const r of rows) if (!r || typeof r.id !== 'string') throw new Error(`ردیف نامعتبر در «${t}».`);
    counts[t] = rows.length;
  }
  return { data: obj.data, settings: obj.settings ?? {}, counts };
}

