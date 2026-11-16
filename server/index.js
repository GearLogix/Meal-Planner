import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, rowToRecipe, upsertRecipe, getMeta, setMeta } from './db.js';
import { importProteinPlate } from './importer.js';
import { hashPin, verifyPin, newToken, hashToken, safeEqual, setSecret, getSecret } from './secrets.js';
import { buildList, STORES } from './grocery.js';
import { generateRecipe, DEFAULT_MODEL, timeRange, timeLabel } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const WEB_DIR = process.env.WEB_DIR || path.join(__dirname, '..', 'web', 'dist');
const PASSCODE = process.env.ADMIN_PASSCODE || '';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const num = v => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

// ---------- auth ----------
app.use((req, _res, next) => {
  const t = req.get('x-profile-token');
  if (t) {
    const s = db.prepare(`SELECT s.profile_id, s.is_admin, p.name, p.prefs FROM sessions s JOIN profiles p ON p.id=s.profile_id
      WHERE s.token_hash=?`).get(hashToken(t));
    if (s) req.profile = { id: s.profile_id, name: s.name, prefs: JSON.parse(s.prefs || '{}'), isAdmin: !!s.is_admin };
  }
  const pc = req.get('x-passcode');
  req.isAdmin = !PASSCODE || req.profile?.isAdmin || (pc != null && safeEqual(pc, PASSCODE));
  next();
});
const requireProfile = (req, res, next) => (req.profile ? next() : res.status(401).json({ error: 'Choose a profile first' }));
const requireAdmin = (req, res, next) => (req.isAdmin ? next() : res.status(403).json({ error: 'Admin passcode required' }));

function issueSession(profileId, isAdmin) {
  const token = newToken();
  db.prepare('INSERT INTO sessions(token_hash, profile_id, is_admin) VALUES (?,?,?)').run(hashToken(token), profileId, isAdmin ? 1 : 0);
  return token;
}
const publicProfile = p => ({ id: p.id, name: p.name, hasPin: !!p.pin_hash });

app.get('/api/health', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM recipes').get().n;
  res.json({ ok: true, recipes: n, importedAt: getMeta('protein_plate_imported_at'), adminLocked: !!PASSCODE });
});

app.get('/api/profiles', (_req, res) => {
  res.json(db.prepare('SELECT * FROM profiles ORDER BY name').all().map(publicProfile));
});

app.post('/api/profiles', (req, res) => {
  const first = db.prepare('SELECT COUNT(*) n FROM profiles').get().n === 0;
  if (!first && !req.isAdmin) return res.status(403).json({ error: 'Admin passcode required to add a profile' });
  const name = String(req.body?.name || '').trim().slice(0, 40);
  const pin = req.body?.pin ? String(req.body.pin) : '';
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (pin && !/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4 to 8 digits' });
  try {
    const r = db.prepare('INSERT INTO profiles(name, pin_hash) VALUES (?,?)').run(name, pin ? hashPin(pin) : null);
    const id = Number(r.lastInsertRowid);
    res.status(201).json({ token: issueSession(id, req.isAdmin), profile: { id, name, hasPin: !!pin } });
  } catch {
    res.status(409).json({ error: 'That name is taken' });
  }
});

const loginAttempts = new Map();
app.post('/api/profiles/:id/login', (req, res) => {
  const p = db.prepare('SELECT * FROM profiles WHERE id=?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Profile not found' });
  const k = `${req.ip}:${p.id}`, a = loginAttempts.get(k) || { n: 0, until: 0 };
  if (Date.now() < a.until) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  if (!verifyPin(req.body?.pin, p.pin_hash)) {
    a.n += 1; if (a.n >= 5) { a.until = Date.now() + 60_000; a.n = 0; } loginAttempts.set(k, a);
    return res.status(401).json({ error: 'Wrong PIN' });
  }
  loginAttempts.delete(k);
  res.json({ token: issueSession(p.id, !PASSCODE), profile: publicProfile(p) });
});

app.post('/api/logout', requireProfile, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(req.get('x-profile-token')));
  res.status(204).end();
});

