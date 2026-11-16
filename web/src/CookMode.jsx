import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { scaleAmount } from '../../shared/scale.js';
import { useApp, useStored, go } from './lib.jsx';

const TEMP = /(\d{2,3}\s?°\s?[FC])/g;
const DUR = /(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;

function toSeconds(n, unit) {
  const u = unit.toLowerCase();
  if (u.startsWith('h')) return n * 3600;
  if (u.startsWith('s')) return n;
  return n * 60;
}
const mmss = s => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(r).padStart(2, '0')}`;
};

/** Split step text into plain strings, temperatures, and tappable durations. */
function annotate(text, onTimer, label) {
  const marks = [];
  for (const m of text.matchAll(TEMP)) marks.push({ i: m.index, len: m[0].length, kind: 'temp', t: m[0] });
  for (const m of text.matchAll(DUR)) {
    marks.push({ i: m.index, len: m[0].length, kind: 'dur', t: m[0], secs: toSeconds(Number(m[1]), m[3]) });
  }
  marks.sort((a, b) => a.i - b.i);
  const out = []; let pos = 0;
  marks.forEach((m, k) => {
    if (m.i < pos) return;
    out.push(text.slice(pos, m.i));
    out.push(m.kind === 'temp'
      ? <mark key={k} className="hl temp">{m.t}</mark>
      : <button key={k} className="hl dur" onClick={() => onTimer(m.secs, `${label}: ${m.t}`)} title="Start a timer">⏱ {m.t}</button>);
    pos = m.i + m.len;
  });
  out.push(text.slice(pos));
  return out;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* audio unavailable */ }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

export default function CookMode({ id }) {
  const { markCooked } = useApp();
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`mp.cook.${id}`) || 'null')?.step || 0; } catch { return 0; }
  });
  const [checked, setChecked] = useStored(`mp.cookcheck.${id}`, []);
  const [timers, setTimers] = useStored('mp.timers.v1', []);
  const [voice, setVoice] = useStored('mp.voice', false);
  const [now, setNow] = useState(Date.now());
  const [showIngs, setShowIngs] = useState(window.innerWidth > 820);
  const [wake, setWake] = useState(false);
  const firedRef = useRef(new Set());

  useEffect(() => { api.get(id).then(setR).catch(e => setErr(e.message)); }, [id]);

  // Persist progress so the recipe page can offer "Resume".
  useEffect(() => {
    if (!r) return;
    try { localStorage.setItem(`mp.cook.${id}`, JSON.stringify({ step, total: r.steps.length, at: Date.now() })); } catch { /* ignore */ }
  }, [id, r, step]);

  // Keep the screen awake while cooking.
  useEffect(() => {
    let lock = null, alive = true;
    const req = async () => {
      try { lock = await navigator.wakeLock?.request('screen'); setWake(!!lock); lock?.addEventListener('release', () => setWake(false)); }
      catch { setWake(false); }
    };
    req();
    const onVis = () => { if (alive && document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); lock?.release?.(); };
  }, []);

  // Timer ticking + alarms.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    for (const t of timers) {
      if (t.endsAt <= now && !firedRef.current.has(t.id)) {
        firedRef.current.add(t.id);
        beep();
        speak(`Timer done. ${t.label}`);
      }
    }
  }, [now, timers]);

  const speak = useCallback(text => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/°F/g, ' degrees').replace(/–/g, ' to '));
    u.rate = 1; window.speechSynthesis.speak(u);
  }, []);

  const s = r?.steps[step];
  useEffect(() => { if (voice && s) speak(`Step ${step + 1}. ${s.title}. ${s.text}`); }, [voice, s, step, speak]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const total = r?.steps.length || 0;
  const next = useCallback(() => setStep(x => Math.min(total - 1, x + 1)), [total]);
  const prev = useCallback(() => setStep(x => Math.max(0, x - 1)), []);
  useEffect(() => {
    const on = e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') go(`r/${encodeURIComponent(id)}`);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [next, prev, id]);

  if (err) return <div className="empty"><h2>Not found</h2><a href="#/">Back</a></div>;
  if (!r) return <div className="empty"><p>Loading…</p></div>;

  let servings = r.servings;
  try { servings = JSON.parse(localStorage.getItem(`mp.servings.${id}`) || 'null') || r.servings; } catch { /* ignore */ }
  const factor = servings / (r.servings || 4);

  const addTimer = (secs, label) => {
    setTimers([...timers, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, total: secs, endsAt: Date.now() + secs * 1000 }]);
  };
  const finish = async () => {
    await markCooked(id);
    localStorage.removeItem(`mp.cook.${id}`);
    localStorage.removeItem(`mp.cookcheck.${id}`);
    go(`r/${encodeURIComponent(id)}`);
  };
  const last = step === total - 1;

  return (
    <div className="cook">
      <header className="cook-top">
        <button className="icon-btn" onClick={() => go(`r/${encodeURIComponent(id)}`)} aria-label="Exit cook mode">✕</button>
        <div className="cook-title">
          <strong>Step {step + 1} of {total}</strong>
          <span>{r.title}</span>
        </div>
        <div className="cook-tools">
          {wake && <span className="muted small" title="Screen will stay on">☀︎ awake</span>}
          <button className={`icon-btn ${voice ? 'on' : ''}`} onClick={() => setVoice(!voice)} aria-label="Read steps aloud" title="Read steps aloud">{voice ? '🔊' : '🔈'}</button>
          <button className="icon-btn ings-toggle" onClick={() => setShowIngs(!showIngs)} aria-label="Ingredients">🧾</button>
        </div>
      </header>
      <div className="cook-progress"><div style={{ width: `${((step + 1) / total) * 100}%` }} /></div>

      <div className="cook-body">
        <main className="cook-step">
          <div className="big-num">{step + 1}</div>
          <h2>{s.title}</h2>
          <p className="step-text">{annotate(s.text, addTimer, `Step ${step + 1}`)}</p>
          <button className="link" onClick={() => speak(`${s.title}. ${s.text}`)}>🔊 Read this step</button>

          {timers.length > 0 && (
            <div className="timers">
              {timers.map(t => {
                const left = (t.endsAt - now) / 1000;
                const done = left <= 0;
                return (
                  <div key={t.id} className={`timer ${done ? 'done' : ''}`}>
                    <span className="t-left">{done ? 'Done' : mmss(left)}</span>
                    <span className="t-label">{t.label}</span>
                    <button className="link" onClick={() => setTimers(timers.filter(x => x.id !== t.id))}>{done ? 'Dismiss' : 'Cancel'}</button>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {showIngs && (
          <aside className="cook-ings">
            <div className="sec-row"><h3>Ingredients</h3><span className="muted small">{checked.length}/{r.ingredients.length} · serves {servings}</span></div>
            <ul>
              {r.ingredients.map((i, k) => (
                <li key={k}>
                  <label className={checked.includes(k) ? 'done' : ''}>
                    <input type="checkbox" checked={checked.includes(k)} onChange={() => setChecked(checked.includes(k) ? checked.filter(x => x !== k) : [...checked, k])} />
                    <span><strong>{i.name}</strong><small>{scaleAmount(i.amount, factor)}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="cook-nav">
        <button className="btn" onClick={prev} disabled={step === 0}>‹ Back</button>
        {last ? <button className="btn primary" onClick={finish}>✓ Done, mark as cooked</button>
          : <button className="btn primary" onClick={next}>Next ›</button>}
      </footer>
    </div>
  );
}
