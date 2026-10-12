import { useEffect, useRef, useState } from 'preact/hooks';
import { Capacitor } from '@capacitor/core';
import { useBack } from '../back';
import { byTerm, neededAverage, weighted } from '../lib/gpa';
import { DAY, faNum, formatJalali, formatTime, startOfDay } from '../lib/jalali';
import { autoBackup, exportBackup, parseBackup, restoreBackup, ParsedBackup } from '../services/backup';
import { cancelPomodoro, ensurePermission, exactAlarmAllowed, openExactAlarmSettings, rescheduleAll, schedulePomodoroEnd } from '../services/notify';
import { setPin } from '../lock';
import { Grade, Note, Reminder, courseOf, deleteItem, reloadAndReschedule, saveItem, updateSetting, useStore } from '../store';
import { CoursePick, DateField, Empty, Field, JalaliPicker, Sheet, confirmDo, num } from '../ui';

type Sub = null | 'grades' | 'notes' | 'absences' | 'reminders' | 'pomodoro' | 'resources' | 'backup' | 'settings';

const MENU: { k: Sub; icon: string; t: string; d: string }[] = [
  { k: 'grades', icon: '🎓', t: 'نمرات و معدل', d: 'GPA ترم و کل، نمودار، پیش‌بینی' },
  { k: 'notes', icon: '🗒️', t: 'یادداشت‌ها', d: 'جستجو و برچسب' },
  { k: 'absences', icon: '🚫', t: 'حضور و غیاب', d: 'شمارش غیبت و هشدار' },
  { k: 'reminders', icon: '🔔', t: 'یادآوری‌ها', d: 'یادآوری سفارشی و تکرارشونده' },
  { k: 'pomodoro', icon: '🍅', t: 'تایمر پومودورو', d: 'ثبت ساعت مطالعه' },
  { k: 'resources', icon: '🔗', t: 'منابع درس‌ها', d: 'لینک کتاب و جزوه' },
  { k: 'backup', icon: '💾', t: 'پشتیبان‌گیری', d: 'خروجی و بازیابی' },
  { k: 'settings', icon: '⚙️', t: 'تنظیمات', d: 'تم، قفل، یادآوری‌ها' },
];

export function More() {
  const [sub, setSub] = useState<Sub>(null);
  useBack(() => setSub(null), sub !== null);
  if (sub) {
    const back = () => setSub(null);
    return (
      <div class="page">
        <button class="btn ghost small" onClick={back}>‹ بازگشت</button>
        {sub === 'grades' && <Grades />}
        {sub === 'notes' && <Notes />}
        {sub === 'absences' && <Absences />}
        {sub === 'reminders' && <Reminders />}
        {sub === 'pomodoro' && <Pomodoro />}
        {sub === 'resources' && <Resources />}
        {sub === 'backup' && <Backup />}
        {sub === 'settings' && <Settings />}
      </div>
    );
  }
  return (
    <div class="page">
      <h1>بیشتر</h1>
      {MENU.map((m) => (
        <div class="card click row" onClick={() => setSub(m.k)}>
          <span style="font-size:24px">{m.icon}</span>
          <div class="grow"><div class="title">{m.t}</div><div class="sub">{m.d}</div></div>
        </div>
      ))}
    </div>
  );
}