app.post('/api/admin/unlock', requireProfile, (req, res) => {
  if (PASSCODE && !safeEqual(String(req.body?.passcode || ''), PASSCODE)) return res.status(401).json({ error: 'Wrong passcode' });
  db.prepare('UPDATE sessions SET is_admin=1 WHERE token_hash=?').run(hashToken(req.get('x-profile-token')));
  res.json({ isAdmin: true });
});

app.get('/api/me', requireProfile, (req, res) => {
  const g = db.prepare('SELECT * FROM goals WHERE profile_id=?').get(req.profile.id);
  res.json({
    id: req.profile.id, name: req.profile.name, prefs: req.profile.prefs, isAdmin: req.isAdmin, adminLocked: !!PASSCODE,
    hasPin: !!db.prepare('SELECT pin_hash FROM profiles WHERE id=?').get(req.profile.id)?.pin_hash,
    goals: g ? { kcal: g.kcal, protein_g: g.protein_g, carbs_g: g.carbs_g, fat_g: g.fat_g, calc: JSON.parse(g.calc || '{}') } : null,
  });
});

app.put('/api/me', requireProfile, (req, res) => {
  if (req.body?.prefs && typeof req.body.prefs === 'object') {
    const prefs = { ...req.profile.prefs, ...req.body.prefs };
    db.prepare('UPDATE profiles SET prefs=? WHERE id=?').run(JSON.stringify(prefs), req.profile.id);
  }
  if ('pin' in (req.body || {})) {
    const pin = req.body.pin ? String(req.body.pin) : '';
    if (pin && !/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4 to 8 digits' });
    db.prepare('UPDATE profiles SET pin_hash=? WHERE id=?').run(pin ? hashPin(pin) : null, req.profile.id);
  }
  res.status(204).end();
});

app.put('/api/goals', requireProfile, (req, res) => {
  const g = { kcal: num(req.body?.kcal), protein_g: num(req.body?.protein_g), carbs_g: num(req.body?.carbs_g), fat_g: num(req.body?.fat_g) };
  if (Object.values(g).some(Number.isNaN)) return res.status(400).json({ error: 'Goals must be numbers' });
  db.prepare(`INSERT INTO goals(profile_id,kcal,protein_g,carbs_g,fat_g,calc) VALUES (?,?,?,?,?,?)
    ON CONFLICT(profile_id) DO UPDATE SET kcal=excluded.kcal, protein_g=excluded.protein_g, carbs_g=excluded.carbs_g,
    fat_g=excluded.fat_g, calc=excluded.calc`)
    .run(req.profile.id, g.kcal, g.protein_g, g.carbs_g, g.fat_g, JSON.stringify(req.body?.calc || {}));
  res.json(g);
});

// ---------- favorites & cooked ----------
app.get('/api/favorites', requireProfile, (req, res) => {
  res.json(db.prepare('SELECT recipe_id FROM favorites WHERE profile_id=?').all(req.profile.id).map(r => r.recipe_id));
});
app.put('/api/favorites/:rid', requireProfile, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO favorites VALUES (?,?)').run(req.profile.id, req.params.rid); res.status(204).end();
});
app.delete('/api/favorites/:rid', requireProfile, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE profile_id=? AND recipe_id=?').run(req.profile.id, req.params.rid); res.status(204).end();
});

app.get('/api/cooked', requireProfile, (req, res) => {
  res.json(db.prepare(`SELECT recipe_id, COUNT(*) count, MAX(cooked_at) last FROM cooked WHERE profile_id=? GROUP BY recipe_id`)
    .all(req.profile.id));
});
app.post('/api/cooked', requireProfile, (req, res) => {
  if (!req.body?.recipe_id) return res.status(400).json({ error: 'recipe_id required' });
  db.prepare('INSERT INTO cooked(profile_id, recipe_id) VALUES (?,?)').run(req.profile.id, String(req.body.recipe_id));
  res.status(201).end();
});
app.delete('/api/cooked/:rid', requireProfile, (req, res) => {
  db.prepare(`DELETE FROM cooked WHERE id=(SELECT id FROM cooked WHERE profile_id=? AND recipe_id=? ORDER BY id DESC LIMIT 1)`)
    .run(req.profile.id, req.params.rid);
  res.status(204).end();
});

