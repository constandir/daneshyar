import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { list } from '../db/repo';
import { DAY, formatJalali, formatTime, startOfDay } from '../lib/jalali';
import { classActiveOn } from '../lib/term';

const isNative = Capacitor.isNativePlatform();

/** Deterministic positive 31-bit int from a string (Android notification ids must be ints). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483000;
}

/** fixed id so the pomodoro alarm can be cancelled and is never touched by rescheduleAll() */
export const POMODORO_ID = 2147483001;

export async function schedulePomodoroEnd(at: number) {
  if (!isNative) return;
  if (!(await ensurePermission())) return;
  await LocalNotifications.schedule({
    notifications: [{ id: POMODORO_ID, title: 'پومودورو تموم شد 🍅', body: 'یه استراحت کوتاه بکن.', schedule: { at: new Date(at), allowWhileIdle: true }, smallIcon: 'ic_stat_icon' }],
  });
}

export async function cancelPomodoro() {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id: POMODORO_ID }] });
}

export const REMIND_OPTIONS: { label: string; ms: number }[] = [
  { label: 'همان لحظه', ms: 0 },
  { label: '۱۰ دقیقه قبل', ms: 10 * 60e3 },
  { label: '۱ ساعت قبل', ms: 60 * 60e3 },
  { label: '۳ ساعت قبل', ms: 3 * 60 * 60e3 },
  { label: '۱ روز قبل', ms: DAY },
  { label: '۲ روز قبل', ms: 2 * DAY },
  { label: '۱ هفته قبل', ms: 7 * DAY },
];

export async function ensurePermission(): Promise<boolean> {
  if (!isNative) {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  }
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted') p = await LocalNotifications.requestPermissions(); // Android 13+: POST_NOTIFICATIONS
  return p.display === 'granted';
}

/** Android 12+: exact alarms need user consent. Returns false if we must fall back to inexact. */
export async function exactAlarmAllowed(): Promise<boolean> {
  if (!isNative) return true;
  try {
    const r = await LocalNotifications.checkExactNotificationSetting();
    return r.exact_alarm === 'granted';
  } catch {
    return true;
  }
}

export async function openExactAlarmSettings() {
  if (!isNative) return;
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    /* ignore */
  }
}

interface Planned {
  id: number;
  title: string;
  body: string;
  at: Date;
}

function planFor(kind: string, id: string, title: string, when: number, remind: number[], bodyPrefix: string): Planned[] {
  return remind.map((ms) => ({
    id: hash(`${kind}:${id}:${ms}`),
    title,
    body: `${bodyPrefix} • ${formatJalali(when)} ساعت ${formatTime(when)}`,
    at: new Date(when - ms),
  }));
}

/**
 * Rebuilds ALL notifications from the database. Called on app start, after any save/delete,
 * after restoring a backup and when the app resumes. Because it cancels + re-creates,
 * edits and deletions can never leave stale reminders (and a phone reboot is covered too:
 * the plugin re-registers pending alarms on boot, and opening the app re-syncs anything missed).
 */
export async function rescheduleAll(): Promise<number> {
  const now = Date.now();
  const [courses, sessions, assignments, presentations, exams, reminders] = await Promise.all([
    list<any>('courses'),
    list<any>('sessions'),
    list<any>('assignments'),
    list<any>('presentations'),
    list<any>('exams'),
    list<any>('reminders'),
  ]);
  const cname = (id: string | null) => courses.find((c) => c.id === id)?.name ?? '';
  const plans: Planned[] = [];

  for (const a of assignments) {
    if (a.due && a.status !== 'done') plans.push(...planFor('as', a.id, `تکلیف: ${a.title}`, a.due, a.remind, cname(a.course_id) || 'مهلت تحویل'));
  }
  for (const p of presentations) {
    if (p.date) plans.push(...planFor('pr', p.id, `ارائه: ${p.title}`, p.date, p.remind, cname(p.course_id) || 'ارائه'));
  }
  for (const e of exams) {
    plans.push(...planFor('ex', e.id, `امتحان: ${e.title}`, e.date, e.remind, `${cname(e.course_id)}${e.hall ? ' • ' + e.hall : ''}`));
  }
  for (const r of reminders) {
    if (r.done) continue;
    const step = r.repeat === 'daily' ? DAY : r.repeat === 'weekly' ? 7 * DAY : 0;
    if (!step) {
      if (r.at > now) plans.push({ id: hash('rm:' + r.id), title: r.title, body: r.body || 'یادآوری', at: new Date(r.at) });
      continue;
    }
    // repeating: schedule occurrences within the next 14 days
    let t = r.at;
    if (t < now) t += Math.ceil((now - t) / step) * step;
    for (let k = 0; k < 14 && t < now + 14 * DAY; k++, t += step) {
      plans.push({ id: hash(`rm:${r.id}:${t}`), title: r.title, body: r.body || 'یادآوری', at: new Date(t) });
    }
  }

  // Weekly class reminders: next 14 days, 15 minutes before start
  const settings = (await import('../db/repo')).getSettings;
  const s = await settings();
  const classMin = s.classRemindMin ?? 15;
  if (classMin >= 0) {
    for (const ss of sessions) {
      for (let i = 0; i < 14; i++) {
        const day = new Date(startOfDay(now) + i * DAY);
        if (day.getDay() !== ss.weekday || !classActiveOn(s, day.getTime())) continue;
        const [h, m] = ss.start.split(':').map(Number);
        day.setHours(h, m, 0, 0);
        const at = new Date(day.getTime() - classMin * 60e3);
        plans.push({
          id: hash(`cl:${ss.id}:${day.toDateString()}`),
          title: `کلاس ${cname(ss.course_id)}`,
          body: `ساعت ${formatTime(day.getTime())}${ss.room ? ' • ' + ss.room : ''}`,
          at,
        });
      }
    }
  }

  const future = plans.filter((p) => p.at.getTime() > now).sort((a, b) => a.at.getTime() - b.at.getTime());

  if (!isNative) return future.length; // browser: nothing is scheduled (dev only)

  const pending = await LocalNotifications.getPending();
  // keep the running pomodoro alarm; everything else is rebuilt from the database
  const stale = pending.notifications.filter((n) => n.id !== POMODORO_ID);
  if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
  if (!future.length) return 0;
  if (!(await ensurePermission())) return 0;

  // Android keeps a cap (~500 alarms) on pending notifications; take the soonest ones.
  const exact = await exactAlarmAllowed();
  await LocalNotifications.schedule({
    notifications: future.slice(0, 400).map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      schedule: { at: p.at, allowWhileIdle: exact },
      smallIcon: 'ic_stat_icon',
    })),
  });
  return Math.min(future.length, 400);
}
