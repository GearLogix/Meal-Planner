import React, { createContext, useContext, useEffect, useState } from 'react';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = path => { window.location.hash = '#/' + path; };

export function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => {
    try { v === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key, v]);
  return [v, setV];
}

export const fmt = n => (n == null || Number.isNaN(n) ? '–' : Math.round(n).toLocaleString());
export const toggleIn = (arr, x) => (arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x]);
export const perServing = r => {
  const s = r.servings || 4;
  return { kcal: r.kcal / s, protein_g: r.protein_g / s, carbs_g: r.carbs_g / s, fat_g: ((r.sat_fat_g || 0) + (r.unsat_fat_g || 0)) / s };
};

// ---- dates (local time, YYYY-MM-DD) ----
export const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const today = () => ymd(new Date());
export const weekStart = s => { const d = parseYmd(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return ymd(d); };
export const dayLabel = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parseYmd(s).toLocaleDateString(undefined, opts);

export const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const on = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    const on = e => { setMsg(e.detail); clearTimeout(t); t = setTimeout(() => setMsg(null), 2600); };
    window.addEventListener('mp-toast', on);
    return () => window.removeEventListener('mp-toast', on);
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}
export const toast = m => window.dispatchEvent(new CustomEvent('mp-toast', { detail: m }));

export function MacroBar({ label, value, goal, unit = 'g' }) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal && value > goal * 1.05;
  return (
    <div className="mbar">
      <div className="mbar-top"><span>{label}</span><span>{fmt(value)}{unit}{goal ? ` / ${fmt(goal)}${unit}` : ''}</span></div>
      <div className="mbar-track"><div className={`mbar-fill ${over ? 'over' : ''}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