// ---------- recipes ----------
const LIST_COLS = `id,title,protein,method,meal_type,total_min,active_min,time_range,time_label,
  servings,kcal,protein_g,carbs_g,sat_fat_g,unsat_fat_g,is_soup,source,ingredients`;

app.get('/api/recipes', (_req, res) => {
  const rows = db.prepare(`SELECT ${LIST_COLS} FROM recipes ORDER BY id`).all();
  res.json(rows.map(r => {
    const rec = rowToRecipe({ ...r, steps: '[]', sides: '[]' });
    rec.ingredients = rec.ingredients.map(i => i.name);
    delete rec.steps; delete rec.sides;
    return rec;
  }));
});

app.get('/api/recipes/:id', (req, res) => {
  const r = rowToRecipe(db.prepare('SELECT * FROM recipes WHERE id=?').get(req.params.id));
  r ? res.json(r) : res.status(404).json({ error: 'Not found' });
});

function nextUserId() {
  const last = db.prepare("SELECT id FROM recipes WHERE id LIKE 'MP-%' ORDER BY CAST(substr(id,4) AS INTEGER) DESC LIMIT 1").get()?.id;
  const n = last ? Number(last.slice(3)) + 1 : 1;
  return 'MP-' + String(n).padStart(2, '0');
}

function cleanRecipe(b) {
  if (!b || typeof b.title !== 'string' || !b.title.trim()) return { error: 'Title is required' };
  for (const k of ['kcal', 'protein_g', 'carbs_g', 'sat_fat_g', 'unsat_fat_g', 'servings', 'total_min', 'active_min']) {
    if (Number.isNaN(num(b[k]))) return { error: `${k} must be a number` };
  }
  const total = num(b.total_min);
  return {
    recipe: {
      ...b,
      title: b.title.trim(),
      meal_type: SLOTS.includes(b.meal_type) ? b.meal_type : 'Dinner',
      servings: num(b.servings) || 4,
      total_min: total, active_min: num(b.active_min),
      time_range: total != null ? timeRange(total) : b.time_range || null,
      time_label: total != null ? timeLabel(total) : b.time_label || null,
      ingredients: Array.isArray(b.ingredients) ? b.ingredients : [],
      steps: Array.isArray(b.steps) ? b.steps : [],
      sides: Array.isArray(b.sides) ? b.sides : [],
    },
  };
}

app.post('/api/recipes', requireAdmin, (req, res) => {
  const { recipe, error } = cleanRecipe(req.body); if (error) return res.status(400).json({ error });
  const id = nextUserId();
  upsertRecipe({ ...recipe, id, source: req.body.source === 'ai' ? 'ai' : 'user' });
  res.status(201).json(rowToRecipe(db.prepare('SELECT * FROM recipes WHERE id=?').get(id)));
});

app.put('/api/recipes/:id', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM recipes WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const { recipe, error } = cleanRecipe({ ...rowToRecipe(cur), ...req.body });
  if (error) return res.status(400).json({ error });
  upsertRecipe({ ...recipe, id: cur.id, source: cur.source });
  res.json(rowToRecipe(db.prepare('SELECT * FROM recipes WHERE id=?').get(cur.id)));
});

app.delete('/api/recipes/:id', requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM recipes WHERE id=?').run(req.params.id);
  r.changes ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
});

