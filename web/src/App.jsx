import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { scaleAmount } from './scale.js';

const PROTEINS = ['Salmon', 'Shrimp', 'Seafood', 'Chicken', 'Turkey', 'Beef', 'Pork', 'Lamb', 'Eggs', 'Plant-based'];
const METHODS = ['Sous vide', 'Grill', 'Bake', 'Sear', 'Air fryer', 'Slow cooker', 'Stovetop'];
const TIMES = ['Under 30 min', '30–60 min', '1–2 hr', '2–4 hr', '4+ hr'];
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const TYPES = ['Soups & stews', 'Mains'];
const SERVING_OPTS = [1, 2, 4, 6, 8];

// ---------- small hooks ----------
function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }, [key, v]);
  return [v, setV];
}

const toggleIn = (arr, x) => (arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x]);
const fmt = n => (n == null ? '–' : Math.round(n).toLocaleString());

// ---------- app ----------
export default function App() {
  const route = useHashRoute();
  const selectedId = route.startsWith('r/') ? decodeURIComponent(route.slice(2)) : null;

  const [recipes, setRecipes] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [f, setF] = useStored('mp.filters.v1', { protein: [], method: [], time: [], meal: [], type: [], favOnly: false });
  const [favs, setFavs] = useStored('mp.favorites.v1', []);

  useEffect(() => { api.list().then(setRecipes).catch(e => setError(e.message)); }, []);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const needle = q.trim().toLowerCase();
    return recipes.filter(r =>
      (!f.protein.length || f.protein.includes(r.protein)) &&
      (!f.method.length || f.method.includes(r.method)) &&
      (!f.time.length || f.time.includes(r.time_range)) &&
      (!f.meal.length || f.meal.includes(r.meal_type)) &&
      (!f.type.length || f.type.includes(r.is_soup ? 'Soups & stews' : 'Mains')) &&
      (!f.favOnly || favs.includes(r.id)) &&
      (!needle || r.title.toLowerCase().includes(needle) || r.ingredients.some(i => i.toLowerCase().includes(needle))));
  }, [recipes, q, f, favs]);

  const activeCount = f.protein.length + f.method.length + f.time.length + f.meal.length + f.type.length + (f.favOnly ? 1 : 0);
  const clear = () => setF({ protein: [], method: [], time: [], meal: [], type: [], favOnly: false });

  return (
    <div className={`shell ${selectedId ? 'has-detail' : ''}`}>
      <aside className="sidebar">
        <header className="brand">
          <h1>Meal Planner</h1>
          <p>High-protein meals, planned around your macros.</p>
        </header>

        <input className="search" type="search" placeholder="Search recipes and ingredients"
          value={q} onChange={e => setQ(e.target.value)} />

        <details className="filters" open>
          <summary>Filters{activeCount ? ` (${activeCount})` : ''}
            {activeCount > 0 && <button className="link" onClick={e => { e.preventDefault(); clear(); }}>Clear</button>}
          </summary>
          <ChipGroup label="Protein" opts={PROTEINS} sel={f.protein} on={x => setF({ ...f, protein: toggleIn(f.protein, x) })} />
          <ChipGroup label="Meal" opts={MEALS} sel={f.meal} on={x => setF({ ...f, meal: toggleIn(f.meal, x) })} />
          <ChipGroup label="Method" opts={METHODS} sel={f.method} on={x => setF({ ...f, method: toggleIn(f.method, x) })} />
          <ChipGroup label="Cook time" opts={TIMES} sel={f.time} on={x => setF({ ...f, time: toggleIn(f.time, x) })} />
          <ChipGroup label="Type" opts={TYPES} sel={f.type} on={x => setF({ ...f, type: toggleIn(f.type, x) })} />
          <ChipGroup label="Mine" opts={['★ Favorites']} sel={f.favOnly ? ['★ Favorites'] : []} on={() => setF({ ...f, favOnly: !f.favOnly })} />
        </details>

        <div className="count">{recipes ? `${filtered.length} of ${recipes.length} recipes` : 'Loading…'}</div>
        {error && <div className="error">Couldn't load recipes: {error}</div>}

        <ul className="list">
          {filtered.map(r => (
            <li key={r.id}>
              <a href={`#/r/${encodeURIComponent(r.id)}`} className={r.id === selectedId ? 'active' : ''}>
                <div className="li-main">
                  <div className="li-title">{r.title}</div>
                  <div className="li-meta">{r.id} · {r.method || r.meal_type} · {r.time_label || '–'}</div>
                </div>
                <div className="li-macro">
                  <strong>{fmt(r.protein_g / r.servings)}g</strong>
                  <span>protein</span>
                  <span>{fmt(r.kcal / r.servings)} kcal</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <main className="detail">
        {selectedId
          ? <RecipeDetail id={selectedId} fav={favs.includes(selectedId)} onFav={() => setFavs(toggleIn(favs, selectedId))} />
          : <div className="empty"><h2>Pick a recipe</h2><p>Choose one on the left to see ingredients, macros and steps.</p></div>}
      </main>
    </div>
  );
}

function ChipGroup({ label, opts, sel, on }) {
  return (
    <div className="chip-group">
      <div className="chip-label">{label}</div>
      <div className="chips">
        {opts.map(o => (
          <button key={o} className={`chip ${sel.includes(o) ? 'on' : ''}`} aria-pressed={sel.includes(o)} onClick={() => on(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function RecipeDetail({ id, fav, onFav }) {
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  const [servings, setServings] = useStored(`mp.servings.${id}`, null);

  useEffect(() => {
    setR(null); setErr(null);
    api.get(id).then(setR).catch(e => setErr(e.message));
  }, [id]);

  if (err) return <div className="empty"><h2>Not found</h2><p>{err}</p><a href="#/">Back</a></div>;
  if (!r) return <div className="empty"><p>Loading…</p></div>;

  const base = r.servings || 4;
  const sv = servings || base;
  const factor = sv / base;
  const rows = [
    ['Calories', r.kcal, ''],
    ['Protein', r.protein_g, 'g'],
    ['Carbs', r.carbs_g, 'g'],
    ['Fat (total)', r.fat_g, 'g'],
    ['Saturated', r.sat_fat_g, 'g', true],
    ['Unsaturated', r.unsat_fat_g, 'g', true],
  ];

  return (
    <article className="recipe">
      <a className="back" href="#/">‹ All recipes</a>
      <div className="r-head">
        <h2>{r.title}</h2>
        <button className={`star ${fav ? 'on' : ''}`} onClick={onFav} aria-label={fav ? 'Remove favorite' : 'Add favorite'}>{fav ? '★' : '☆'}</button>
      </div>
      <div className="tags">
        {r.protein && <span className="tag accent">{r.protein}</span>}
        {r.method && <span className="tag">{r.method}</span>}
        <span className="tag">{r.meal_type}</span>
        {r.time_label && <span className="tag">⏱ {r.time_label} total</span>}
        {r.active_min != null && <span className="tag">{r.active_min} min active</span>}
        <span className="tag muted">{r.id}</span>
      </div>
      {r.description && <p className="desc">{r.description}</p>}

      <section>
        <div className="sec-row">
          <h3>Servings</h3>
          <div className="seg">
            {SERVING_OPTS.map(n => (
              <button key={n} className={n === sv ? 'on' : ''} onClick={() => setServings(n === base ? null : n)}>{n}</button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3>Nutrition</h3>
        <table className="nutri">
          <thead><tr><th></th><th>Entire recipe</th><th>Per serving</th></tr></thead>
          <tbody>
            {rows.map(([label, v, unit, sub]) => (
              <tr key={label} className={sub ? 'sub' : ''}>
                <td>{label}</td>
                <td>{fmt(v * factor)}{unit}</td>
                <td>{fmt(v / base)}{unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">Makes {sv} serving{sv === 1 ? '' : 's'}. Per-serving values stay the same as you scale.</p>
      </section>

      <section>
        <h3>Ingredients</h3>
        <ul className="ings">
          {r.ingredients.map((i, k) => (
            <li key={k}>
              <span className="amt">{scaleAmount(i.amount, factor)}</span>
              <span className="ing">{i.name}{i.pantry && <em className="pantry"> pantry</em>}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Steps</h3>
        <ol className="steps">
          {r.steps.map((s, k) => (
            <li key={k}><span className="num">{k + 1}</span><div><strong>{s.title}.</strong> {s.text}</div></li>
          ))}
        </ol>
      </section>

      {r.sides?.length > 0 && (
        <section>
          <h3>Suggested sides</h3>
          <ul className="sides">
            {r.sides.map((s, k) => <li key={k}><strong>{s.name}</strong>{s.desc && <span>{s.desc}</span>}</li>)}
          </ul>
        </section>
      )}

      {r.tip && <aside className="tip"><strong>Tip</strong><p>{r.tip}</p></aside>}
    </article>
  );
}
