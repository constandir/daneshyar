import { useState } from 'preact/hooks';
import { WEEKDAY_NAME, WEEK_ORDER, faNum } from '../lib/jalali';
import { Course, Session, courseOf, deleteItem, saveItem, useStore } from '../store';
import { Empty, Field, Sheet, confirmDo, num } from '../ui';

const COLORS = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#db2777', '#0d9488'];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** returns the sessions overlapping with `s` on the same weekday */
export function conflicts(s: Pick<Session, 'weekday' | 'start' | 'end' | 'id'>, all: Session[]) {
  return all.filter((o) => o.id !== s.id && o.weekday === s.weekday && toMin(o.start) < toMin(s.end) && toMin(s.start) < toMin(o.end));
}

export function Schedule() {
  const { courses, sessions } = useStore();
  const [tab, setTab] = useState<'week' | 'courses'>('week');
  const [edit, setEdit] = useState<Partial<Course> | null>(null);
  const today = new Date().getDay();
  return (
    <div class="page">
      <h1>برنامه و درس‌ها</h1>
      <div class="seg">
        <button class={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>برنامه هفتگی</button>
        <button class={tab === 'courses' ? 'on' : ''} onClick={() => setTab('courses')}>درس‌ها</button>
      </div>
      {tab === 'week' && (
        <div class="week">
          {WEEK_ORDER.map((wd) => {
            const list = sessions.filter((s) => s.weekday === wd).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <div class="card" style={wd === today ? 'border-color:var(--pri)' : ''}>
                <b>{WEEKDAY_NAME(wd)}{wd === today ? ' (امروز)' : ''}</b>
                {!list.length && <div class="sub">کلاسی نیست</div>}
                {list.map((s) => {
                  const c = courseOf(s.course_id);
                  const clash = conflicts(s, sessions).length > 0;
                  return (
                    <div class="row" style="margin-top:8px" onClick={() => c && setEdit(c)}>
                      <span class="dot" style={`background:${c?.color}`} />
                      <div class="grow">
                        <div class="title">{c?.name}</div>
                        <div class="sub">{faNum(s.start)} تا {faNum(s.end)}{s.room || c?.room ? ' • ' + (s.room || c?.room) : ''}{c?.teacher ? ' • ' + c.teacher : ''}</div>
                      </div>
                      {clash && <span class="badge late">تداخل</span>}
                      {c?.online_link && <a class="badge" href={c.online_link} target="_blank" onClick={(e) => e.stopPropagation()}>آنلاین</a>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {tab === 'courses' && (
        <>
          {!courses.length && <Empty text="هنوز درسی اضافه نکردی. با دکمه + شروع کن." />}
          {courses.map((c) => (
            <div class="card click row" onClick={() => setEdit(c)}>
              <span class="dot" style={`background:${c.color}`} />
              <div class="grow">
                <div class="title">{c.name}</div>
                <div class="sub">{c.teacher || 'بدون استاد'} • {faNum(c.units)} واحد{c.term ? ' • ترم ' + c.term : ''}</div>
              </div>
            </div>
          ))}
        </>
      )}
      <button class="fab" onClick={() => setEdit({ color: COLORS[courses.length % COLORS.length], units: 3, max_absences: 4 })}>+</button>
      {edit && <CourseForm init={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CourseForm({ init, onClose }: { init: Partial<Course>; onClose: () => void }) {
  const { sessions, settings } = useStore();
  const [c, setC] = useState<Partial<Course>>({ term: settings.currentTerm, ...init });
  const [ss, setSs] = useState<Partial<Session>[]>(sessions.filter((s) => s.course_id === init.id));
  const [err, setErr] = useState('');
  const set = (k: keyof Course, v: any) => setC({ ...c, [k]: v });

  async function submit() {
    if (!c.name?.trim()) return setErr('نام درس را وارد کن.');
    const row: any = await saveItem('courses', { ...c, name: c.name.trim(), units: c.units || 3, max_absences: c.max_absences ?? 4 });
    const old = sessions.filter((s) => s.course_id === row.id);
    for (const o of old) if (!ss.find((s) => s.id === o.id)) await deleteItem('sessions', o.id);
    for (const s of ss) await saveItem('sessions', { ...s, course_id: row.id });
    if (c.term) {
      // grade rows are created lazily in the grades page
    }
    onClose();
  }

  const clashInfo = ss.map((s) => conflicts({ id: s.id ?? '', weekday: s.weekday!, start: s.start!, end: s.end! }, sessions.filter((x) => x.course_id !== c.id)).map((o) => courseOf(o.course_id)?.name));

  return (
    <Sheet
      title={c.id ? 'ویرایش درس' : 'درس جدید'}
      onClose={onClose}
      footer={
        <>
          {c.id && <button class="btn danger" onClick={async () => { if (confirmDo('این درس و جلسه‌ها، نمرات و غیبت‌های آن حذف شود؟')) { await deleteItem('courses', c.id!); onClose(); } }}>حذف</button>}
          <button class="btn" onClick={submit}>ذخیره</button>
        </>
      }
    >
      {err && <div class="late">{err}</div>}
      <Field label="نام درس"><input class="input" value={c.name ?? ''} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} /></Field>
      <Field label="استاد"><input class="input" value={c.teacher ?? ''} onInput={(e) => set('teacher', (e.target as HTMLInputElement).value)} /></Field>
      <div class="grid2">
        <Field label="تعداد واحد"><input class="input" inputMode="numeric" value={c.units ?? ''} onInput={(e) => set('units', num((e.target as HTMLInputElement).value) || 0)} /></Field>
        <Field label="حداکثر غیبت مجاز"><input class="input" inputMode="numeric" value={c.max_absences ?? ''} onInput={(e) => set('max_absences', num((e.target as HTMLInputElement).value) || 0)} /></Field>
      </div>
      <div class="grid2">
        <Field label="کلاس / سالن"><input class="input" value={c.room ?? ''} onInput={(e) => set('room', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="ترم (مثلاً ۱۴۰۵-۱)"><input class="input" value={c.term ?? ''} onInput={(e) => set('term', (e.target as HTMLInputElement).value)} /></Field>
      </div>
      <Field label="لینک کلاس آنلاین"><input class="input" dir="ltr" value={c.online_link ?? ''} onInput={(e) => set('online_link', (e.target as HTMLInputElement).value)} /></Field>
      <Field label="رنگ">
        <div class="chips">{COLORS.map((col) => <button type="button" class="dot" style={`background:${col};width:28px;height:28px;border:${c.color === col ? '3px solid var(--text)' : '0'}`} onClick={() => set('color', col)} />)}</div>
      </Field>
      <h2>جلسه‌های هفتگی</h2>
      {ss.map((s, i) => (
        <div class="card">
          <div class="row">
            <select class="input" value={s.weekday} onChange={(e) => setSs(ss.map((x, k) => k === i ? { ...x, weekday: +(e.target as HTMLSelectElement).value } : x))}>
              {WEEK_ORDER.map((w) => <option value={w}>{WEEKDAY_NAME(w)}</option>)}
            </select>
            <input class="input" type="time" value={s.start} onInput={(e) => setSs(ss.map((x, k) => k === i ? { ...x, start: (e.target as HTMLInputElement).value } : x))} />
            <input class="input" type="time" value={s.end} onInput={(e) => setSs(ss.map((x, k) => k === i ? { ...x, end: (e.target as HTMLInputElement).value } : x))} />
            <button class="icon" onClick={() => setSs(ss.filter((_, k) => k !== i))}>✕</button>
          </div>
          {clashInfo[i].length > 0 && <div class="late sub">⚠ تداخل با: {clashInfo[i].join('، ')}</div>}
        </div>
      ))}
      <button class="btn ghost" onClick={() => setSs([...ss, { weekday: 6, start: '08:00', end: '10:00' }])}>+ افزودن جلسه</button>
    </Sheet>
  );
}
