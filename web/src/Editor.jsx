import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useApp, fmt, toast, go, SLOTS, dayLabel } from './lib.jsx';

const PROTEINS = ['Salmon', 'Shrimp', 'Seafood', 'Chicken', 'Turkey', 'Beef', 'Pork', 'Lamb', 'Eggs', 'Dairy', 'Plant-based'];
const METHODS = ['Sous vide', 'Grill', 'Bake', 'Sear', 'Air fryer', 'Slow cooker', 'Stovetop', 'No-cook', 'Blender'];

// Ingredient lines: "amount | name | flags" where flags can be pantry, shared, shop=term
const ingToText = list => list.map(i => {
  const flags = [i.pantry && 'pantry', i.sharedPurchase && 'shared', i.shopTerms?.[0] && i.shopTerms[0].toLowerCase() !== i.name.toLowerCase() && `shop=${i.shopTerms[0]}`].filter(Boolean);
  return [i.amount || '', i.name, ...flags].join(' | ');
}).join('\n');
const textToIng = t => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const parts = l.split('|').map(s => s.trim());
  const [amount, name, ...flags] = parts.length === 1 ? ['', parts[0]] : parts;
  const shop = flags.find(f => f.startsWith('shop='))?.slice(5);
  return { name, amount, shopTerms: [shop || name.toLowerCase().replace(/,.*$/, '')], pantry: flags.includes('pantry'), sharedPurchase: flags.includes('shared') };
});
const stepsToText = l => l.map(s => `${s.title}: ${s.text}`).join('\n');
const textToSteps = t => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.indexOf(':');
  return i > 0 && i < 60 ? { title: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { title: `Step`, text: l };
});
const sidesToText = l => l.map(s => (s.desc ? `${s.name}: ${s.desc}` : s.name)).join('\n');
const textToSides = t => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.indexOf(':'); return i > 0 ? { name: l.slice(0, i).trim(), desc: l.slice(i + 1).trim() } : { name: l, desc: '' };
});

const BLANK = {
  title: '', meal_type: 'Dinner', protein: 'Chicken', method: 'Stovetop', servings: 4, total_min: 30, active_min: 20,
  description: '', kcal: '', protein_g: '', carbs_g: '', sat_fat_g: '', unsat_fat_g: '', is_soup: false, tip: '',
  ingText: '', stepText: '', sideText: '',
};
const fromRecipe = r => ({
  ...BLANK, ...r, ingText: ingToText(r.ingredients || []), stepText: stepsToText(r.steps || []), sideText: sidesToText(r.sides || []),
  tip: r.tip || '', description: r.description || '',
});

