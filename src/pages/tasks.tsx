import { useState } from 'preact/hooks';
import { DAY, faNum, formatJalali, formatTime, relativeDays } from '../lib/jalali';
import { Assignment, Exam, Presentation, courseOf, deleteItem, saveItem, useStore } from '../store';
import { Checklist, CoursePick, DateField, Empty, Field, RemindPick, Sheet, confirmDo, daysLeftClass } from '../ui';

type Tab = 'assign' | 'pres' | 'exam';
const STATUS: Record<string, string> = { todo: 'انجام نشده', doing: 'در حال انجام', done: 'تحویل شده' };
const PRIO = ['کم', 'متوسط', 'زیاد'];

export function Tasks() {
  const [tab, setTab] = useState<Tab>('assign');
  const [form, setForm] = useState<{ kind: Tab; item: any } | null>(null);
  return (
    <div class="page">
      <h1>کارها</h1>
      <div class="seg">
        <button class={tab === 'assign' ? 'on' : ''} onClick={() => setTab('assign')}>تکالیف</button>
        <button class={tab === 'pres' ? 'on' : ''} onClick={() => setTab('pres')}>ارائه‌ها</button>
        <button class={tab === 'exam' ? 'on' : ''} onClick={() => setTab('exam')}>امتحانات</button>
      </div>
      {tab === 'assign' && <Assignments onEdit={(item) => setForm({ kind: 'assign', item })} />}
      {tab === 'pres' && <Presentations onEdit={(item) => setForm({ kind: 'pres', item })} />}
      {tab === 'exam' && <Exams onEdit={(item) => setForm({ kind: 'exam', item })} />}
      <button class="fab" onClick={() => setForm({ kind: tab, item: tab === 'assign' ? { status: 'todo', priority: 1, subtasks: [], remind: [DAY] } : { remind: [DAY], members: [], checklist: [] } })}>+</button>
      {form?.kind === 'assign' && <AssignForm init={form.item} onClose={() => setForm(null)} />}
      {form?.kind === 'pres' && <PresForm init={form.item} onClose={() => setForm(null)} />}
      {form?.kind === 'exam' && <ExamForm init={form.item} onClose={() => setForm(null)} />}
    </div>
  );
}

function Assignments({ onEdit }: { onEdit: (a: Assignment) => void }) {
  const { assignments, courses } = useStore();
  const [fStatus, setFStatus] = useState('open');
  const [fCourse, setFCourse] = useState('');
  const [sort, setSort] = useState<'due' | 'prio'>('due');
  let list = assignments.filter((a) => (fStatus === 'open' ? a.status !== 'done' : fStatus === 'all' ? true : a.status === fStatus) && (!fCourse || a.course_id === fCourse));
  list = [...list].sort((a, b) => (sort === 'due' ? (a.due ?? 9e15) - (b.due ?? 9e15) : b.priority - a.priority));
  return (
    <>
      <div class="row" style="margin-bottom:10px">
        <select class="input" value={fStatus} onChange={(e) => setFStatus((e.target as HTMLSelectElement).value)}>
          <option value="open">باز</option><option value="all">همه</option>
          {Object.entries(STATUS).map(([k, v]) => <option value={k}>{v}</option>)}
        </select>
        <select class="input" value={fCourse} onChange={(e) => setFCourse((e.target as HTMLSelectElement).value)}>
          <option value="">همه درس‌ها</option>{courses.map((c) => <option value={c.id}>{c.name}</option>)}
        </select>
        <select class="input" value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as any)}>
          <option value="due">مهلت</option><option value="prio">اولویت</option>
        </select>
      </div>
      {!list.length && <Empty text="تکلیفی نیست 🎉" />}
      {list.map((a) => {
        const c = courseOf(a.course_id);
        const done = a.subtasks.filter((s) => s.done).length;
        return (
          <div class="card click" onClick={() => onEdit(a)}>
            <div class="row">
              <input type="checkbox" checked={a.status === 'done'} onClick={(e) => e.stopPropagation()} onChange={() => saveItem('assignments', { ...a, status: a.status === 'done' ? 'todo' : 'done' })} />
              <div class="grow">
                <div class={'title ' + (a.status === 'done' ? 'done' : '')}>{a.title}</div>
                <div class="sub">{c?.name ?? 'بدون درس'} • اولویت {PRIO[a.priority]}{a.subtasks.length ? ` • ${faNum(done)}/${faNum(a.subtasks.length)}` : ''}</div>
              </div>
              {a.due && a.status !== 'done' && <span class={'badge ' + daysLeftClass(a.due)}>{relativeDays(a.due)}</span>}
            </div>
            {a.status !== 'done' && <div class="sub" style="margin-top:4px">وضعیت: {STATUS[a.status]}</div>}
          </div>
        );
      })}
    </>
  );
}