/* ---------- grades ---------- */
function Grades() {
  const { grades, courses, settings } = useStore();
  const [edit, setEdit] = useState<Partial<Grade> | null>(null);
  const [target, setTarget] = useState('17');
  const [units, setUnits] = useState('15');
  const all = weighted(grades);
  const terms = byTerm(grades);
  const need = neededAverage(grades, num(units) || 0, num(target) || 0);
  const W = 300, H = 120;
  const pts = terms.map((t, i) => [terms.length === 1 ? W / 2 : 20 + (i * (W - 40)) / (terms.length - 1), H - 15 - (Math.min(20, t.gpa) / 20) * (H - 30)]);
  return (
    <>
      <h1>نمرات و معدل</h1>
      <div class="grid2">
        <div class="card stat"><b>{grades.length ? faNum(all.gpa.toFixed(2)) : '—'}</b>معدل کل</div>
        <div class="card stat"><b>{faNum(all.units)}</b>واحد گذرانده</div>
      </div>
      {terms.length > 0 && (
        <div class="card">
          <b>روند معدل ترم‌ها</b>
          <svg class="chart" viewBox={`0 0 ${W} ${H}`}>
            <polyline fill="none" stroke="var(--pri)" stroke-width="2.5" points={pts.map((p) => p.join(',')).join(' ')} />
            {pts.map((p, i) => <g><circle cx={p[0]} cy={p[1]} r="4" fill="var(--pri)" /><text x={p[0]} y={p[1] - 8} font-size="10" text-anchor="middle" fill="currentColor">{terms[i].gpa.toFixed(1)}</text><text x={p[0]} y={H - 2} font-size="9" text-anchor="middle" fill="var(--muted)">{terms[i].term}</text></g>)}
          </svg>
        </div>
      )}
      <div class="card">
        <b>پیش‌بینی معدل</b>
        <div class="grid2" style="margin-top:8px">
          <Field label="معدل هدف"><input class="input" inputMode="decimal" value={target} onInput={(e) => setTarget((e.target as HTMLInputElement).value)} /></Field>
          <Field label="واحدهای ترم بعد"><input class="input" inputMode="numeric" value={units} onInput={(e) => setUnits((e.target as HTMLInputElement).value)} /></Field>
        </div>
        {need !== null && grades.length > 0 && <div class={need > 20 ? 'late' : ''}>{need > 20 ? 'با این واحدها رسیدن به این معدل ممکن نیست.' : `باید معدل ترم بعد حداقل ${faNum(Math.max(0, need).toFixed(2))} باشد.`}</div>}
      </div>
      {terms.slice().reverse().map((t) => (
        <>
          <h2>ترم {t.term} — معدل {faNum(t.gpa.toFixed(2))}</h2>
          {grades.filter((g) => g.term === t.term).map((g) => (
            <div class="card click row between" onClick={() => setEdit(g)}>
              <span>{courseOf(g.course_id)?.name}</span><span class="sub">{faNum(g.units)} واحد</span><b>{g.score ?? '—'}</b>
            </div>
          ))}
        </>
      ))}
      {!grades.length && <Empty text="نمره‌ای ثبت نشده." />}
      <button class="fab" onClick={() => setEdit({ term: settings.currentTerm ?? '', units: 3 })}>+</button>
      {edit && <GradeForm init={edit} onClose={() => setEdit(null)} courses={courses} />}
    </>
  );
}

function GradeForm({ init, onClose, courses }: { init: Partial<Grade>; onClose: () => void; courses: any[] }) {
  const [g, setG] = useState<Partial<Grade>>(init);
  const [score, setScore] = useState(init.score != null ? String(init.score) : '');
  const [err, setErr] = useState('');
  async function submit() {
    if (!g.course_id) return setErr('درس را انتخاب کن.');
    if (!g.term?.trim()) return setErr('ترم را وارد کن (مثلاً ۱۴۰۵-۱).');
    const sc = score.trim() === '' ? null : num(score);
    if (sc !== null && (Number.isNaN(sc) || sc < 0 || sc > 20)) return setErr('نمره باید بین ۰ تا ۲۰ باشد.');
    await saveItem('grades', { ...g, term: g.term.trim(), score: sc, units: g.units || courseOfUnits(courses, g.course_id) });
    onClose();
  }
  return (
    <Sheet title="نمره" onClose={onClose} footer={<>{g.id && <button class="btn danger" onClick={async () => { await deleteItem('grades', g.id!); onClose(); }}>حذف</button>}<button class="btn" onClick={submit}>ذخیره</button></>}>
      {err && <div class="late">{err}</div>}
      <CoursePick value={g.course_id ?? null} onChange={(v) => setG({ ...g, course_id: v ?? undefined, units: courseOfUnits(courses, v) })} />
      <Field label="ترم"><input class="input" value={g.term ?? ''} onInput={(e) => setG({ ...g, term: (e.target as HTMLInputElement).value })} /></Field>
      <div class="grid2">
        <Field label="نمره (از ۲۰)"><input class="input" inputMode="decimal" value={score} onInput={(e) => setScore((e.target as HTMLInputElement).value)} /></Field>
        <Field label="واحد"><input class="input" inputMode="numeric" value={g.units ?? ''} onInput={(e) => setG({ ...g, units: num((e.target as HTMLInputElement).value) || 0 })} /></Field>
      </div>
    </Sheet>
  );
}
const courseOfUnits = (courses: any[], id: string | null | undefined) => courses.find((c) => c.id === id)?.units ?? 3;

