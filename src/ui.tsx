import { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { useBack } from './back';
import { DAY, MONTHS, WEEK_ORDER, enNum, faNum, formatJalali, jalaliMonthLength, mergeDateTime, pad2, startOfDay, toGregorian, toJalali } from './lib/jalali';
import { REMIND_OPTIONS } from './services/notify';
import { useStore } from './store';

export function Sheet(p: { title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren }) {
  useBack(p.onClose);
  return (
    <div class="overlay" onClick={p.onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-h">
          <b>{p.title}</b>
          <button class="icon" onClick={p.onClose} aria-label="بستن">✕</button>
        </div>
        <div class="sheet-b">{p.children}</div>
        {p.footer && <div class="sheet-f">{p.footer}</div>}
      </div>
    </div>
  );
}

export const Field = (p: { label: string; children: ComponentChildren }) => (
  <label class="field"><span>{p.label}</span>{p.children}</label>
);

export const Empty = (p: { text: string }) => <div class="empty">{p.text}</div>;

export function confirmDo(msg: string): boolean {
  return window.confirm(msg);
}

/** Jalali date (+ optional time) picker. value = timestamp or null */
export function DateField(p: { label: string; value: number | null; onChange: (v: number | null) => void; withTime?: boolean }) {
  const [open, setOpen] = useState(false);
  const showG = !!useStore().settings.showGregorian;
  const d = p.value ? new Date(p.value) : null;
  const time = d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '23:59';
  return (
    <div class="field">
      <span>{p.label}</span>
      <div class="row">
        <button type="button" class="input btn-like" onClick={() => setOpen(true)}>
          {p.value ? formatJalali(p.value, false) : 'انتخاب تاریخ…'}
        </button>
        {p.withTime && (
          <input class="input time" type="time" value={time} onInput={(e) => p.value && p.onChange(mergeDateTime(startOfDay(p.value), (e.target as HTMLInputElement).value))} />
        )}
        {p.value && <button type="button" class="icon" onClick={() => p.onChange(null)}>✕</button>}
      </div>
      {p.value && showG && <small class="muted">میلادی: {d!.getFullYear()}/{pad2(d!.getMonth() + 1)}/{pad2(d!.getDate())}</small>}
      {open && (
        <JalaliPicker
          initial={p.value ?? Date.now()}
          onPick={(day) => { p.onChange(mergeDateTime(day, time)); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function JalaliPicker(p: { initial: number; onPick: (dayTs: number) => void; onClose: () => void }) {
  const j0 = toJalali(new Date(p.initial));
  const [y, setY] = useState(j0.jy);
  const [m, setM] = useState(j0.jm);
  const first = toGregorian(y, m, 1);
  const offset = WEEK_ORDER.indexOf(first.getDay());
  const len = jalaliMonthLength(y, m);
  const today = startOfDay(Date.now());
  const prev = () => (m === 1 ? (setM(12), setY(y - 1)) : setM(m - 1));
  const next = () => (m === 12 ? (setM(1), setY(y + 1)) : setM(m + 1));
  return (
    <Sheet title="انتخاب تاریخ" onClose={p.onClose}>
      <div class="cal-head">
        <button class="icon" onClick={prev}>›</button>
        <b>{MONTHS[m - 1]} {faNum(y)}</b>
        <button class="icon" onClick={next}>‹</button>
      </div>
      <div class="cal-grid">
        {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((w) => <div class="cal-w">{w}</div>)}
        {Array.from({ length: offset }).map(() => <div />)}
        {Array.from({ length: len }).map((_, i) => {
          const ts = toGregorian(y, m, i + 1).getTime();
          return <button class={'cal-d' + (ts === today ? ' today' : '')} onClick={() => p.onPick(ts)}>{faNum(i + 1)}</button>;
        })}
      </div>
      <button class="btn ghost" onClick={() => p.onPick(today)}>امروز</button>
    </Sheet>
  );
}

export function CoursePick(p: { value: string | null; onChange: (v: string | null) => void; label?: string }) {
  const { courses } = useStore();
  return (
    <Field label={p.label ?? 'درس'}>
      <select class="input" value={p.value ?? ''} onChange={(e) => p.onChange((e.target as HTMLSelectElement).value || null)}>
        <option value="">— بدون درس —</option>
        {courses.map((c) => <option value={c.id}>{c.name}</option>)}
      </select>
    </Field>
  );
}

export function RemindPick(p: { value: number[]; onChange: (v: number[]) => void }) {
  const toggle = (ms: number) => p.onChange(p.value.includes(ms) ? p.value.filter((x) => x !== ms) : [...p.value, ms]);
  return (
    <Field label="یادآوری">
      <div class="chips">
        {REMIND_OPTIONS.map((o) => (
          <button type="button" class={'chip' + (p.value.includes(o.ms) ? ' on' : '')} onClick={() => toggle(o.ms)}>{o.label}</button>
        ))}
      </div>
    </Field>
  );
}

/** editable checklist: used for subtasks and presentation prep */
export function Checklist(p: { items: { t: string; done: boolean }[]; onChange: (v: { t: string; done: boolean }[]) => void; label: string }) {
  const [txt, setTxt] = useState('');
  const add = () => {
    const t = txt.trim();
    if (!t) return;
    p.onChange([...p.items, { t, done: false }]);
    setTxt('');
  };
  return (
    <Field label={p.label}>
      {p.items.map((it, i) => (
        <div class="row check">
          <input type="checkbox" checked={it.done} onChange={() => p.onChange(p.items.map((x, k) => (k === i ? { ...x, done: !x.done } : x)))} />
          <span class={it.done ? 'done' : ''}>{it.t}</span>
          <button type="button" class="icon" onClick={() => p.onChange(p.items.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      <div class="row">
        <input class="input" value={txt} placeholder="مورد جدید…" onInput={(e) => setTxt((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button type="button" class="btn small" onClick={add}>+</button>
      </div>
    </Field>
  );
}

export const num = (s: string) => {
  const n = parseFloat(enNum(s).replace('٫', '.').replace(',', '.'));
  return Number.isNaN(n) ? NaN : n;
};

export const daysLeftClass = (ts: number) => {
  const d = Math.round((startOfDay(ts) - startOfDay(Date.now())) / DAY);
  return d < 0 ? 'late' : d <= 1 ? 'soon' : '';
};
