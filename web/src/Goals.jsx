import React, { useState } from 'react';
import { api } from './api.js';
import { useApp, fmt, toast } from './lib.jsx';

const ACTIVITY = [
  [1.2, 'Sedentary (desk job, little exercise)'],
  [1.375, 'Light (1 to 3 workouts a week)'],
  [1.55, 'Moderate (3 to 5 workouts a week)'],
  [1.725, 'Very active (6 to 7 workouts a week)'],
  [1.9, 'Athlete (hard training plus physical job)'],
];
const GOALS = [['cut', 'Lose fat', -0.2], ['recomp', 'Recomp', -0.1], ['maintain', 'Maintain', 0], ['gain', 'Build muscle', 0.1]];

/** Mifflin-St Jeor BMR, activity TDEE, then protein by bodyweight, fat by % calories, carbs fill the rest. */
export function calcTargets(c) {
  const kg = c.weight_lb * 0.4536;
  const cm = (c.height_ft * 12 + Number(c.height_in || 0)) * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * c.age + (c.sex === 'male' ? 5 : -161);
  const tdee = bmr * c.activity;
  const adj = GOALS.find(g => g[0] === c.goal)?.[2] ?? 0;
  const kcal = Math.round((tdee * (1 + adj)) / 10) * 10;
  const protein_g = Math.round(c.weight_lb * c.protein_per_lb);
  const fat_g = Math.round((kcal * c.fat_pct) / 100 / 9);
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein_g, carbs_g, fat_g };
}

export default function Goals() {
  const { me, reloadMe } = useApp();
  const g = me.goals || {};
  const [vals, setVals] = useState({ kcal: g.kcal ?? '', protein_g: g.protein_g ?? '', carbs_g: g.carbs_g ?? '', fat_g: g.fat_g ?? '' });
  const [c, setC] = useState({
    sex: 'male', age: 45, weight_lb: 200, height_ft: 6, height_in: 0, activity: 1.55, goal: 'recomp', protein_per_lb: 1, fat_pct: 25,
    ...(g.calc || {}),
  });
  const calc = calcTargets(c);
  const macroKcal = Number(vals.protein_g || 0) * 4 + Number(vals.carbs_g || 0) * 4 + Number(vals.fat_g || 0) * 9;

  const save = async () => {
    try { await api.saveGoals({ ...vals, calc: c }); await reloadMe(); toast('Goals saved'); }
    catch (e) { toast(e.message); }
  };
  const num = (k, step = 1) => (
    <input type="number" step={step} inputMode="decimal" value={c[k]} onChange={e => setC({ ...c, [k]: Number(e.target.value) })} />
  );

  return (
    <div className="narrow">
      <a className="back show" href="#/plan">‹ Plan</a>
      <h2 className="page-title">Daily macro goals</h2>

      <section className="card">
        <h3>Your targets</h3>
        <div className="grid4">
          {[['kcal', 'Calories'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)']].map(([k, l]) => (
            <label key={k}>{l}<input inputMode="decimal" value={vals[k]} onChange={e => setVals({ ...vals, [k]: e.target.value })} /></label>
          ))}
        </div>
        {macroKcal > 0 && (
          <p className="muted small">
            Macros add up to {fmt(macroKcal)} kcal
            {vals.kcal ? ` (${macroKcal > vals.kcal * 1.05 ? 'over' : macroKcal < vals.kcal * 0.95 ? 'under' : 'matches'} your calorie target)` : ''}.
            Split: {fmt((vals.protein_g * 4 / macroKcal) * 100)}% P / {fmt((vals.carbs_g * 4 / macroKcal) * 100)}% C / {fmt((vals.fat_g * 9 / macroKcal) * 100)}% F.
          </p>
        )}
        <button className="btn primary" onClick={save}>Save goals</button>
      </section>

      <section className="card">
        <h3>Calculator</h3>
        <p className="muted small">Mifflin-St Jeor for resting burn, times your activity level, adjusted for your goal. Protein is set per pound of bodyweight, fat as a share of calories, and carbs fill the rest.</p>
        <div className="grid4">
          <label>Sex<select value={c.sex} onChange={e => setC({ ...c, sex: e.target.value })}><option value="male">Male</option><option value="female">Female</option></select></label>
          <label>Age{num('age')}</label>
          <label>Weight (lb){num('weight_lb')}</label>
          <label>Height<div className="pair">{num('height_ft')}<span>ft</span>{num('height_in')}<span>in</span></div></label>
        </div>
        <label>Activity<select value={c.activity} onChange={e => setC({ ...c, activity: Number(e.target.value) })}>
          {ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></label>
        <label>Goal<div className="seg wide">{GOALS.map(([k, l]) => <button key={k} className={c.goal === k ? 'on' : ''} onClick={() => setC({ ...c, goal: k })}>{l}</button>)}</div></label>
        <div className="grid4">
          <label>Protein g per lb{num('protein_per_lb', 0.1)}</label>
          <label>Fat % of calories{num('fat_pct')}</label>
        </div>
        <div className="calc-out">
          <div><small>Resting</small><strong>{fmt(calc.bmr)}</strong></div>
          <div><small>Maintenance</small><strong>{fmt(calc.tdee)}</strong></div>
          <div><small>Target kcal</small><strong>{fmt(calc.kcal)}</strong></div>
          <div><small>Protein</small><strong>{calc.protein_g}g</strong></div>
          <div><small>Carbs</small><strong>{calc.carbs_g}g</strong></div>
          <div><small>Fat</small><strong>{calc.fat_g}g</strong></div>
        </div>
        <button className="btn" onClick={() => setVals({ kcal: calc.kcal, protein_g: calc.protein_g, carbs_g: calc.carbs_g, fat_g: calc.fat_g })}>Use these targets</button>
      </section>
    </div>
  );
}
