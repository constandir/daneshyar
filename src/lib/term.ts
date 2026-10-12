import { DAY, startOfDay } from './jalali';

/**
 * Are weekly classes held on this day? False before the term starts, after it ends
 * and on any day the user marked as a holiday. With no term dates set, always true.
 */
export function classActiveOn(settings: Record<string, any>, dayTs: number): boolean {
  const day = startOfDay(dayTs);
  const start = settings.termStart as number | null | undefined;
  const end = settings.termEnd as number | null | undefined;
  if (start && day < startOfDay(start)) return false;
  if (end && day >= startOfDay(end) + DAY) return false;
  const holidays = (settings.holidays as number[] | undefined) ?? [];
  return !holidays.some((h) => startOfDay(h) === day);
}
