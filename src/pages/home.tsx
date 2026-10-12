import { useState } from 'preact/hooks';
import { DAY, MONTHS, WEEKDAY_NAME, WEEK_ORDER, faNum, formatJalali, formatTime, jalaliMonthLength, relativeDays, startOfDay, toGregorian, toJalali } from '../lib/jalali';
import { weighted } from '../lib/gpa';
import { classActiveOn } from '../lib/term';
import { courseOf, useStore } from '../store';
import { Empty, daysLeftClass } from '../ui';

interface Ev { ts: number; title: string; sub: string; kind: 'as' | 'pr' | 'ex' | 'rm'; color?: string }

function allEvents(s: ReturnType<typeof useStore>): Ev[] {
  const ev: Ev[] = [];
  s.assignments.forEach((a) => a.due && a.status !== 'done' && ev.push({ ts: a.due, title: a.title, sub: 'تکلیف • ' + (courseOf(a.course_id)?.name ?? ''), kind: 'as' }));
  s.presentations.forEach((p) => p.date && ev.push({ ts: p.date, title: p.title, sub: 'ارائه • ' + (courseOf(p.course_id)?.name ?? ''), kind: 'pr' }));
  s.exams.forEach((e) => ev.push({ ts: e.date, title: e.title, sub: 'امتحان • ' + (courseOf(e.course_id)?.name ?? ''), kind: 'ex' }));
  s.reminders.forEach((r) => !r.done && ev.push({ ts: r.at, title: r.title, sub: 'یادآوری', kind: 'rm' }));
  return ev.sort((a, b) => a.ts - b.ts);
}

export function Dashboard({ go }: { go: (t: string) => void }) {
  const s = useStore();
  const now = Date.now();
  const today = startOfDay(now);
  const todayClasses = (classActiveOn(s.settings, now) ? s.sessions : []).filter((x) => x.weekday === new Date().getDay()).sort((a, b) => a.start.localeCompare(b.start));
  const nowHM = new Date().toTimeString().slice(0, 5);
  const nextClass = todayClasses.find((c) => c.end > nowHM);
  const events = allEvents(s).filter((e) => e.ts >= today);
  const soon = events.filter((e) => e.ts < today + 7 * DAY).slice(0, 8);
  const todayEv = events.filter((e) => startOfDay(e.ts) === today);
  const open = s.assignments.filter((a) => a.status !== 'done').length;
  const doneN = s.assignments.filter((a) => a.status === 'done').length;
  const total = s.assignments.length;
  const nextExam = s.exams.filter((e) => e.date > now).sort((a, b) => a.date - b.date)[0];
  const { gpa } = weighted(s.grades);
  const studyWeek = s.study_logs.filter((l) => l.day >= today - 6 * DAY).reduce((x, l) => x + l.minutes, 0);
  // not done and the deadline has passed: these must never silently disappear
  const overdue = s.assignments
    .filter((a) => a.status !== 'done' && a.due !== null && a.due < now)
    .sort((a, b) => (a.due as number) - (b.due as number));

  return (
    <div class="page">
      <h1>سلام 👋 {formatJalali(now, !!s.settings.showGregorian)}</h1>
      <div class="grid2">
        <div class="card stat"><b>{faNum(open)}</b>تکلیف باز</div>
        <div class="card stat"><b>{s.grades.length ? faNum(gpa.toFixed(2)) : '—'}</b>معدل کل</div>
      </div>

      {overdue.length > 0 && (
        <>
          <h2 class="late">⚠ عقب‌افتاده‌ها ({faNum(overdue.length)})</h2>
          {overdue.map((a) => (
            <div class="card row" style="border-color:var(--bad)" onClick={() => go('tasks')}>
              <span>📝</span>
              <div class="grow"><div class="title">{a.title}</div><div class="sub">{courseOf(a.course_id)?.name ?? 'بدون درس'} • مهلت: {formatJalali(a.due as number)}</div></div>
              <span class="badge late">{relativeDays(a.due as number)}</span>
            </div>
          ))}
        </>
      )}

      <h2>کلاس بعدی</h2>
      {nextClass ? (
        <div class="card row">
          <span class="dot" style={`background:${courseOf(nextClass.course_id)?.color}`} />
          <div class="grow"><div class="title">{courseOf(nextClass.course_id)?.name}</div><div class="sub">امروز {faNum(nextClass.start)} تا {faNum(nextClass.end)} {courseOf(nextClass.course_id)?.room ?? ''}</div></div>
        </div>
      ) : <div class="card sub">امروز کلاس دیگری نداری.</div>}

      {nextExam && (
        <>
          <h2>امتحان بعدی</h2>
          <div class="card row between"><div><div class="title">{nextExam.title}</div><div class="sub">{courseOf(nextExam.course_id)?.name} • {formatJalali(nextExam.date)}</div></div><span class={'badge ' + daysLeftClass(nextExam.date)}>{relativeDays(nextExam.date)}</span></div>
        </>
      )}

      <h2>کارهای امروز</h2>
      {!todayEv.length && <div class="card sub">برای امروز موردی ثبت نشده.</div>}
      {todayEv.map((e) => <EventRow e={e} />)}

      <h2>مهلت‌های نزدیک (۷ روز آینده)</h2>
      {!soon.length && <Empty text="چیزی در پیش نیست." />}
      {soon.map((e) => <EventRow e={e} />)}

      <h2>پیشرفت</h2>
      <div class="card">
        <div class="row between"><span>تکالیف انجام‌شده</span><span class="sub">{faNum(doneN)} از {faNum(total)}</span></div>
        <div class="bar" style="margin-top:6px"><div style={`width:${total ? (doneN / total) * 100 : 0}%`} /></div>
        <div class="sub" style="margin-top:8px">مطالعه ۷ روز اخیر: {faNum(Math.round(studyWeek / 60 * 10) / 10)} ساعت</div>
      </div>
      <button class="btn ghost block" onClick={() => go('more')}>امکانات بیشتر (نمرات، یادداشت، غیبت…)</button>
    </div>
  );
}