function AssignForm({ init, onClose }: { init: Partial<Assignment>; onClose: () => void }) {
  const [a, setA] = useState<Partial<Assignment>>(init);
  const [err, setErr] = useState('');
  const set = (k: keyof Assignment, v: any) => setA({ ...a, [k]: v });
  async function submit() {
    if (!a.title?.trim()) return setErr('عنوان را وارد کن.');
    await saveItem('assignments', { ...a, title: a.title.trim() });
    onClose();
  }
  return (
    <Sheet title={a.id ? 'ویرایش تکلیف' : 'تکلیف جدید'} onClose={onClose}
      footer={<>{a.id && <button class="btn danger" onClick={async () => { if (confirmDo('حذف شود؟')) { await deleteItem('assignments', a.id!); onClose(); } }}>حذف</button>}<button class="btn" onClick={submit}>ذخیره</button></>}>
      {err && <div class="late">{err}</div>}
      <Field label="عنوان"><input class="input" value={a.title ?? ''} onInput={(e) => set('title', (e.target as HTMLInputElement).value)} /></Field>
      <CoursePick value={a.course_id ?? null} onChange={(v) => set('course_id', v)} />
      <DateField label="مهلت تحویل" withTime value={a.due ?? null} onChange={(v) => set('due', v)} />
      <Field label="اولویت"><div class="chips">{PRIO.map((p, i) => <button type="button" class={'chip' + (a.priority === i ? ' on' : '')} onClick={() => set('priority', i)}>{p}</button>)}</div></Field>
      <Field label="وضعیت"><div class="chips">{Object.entries(STATUS).map(([k, v]) => <button type="button" class={'chip' + (a.status === k ? ' on' : '')} onClick={() => set('status', k)}>{v}</button>)}</div></Field>
      <Field label="توضیحات"><textarea class="input" value={a.description ?? ''} onInput={(e) => set('description', (e.target as HTMLTextAreaElement).value)} /></Field>
      <Field label="لینک پیوست (فایل در درایو، سایت و…)"><input class="input" dir="ltr" value={a.link ?? ''} onInput={(e) => set('link', (e.target as HTMLInputElement).value)} /></Field>
      <Checklist label="زیرکارها" items={a.subtasks ?? []} onChange={(v) => set('subtasks', v)} />
      <RemindPick value={a.remind ?? []} onChange={(v) => set('remind', v)} />
    </Sheet>
  );
}

function Presentations({ onEdit }: { onEdit: (p: Presentation) => void }) {
  const { presentations } = useStore();
  const list = [...presentations].sort((a, b) => (a.date ?? 9e15) - (b.date ?? 9e15));
  if (!list.length) return <Empty text="ارائه یا پروژه‌ای ثبت نشده." />;
  return <>{list.map((p) => {
    const done = p.checklist.filter((c) => c.done).length;
    return (
      <div class="card click" onClick={() => onEdit(p)}>
        <div class="row between"><div class="title">{p.title}</div>{p.date && <span class={'badge ' + daysLeftClass(p.date)}>{relativeDays(p.date)}</span>}</div>
        <div class="sub">{courseOf(p.course_id)?.name ?? ''}{p.members.length ? ` • ${faNum(p.members.length)} نفر` : ''}{p.checklist.length ? ` • آمادگی ${faNum(done)}/${faNum(p.checklist.length)}` : ''}</div>
        {p.checklist.length > 0 && <div class="bar" style="margin-top:8px"><div style={`width:${(done / p.checklist.length) * 100}%`} /></div>}
      </div>
    );
  })}</>;
}

