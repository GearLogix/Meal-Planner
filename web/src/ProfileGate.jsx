import React, { useEffect, useState } from 'react';
import { api, setToken } from './api.js';

export default function ProfileGate({ onReady }) {
  const [profiles, setProfiles] = useState(null);
  const [pick, setPick] = useState(null);
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { api.profiles().then(setProfiles).catch(e => setErr(e.message)); }, []);

  const login = async p => {
    setErr('');
    try { const r = await api.login(p.id, p.hasPin ? pin : ''); setToken(r.token); onReady(); }
    catch (e) { setErr(e.message); setPin(''); }
  };
  const create = async e => {
    e.preventDefault(); setErr('');
    try { const r = await api.createProfile(name, newPin); setToken(r.token); onReady(); }
    catch (e2) { setErr(e2.message); }
  };

  if (!profiles) return <div className="gate"><p>{err || 'Loading…'}</p></div>;

  if (!profiles.length) {
    return (
      <div className="gate">
        <h1>Meal Planner</h1>
        <p>Create your profile to get started. Each profile keeps its own goals, plan, favorites and grocery list.</p>
        <form onSubmit={create} className="card form">
          <label>Name<input value={name} onChange={e => setName(e.target.value)} autoFocus required /></label>
          <label>PIN (optional, 4 to 8 digits)<input value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={8} /></label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary">Create profile</button>
        </form>
      </div>
    );
  }

  return (
    <div className="gate">
      <h1>Who's cooking?</h1>
      <div className="profiles">
        {profiles.map(p => (
          <button key={p.id} className={`profile ${pick?.id === p.id ? 'on' : ''}`} onClick={() => { setPick(p); setPin(''); setErr(''); if (!p.hasPin) login(p); }}>
            <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>{p.name}{p.hasPin && <small>🔒</small>}
          </button>
        ))}
      </div>
      {pick?.hasPin && (
        <form className="card form pin" onSubmit={e => { e.preventDefault(); login(pick); }}>
          <label>PIN for {pick.name}<input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={8} autoFocus /></label>
          <button className="btn primary">Continue</button>
        </form>
      )}
      {err && <div className="error">{err}</div>}
      <p className="muted small">New profiles are added in Settings by an admin.</p>
    </div>
  );
}