app.post('/api/recipes/generate', requireProfile, requireAdmin, wrap(async (req, res) => {
  try { res.json(await generateRecipe(req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
}));

app.post('/api/import/protein-plate', requireAdmin, wrap(async (_req, res) => {
  try { res.json(await importProteinPlate()); }
  catch (e) { res.status(502).json({ error: e.message }); }
}));

// ---------- plan ----------
function perServing(r) {
  const s = r.servings || 4;
  return { kcal: r.kcal / s, protein_g: r.protein_g / s, carbs_g: r.carbs_g / s, fat_g: ((r.sat_fat_g || 0) + (r.unsat_fat_g || 0)) / s };
}

app.get('/api/plan', requireProfile, (req, res) => {
  const { from, to } = req.query;
  if (!DATE.test(from) || !DATE.test(to)) return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
  const rows = db.prepare(`SELECT p.*, r.title, r.servings r_servings, r.kcal r_kcal, r.protein_g r_protein, r.carbs_g r_carbs,
      r.sat_fat_g r_sat, r.unsat_fat_g r_unsat, r.time_label
    FROM plan_items p LEFT JOIN recipes r ON r.id=p.recipe_id
    WHERE p.profile_id=? AND p.date BETWEEN ? AND ? ORDER BY p.date, p.id`).all(req.profile.id, from, to);
  res.json(rows.map(p => {
    const m = p.recipe_id && p.title
      ? perServing({ servings: p.r_servings, kcal: p.r_kcal, protein_g: p.r_protein, carbs_g: p.r_carbs, sat_fat_g: p.r_sat, unsat_fat_g: p.r_unsat })
      : { kcal: p.kcal || 0, protein_g: p.protein_g || 0, carbs_g: p.carbs_g || 0, fat_g: p.fat_g || 0 };
    const f = p.recipe_id ? p.servings : 1;
    return {
      id: p.id, date: p.date, slot: p.slot, recipe_id: p.recipe_id, servings: p.servings,
      name: p.recipe_id ? (p.title || '(deleted recipe)') : p.custom_name, time_label: p.time_label,
      kcal: m.kcal * f, protein_g: m.protein_g * f, carbs_g: m.carbs_g * f, fat_g: m.fat_g * f,
    };
  }));
});

app.post('/api/plan', requireProfile, (req, res) => {
  const b = req.body || {};
  if (!DATE.test(b.date) || !SLOTS.includes(b.slot)) return res.status(400).json({ error: 'Valid date and slot required' });
  if (!b.recipe_id && !String(b.custom_name || '').trim()) return res.status(400).json({ error: 'Pick a recipe or name a food' });
  const vals = ['servings', 'kcal', 'protein_g', 'carbs_g', 'fat_g'].map(k => num(b[k]));
  if (vals.some(Number.isNaN)) return res.status(400).json({ error: 'Numbers only for servings and macros' });
  const r = db.prepare(`INSERT INTO plan_items(profile_id,date,slot,recipe_id,servings,custom_name,kcal,protein_g,carbs_g,fat_g)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.profile.id, b.date, b.slot, b.recipe_id || null, vals[0] || 1,
    b.recipe_id ? null : String(b.custom_name).trim(), vals[1], vals[2], vals[3], vals[4]);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/plan/:id', requireProfile, (req, res) => {
  const cur = db.prepare('SELECT * FROM plan_items WHERE id=? AND profile_id=?').get(Number(req.params.id), req.profile.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const b = { ...cur, ...req.body };
  if (!DATE.test(b.date) || !SLOTS.includes(b.slot) || Number.isNaN(num(b.servings))) return res.status(400).json({ error: 'Invalid update' });
  db.prepare('UPDATE plan_items SET date=?, slot=?, servings=? WHERE id=?').run(b.date, b.slot, num(b.servings) || 1, cur.id);
  res.status(204).end();
});

app.delete('/api/plan/:id', requireProfile, (req, res) => {
  db.prepare('DELETE FROM plan_items WHERE id=? AND profile_id=?').run(Number(req.params.id), req.profile.id);
  res.status(204).end();
});

app.post('/api/plan/copy', requireProfile, (req, res) => {
  const { from_date, to_date } = req.body || {};
  if (!DATE.test(from_date) || !DATE.test(to_date)) return res.status(400).json({ error: 'Dates required' });
  db.prepare(`INSERT INTO plan_items(profile_id,date,slot,recipe_id,servings,custom_name,kcal,protein_g,carbs_g,fat_g)
    SELECT profile_id,?,slot,recipe_id,servings,custom_name,kcal,protein_g,carbs_g,fat_g FROM plan_items
    WHERE profile_id=? AND date=?`).run(to_date, req.profile.id, from_date);
  res.status(204).end();
});

// ---------- grocery ----------
app.get('/api/stores', (_req, res) => res.json(Object.entries(STORES).map(([id, s]) => ({ id, name: s.name }))));

app.get('/api/grocery', requireProfile, (req, res) => {
  const { from, to } = req.query;
  const range = DATE.test(from) && DATE.test(to) ? { from, to } : {};
  const store = STORES[req.query.store] ? req.query.store : (req.profile.prefs.store || 'publix');
  const list = buildList(req.profile.id, range);
  list.items = list.items.map(i => ({ ...i, link: STORES[store].url(i.name) }));
  res.json({ ...list, store });
});

app.post('/api/grocery/extra', requireProfile, (req, res) => {
  const b = req.body || {};
  if (b.recipe_id) {
    const r = db.prepare('SELECT servings FROM recipes WHERE id=?').get(b.recipe_id);
    if (!r) return res.status(404).json({ error: 'Recipe not found' });
    db.prepare('INSERT INTO grocery_extra(profile_id, recipe_id, servings) VALUES (?,?,?)').run(req.profile.id, b.recipe_id, num(b.servings) || r.servings);
  } else if (String(b.text || '').trim()) {
    db.prepare('INSERT INTO grocery_extra(profile_id, text) VALUES (?,?)').run(req.profile.id, String(b.text).trim().slice(0, 120));
  } else return res.status(400).json({ error: 'recipe_id or text required' });
  res.status(201).end();
});
app.delete('/api/grocery/extra/:id', requireProfile, (req, res) => {
  db.prepare('DELETE FROM grocery_extra WHERE id=? AND profile_id=?').run(Number(req.params.id), req.profile.id); res.status(204).end();
});
app.put('/api/grocery/check', requireProfile, (req, res) => {
  const key = String(req.body?.key || '');
  if (!key) return res.status(400).json({ error: 'key required' });
  if (req.body.checked) db.prepare('INSERT OR IGNORE INTO grocery_checks VALUES (?,?)').run(req.profile.id, key);
  else db.prepare('DELETE FROM grocery_checks WHERE profile_id=? AND item_key=?').run(req.profile.id, key);
  res.status(204).end();
});
app.post('/api/grocery/reset', requireProfile, (req, res) => {
  db.prepare('DELETE FROM grocery_checks WHERE profile_id=?').run(req.profile.id);
  if (req.body?.clearExtras) db.prepare('DELETE FROM grocery_extra WHERE profile_id=?').run(req.profile.id);
  res.status(204).end();
});

// ---------- settings ----------
app.get('/api/settings', requireProfile, requireAdmin, (_req, res) => {
  const key = getSecret('anthropic_api_key');
  res.json({ hasAnthropicKey: !!key, keyHint: key ? `…${key.slice(-4)}` : null, model: getMeta('anthropic_model') || DEFAULT_MODEL });
});
app.put('/api/settings', requireProfile, requireAdmin, (req, res) => {
  const b = req.body || {};
  if ('anthropicKey' in b) setSecret('anthropic_api_key', String(b.anthropicKey || '').trim());
  if (b.model) setMeta('anthropic_model', String(b.model).trim().slice(0, 80));
  res.status(204).end();
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

// ---------- static PWA ----------
app.use(express.static(WEB_DIR, { index: false, maxAge: '1h', setHeaders: (res, p) => {
  if (p.endsWith('sw.js') || p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
} }));
app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(WEB_DIR, 'index.html')); });

async function start() {
  const count = db.prepare('SELECT COUNT(*) n FROM recipes').get().n;
  if (count === 0 && process.env.IMPORT_ON_FIRST_RUN !== 'false') {
    try { await importProteinPlate(); }
    catch (e) { console.error(`[import] first-run import failed: ${e.message}`); }
  }
  app.listen(PORT, () => console.log(`Meal Planner listening on :${PORT}`));
}
start();
