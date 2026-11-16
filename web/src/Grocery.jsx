import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useApp, toast, today, addDays, weekStart, dayLabel } from './lib.jsx';

export default function Grocery() {
  const { me, reloadMe } = useApp();
  const [range, setRange] = useState(() => {
    try { const s = JSON.parse(sessionStorage.getItem('mp.groceryRange') || 'null'); if (s) return s; } catch { /* ignore */ }
    const s = weekStart(today()); return { from: s, to: addDays(s, 6) };
  });
  const [usePlan, setUsePlan] = useState(true);
  const [stores, setStores] = useState([]);
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const store = me.prefs.store || 'publix';

  useEffect(() => { api.stores().then(setStores); }, []);
  const load = useCallback(() => {
    const r = usePlan ? range : {};
    return api.grocery(r.from, r.to, store).then(setData).catch(e => toast(e.message));
  }, [range, usePlan, store]);
  useEffect(() => { load(); }, [load]);

  const setStore = async s => { await api.updateMe({ prefs: { store: s } }); reloadMe(); };
  const toggle = async it => {
    setData(d => ({ ...d, items: d.items.map(x => (x.key === it.key ? { ...x, checked: !x.checked } : x)) }));
    await api.checkGrocery(it.key, !it.checked);
  };
  const addText = async e => {
    e.preventDefault(); if (!text.trim()) return;
    await api.addGrocery({ text }); setText(''); load();
  };
  const copy = async () => {
    const lines = [];
    let aisle = '';
    for (const i of data.items.filter(x => !x.checked)) {
      if (i.aisle !== aisle) { aisle = i.aisle; lines.push(`\n${aisle.toUpperCase()}`); }
      lines.push(`☐ ${i.name}${i.quantity ? ` (${i.quantity})` : ''}`);
    }
    const out = `Grocery list${usePlan ? ` ${dayLabel(range.from)} to ${dayLabel(range.to)}` : ''}\n${lines.join('\n')}`;
    try {
      if (navigator.share && /Mobi/.test(navigator.userAgent)) await navigator.share({ text: out });
      else { await navigator.clipboard.writeText(out); toast('List copied'); }
    } catch { /* cancelled */ }
  };
  const reset = async clearExtras => { await api.resetGrocery(clearExtras); load(); toast(clearExtras ? 'List cleared' : 'Checks cleared'); };

  if (!data) return <div className="empty"><p>Loading…</p></div>;
  const items = hideDone ? data.items.filter(i => !i.checked) : data.items;
  const aisles = [...new Set(items.map(i => i.aisle))];
  const done = data.items.filter(i => i.checked).length;
  const storeName = stores.find(s => s.id === store)?.name || 'store';

  return (
    <div className="narrow grocery">
      <h2 className="page-title">Grocery list</h2>

      <div className="card controls">
        <label className="check"><input type="checkbox" checked={usePlan} onChange={e => setUsePlan(e.target.checked)} /> Include planned meals</label>
        {usePlan && (
          <div className="range">
            <input type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} />
            <span>to</span>
            <input type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} />
            <button className="link" onClick={() => { const s = weekStart(today()); setRange({ from: s, to: addDays(s, 6) }); }}>This week</button>
            <button className="link" onClick={() => { const s = addDays(weekStart(today()), 7); setRange({ from: s, to: addDays(s, 6) }); }}>Next week</button>
          </div>
        )}
        <div className="store-pick">
          <span>Shop at</span>
          <div className="chips">
            {stores.map(s => <button key={s.id} className={`chip ${s.id === store ? 'on' : ''}`} onClick={() => setStore(s.id)}>{s.name}</button>)}
          </div>
        </div>
      </div>

      {data.recipes.length > 0 && (
        <div className="from-recipes">
          <span className="muted small">From:</span>
          {data.recipes.map((r, k) => (
            <span key={k} className="tag">
              <a href={`#/r/${encodeURIComponent(r.id)}`}>{r.title}</a> ×{r.servings}
              {r.extra_id && <button className="x" onClick={async () => { await api.removeGrocery(r.extra_id); load(); }} aria-label="Remove">✕</button>}
            </span>
          ))}
        </div>
      )}

      <form className="add-line" onSubmit={addText}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add an item (paper towels, coffee…)" />
        <button className="btn">Add</button>
      </form>

      <div className="list-tools">
        <span className="muted small">{done}/{data.items.length} in cart</span>
        <button className="link" onClick={() => setHideDone(!hideDone)}>{hideDone ? 'Show checked' : 'Hide checked'}</button>
        <button className="link" onClick={copy}>Copy / share</button>
        <button className="link" onClick={() => reset(false)}>Uncheck all</button>
        <button className="link danger" onClick={() => reset(true)}>Clear added</button>
      </div>

      {!data.items.length && <div className="empty-card">Nothing here yet. Plan some meals or tap "Grocery list" on a recipe.</div>}

      {aisles.map(a => (
        <section key={a} className="aisle">
          <h3>{a}</h3>
          <ul>
            {items.filter(i => i.aisle === a).map(i => (
              <li key={i.key} className={i.checked ? 'done' : ''}>
                <label>
                  <input type="checkbox" checked={i.checked} onChange={() => toggle(i)} />
                  <span className="g-name">{i.name}{i.quantity && <small>{i.quantity}</small>}</span>
                </label>
                {i.recipes.length > 0 && <span className="g-for" title={i.recipes.join(', ')}>{i.recipes.length > 1 ? `${i.recipes.length} recipes` : i.recipes[0]}</span>}
                <a className="g-shop" href={i.link} target="_blank" rel="noopener noreferrer" title={`Search ${storeName}`}>{storeName} ↗</a>
                {i.manual_id && <button className="icon-btn sm" onClick={async () => { await api.removeGrocery(i.manual_id); load(); }} aria-label="Remove">✕</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="muted small">Pantry staples (salt, pepper, and the like) and items bought together with another line (lemon juice from the lemons) are left off. Publix and Aldi links open their Instacart storefronts.</p>
    </div>
  );
}
