import { useEffect, useState } from 'preact/hooks';
import { getSettings, list, remove, save, setSetting } from './db/repo';
import { TableName, TABLES } from './db/schema';
import { rescheduleAll } from './services/notify';

export interface Course { id: string; name: string; teacher?: string; units: number; room?: string; online_link?: string; color: string; term?: string; max_absences: number; created_at: number }
export interface Session { id: string; course_id: string; weekday: number; start: string; end: string; room?: string }
export interface Subtask { t: string; done: boolean }
export interface Assignment { id: string; course_id: string | null; title: string; description?: string; due: number | null; priority: number; status: 'todo' | 'doing' | 'done'; link?: string; subtasks: Subtask[]; remind: number[]; created_at: number }
export interface Presentation { id: string; course_id: string | null; title: string; date: number | null; members: string[]; checklist: Subtask[]; slide_link?: string; note?: string; remind: number[] }
export interface Exam { id: string; course_id: string | null; title: string; date: number; hall?: string; topics?: string; remind: number[] }
export interface Grade { id: string; course_id: string; term: string; score: number | null; units: number }
export interface Note { id: string; course_id: string | null; title: string; body?: string; tags: string[]; updated_at: number }
export interface Absence { id: string; course_id: string; date: number; kind: string }
export interface Reminder { id: string; title: string; body?: string; at: number; repeat: string; done: number }
export interface Resource { id: string; course_id: string | null; title: string; url?: string }
export interface StudyLog { id: string; course_id: string | null; minutes: number; day: number }

export interface State {
  ready: boolean;
  courses: Course[];
  sessions: Session[];
  assignments: Assignment[];
  presentations: Presentation[];
  exams: Exam[];
  grades: Grade[];
  notes: Note[];
  absences: Absence[];
  reminders: Reminder[];
  resources: Resource[];
  study_logs: StudyLog[];
  settings: Record<string, any>;
}

let state: State = {
  ready: false, courses: [], sessions: [], assignments: [], presentations: [], exams: [],
  grades: [], notes: [], absences: [], reminders: [], resources: [], study_logs: [], settings: {},
};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function useStore(): State {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return state;
}

export async function load() {
  const next: any = { ...state };
  for (const t of TABLES) next[t] = await list(t);
  next.settings = await getSettings();
  next.ready = true;
  state = next;
  emit();
}

let timer: any;
function scheduleNotifications() {
  clearTimeout(timer);
  timer = setTimeout(() => { rescheduleAll().catch(console.error); }, 400);
}

export async function saveItem(t: TableName, item: Record<string, any>) {
  const row = await save(t, item);
  await load();
  scheduleNotifications();
  return row;
}

export async function deleteItem(t: TableName, id: string) {
  await remove(t, id);
  await load();
  scheduleNotifications();
}

export async function updateSetting(key: string, value: any) {
  await setSetting(key, value);
  state = { ...state, settings: { ...state.settings, [key]: value } };
  emit();
  if (['classRemindMin', 'termStart', 'termEnd', 'holidays'].includes(key)) scheduleNotifications();
}

export const reloadAndReschedule = async () => { await load(); await rescheduleAll(); };

export const courseOf = (id: string | null | undefined) => state.courses.find((c) => c.id === id);
