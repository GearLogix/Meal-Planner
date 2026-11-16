import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useApp, toast } from './lib.jsx';

export default function Settings() {
  const { me, reloadMe, signOut, refreshRecipes } = useApp();
  const [pin, setPin] = useState('');
  const [pass, setPass] = useState('');
  const [settings, setSettings] = useState(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [newProfile, setNewProfile] = useState({ name: '', pin: '' });
  const [health, setHealth] = useState(null);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('mp.theme') || 'auto'; } catch { return 'auto'; } });

  useEffect(() => { api.health().then(setHealth); }, []);
  useEffect(() => {
    if (me.isAdmin) api.settings().then(s => { setSettings(s); setModel(s.model); }).catch(() => {});
  }, [me.isAdmin]);

  const applyTheme = t => { setTheme(t); localStorage.setItem('mp.theme', t); document.documentElement.dataset.theme = t; };
  const savePin = async () => {
    try { await api.updateMe({ pin }); setPin(''); await reloadMe(); toast(pin ? 'PIN updated' : 'PIN removed'); }
    catch (e) { toast(e.message); }
  };
  const unlock = async e => {
    e.preventDefault();
    try { await api.unlock(pass); setPass(''); await reloadMe(); toast('Admin unlocked on this device'); }
    catch (e2) { toast(e2.message); }
  };
  const saveAi = async () => {
    try {
      await api.saveSettings({ ...(key ? { anthropicKey: key } : {}), model });
      setKey(''); setSettings(await api.settings()); toast('Saved. The key is stored encrypted.');
    } catch (e) { toast(e.message); }
  };
  const removeKey = async () => { await api.saveSettings({ anthropicKey: '' }); setSettings(await api.settings()); toast('Key removed'); };
  const reimport = async () => {
    try { const r = await api.importProteinPlate(); await refreshRecipes(); toast(`Imported ${r.total} recipes`); api.health().then(setHealth); }
    catch (e) { toast(e.message); }
  };
  const addProfile = async e => {
    e.preventDefault();
    try {
      const r = await api.createProfile(newProfile.name, newProfile.pin);
      setNewProfile({ name: '', pin: '' }); toast(`Profile "${r.profile.name}" added`);
    } catch (e2) { toast(e2.message); }
  };

  return (
    <div className="narrow">
      <h2 className="page-title">Settings</h2>

      <section className="card">
        <h3>Profile: {me.name}</h3>
        <label>{me.hasPin ? 'Change PIN' : 'PIN'} <small className="muted">4 to 8 digits, blank to remove</small>
          <div className="inline">
            <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
            <button className="btn" onClick={savePin}>Save PIN</button>
          </div>
        </label>
        <label>Theme
          <div className="seg wide">{['auto', 'light', 'dark'].map(t => <button key={t} className={theme === t ? 'on' : ''} onClick={() => applyTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
        </label>
        <button className="btn" onClick={signOut}>Switch profile</button>
      </section>

      {!me.isAdmin && (
        <section className="card">
          <h3>Admin</h3>
          <p className="muted small">Unlock to add or edit recipes, generate with AI, add profiles and manage the API key.</p>
          <form className="inline" onSubmit={unlock}>
            <input type="password" placeholder="Admin passcode" value={pass} onChange={e => setPass(e.target.value)} />
            <button className="btn primary">Unlock</button>
          </form>
        </section>
      )}

      {me.isAdmin && (
        <>
          <section className="card">
            <h3>AI recipe generation</h3>
            <p className="muted small">
              Uses your Claude API key from console.anthropic.com. The key is encrypted on the server (AES-256-GCM) and never sent back to the browser.
            </p>
            <p>Status: {settings?.hasAnthropicKey ? <strong>Key saved ({settings.keyHint})</strong> : <strong>No key</strong>}</p>
            <label>{settings?.hasAnthropicKey ? 'Replace key' : 'API key'}
              <input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-ant-…" />
            </label>
            <label>Model<input value={model} onChange={e => setModel(e.target.value)} /></label>
            <div className="inline">
              <button className="btn primary" onClick={saveAi}>Save</button>
              {settings?.hasAnthropicKey && <button className="btn danger" onClick={removeKey}>Remove key</button>}
            </div>
          </section>

          <section className="card">
            <h3>Profiles</h3>
            <form className="inline wrap" onSubmit={addProfile}>
              <input placeholder="Name" value={newProfile.name} onChange={e => setNewProfile({ ...newProfile, name: e.target.value })} required />
              <input placeholder="PIN (optional)" type="password" inputMode="numeric" maxLength={8} value={newProfile.pin} onChange={e => setNewProfile({ ...newProfile, pin: e.target.value.replace(/\D/g, '') })} />
              <button className="btn">Add profile</button>
            </form>
          </section>

          <section className="card">
            <h3>Recipe library</h3>
            <p className="muted small">{health?.recipes ?? '–'} recipes. Last Protein Plate import: {health?.importedAt ? new Date(health.importedAt).toLocaleString() : 'never'}.</p>
            <p className="muted small">Re-importing updates Cade's recipes in place. Your own recipes (MP codes) are untouched.</p>
            <button className="btn" onClick={reimport}>Re-import from The Protein Plate</button>
          </section>
        </>
      )}
    </div>
  );
}
