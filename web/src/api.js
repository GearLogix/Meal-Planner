const TOKEN_KEY = 'mp.token.v1';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

async function j(method, url, body) {
  const r = await fetch('/api' + url, {
    method,
    headers: { 'content-type': 'application/json', 'x-profile-token': getToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401 && url !== '/admin/unlock' && !url.includes('/login')) {
    const e = new Error('Session expired'); e.status = 401; throw e;
  }
  if (!r.ok) {
    const e = new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); e.status = r.status; throw e;
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

const enc = encodeURIComponent;
export const api = {
  health: () => j('GET', '/health'),
  profiles: () => j('GET', '/profiles'),
  createProfile: (name, pin) => j('POST', '/profiles', { name, pin }),
  login: (id, pin) => j('POST', `/profiles/${id}/login`, { pin }),
  logout: () => j('POST', '/logout'),
  unlock: passcode => j('POST', '/admin/unlock', { passcode }),
  me: () => j('GET', '/me'),
  updateMe: b => j('PUT', '/me', b),
  saveGoals: g => j('PUT', '/goals', g),

  list: () => j('GET', '/recipes'),
  get: id => j('GET', `/recipes/${enc(id)}`),
  create: r => j('POST', '/recipes', r),
  update: (id, r) => j('PUT', `/recipes/${enc(id)}`, r),
  remove: id => j('DELETE', `/recipes/${enc(id)}`),
  generate: o => j('POST', '/recipes/generate', o),
  importProteinPlate: () => j('POST', '/import/protein-plate'),

  favorites: () => j('GET', '/favorites'),
  setFavorite: (id, on) => j(on ? 'PUT' : 'DELETE', `/favorites/${enc(id)}`),
  cooked: () => j('GET', '/cooked'),
  markCooked: id => j('POST', '/cooked', { recipe_id: id }),
  unmarkCooked: id => j('DELETE', `/cooked/${enc(id)}`),

  plan: (from, to) => j('GET', `/plan?from=${from}&to=${to}`),
  addPlan: item => j('POST', '/plan', item),
  updatePlan: (id, b) => j('PUT', `/plan/${id}`, b),
  removePlan: id => j('DELETE', `/plan/${id}`),
  copyDay: (from_date, to_date) => j('POST', '/plan/copy', { from_date, to_date }),

  stores: () => j('GET', '/stores'),
  grocery: (from, to, store) => j('GET', `/grocery?from=${from || ''}&to=${to || ''}${store ? `&store=${store}` : ''}`),
  addGrocery: b => j('POST', '/grocery/extra', b),
  removeGrocery: id => j('DELETE', `/grocery/extra/${id}`),
  checkGrocery: (key, checked) => j('PUT', '/grocery/check', { key, checked }),
  resetGrocery: clearExtras => j('POST', '/grocery/reset', { clearExtras }),

  settings: () => j('GET', '/settings'),
  saveSettings: b => j('PUT', '/settings', b),
};