function PresForm({ init, onClose }: { init: Partial<Presentation>; onClose: () => void }) {
  const [p, setP] = useState<Partial<Presentation>>(init);
  const [member, setMember] = useState('');
  const [err, setErr] = useState('');
  const set = (k: keyof Presentation, v: any) => setP({ ...p, [k]: v });
  async function submit() {
    if (!p.title?.trim()) return setErr('عنوان را وارد کن.');
    await saveItem('presentations', { ...p, title: p.title.trim() });
    onClose();
  }
  return (
    <Sheet title={p.id ? 'ویرایش ارائه' : 'ارائه / پروژه جدید'} onClose={onClose}
      footer={<>{p.id && <button class="btn danger" onClick={async () => { if (confirmDo('حذف شود؟')) { await deleteItem('presentations', p.id!); onClose(); } }}>حذف</button>}<button class="btn" onClick={submit}>ذخیره</button></>}>
      {err && <div class="late">{err}</div>}
      <Field label="عنوان"><input class="input" value={p.title ?? ''} onInput={(e) => set('title', (e.target as HTMLInputElement).value)} /></Field>
      <CoursePick value={p.course_id ?? null} onChange={(v) => set('course_id', v)} />
      <DateField label="تاریخ ارائه" withTime value={p.date ?? null} onChange={(v) => set('date', v)} />
      <Field label="اعضای گروه">
        <div class="chips">{(p.members ?? []).map((m, i) => <button type="button" class="chip on" onClick={() => set('members', (p.members ?? []).filter((_, k) => k !== i))}>{m} ✕</button>)}</div>
        <div class="row" style="margin-top:6px">
          <input class="input" value={member} placeholder="نام عضو…" onInput={(e) => setMember((e.target as HTMLInputElement).value)} />
          <button type="button" class="btn small" onClick={() => { if (member.trim()) { set('members', [...(p.members ?? []), member.trim()]); setMember(''); } }}>+</button>
        </div>
      </Field>
      <Checklist label="چک‌لیست آماده‌سازی" items={p.checklist ?? []} onChange={(v) => set('checklist', v)} />
      <Field label="لینک اسلاید"><input class="input" dir="ltr" value={p.slide_link ?? ''} onInput={(e) => set('slide_link', (e.target as HTMLInputElement).value)} /></Field>
      <Field label="یادداشت"><textarea class="input" value={p.note ?? ''} onInput={(e) => set('note', (e.target as HTMLTextAreaElement).value)} /></Field>
      <RemindPick value={p.remind ?? []} onChange={(v) => set('remind', v)} />
    </Sheet>
  );
}

function Exams({ onEdit }: { onEdit: (e: Exam) => void }) {
  const { exams, settings } = useStore();
  const now = Date.now();
  const list = [...exams].sort((a, b) => a.date - b.date);
  if (!list.length) return <Empty text="امتحانی ثبت نشده." />;
  return <>{list.map((e) => {
    const past = e.date < now;
    return (
      <div class="card click" style={past ? 'opacity:.55' : ''} onClick={() => onEdit(e)}>
        <div class="row between"><div class="title">{e.title}</div><span class={'badge ' + (past ? '' : daysLeftClass(e.date))}>{past ? 'برگزار شد' : relativeDays(e.date)}</span></div>
        <div class="sub">{courseOf(e.course_id)?.name ?? ''} • {formatJalali(e.date, !!settings.showGregorian)} ساعت {formatTime(e.date)}{e.hall ? ' • ' + e.hall : ''}</div>
        {!past && <div class="sub">{countdown(e.date - now)}</div>}
      </div>
    );
  })}</>;
}

function countdown(ms: number) {
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / 3600000);
  return `⏳ ${faNum(d)} روز و ${faNum(h)} ساعت مانده`;
}

function ExamForm({ init, onClose }: { init: Partial<Exam>; onClose: () => void }) {
  const [x, setX] = useState<Partial<Exam>>(init);
  const [err, setErr] = useState('');
  const set = (k: keyof Exam, v: any) => setX({ ...x, [k]: v });
  async function submit() {
    if (!x.title?.trim()) return setErr('عنوان را وارد کن.');
    if (!x.date) return setErr('تاریخ امتحان را انتخاب کن.');
    await saveItem('exams', { ...x, title: x.title.trim() });
    onClose();
  }
  return (
    <Sheet title={x.id ? 'ویرایش امتحان' : 'امتحان جدید'} onClose={onClose}
      footer={<>{x.id && <button class="btn danger" onClick={async () => { if (confirmDo('حذف شود؟')) { await deleteItem('exams', x.id!); onClose(); } }}>حذف</button>}<button class="btn" onClick={submit}>ذخیره</button></>}>
      {err && <div class="late">{err}</div>}
      <Field label="عنوان (مثلاً میان‌ترم)"><input class="input" value={x.title ?? ''} onInput={(e) => set('title', (e.target as HTMLInputElement).value)} /></Field>
      <CoursePick value={x.course_id ?? null} onChange={(v) => set('course_id', v)} />
      <DateField label="تاریخ و ساعت" withTime value={x.date ?? null} onChange={(v) => set('date', v)} />
      <Field label="سالن / محل"><input class="input" value={x.hall ?? ''} onInput={(e) => set('hall', (e.target as HTMLInputElement).value)} /></Field>
      <Field label="مباحث"><textarea class="input" value={x.topics ?? ''} onInput={(e) => set('topics', (e.target as HTMLTextAreaElement).value)} /></Field>
      <RemindPick value={x.remind ?? []} onChange={(v) => set('remind', v)} />
    </Sheet>
  );
}
