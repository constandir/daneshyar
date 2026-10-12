import { useEffect, useState } from 'preact/hooks';
import { App as CapApp } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { handleBack, useBack } from './back';
import { verifyPin } from './lock';
import { CalendarPage, Dashboard } from './pages/home';
import { More } from './pages/more';
import { Schedule } from './pages/schedule';
import { Tasks } from './pages/tasks';
import { autoBackup } from './services/backup';
import { rescheduleAll } from './services/notify';
import { load, updateSetting, useStore } from './store';
import { DAY, formatJalali } from './lib/jalali';

const TABS = [
  { k: 'home', icon: '🏠', t: 'داشبورد' },
  { k: 'schedule', icon: '📅', t: 'برنامه' },
  { k: 'tasks', icon: '✅', t: 'کارها' },
  { k: 'calendar', icon: '🗓️', t: 'تقویم' },
  { k: 'more', icon: '☰', t: 'بیشتر' },
];

export function App() {
  const s = useStore();
  const [tab, setTab] = useState('home');
  const [locked, setLocked] = useState(true);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    (async () => {
      await load();
      setBooted(true);
      rescheduleAll().catch(console.error);
    })();
    // re-sync notifications and re-lock whenever the app returns from background
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) rescheduleAll().catch(console.error);
      else setLocked(true);
    });
    // Android back button / gesture: close the top-most sheet or sub-page first,
    // then return to the home tab, and only then leave the app.
    const back = CapApp.addListener('backButton', () => {
      if (!handleBack()) CapApp.exitApp();
    });
    return () => {
      sub.then((h) => h.remove()).catch(() => {});
      back.then((h) => h.remove()).catch(() => {});
    };
  }, []);

  useBack(() => setTab('home'), tab !== 'home' && !locked);

  // theme
  useEffect(() => {
    const t = s.settings.theme ?? 'auto';
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    // dark icons on the light theme, light icons on the dark theme (status + navigation bar)
    if (Capacitor.isNativePlatform()) SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }, [s.settings.theme]);

  // auto backup once per day on launch
  useEffect(() => {
    if (!booted || (s.settings.autoBackup ?? true) === false) return;
    const last = s.settings.lastAutoBackup ?? 0;
    if (Date.now() - last > DAY) {
      autoBackup().then(() => updateSetting('lastAutoBackup', Date.now())).catch(() => {});
    }
  }, [booted]);

  if (!booted) return <div class="empty">در حال بارگذاری…</div>;
  if (s.settings.pinHash && locked) return <Lock salt={s.settings.pinSalt} hash={s.settings.pinHash} onOk={() => setLocked(false)} />;

  const every = s.settings.backupEveryDays ?? 7;
  const last = s.settings.lastBackup as number | undefined;
  const needBackup = every > 0 && s.courses.length + s.assignments.length > 0 && (!last || Date.now() - last > every * DAY);

  return (
    <>
      {needBackup && (
        <div class="card" style="margin:10px;border-color:var(--warn)" onClick={() => setTab('more')}>
          💾 مدت زیادی از آخرین بکاپ گذشته ({last ? formatJalali(last) : 'هیچ‌وقت'}). از «بیشتر ← پشتیبان‌گیری» بکاپ بگیر.
        </div>
      )}
      {tab === 'home' && <Dashboard go={setTab} />}
      {tab === 'schedule' && <Schedule />}
      {tab === 'tasks' && <Tasks />}
      {tab === 'calendar' && <CalendarPage />}
      {tab === 'more' && <More />}
      <nav class="tabs">
        {TABS.map((t) => (
          <button class={'tab' + (tab === t.k ? ' on' : '')} onClick={() => setTab(t.k)}><span>{t.icon}</span>{t.t}</button>
        ))}
      </nav>
    </>
  );
}

function Lock({ salt, hash, onOk }: { salt: string; hash: string; onOk: () => void }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  async function submit() {
    if (await verifyPin(pin, salt, hash)) onOk();
    else { setBad(true); setPin(''); }
  }
  return (
    <div class="page" style="text-align:center;padding-top:20vh">
      <h1>🔒 دانشیار</h1>
      <input class="input" type="password" inputMode="numeric" autoFocus value={pin} placeholder="پین" style="text-align:center;max-width:220px"
        onInput={(e) => { setPin((e.target as HTMLInputElement).value); setBad(false); }}
        onKeyDown={(e) => e.key === 'Enter' && submit()} />
      {bad && <p class="late">پین اشتباه است.</p>}
      <div><button class="btn" style="margin-top:12px" onClick={submit}>ورود</button></div>
    </div>
  );
}
