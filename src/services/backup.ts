import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { exportAll, importAll } from '../db/repo';
import { SCHEMA_VERSION } from '../db/schema';
import { APP_ID, ParsedBackup } from './backupFormat';

export { parseBackup } from './backupFormat';
export type { ParsedBackup } from './backupFormat';

export async function buildBackup(): Promise<string> {
  const { data, settings } = await exportAll();
  return JSON.stringify({ app: APP_ID, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data, settings }, null, 2);
}

export function backupFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `daneshyar-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** Writes the backup to the app's Documents folder and (native) opens the Android share sheet. */
export async function exportBackup(): Promise<string> {
  const json = await buildBackup();
  const name = backupFileName();
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  }
  const res = await Filesystem.writeFile({
    path: `Daneshyar/${name}`,
    data: json,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    await Share.share({ title: 'بکاپ دانشیار', text: name, url: res.uri, dialogTitle: 'ذخیره یا ارسال بکاپ' });
  } catch {
    /* user closed the share sheet – file is still saved */
  }
  return `Documents/Daneshyar/${name}`;
}

export async function restoreBackup(p: ParsedBackup) {
  await importAll(p.data, p.settings);
}

/** Auto backup: keeps the last 5 files in Documents/Daneshyar/auto (native only). */
export async function autoBackup() {
  if (!Capacitor.isNativePlatform()) return;
  const json = await buildBackup();
  const name = `auto-${backupFileName()}`;
  await Filesystem.writeFile({ path: `Daneshyar/auto/${name}`, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
  const dir = await Filesystem.readdir({ path: 'Daneshyar/auto', directory: Directory.Documents });
  const files = dir.files.map((f) => f.name).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 5))) {
    await Filesystem.deleteFile({ path: `Daneshyar/auto/${f}`, directory: Directory.Documents });
  }
}
