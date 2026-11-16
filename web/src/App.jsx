import React, { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { AppCtx, useHashRoute, Toast, toast } from './lib.jsx';
import ProfileGate from './ProfileGate.jsx';
import Library from './Library.jsx';
import CookMode from './CookMode.jsx';
import Planner from './Planner.jsx';
import Goals from './Goals.jsx';
import Grocery from './Grocery.jsx';
import Editor from './Editor.jsx';
import Settings from './Settings.jsx';

const NAV = [
  ['', 'Recipes', '📖'],
  ['plan', 'Plan', '📅'],
  ['grocery', 'Grocery', '🛒'],
  ['settings', 'Settings', '⚙️'],
];

export default function App() {
  const route = useHashRoute();
  const [me, setMe] = useState(null);
  const [checked, setChecked] = useState(false);
  const [recipes, setRecipes] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [cooked, setCooked] = useState({});

  const loadMe = useCallback(async () => {
    if (!getToken()) { setMe(null); setChecked(true); return; }
    try { setMe(await api.me()); }
    catch (e) { if (e.status === 401) setToken(null); setMe(null); }
    setChecked(true);
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);

  const refreshRecipes = useCallback(() => api.list().then(setRecipes).catch(e => toast(`Couldn't load recipes: ${e.message}`)), []);
  const refreshMine = useCallback(async () => {
    const [f, c] = await Promise.all([api.favorites(), api.cooked()]);
    setFavorites(f);
    setCooked(Object.fromEntries(c.map(x => [x.recipe_id, x])));
  }, []);

  useEffect(() => { refreshRecipes(); }, [refreshRecipes]);
  useEffect(() => { if (me) refreshMine().catch(() => {}); }, [me, refreshMine]);

  useEffect(() => {
    let t = 'auto';
    try { t = localStorage.getItem('mp.theme') || 'auto'; } catch { /* ignore */ }
    document.documentElement.dataset.theme = t;
  }, []);

  if (!checked) return null;
  if (!me) return <><ProfileGate onReady={loadMe} /><Toast /></>;

  const ctx = {
    me, reloadMe: loadMe, recipes, refreshRecipes, favorites, cooked,
    toggleFavorite: async id => {
      const on = !favorites.includes(id);
      setFavorites(on ? [...favorites, id] : favorites.filter(x => x !== id));
      try { await api.setFavorite(id, on); } catch { refreshMine(); }
    },
    markCooked: async (id, undo) => {
      await (undo ? api.unmarkCooked(id) : api.markCooked(id));
      await refreshMine();
      toast(undo ? 'Unmarked' : 'Marked as cooked');
    },
    signOut: async () => { try { await api.logout(); } catch { /* ignore */ } setToken(null); setMe(null); },
  };

  const [section, ...rest] = route.split('/');
  const arg = decodeURIComponent(rest.join('/'));
  let page;
  if (section === 'cook') page = <CookMode id={arg} />;
  else if (section === 'plan') page = <Planner />;
  else if (section === 'goals') page = <Goals />;
  else if (section === 'grocery') page = <Grocery />;
  else if (section === 'settings') page = <Settings />;
  else if (section === 'new') page = <Editor />;
  else if (section === 'edit') page = <Editor id={arg} />;
  else page = <Library selectedId={section === 'r' ? arg : null} />;

  const active = ['plan', 'goals'].includes(section) ? 'plan' : ['grocery', 'settings'].includes(section) ? section : '';

  return (
    <AppCtx.Provider value={ctx}>
      {section === 'cook' ? page : (
        <div className="app">
          <nav className="topnav">
            <a className="logo" href="#/">Meal Planner</a>
            {NAV.map(([p, label, icon]) => (
              <a key={p} href={`#/${p}`} className={active === p ? 'on' : ''}><span className="ni" aria-hidden="true">{icon}</span><span>{label}</span></a>
            ))}
            <span className="who">{me.name}</span>
          </nav>
          <div className="page">{page}</div>
        </div>
      )}
      <Toast />
    </AppCtx.Provider>
  );
}
