import type { Grade } from '../store';

export interface TermStat { term: string; gpa: number; units: number }

/** weighted average (score × units) / units – only graded courses count */
export function weighted(grades: Grade[]): { gpa: number; units: number } {
  const g = grades.filter((x) => x.score !== null && x.score !== undefined && !Number.isNaN(x.score));
  const units = g.reduce((s, x) => s + x.units, 0);
  if (!units) return { gpa: 0, units: 0 };
  return { gpa: g.reduce((s, x) => s + (x.score as number) * x.units, 0) / units, units };
}

export function byTerm(grades: Grade[]): TermStat[] {
  const terms = [...new Set(grades.map((g) => g.term))].sort();
  return terms.map((t) => ({ term: t, ...weighted(grades.filter((g) => g.term === t)) }));
}

/** What average do I need in `nextUnits` more units to reach `target` overall? */
export function neededAverage(grades: Grade[], nextUnits: number, target: number): number | null {
  const { gpa, units } = weighted(grades);
  if (!nextUnits) return null;
  return (target * (units + nextUnits) - gpa * units) / nextUnits;
}
