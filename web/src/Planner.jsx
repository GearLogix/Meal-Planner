import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useApp, useStored, fmt, perServing, Modal, MacroBar, toast, today, addDays, weekStart, dayLabel, SLOTS, go } from './lib.jsx';

const sum = (items, k) => items.reduce((s, i) => s + (i[k] || 0), 0);

export default function Planner() {
  const { me } = useApp();
  const [start, setStart] = useState(() => weekStart(today()));
  const [day, setDay] = useStored('mp.planDay', today());
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(null); // { date, slot }
  const goals = me.goals || {};
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const end = days[6];

  const load = useCallback(() => api.plan(start, end).then(setItems).catch(e => toast(e.message)), [start, end]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!days.includes(day)) setDay(days[0]); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = d => items.filter(i => i.date === d);
  const weekAvg = k => days.reduce((s, d) => s + sum(byDay(d), k), 0) / Math.max(1, days.filter(d => byDay(d).length).length);

  const remove = async id => { await api.removePlan(id); load(); };
  const setServ = async (it, servings) => { if (servings <= 0) return remove(it.id); await api.updatePlan(it.id, { servings }); load(); };
  const copyToNext = async d => { await api.copyDay(d, addDays(d, 1)); toast(`Copied to ${dayLabel(addDays(d, 1))}`); load(); };

  const fillGap = d => {
    const dayItems = byDay(d);
    const gap = {
      kcal: Math.max(0, (goals.kcal || 0) - sum(dayItems, 'kcal')),
      protein_g: Math.max(0, (goals.protein_g || 0) - sum(dayItems, 'protein_g')),
      carbs_g: Math.max(0, (goals.carbs_g || 0) - sum(dayItems, 'carbs_g')),
      fat_g: Math.max(0, (goals.fat_g || 0) - sum(dayItems, 'fat_g')),
    };
    const open = SLOTS.find(s => !dayItems.some(i => i.slot === s)) || 'Snack';
    sessionStorage.setItem('mp.genSeed', JSON.stringify({ meal_type: open, targets: Object.fromEntries(Object.entries(gap).map(([k, v]) => [k, Math.round(v)])), servings: 1, planDate: d }));
    go('new');
  };

  return (
    <div className="planner">
      <div className="plan-head">
        <div className="week-nav">
          <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">‹</button>
          <strong>{dayLabel(start, { month: 'short', day: 'numeric' })} to {dayLabel(end, { month: 'short', day: 'numeric' })}</strong>
          <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">›</button>
          {start !== weekStart(today()) && <button className="link" onClick={() => { setStart(weekStart(today())); setDay(today()); }}>This week</button>}
        </div>
        <div className="plan-links">
          <a className="btn sm" href="#/goals">🎯 Goals</a>
          <a className="btn sm" href={`#/grocery`} onClick={() => sessionStorage.setItem('mp.groceryRange', JSON.stringify({ from: start, to: end }))}>🛒 Shop this week</a>
        </div>
      </div>

      {!me.goals && <div className="banner">Set your daily macro goals to see progress for each day. <a href="#/goals">Set goals ›</a></div>}

      <div className="week-summary">
        <span>Week average (planned days):</span>
        <span>{fmt(weekAvg('kcal'))} kcal</span><span>{fmt(weekAvg('protein_g'))}g P</span><span>{fmt(weekAvg('carbs_g'))}g C</span><span>{fmt(weekAvg('fat_g'))}g F</span>
      </div>

      <div className="day-tabs">
        {days.map(d => (
          <button key={d} className={`${d === day ? 'on' : ''} ${d === today() ? 'today' : ''}`} onClick={() => setDay(d)}>
            <span>{dayLabel(d, { weekday: 'short' })}</span><strong>{dayLabel(d, { day: 'numeric' })}</strong>
            <i style={{ opacity: byDay(d).length ? 1 : 0 }} />
          </button>
        ))}
      </div>

      <div className="week-grid">
        {days.map(d => {
          const di = byDay(d);
          const totals = { kcal: sum(di, 'kcal'), protein_g: sum(di, 'protein_g'), carbs_g: sum(di, 'carbs_g'), fat_g: sum(di, 'fat_g') };
          const short = me.goals && totals.protein_g < (goals.protein_g || 0) * 0.95;
          return (
            <section key={d} className={`day ${d === day ? 'selected' : ''} ${d === today() ? 'today' : ''}`}>
              <header>
                <h3>{d === today() ? 'Today' : dayLabel(d, { weekday: 'long' })}<small>{dayLabel(d, { month: 'short', day: 'numeric' })}</small></h3>
                {di.length > 0 && <button className="link small" onClick={() => copyToNext(d)} title="Copy this day to the next day">Copy ›</button>}
              </header>
              <div className="macros">
                <MacroBar label="Calories" value={totals.kcal} goal={goals.kcal} unit="" />
                <MacroBar label="Protein" value={totals.protein_g} goal={goals.protein_g} />
                <MacroBar label="Carbs" value={totals.carbs_g} goal={goals.carbs_g} />
                <MacroBar label="Fat" value={totals.fat_g} goal={goals.fat_g} />
              </div>
              {SLOTS.map(slot => {
                const si = di.filter(i => i.slot === slot);
                return (
                  <div key={slot} className="slot">
                    <div className="slot-head"><span>{slot}</span><button className="link small" onClick={() => setAdding({ date: d, slot })}>+ Add</button></div>
                    {si.map(it => (
                      <div key={it.id} className="pitem">
                        <div className="pi-main">
                          {it.recipe_id ? <a href={`#/r/${encodeURIComponent(it.recipe_id)}`}>{it.name}</a> : <span>{it.name}</span>}
                          <small>{fmt(it.kcal)} kcal · {fmt(it.protein_g)}g P · {fmt(it.carbs_g)}g C · {fmt(it.fat_g)}g F</small>
                        </div>
                        {it.recipe_id ? (
                          <div className="stepper sm">
                            <button onClick={() => setServ(it, it.servings - 0.5)} aria-label="Less">−</button>
                            <span>{it.servings}</span>
                            <button onClick={() => setServ(it, it.servings + 0.5)} aria-label="More">+</button>
                          </div>
                        ) : <button className="icon-btn sm" onClick={() => remove(it.id)} aria-label="Remove">✕</button>}
                      </div>
                    ))}
                  </div>
                );
              })}
              {me.goals && short && di.length > 0 && (
                <button className="btn sm block ghost" onClick={() => fillGap(d)}>✨ Fill the gap: {fmt(goals.protein_g - totals.protein_g)}g protein</button>
              )}
            </section>
          );
        })}
      </div>

      {adding && <AddItem {...adding} onClose={changed => { setAdding(null); if (changed) load(); }} />}
    </div>
  );
}