/* ---------- notes ---------- */
function Notes() {
  const { notes } = useStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Note> | null>(null);
  const list = notes.filter((n) => !q || (n.title + (n.body ?? '') + n.tags.join(' ')).includes(q)).sort((a, b) => b.updated_at - a.updated_at);
  return (
    <>
      <h1>یادداشت‌ها</h1>
      <input class="input" placeholder="جستجو در عنوان، متن و برچسب…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} style="margin-bottom:10px" />
      {!list.length && <Empty text="یادداشتی نیست." />}
      {list.map((n) => (
        <div class="card click" onClick={() => setEdit(n)}>
          <div class="title">{n.title}</div>
          <div class="sub">{courseOf(n.course_id)?.name ?? ''} {n.tags.map((t) => '#' + t).join(' ')}</div>
          <div class="sub" style="margin-top:4px">{(n.body ?? '').slice(0, 90)}</div>
        </div>
      ))}
      <button class="fab" onClick={() => setEdit({ tags: [] })}>+</button>
      {edit && <NoteForm init={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function NoteForm({ init, onClose }: { init: Partial<Note>; onClose: () => void }) {
  const [n, setN] = useState<Partial<Note>>(init);
  const [tags, setTags] = useState((init.tags ?? []).join(' '));
  async function submit() {
    if (!n.title?.trim()) return;
    await saveItem('notes', { ...n, title: n.title.trim(), tags: tags.split(/[\s,،#]+/).filter(Boolean) });
    onClose();
  }
  return (
    <Sheet title="یادداشت" onClose={onClose} footer={<>{n.id && <button class="btn danger" onClick={async () => { if (confirmDo('حذف شود؟')) { await deleteItem('notes', n.id!); onClose(); } }}>حذف</button>}<button class="btn" onClick={submit}>ذخیره</button></>}>
      <Field label="عنوان"><input class="input" value={n.title ?? ''} onInput={(e) => setN({ ...n, title: (e.target as HTMLInputElement).value })} /></Field>
      <CoursePick value={n.course_id ?? null} onChange={(v) => setN({ ...n, course_id: v })} />
      <Field label="متن"><textarea class="input" style="min-height:160px" value={n.body ?? ''} onInput={(e) => setN({ ...n, body: (e.target as HTMLTextAreaElement).value })} /></Field>
      <Field label="برچسب‌ها (با فاصله جدا کن)"><input class="input" value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} /></Field>
    </Sheet>
  );
}

/* ---------- absences ---------- */
function Absences() {
  const { courses, absences } = useStore();
  return (
    <>
      <h1>حضور و غیاب</h1>
      {!courses.length && <Empty text="اول درس اضافه کن." />}
      {courses.map((c) => {
        const list = absences.filter((a) => a.course_id === c.id);
        const n = list.length;
        const warn = c.max_absences > 0 && n >= c.max_absences - 1;
        return (
          <div class="card">
            <div class="row between"><b>{c.name}</b><span class={'badge ' + (n >= c.max_absences ? 'late' : warn ? 'soon' : '')}>{faNum(n)} از {faNum(c.max_absences)} غیبت</span></div>
            <div class={'bar ' + (warn ? 'warn' : '')} style="margin:8px 0"><div style={`width:${Math.min(100, c.max_absences ? (n / c.max_absences) * 100 : 0)}%`} /></div>
            {n >= c.max_absences && c.max_absences > 0 && <div class="late sub">⚠ به سقف غیبت مجاز رسیده‌ای!</div>}
            {warn && n < c.max_absences && <div class="soon sub">⚠ فقط یک غیبت دیگر مجازه.</div>}
            <div class="row" style="margin-top:6px">
              <button class="btn small" onClick={() => saveItem('absences', { course_id: c.id, date: Date.now(), kind: 'unexcused' })}>+ غیبت امروز</button>
              <button class="btn ghost small" disabled={!n} onClick={() => deleteItem('absences', [...list].sort((a, b) => b.date - a.date)[0].id)}>− آخرین را حذف کن</button>
            </div>
            {list.length > 0 && <div class="sub" style="margin-top:6px">{[...list].sort((a, b) => b.date - a.date).slice(0, 5).map((a) => formatJalali(a.date)).join(' • ')}</div>}
          </div>
        );
      })}
    </>
  );
}

/* ---------- reminders ---------- */
const REPEAT: Record<string, string> = { none: 'یک‌بار', daily: 'روزانه', weekly: 'هفتگی' };
function Reminders() {
  const { reminders } = useStore();
  const [edit, setEdit] = useState<Partial<Reminder> | null>(null);
  const list = [...reminders].sort((a, b) => a.at - b.at);
  return (
    <>
      <h1>یادآوری‌ها</h1>
      {!list.length && <Empty text="یادآوری سفارشی نداری." />}
      {list.map((r) => (
        <div class="card click row" onClick={() => setEdit(r)}>
          <input type="checkbox" checked={!!r.done} onClick={(e) => e.stopPropagation()} onChange={() => saveItem('reminders', { ...r, done: r.done ? 0 : 1 })} />
          <div class="grow"><div class={'title ' + (r.done ? 'done' : '')}>{r.title}</div><div class="sub">{formatJalali(r.at)} ساعت {formatTime(r.at)} • {REPEAT[r.repeat]}</div></div>
        </div>
      ))}
      <button class="fab" onClick={() => setEdit({ at: Date.now() + 3600e3, repeat: 'none', done: 0 })}>+</button>
      {edit && <ReminderForm init={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ReminderForm({ init, onClose }: { init: Partial<Reminder>; onClose: () => void }) {
  const [r, setR] = useState<Partial<Reminder>>(init);
  async function submit() {
    if (!r.title?.trim() || !r.at) return;
    await saveItem('reminders', { ...r, title: r.title.trim() });
    onClose();
  }
  return (
    <Sheet title="یادآوری" onClose={onClose} footer={<>{r.id && <button class="btn danger" onClick={async () => { await deleteItem('reminders', r.id!); onClose(); }}>حذف</button>}<button class="btn" onClick={submit}>ذخیره</button></>}>
      <Field label="عنوان"><input class="input" value={r.title ?? ''} onInput={(e) => setR({ ...r, title: (e.target as HTMLInputElement).value })} /></Field>
      <Field label="توضیح"><input class="input" value={r.body ?? ''} onInput={(e) => setR({ ...r, body: (e.target as HTMLInputElement).value })} /></Field>
      <DateField label="زمان" withTime value={r.at ?? null} onChange={(v) => setR({ ...r, at: v ?? Date.now() })} />
      <Field label="تکرار"><div class="chips">{Object.entries(REPEAT).map(([k, v]) => <button type="button" class={'chip' + (r.repeat === k ? ' on' : '')} onClick={() => setR({ ...r, repeat: k })}>{v}</button>)}</div></Field>
    </Sheet>
  );
}

/* ---------- pomodoro ---------- */
const FOCUS_MIN = 25;
function Pomodoro() {
  const { courses, study_logs, settings } = useStore();
  // the running timer lives in settings as an absolute end time, so it survives
  // screen lock, leaving this page and even closing the app
  const pomo = settings.pomo as { endAt: number; course: string | null } | undefined;
  const [course, setCourse] = useState<string | null>(pomo?.course ?? null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // finished (also when it ended while the app was in the background)
  useEffect(() => {
    if (!pomo || now < pomo.endAt) return;
    (async () => {
      await updateSetting('pomo', null); // clear first so it is logged exactly once
      await saveItem('study_logs', { course_id: pomo.course, minutes: FOCUS_MIN, day: startOfDay(pomo.endAt) });
      if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    })();
  }, [now, pomo?.endAt]);

  const running = !!pomo && now < pomo.endAt;
  const left = running ? Math.max(0, Math.ceil((pomo!.endAt - now) / 1000)) : FOCUS_MIN * 60;

  async function start() {
    const endAt = Date.now() + FOCUS_MIN * 60e3;
    await updateSetting('pomo', { endAt, course });
    await schedulePomodoroEnd(endAt).catch(() => {});
  }
  async function stop() {
    await updateSetting('pomo', null);
    await cancelPomodoro().catch(() => {});
  }

  const total = study_logs.reduce((s, l) => s + l.minutes, 0);
  const today = study_logs.filter((l) => l.day === startOfDay(Date.now())).reduce((s, l) => s + l.minutes, 0);
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  return (
    <>
      <h1>تایمر پومودورو</h1>
      <div class="card stat"><b style="font-size:54px">{faNum(`${mm}:${ss}`)}</b>
        <div class="row" style="justify-content:center;margin-top:10px">
          {running ? <button class="btn danger" onClick={stop}>انصراف</button> : <button class="btn" onClick={start}>شروع ۲۵ دقیقه</button>}
        </div>
        <small class="muted">با قفل شدن صفحه هم ادامه پیدا می‌کنه و آخرش نوتیفیکیشن می‌آد. فقط جلسه کامل‌شده ثبت می‌شه.</small>
      </div>
      <CoursePick label="مطالعه برای درس" value={running ? pomo!.course : course} onChange={(v) => !running && setCourse(v)} />
      <div class="grid2"><div class="card stat"><b>{faNum(today)}</b>دقیقه امروز</div><div class="card stat"><b>{faNum(Math.round(total / 6) / 10)}</b>ساعت کل</div></div>
      {courses.map((c) => {
        const m = study_logs.filter((l) => l.course_id === c.id).reduce((s, l) => s + l.minutes, 0);
        return m ? <div class="card row between"><span>{c.name}</span><span class="sub">{faNum(m)} دقیقه</span></div> : null;
      })}
    </>
  );
}

/* ---------- resources ---------- */
function Resources() {
  const { resources, courses } = useStore();
  const [t, setT] = useState('');
  const [u, setU] = useState('');
  const [c, setC] = useState<string | null>(null);
  return (
    <>
      <h1>منابع درس‌ها</h1>
      <div class="card">
        <Field label="عنوان"><input class="input" value={t} onInput={(e) => setT((e.target as HTMLInputElement).value)} /></Field>
        <Field label="لینک"><input class="input" dir="ltr" value={u} onInput={(e) => setU((e.target as HTMLInputElement).value)} /></Field>
        <CoursePick value={c} onChange={setC} />
        <button class="btn block" onClick={async () => { if (!t.trim()) return; await saveItem('resources', { title: t.trim(), url: u.trim(), course_id: c }); setT(''); setU(''); }}>افزودن</button>
      </div>
      {!resources.length && <Empty text="منبعی ثبت نشده." />}
      {[...courses.map((x) => x.id), null].map((cid) => {
        const list = resources.filter((r) => r.course_id === cid);
        if (!list.length) return null;
        return <><h2>{cid ? courseOf(cid)?.name : 'بدون درس'}</h2>{list.map((r) => (
          <div class="card row"><div class="grow">{r.url ? <a href={r.url} target="_blank">{r.title}</a> : r.title}</div><button class="icon" onClick={() => deleteItem('resources', r.id)}>✕</button></div>
        ))}</>;
      })}
    </>
  );
}

/* ---------- backup ---------- */
function Backup() {
  const { settings } = useStore();
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const last = settings.lastBackup as number | undefined;
  async function doExport() {
    try {
      const where = await exportBackup();
      await updateSetting('lastBackup', Date.now());
      setMsg('بکاپ ذخیره شد: ' + where);
    } catch (e: any) { setMsg('خطا: ' + e.message); }
  }
  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { setPending(parseBackup(await f.text())); setMsg(''); } catch (err: any) { setMsg('❌ ' + err.message); }
    (e.target as HTMLInputElement).value = '';
  }
  return (
    <>
      <h1>پشتیبان‌گیری</h1>
      <div class="card">
        <p>همه اطلاعات فقط روی همین گوشی ذخیره می‌شه. اگه گوشی گم شه یا برنامه پاک بشه، بدون بکاپ چیزی نمی‌مونه.</p>
        <div class="sub">آخرین بکاپ: {last ? formatJalali(last) : 'هیچ‌وقت'}</div>
        <button class="btn block" onClick={doExport}>گرفتن بکاپ و ارسال/ذخیره</button>
        <button class="btn ghost block" onClick={() => file.current?.click()}>بازیابی از فایل بکاپ</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={onFile} />
        {msg && <p>{msg}</p>}
      </div>
      <div class="card">
        <Field label="یادآوری دوره‌ای بکاپ">
          <select class="input" value={settings.backupEveryDays ?? 7} onChange={(e) => updateSetting('backupEveryDays', +(e.target as HTMLSelectElement).value)}>
            <option value="0">خاموش</option><option value="3">هر ۳ روز</option><option value="7">هر هفته</option><option value="30">هر ماه</option>
          </select>
        </Field>
        <label class="row"><input type="checkbox" checked={settings.autoBackup ?? true} onChange={(e) => updateSetting('autoBackup', (e.target as HTMLInputElement).checked)} /> بکاپ خودکار هنگام باز کردن برنامه (۵ نسخه آخر در Documents/Daneshyar/auto)</label>
        <button class="btn ghost block" onClick={async () => { try { await autoBackup(); setMsg('بکاپ خودکار گرفته شد.'); } catch (e: any) { setMsg('خطا: ' + e.message); } }}>همین الان بکاپ خودکار بگیر</button>
      </div>
      {pending && (
        <Sheet title="تأیید بازیابی" onClose={() => setPending(null)} footer={<><button class="btn ghost" onClick={() => setPending(null)}>انصراف</button><button class="btn danger" onClick={async () => { await restoreBackup(pending); await reloadAndReschedule(); setPending(null); setMsg('✅ بازیابی انجام شد.'); }}>جایگزین کن</button></>}>
          <p class="late">⚠ همه اطلاعات فعلی پاک می‌شه و با این بکاپ جایگزین می‌شه.</p>
          {Object.entries(pending.counts).filter(([, n]) => n > 0).map(([k, n]) => <div class="row between"><span>{k}</span><b>{faNum(n)}</b></div>)}
        </Sheet>
      )}
    </>
  );
}

/* ---------- settings ---------- */
function Settings() {
  const { settings } = useStore();
  const [info, setInfo] = useState('');
  const [pin, setPinV] = useState('');
  const [holidayPick, setHolidayPick] = useState(false);
  const native = Capacitor.isNativePlatform();
  return (
    <>
      <h1>تنظیمات</h1>
      <div class="card">
        <Field label="تم">
          <div class="chips">{[['auto', 'خودکار'], ['light', 'روشن'], ['dark', 'تاریک']].map(([k, v]) => <button class={'chip' + ((settings.theme ?? 'auto') === k ? ' on' : '')} onClick={() => updateSetting('theme', k)}>{v}</button>)}</div>
        </Field>
        <label class="row"><input type="checkbox" checked={!!settings.showGregorian} onChange={(e) => updateSetting('showGregorian', (e.target as HTMLInputElement).checked)} /> نمایش تاریخ میلادی کنار شمسی (در تقویم)</label>
        <Field label="ترم جاری (برای پیش‌فرض)"><input class="input" value={settings.currentTerm ?? ''} onChange={(e) => updateSetting('currentTerm', (e.target as HTMLInputElement).value)} /></Field>
        <DateField label="شروع ترم" value={settings.termStart ?? null} onChange={(v) => updateSetting('termStart', v)} />
        <DateField label="پایان ترم (بعد از این تاریخ یادآوری کلاس نمی‌آد)" value={settings.termEnd ?? null} onChange={(v) => updateSetting('termEnd', v)} />
        <Field label="تعطیلی‌ها (روزهایی که کلاس نیست)">
          <div class="chips">
            {((settings.holidays as number[] | undefined) ?? []).slice().sort((a, b) => a - b).map((h) => (
              <button type="button" class="chip on" onClick={() => updateSetting('holidays', ((settings.holidays as number[]) ?? []).filter((x) => x !== h))}>{formatJalali(h)} ✕</button>
            ))}
            <button type="button" class="chip" onClick={() => setHolidayPick(true)}>+ افزودن روز</button>
          </div>
        </Field>
        {holidayPick && <JalaliPicker initial={Date.now()} onClose={() => setHolidayPick(false)} onPick={(d) => { const cur = ((settings.holidays as number[]) ?? []); if (!cur.includes(d)) updateSetting('holidays', [...cur, d]); setHolidayPick(false); }} />}
        <Field label="یادآوری کلاس‌ها">
          <select class="input" value={settings.classRemindMin ?? 15} onChange={(e) => updateSetting('classRemindMin', +(e.target as HTMLSelectElement).value)}>
            <option value="-1">خاموش</option><option value="5">۵ دقیقه قبل</option><option value="15">۱۵ دقیقه قبل</option><option value="30">۳۰ دقیقه قبل</option><option value="60">۱ ساعت قبل</option>
          </select>
        </Field>
      </div>
      <div class="card">
        <b>قفل برنامه</b>
        {settings.pinHash ? (
          <button class="btn danger block" onClick={() => setPin(null)}>برداشتن قفل</button>
        ) : (
          <>
            <Field label="پین ۴ تا ۸ رقمی"><input class="input" inputMode="numeric" type="password" value={pin} onInput={(e) => setPinV((e.target as HTMLInputElement).value)} /></Field>
            <button class="btn block" onClick={async () => { if (!/^\d{4,8}$/.test(pin)) return setInfo('پین باید ۴ تا ۸ رقم انگلیسی باشد.'); await setPin(pin); setPinV(''); setInfo('قفل فعال شد.'); }}>فعال‌سازی قفل</button>
          </>
        )}
        <small class="muted">اگه پین رو فراموش کنی راهی برای بازیابی نیست جز پاک کردن داده‌های برنامه، پس بکاپ بگیر.</small>
      </div>
      <div class="card">
        <b>نوتیفیکیشن‌ها</b>
        <button class="btn ghost block" onClick={async () => { const ok = await ensurePermission(); const n = ok ? await rescheduleAll() : 0; setInfo(ok ? `مجوز داده شده؛ ${faNum(n)} یادآوری زمان‌بندی شد.` : 'مجوز نوتیفیکیشن داده نشده. از تنظیمات گوشی فعالش کن.'); }}>بررسی مجوز و زمان‌بندی دوباره</button>
        {native && <button class="btn ghost block" onClick={async () => { if (await exactAlarmAllowed()) setInfo('آلارم دقیق مجازه ✅'); else { setInfo('آلارم دقیق مجاز نیست؛ صفحه تنظیمات باز می‌شه.'); openExactAlarmSettings(); } }}>بررسی آلارم دقیق (اندروید ۱۲+)</button>}
        <details style="margin-top:8px"><summary>یادآوری‌ها دیر می‌رسن؟</summary>
          <p class="sub">روی بعضی گوشی‌ها (شیائومی، هواوی، سامسونگ، اوپو) سیستم باتری اپ‌های پس‌زمینه رو می‌بنده. تنظیمات گوشی ← برنامه‌ها ← دانشیار ← باتری، رو روی «بدون محدودیت» بذار و «شروع خودکار» (Autostart) رو فعال کن. در سامسونگ هم برنامه رو از «Sleeping apps» دربیار.</p>
        </details>
        {info && <p>{info}</p>}
      </div>
      <div class="card sub">دانشیار نسخه ۱.۰ • همه داده‌ها فقط روی دستگاه شما می‌مانند و هیچ اطلاعاتی به اینترنت ارسال نمی‌شود.</div>
    </>
  );
}
