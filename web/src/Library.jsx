import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { scaleAmount } from '../../shared/scale.js';
import { useApp, useStored, fmt, toggleIn, perServing, Modal, toast, today, addDays, dayLabel, SLOTS, go } from './lib.jsx';

const PROTEINS = ['Salmon', 'Shrimp', 'Seafood', 'Chicken', 'Turkey', 'Beef', 'Pork', 'Lamb', 'Eggs', 'Dairy', 'Plant-based'];
const METHODS = ['Sous vide', 'Grill', 'Bake', 'Sear', 'Air fryer', 'Slow cooker', 'Stovetop', 'No-cook', 'Blender'];
const TIMES = ['Under 30 min', '30–60 min', '1–2 hr', '2–4 hr', '4+ hr'];
const TYPES = ['Soups & stews', 'Mains'];
const SERVING_OPTS = [1, 2, 4, 6, 8];
const EMPTY = { protein: [], method: [], time: [], meal: [], type: [], mine: [] };

export default function Library({ selectedId }) {
  const { recipes, favorites, cooked } = useApp();
  const [q, setQ] = useState('');
  const [f, setF] = useStored('mp.filters.v2', EMPTY);
  const [open, setOpen] = useStored('mp.filtersOpen', window.innerWidth > 820);
  const [sort, setSort] = useStored('mp.sort', 'id');

  const present = useMemo(() => ({
    protein: PROTEINS.filter(p => recipes?.some(r => r.protein === p)),
    method: METHODS.filter(m => recipes?.some(r => r.method === m)),
  }), [recipes]);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const needle = q.trim().toLowerCase();
    const list = recipes.filter(r =>
      (!f.protein.length || f.protein.includes(r.protein)) &&
      (!f.method.length || f.method.includes(r.method)) &&
      (!f.time.length || f.time.includes(r.time_range)) &&
      (!f.meal.length || f.meal.includes(r.meal_type)) &&
      (!f.type.length || f.type.includes(r.is_soup ? 'Soups & stews' : 'Mains')) &&
      (!f.mine.includes('★ Favorites') || favorites.includes(r.id)) &&
      (!f.mine.includes('Cooked before') || cooked[r.id]) &&
      (!needle || r.title.toLowerCase().includes(needle) || r.ingredients.some(i => i.toLowerCase().includes(needle))));
    const key = {
      id: (a, b) => a.id.localeCompare(b.id),
      protein: (a, b) => perServing(b).protein_g - perServing(a).protein_g,
      ratio: (a, b) => perServing(b).protein_g / perServing(b).kcal - perServing(a).protein_g / perServing(a).kcal,
      kcal: (a, b) => perServing(a).kcal - perServing(b).kcal,
      time: (a, b) => (a.total_min ?? 999) - (b.total_min ?? 999),
    }[sort] || (() => 0);
    return list.sort(key);
  }, [recipes, q, f, favorites, cooked, sort]);

  const activeCount = Object.values(f).reduce((n, a) => n + a.length, 0);
  const set = k => x => setF({ ...f, [k]: toggleIn(f[k], x) });

  return (
    <div className={`library ${selectedId ? 'has-detail' : ''}`}>
      <aside className="sidebar">
        <div className="side-head">
          <input className="search" type="search" placeholder="Search recipes and ingredients" value={q} onChange={e => setQ(e.target.value)} />
          <a className="btn primary sm" href="#/new">+ Add</a>
        </div>

        <div className="filter-bar">
          <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide filters' : 'Filters'}{activeCount ? ` (${activeCount})` : ''}</button>
          {activeCount > 0 && <button className="link" onClick={() => setF(EMPTY)}>Clear</button>}
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
            <option value="id">Sort: Code</option>
            <option value="protein">Most protein</option>
            <option value="ratio">Best protein per calorie</option>
            <option value="kcal">Fewest calories</option>
            <option value="time">Quickest</option>
          </select>
        </div>

        {open && (
          <div className="filters">
            <ChipGroup label="Meal" opts={['Breakfast', 'Lunch', 'Dinner', 'Snack']} sel={f.meal} on={set('meal')} />
            <ChipGroup label="Protein" opts={present.protein} sel={f.protein} on={set('protein')} />
            <ChipGroup label="Method" opts={present.method} sel={f.method} on={set('method')} />
            <ChipGroup label="Cook time" opts={TIMES} sel={f.time} on={set('time')} />
            <ChipGroup label="Type" opts={TYPES} sel={f.type} on={set('type')} />
            <ChipGroup label="Mine" opts={['★ Favorites', 'Cooked before']} sel={f.mine} on={set('mine')} />
          </div>
        )}

        <div className="count">{recipes ? `${filtered.length} of ${recipes.length} recipes` : 'Loading…'}</div>
        <ul className="list">
          {filtered.map(r => {
            const ps = perServing(r);
            return (
              <li key={r.id}>
                <a href={`#/r/${encodeURIComponent(r.id)}`} className={r.id === selectedId ? 'active' : ''}>
                  <div className="li-main">
                    <div className="li-title">{favorites.includes(r.id) && <span className="fav-dot">★ </span>}{r.title}</div>
                    <div className="li-meta">{r.id} · {r.method || r.meal_type} · {r.time_label || '–'}{cooked[r.id] ? ' · ✓ cooked' : ''}</div>
                  </div>
                  <div className="li-macro">
                    <strong>{fmt(ps.protein_g)}g</strong><span>protein</span><span>{fmt(ps.kcal)} kcal</span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="detail">
        {selectedId
          ? <RecipeDetail key={selectedId} id={selectedId} />
          : <div className="empty"><h2>Pick a recipe</h2><p>Choose one to see ingredients, macros and steps, or open the Plan tab to build your week.</p></div>}
      </main>
    </div>
  );
}

function ChipGroup({ label, opts, sel, on }) {
  if (!opts.length) return null;
  return (
    <div className="chip-group">
      <div className="chip-label">{label}</div>
      <div className="chips">
        {opts.map(o => <button key={o} className={`chip ${sel.includes(o) ? 'on' : ''}`} aria-pressed={sel.includes(o)} onClick={() => on(o)}>{o}</button>)}
      </div>
    </div>
  );
}

export function cookProgress(id) {
  try { return JSON.parse(localStorage.getItem(`mp.cook.${id}`) || 'null'); } catch { return null; }
}

function RecipeDetail({ id }) {
  const { me, favorites, toggleFavorite, cooked, markCooked } = useApp();
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  const [servings, setServings] = useStored(`mp.servings.${id}`, null);
  const [planOpen, setPlanOpen] = useState(false);
  const [progress, setProgress] = useState(() => cookProgress(id));

  useEffect(() => { api.get(id).then(setR).catch(e => setErr(e.message)); }, [id]);

  if (err) return <div className="empty"><h2>Not found</h2><p>{err}</p><a href="#/">Back</a></div>;
  if (!r) return <div className="empty"><p>Loading…</p></div>;

  const base = r.servings || 4;
  const sv = servings || base;
  const factor = sv / base;
  const c = cooked[id];
  const fav = favorites.includes(id);
  const rows = [
    ['Calories', r.kcal, ''], ['Protein', r.protein_g, 'g'], ['Carbs', r.carbs_g, 'g'], ['Fat (total)', r.fat_g, 'g'],
    ['Saturated', r.sat_fat_g, 'g', true], ['Unsaturated', r.unsat_fat_g, 'g', true],
  ];

  const addToList = async () => {
    try { await api.addGrocery({ recipe_id: id, servings: sv }); toast(`Added ${sv} servings to your grocery list`); }
    catch (e) { toast(e.message); }
  };

  return (
    <article className="recipe">
      <a className="back" href="#/">‹ All recipes</a>
      <div className="r-head">
        <h2>{r.title}</h2>
        <button className={`star ${fav ? 'on' : ''}`} onClick={() => toggleFavorite(id)} aria-label={fav ? 'Remove favorite' : 'Add favorite'}>{fav ? '★' : '☆'}</button>
      </div>
      <div className="tags">
        {r.protein && <span className="tag accent">{r.protein}</span>}
        {r.method && <span className="tag">{r.method}</span>}
        <span className="tag">{r.meal_type}</span>
        {r.time_label && <span className="tag">⏱ {r.time_label} total</span>}
        {r.active_min != null && <span className="tag">{r.active_min} min active</span>}
        {r.source === 'ai' && <span className="tag">AI</span>}
        <span className="tag muted">{r.id}</span>
      </div>
      {r.description && <p className="desc">{r.description}</p>}

      {progress && progress.step > 0 && (
        <div className="resume">
          <span>You stopped at step {progress.step + 1} of {r.steps.length}.</span>
          <a className="btn primary sm" href={`#/cook/${encodeURIComponent(id)}`}>Resume</a>
          <button className="link" onClick={() => { localStorage.removeItem(`mp.cook.${id}`); setProgress(null); }}>Start over</button>
        </div>
      )}

      <div className="actions">
        <button className="btn primary" onClick={() => { if (!progress) localStorage.removeItem(`mp.cook.${id}`); go(`cook/${encodeURIComponent(id)}`); }}>🍳 Cook now</button>
        <button className="btn" onClick={() => setPlanOpen(true)}>📅 Add to plan</button>
        <button className="btn" onClick={addToList}>🛒 Grocery list</button>
      </div>
      <div className="status-row">
        <span className="muted">{c ? `Cooked ${c.count}× · last ${new Date(c.last + 'Z').toLocaleDateString()}` : 'Not cooked yet'}</span>
        <span>
          {c && <button className="link" onClick={() => markCooked(id, true)}>Undo</button>}
          <button className="link" onClick={() => markCooked(id)}>✓ Mark as cooked</button>
          {me.isAdmin && <a className="link" href={`#/edit/${encodeURIComponent(id)}`}>Edit</a>}
        </span>
      </div>

      <section>
        <div className="sec-row">
          <h3>Servings</h3>
          <div className="seg">
            {SERVING_OPTS.map(n => <button key={n} className={n === sv ? 'on' : ''} onClick={() => setServings(n === base ? null : n)}>{n}</button>)}
          </div>
        </div>
      </section>

      <section>
        <h3>Nutrition</h3>
        <table className="nutri">
          <thead><tr><th></th><th>Entire recipe</th><th>Per serving</th></tr></thead>
          <tbody>
            {rows.map(([label, v, unit, sub]) => (
              <tr key={label} className={sub ? 'sub' : ''}><td>{label}</td><td>{fmt(v * factor)}{unit}</td><td>{fmt(v / base)}{unit}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="note">Makes {sv} serving{sv === 1 ? '' : 's'}. {r.protein_g && r.kcal ? `${fmt((r.protein_g * 4 / r.kcal) * 100)}% of calories from protein.` : ''}</p>
      </section>

      <section>
        <h3>Ingredients</h3>
        <ul className="ings">
          {r.ingredients.map((i, k) => (
            <li key={k}><span className="amt">{scaleAmount(i.amount, factor)}</span><span className="ing">{i.name}{i.pantry && <em className="pantry">pantry</em>}</span></li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Steps</h3>
        <ol className="steps">
          {r.steps.map((s, k) => <li key={k}><span className="num">{k + 1}</span><div><strong>{s.title}.</strong> {s.text}</div></li>)}
        </ol>
      </section>

      {r.sides?.length > 0 && (
        <section>
          <h3>Suggested sides</h3>
          <ul className="sides">{r.sides.map((s, k) => <li key={k}><strong>{s.name}</strong>{s.desc && <span>{s.desc}</span>}</li>)}</ul>
        </section>
      )}
      {r.tip && <aside className="tip"><strong>Tip</strong><p>{r.tip}</p></aside>}

      {planOpen && <AddToPlan recipe={r} onClose={() => setPlanOpen(false)} />}
    </article>
  );
}

export function AddToPlan({ recipe, onClose, date: initialDate, slot: initialSlot }) {
  const [date, setDate] = useState(initialDate || today());
  const [slot, setSlot] = useState(initialSlot || recipe.meal_type || 'Dinner');
  const [servings, setServings] = useState(1);
  const ps = perServing(recipe);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i));

  const save = async () => {
    try {
      await api.addPlan({ date, slot, recipe_id: recipe.id, servings });
      toast(`Added to ${slot}, ${dayLabel(date)}`);
      onClose(true);
    } catch (e) { toast(e.message); }
  };

  return (
    <Modal title={`Add to plan: ${recipe.title}`} onClose={() => onClose(false)}>
      <label>Day
        <select value={date} onChange={e => setDate(e.target.value)}>
          {!days.includes(date) && <option value={date}>{dayLabel(date)}</option>}
          {days.map(d => <option key={d} value={d}>{d === today() ? 'Today' : dayLabel(d)}</option>)}
        </select>
      </label>
      <label>Meal
        <div className="seg wide">{SLOTS.map(s => <button key={s} className={s === slot ? 'on' : ''} onClick={() => setSlot(s)}>{s}</button>)}</div>
      </label>
      <label>Servings you'll eat
        <div className="stepper">
          <button onClick={() => setServings(Math.max(0.5, servings - 0.5))}>−</button>
          <span>{servings}</span>
          <button onClick={() => setServings(servings + 0.5)}>+</button>
        </div>
      </label>
      <p className="muted small">{fmt(ps.kcal * servings)} kcal · {fmt(ps.protein_g * servings)}g protein · {fmt(ps.carbs_g * servings)}g carbs · {fmt(ps.fat_g * servings)}g fat</p>
      <button className="btn primary block" onClick={save}>Add</button>
    </Modal>
  );
}
