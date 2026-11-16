import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || '/data';
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'meal-planner.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS recipes (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  protein       TEXT,
  method        TEXT,
  meal_type     TEXT NOT NULL DEFAULT 'Dinner',
  total_min     INTEGER,
  active_min    INTEGER,
  time_range    TEXT,
  time_label    TEXT,
  description   TEXT,
  servings      INTEGER NOT NULL DEFAULT 4,
  kcal          REAL, protein_g REAL, carbs_g REAL, sat_fat_g REAL, unsat_fat_g REAL,
  ingredients   TEXT NOT NULL DEFAULT '[]',
  steps         TEXT NOT NULL DEFAULT '[]',
  sides         TEXT NOT NULL DEFAULT '[]',
  tip           TEXT,
  is_soup       INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'user',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`);

const JSON_COLS = ['ingredients', 'steps', 'sides'];

export function rowToRecipe(r) {
  if (!r) return null;
  const out = { ...r, is_soup: !!r.is_soup };
  for (const c of JSON_COLS) out[c] = JSON.parse(r[c] || '[]');
  out.fat_g = (r.sat_fat_g || 0) + (r.unsat_fat_g || 0);
  return out;
}

const COLS = ['id', 'title', 'protein', 'method', 'meal_type', 'total_min', 'active_min', 'time_range',
  'time_label', 'description', 'servings', 'kcal', 'protein_g', 'carbs_g', 'sat_fat_g', 'unsat_fat_g',
  'ingredients', 'steps', 'sides', 'tip', 'is_soup', 'source'];

const upsertStmt = db.prepare(`
  INSERT INTO recipes (${COLS.join(',')}) VALUES (${COLS.map(c => '@' + c).join(',')})
  ON CONFLICT(id) DO UPDATE SET ${COLS.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(',')},
  updated_at=datetime('now')`);

export function upsertRecipe(r) {
  const row = {};
  for (const c of COLS) {
    let v = r[c];
    if (JSON_COLS.includes(c)) v = JSON.stringify(v || []);
    if (c === 'is_soup') v = v ? 1 : 0;
    if (c === 'meal_type') v = v || 'Dinner';
    if (c === 'servings') v = v || 4;
    if (c === 'source') v = v || 'user';
    row[c] = v ?? null;
  }
  upsertStmt.run(row);
}

export function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value ?? null;
}
export function setMeta(key, value) {
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}
