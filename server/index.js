import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, rowToRecipe, upsertRecipe, getMeta } from './db.js';
import { importProteinPlate } from './importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const WEB_DIR = process.env.WEB_DIR || path.join(__dirname, '..', 'web', 'dist');
const PASSCODE = process.env.ADMIN_PASSCODE || '';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Write routes require the admin passcode when one is configured.
function requireAdmin(req, res, next) {
  if (!PASSCODE) return next();
  const given = Buffer.from(String(req.get('x-passcode') || ''));
  const want = Buffer.from(PASSCODE);
  if (given.length === want.length && crypto.timingSafeEqual(given, want)) return next();
  res.status(401).json({ error: 'Passcode required' });
}

app.get('/api/health', (_req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM recipes').get().n;
  res.json({ ok: true, recipes: n, importedAt: getMeta('protein_plate_imported_at'), writeLocked: !!PASSCODE });
});

const LIST_COLS = `id,title,protein,method,meal_type,total_min,active_min,time_range,time_label,
  servings,kcal,protein_g,carbs_g,sat_fat_g,unsat_fat_g,is_soup,source,ingredients`;

app.get('/api/recipes', (_req, res) => {
  const rows = db.prepare(`SELECT ${LIST_COLS} FROM recipes ORDER BY id`).all();
  // Ingredient names are sent so the client can search them; amounts are dropped to keep it light.
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
  const last = db.prepare("SELECT id FROM recipes WHERE id LIKE 'MP-%' ORDER BY id DESC LIMIT 1").get()?.id;
  const n = last ? Number(last.slice(3)) + 1 : 1;
  return 'MP-' + String(n).padStart(2, '0');
}

function validate(b) {
  if (!b || typeof b.title !== 'string' || !b.title.trim()) return 'title is required';
  for (const k of ['kcal', 'protein_g', 'carbs_g', 'sat_fat_g', 'unsat_fat_g', 'servings']) {
    if (b[k] != null && !Number.isFinite(Number(b[k]))) return `${k} must be a number`;
  }
  return null;
}

app.post('/api/recipes', requireAdmin, (req, res) => {
  const err = validate(req.body); if (err) return res.status(400).json({ error: err });
  const id = nextUserId();
  upsertRecipe({ ...req.body, id, source: 'user' });
  res.status(201).json(rowToRecipe(db.prepare('SELECT * FROM recipes WHERE id=?').get(id)));
});

app.put('/api/recipes/:id', requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM recipes WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const merged = { ...rowToRecipe(cur), ...req.body, id: cur.id, source: cur.source };
  const err = validate(merged); if (err) return res.status(400).json({ error: err });
  upsertRecipe(merged);
  res.json(rowToRecipe(db.prepare('SELECT * FROM recipes WHERE id=?').get(cur.id)));
});

app.delete('/api/recipes/:id', requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM recipes WHERE id=?').run(req.params.id);
  r.changes ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
});

app.post('/api/import/protein-plate', requireAdmin, async (_req, res) => {
  try { res.json(await importProteinPlate()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Static PWA with SPA fallback.
app.use(express.static(WEB_DIR, { index: false, maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

async function start() {
  const count = db.prepare('SELECT COUNT(*) n FROM recipes').get().n;
  if (count === 0 && process.env.IMPORT_ON_FIRST_RUN !== 'false') {
    try { await importProteinPlate(); }
    catch (e) { console.error(`[import] first-run import failed: ${e.message}`); }
  }
  app.listen(PORT, () => console.log(`Meal Planner listening on :${PORT}`));
}
start();