function AddItem({ date, slot, onClose }) {
  const { recipes, favorites } = useApp();
  const [tab, setTab] = useState('recipe');
  const [q, setQ] = useState('');
  const [onlySlot, setOnlySlot] = useState(slot !== 'Dinner');
  const [servings, setServings] = useState(1);
  const [custom, setCustom] = useState({ custom_name: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '' });

  const list = (recipes || []).filter(r =>
    (!onlySlot || r.meal_type === slot) &&
    (!q || r.title.toLowerCase().includes(q.toLowerCase()) || r.ingredients.some(i => i.toLowerCase().includes(q.toLowerCase()))))
    .sort((a, b) => (favorites.includes(b.id) - favorites.includes(a.id)) || perServing(b).protein_g - perServing(a).protein_g)
    .slice(0, 60);

  const addRecipe = async r => {
    try { await api.addPlan({ date, slot, recipe_id: r.id, servings }); onClose(true); }
    catch (e) { toast(e.message); }
  };
  const addCustom = async e => {
    e.preventDefault();
    try { await api.addPlan({ date, slot, ...custom }); onClose(true); }
    catch (e2) { toast(e2.message); }
  };

  return (
    <Modal title={`${slot} · ${dayLabel(date)}`} onClose={() => onClose(false)} wide>
      <div className="seg wide">
        <button className={tab === 'recipe' ? 'on' : ''} onClick={() => setTab('recipe')}>Recipe</button>
        <button className={tab === 'quick' ? 'on' : ''} onClick={() => setTab('quick')}>Quick add</button>
      </div>
      {tab === 'recipe' ? (
        <>
          <div className="picker-bar">
            <input className="search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} autoFocus />
            <label className="check"><input type="checkbox" checked={onlySlot} onChange={e => setOnlySlot(e.target.checked)} /> {slot} only</label>
            <div className="stepper sm" title="Servings">
              <button onClick={() => setServings(Math.max(0.5, servings - 0.5))}>−</button><span>{servings}</span>
              <button onClick={() => setServings(servings + 0.5)}>+</button>
            </div>
          </div>
          <ul className="picker">
            {list.map(r => {
              const ps = perServing(r);
              return (
                <li key={r.id}>
                  <button onClick={() => addRecipe(r)}>
                    <span>{favorites.includes(r.id) ? '★ ' : ''}{r.title}<small>{r.meal_type} · {r.time_label || '–'}</small></span>
                    <span className="pk-m">{fmt(ps.protein_g * servings)}g P<small>{fmt(ps.kcal * servings)} kcal</small></span>
                  </button>
                </li>
              );
            })}
            {!list.length && <li className="muted small">No matches. {onlySlot && `Untick "${slot} only" or `}add a {slot.toLowerCase()} recipe from the Recipes tab.</li>}
          </ul>
        </>
      ) : (
        <form className="form" onSubmit={addCustom}>
          <label>Food<input value={custom.custom_name} onChange={e => setCustom({ ...custom, custom_name: e.target.value })} placeholder="Protein shake, Greek yogurt cup…" required /></label>
          <div className="grid4">
            {[['kcal', 'Calories'], ['protein_g', 'Protein g'], ['carbs_g', 'Carbs g'], ['fat_g', 'Fat g']].map(([k, l]) => (
              <label key={k}>{l}<input inputMode="decimal" value={custom[k]} onChange={e => setCustom({ ...custom, [k]: e.target.value })} /></label>
            ))}
          </div>
          <button className="btn primary block">Add</button>
        </form>
      )}
    </Modal>
  );
}