export default function Editor({ id }) {
  const { me, refreshRecipes } = useApp();
  const [f, setF] = useState(id ? null : BLANK);
  const [seed] = useState(() => { try { return JSON.parse(sessionStorage.getItem('mp.genSeed') || 'null'); } catch { return null; } });
  const [ai, setAi] = useState(() => ({
    open: !id && !!seed, prompt: '', meal_type: seed?.meal_type || 'Dinner', protein: '', method: '', servings: seed?.servings || 4,
    max_minutes: '', avoid: '', targets: seed?.targets || { kcal: '', protein_g: '', carbs_g: '', fat_g: '' },
  }));
  const [busy, setBusy] = useState(false);
  const [fromAi, setFromAi] = useState(false);

  useEffect(() => { if (seed) sessionStorage.removeItem('mp.genSeed'); }, [seed]);
  useEffect(() => { if (id) api.get(id).then(r => setF(fromRecipe(r))).catch(e => toast(e.message)); }, [id]);

  if (!me.isAdmin) {
    return <div className="narrow"><h2 className="page-title">Admin only</h2><p>Adding and editing recipes is locked. Unlock admin in <a href="#/settings">Settings</a>.</p></div>;
  }
  if (!f) return <div className="empty"><p>Loading…</p></div>;

  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.generate({ ...ai, servings: Number(ai.servings) || 4, max_minutes: Number(ai.max_minutes) || undefined });
      setF(fromRecipe(r)); setFromAi(true); setAi({ ...ai, open: false });
      toast('Draft ready. Review it, then save.');
    } catch (e) { toast(e.message); }
    setBusy(false);
  };

  const save = async e => {
    e.preventDefault();
    const body = {
      title: f.title, meal_type: f.meal_type, protein: f.protein, method: f.method, servings: Number(f.servings),
      total_min: Number(f.total_min), active_min: Number(f.active_min), description: f.description,
      kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g),
      sat_fat_g: Number(f.sat_fat_g), unsat_fat_g: Number(f.unsat_fat_g), is_soup: !!f.is_soup, tip: f.tip || null,
      ingredients: textToIng(f.ingText), steps: textToSteps(f.stepText), sides: textToSides(f.sideText),
      source: fromAi ? 'ai' : undefined,
    };
    try {
      const saved = id ? await api.update(id, body) : await api.create(body);
      await refreshRecipes();
      if (!id && seed?.planDate) {
        await api.addPlan({ date: seed.planDate, slot: body.meal_type, recipe_id: saved.id, servings: 1 });
        toast(`Saved and added to ${dayLabel(seed.planDate)}`);
        go('plan');
      } else { toast('Saved'); go(`r/${encodeURIComponent(saved.id)}`); }
    } catch (e2) { toast(e2.message); }
  };
  const del = async () => {
    if (!window.confirm(`Delete "${f.title}"? This can't be undone.`)) return;
    await api.remove(id); await refreshRecipes(); toast('Deleted'); go('');
  };

  const servings = Number(f.servings) || 1;
  const fat = Number(f.sat_fat_g || 0) + Number(f.unsat_fat_g || 0);
  const t = ai.targets;

  return (
    <div className="narrow editor">
      <a className="back show" href={id ? `#/r/${encodeURIComponent(id)}` : '#/'}>‹ Back</a>
      <h2 className="page-title">{id ? 'Edit recipe' : 'New recipe'}</h2>

      {!id && (
        <section className="card ai">
          <div className="sec-row">
            <h3>✨ Generate with AI</h3>
            <button className="link" onClick={() => setAi({ ...ai, open: !ai.open })}>{ai.open ? 'Hide' : 'Open'}</button>
          </div>
          {ai.open && (
            <div className="form">
              {seed?.planDate && <p className="muted small">Targets are filled from what's left in your {dayLabel(seed.planDate)} plan.</p>}
              <label>What do you want?<textarea rows={2} value={ai.prompt} onChange={e => setAi({ ...ai, prompt: e.target.value })} placeholder="Quick high-protein breakfast with cottage cheese, no oven" /></label>
              <div className="grid4">
                <label>Meal<select value={ai.meal_type} onChange={e => setAi({ ...ai, meal_type: e.target.value })}>{SLOTS.map(s => <option key={s}>{s}</option>)}</select></label>
                <label>Protein<select value={ai.protein} onChange={e => setAi({ ...ai, protein: e.target.value })}><option value="">Any</option>{PROTEINS.map(s => <option key={s}>{s}</option>)}</select></label>
                <label>Method<select value={ai.method} onChange={e => setAi({ ...ai, method: e.target.value })}><option value="">Any</option>{METHODS.map(s => <option key={s}>{s}</option>)}</select></label>
                <label>Servings<input inputMode="numeric" value={ai.servings} onChange={e => setAi({ ...ai, servings: e.target.value })} /></label>
              </div>
              <div className="chip-label">Per-serving targets (optional)</div>
              <div className="grid4">
                {[['kcal', 'Calories'], ['protein_g', 'Protein g'], ['carbs_g', 'Carbs g'], ['fat_g', 'Fat g']].map(([k, l]) => (
                  <label key={k}>{l}<input inputMode="decimal" value={t[k] ?? ''} onChange={e => setAi({ ...ai, targets: { ...t, [k]: e.target.value } })} /></label>
                ))}
              </div>
              <div className="grid4">
                <label>Max minutes<input inputMode="numeric" value={ai.max_minutes} onChange={e => setAi({ ...ai, max_minutes: e.target.value })} /></label>
                <label className="span3">Avoid<input value={ai.avoid} onChange={e => setAi({ ...ai, avoid: e.target.value })} placeholder="mushrooms, cilantro" /></label>
              </div>
              <button className="btn primary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate draft'}</button>
            </div>
          )}
        </section>
      )}

      <form className="form card" onSubmit={save}>
        {fromAi && <div className="banner">AI draft. Check the macros and amounts before saving.</div>}
        <label>Title<input value={f.title} onChange={set('title')} required /></label>
        <label>Description<textarea rows={2} value={f.description} onChange={set('description')} /></label>
        <div className="grid4">
          <label>Meal<select value={f.meal_type} onChange={set('meal_type')}>{SLOTS.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Protein<select value={f.protein || ''} onChange={set('protein')}>{PROTEINS.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Method<select value={f.method || ''} onChange={set('method')}>{METHODS.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Servings<input inputMode="numeric" value={f.servings} onChange={set('servings')} /></label>
          <label>Total min<input inputMode="numeric" value={f.total_min ?? ''} onChange={set('total_min')} /></label>
          <label>Active min<input inputMode="numeric" value={f.active_min ?? ''} onChange={set('active_min')} /></label>
          <label className="check"><input type="checkbox" checked={!!f.is_soup} onChange={set('is_soup')} /> Soup or stew</label>
        </div>

        <div className="chip-label">Nutrition for the entire recipe</div>
        <div className="grid5">
          {[['kcal', 'Calories'], ['protein_g', 'Protein g'], ['carbs_g', 'Carbs g'], ['sat_fat_g', 'Sat fat g'], ['unsat_fat_g', 'Unsat fat g']].map(([k, l]) => (
            <label key={k}>{l}<input inputMode="decimal" value={f[k] ?? ''} onChange={set(k)} /></label>
          ))}
        </div>
        <p className="muted small">Per serving: {fmt(f.kcal / servings)} kcal · {fmt(f.protein_g / servings)}g protein · {fmt(f.carbs_g / servings)}g carbs · {fmt(fat / servings)}g fat</p>

        <label>Ingredients <small className="muted">one per line: amount | name | flags (pantry, shared, shop=search term)</small>
          <textarea rows={8} value={f.ingText} onChange={set('ingText')} placeholder={'1½ lb | Chicken breast\n1 tbsp | Lemon zest | shared | shop=lemons\nto taste | Salt and pepper | pantry'} />
        </label>
        <label>Steps <small className="muted">one per line: Title: instructions</small>
          <textarea rows={8} value={f.stepText} onChange={set('stepText')} placeholder={'Heat the pan: Preheat a skillet over medium-high heat for 2 minutes.'} />
        </label>
        <label>Suggested sides <small className="muted">Name: description</small><textarea rows={2} value={f.sideText} onChange={set('sideText')} /></label>
        <label>Tip<textarea rows={2} value={f.tip} onChange={set('tip')} /></label>

        <div className="row-end">
          {id && <button type="button" className="btn danger" onClick={del}>Delete</button>}
          <button className="btn primary">Save recipe</button>
        </div>
      </form>
    </div>
  );
}
