// Jalali (Persian) calendar conversion. Algorithm follows the well-known jalaali-js implementation.

const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

function jalCal(jy: number) {
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jm = 0;
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let jd: number;
  let jm: number;
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export interface JDate {
  jy: number;
  jm: number;
  jd: number;
}

export const toJalali = (d: Date): JDate => d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));

export function toGregorian(jy: number, jm: number, jd: number): Date {
  const g = d2g(j2d(jy, jm, jd));
  return new Date(g.gy, g.gm - 1, g.gd);
}

export const isJalaliLeap = (jy: number) => jalCal(jy).leap === 0;

export const jalaliMonthLength = (jy: number, jm: number) =>
  jm <= 6 ? 31 : jm <= 11 ? 30 : isJalaliLeap(jy) ? 30 : 29;

export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
/** index = JS getDay() (0 = Sunday) */
export const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
/** Persian week order: Saturday first. Values are JS getDay() numbers. */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
export const WEEKDAY_NAME = (jsDay: number) => ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'][jsDay];

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const faNum = (n: number | string) => String(n).replace(/\d/g, (d) => FA_DIGITS[+d]);
export const enNum = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatJalali(ts: number | Date, withGregorian = false): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  const j = toJalali(d);
  let s = `${faNum(j.jd)} ${MONTHS[j.jm - 1]} ${faNum(j.jy)}`;
  if (withGregorian) s += ` (${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())})`;
  return s;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return faNum(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
}

export const startOfDay = (ts: number | Date) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const DAY = 86400000;

/** Human friendly distance: «۳ روز دیگر», «امروز», «۲ روز پیش» */
export function relativeDays(ts: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(ts) - startOfDay(now)) / DAY);
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'فردا';
  if (diff === -1) return 'دیروز';
  return diff > 0 ? `${faNum(diff)} روز دیگر` : `${faNum(-diff)} روز پیش`;
}

/** value for <input type=date>-like pickers: we use our own jalali picker so keep it as timestamps */
export function mergeDateTime(dayTs: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(dayTs);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}