function EventRow({ e }: { e: Ev }) {
  const icon = { as: '📝', pr: '🎤', ex: '📚', rm: '🔔' }[e.kind];
  return (
    <div class="card row">
      <span>{icon}</span>
      <div class="grow"><div class="title">{e.title}</div><div class="sub">{e.sub} • {formatTime(e.ts)}</div></div>
      <span class={'badge ' + daysLeftClass(e.ts)}>{relativeDays(e.ts)}</span>
    </div>
  );
}

export function CalendarPage() {
  const s = useStore();
  const j = toJalali(new Date());
  const [y, setY] = useState(j.jy);
  const [m, setM] = useState(j.jm);
  const [sel, setSel] = useState<number | null>(startOfDay(Date.now()));
  const events = allEvents(s);
  const first = toGregorian(y, m, 1);
  const offset = WEEK_ORDER.indexOf(first.getDay());
  const len = jalaliMonthLength(y, m);
  const today = startOfDay(Date.now());
  const prev = () => (m === 1 ? (setM(12), setY(y - 1)) : setM(m - 1));
  const next = () => (m === 12 ? (setM(1), setY(y + 1)) : setM(m + 1));
  const selEv = sel ? events.filter((e) => startOfDay(e.ts) === sel) : [];
  const selClasses = sel && classActiveOn(s.settings, sel) ? s.sessions.filter((x) => x.weekday === new Date(sel).getDay()) : [];
  return (
    <div class="page">
      <h1>تقویم</h1>
      <div class="cal-head"><button class="icon" onClick={prev}>›</button><b>{MONTHS[m - 1]} {faNum(y)}</b><button class="icon" onClick={next}>‹</button></div>
      <div class="cal-grid">
        {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((w) => <div class="cal-w">{w}</div>)}
        {Array.from({ length: offset }).map(() => <div />)}
        {Array.from({ length: len }).map((_, i) => {
          const ts = toGregorian(y, m, i + 1).getTime();
          const has = events.some((e) => startOfDay(e.ts) === ts);
          return <button class={'cal-d' + (ts === today ? ' today' : '') + (ts === sel ? ' sel' : '')} onClick={() => setSel(ts)}>{faNum(i + 1)}{has && <i />}</button>;
        })}
      </div>
      {sel && <h2>{WEEKDAY_NAME(new Date(sel).getDay())} {formatJalali(sel, !!s.settings.showGregorian)}</h2>}
      {selClasses.sort((a, b) => a.start.localeCompare(b.start)).map((c) => (
        <div class="card row"><span class="dot" style={`background:${courseOf(c.course_id)?.color}`} /><div class="grow"><div class="title">{courseOf(c.course_id)?.name}</div><div class="sub">کلاس • {faNum(c.start)} تا {faNum(c.end)}</div></div></div>
      ))}
      {selEv.map((e) => <EventRow e={e} />)}
      {!selEv.length && !selClasses.length && <Empty text="این روز چیزی ثبت نشده." />}
    </div>
  );
}
