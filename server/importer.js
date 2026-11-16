// Imports recipes from The Protein Plate (Cade's app) into Meal Planner.
// Seeded recipes are embedded in the app's JS bundle as JSON.parse(`[...]`);
// user-added recipes come from its API at /api/recipes.
import { db, upsertRecipe, setMeta } from './db.js';

export const DEFAULT_APP_URL = 'https://protein-plate-app.cade-butch.workers.dev';
export const DEFAULT_API_URL = 'https://protein-plate-api.cade-butch.workers.dev';

/** Convert one Protein Plate record (compact keys) to the Meal Planner shape. */
export function normalize(p, source = 'protein-plate') {
  const [kcal, protein_g, carbs_g, sat_fat_g, unsat_fat_g] = p.mac || [];
  return {
    id: p.c,
    title: p.t,
    protein: p.p,
    method: p.m,
    meal_type: 'Dinner',
    total_min: p.tm ?? null,
    active_min: p.am ?? null,
    time_range: p.rg ?? null,
    time_label: p.tt ?? null,
    description: p.d ?? '',
    servings: p.sv || 4,
    kcal, protein_g, carbs_g, sat_fat_g, unsat_fat_g,
    ingredients: (p.ing || []).map(i => ({
      name: i.i,
      amount: i.a,
      shopTerms: i.q || [],
      pantry: !!i.off,          // staple, left off grocery lists
      sharedPurchase: !!i.h,    // bought with another line (e.g. lemon juice from the lemons)
    })),
    steps: (p.st || []).map(([title, text]) => ({ title, text })),
    sides: (p.sd || []).map(s => {
      const [name, ...rest] = String(s).split(' — ');
      return { name: name.trim(), desc: rest.join(' — ').trim() };
    }),
    tip: p.tip ?? null,
    is_soup: !!p.soup,
    source,
  };
}

/** Pull the embedded recipe array out of a bundle's source text. */
export function extractFromBundle(js) {
  const re = /JSON\.parse\(`(\[\{\\?"c\\?":[\s\S]*?\}\])`\)/;
  const m = js.match(re);
  if (!m) throw new Error('Recipe array not found in bundle');
  return JSON.parse(decodeTemplateLiteral(m[1]));
}

/** Resolve escape sequences in a template-literal body without evaluating remote code. */
export function decodeTemplateLiteral(s) {
  const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '$' && s[i + 1] === '{') throw new Error('Unexpected interpolation in recipe data');
    if (ch !== '\\') { out += ch; continue; }
    const n = s[++i];
    if (n in simple) out += simple[n];
    else if (n === 'x') { out += String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else if (n === 'u' && s[i + 1] === '{') {
      const end = s.indexOf('}', i);
      out += String.fromCodePoint(parseInt(s.slice(i + 2, end), 16)); i = end;
    } else if (n === 'u') { out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16)); i += 4; }
    else if (n === '\n') { /* line continuation */ }
    else out += n; // \\ \` \$ \" \' and anything else map to themselves
  }
  return out;
}

async function getText(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'MealPlanner-Importer/1.0' } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
}

export async function importProteinPlate({
  appUrl = process.env.PROTEIN_PLATE_URL || DEFAULT_APP_URL,
  apiUrl = process.env.PROTEIN_PLATE_API_URL || DEFAULT_API_URL,
  log = console.log,
} = {}) {
  const html = await getText(appUrl.replace(/\/$/, '') + '/');
  const src = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  if (!src) throw new Error('App bundle script tag not found');
  const bundle = await getText(new URL(src, appUrl).href);
  const seeded = extractFromBundle(bundle);

  let extra = [];
  try {
    const j = JSON.parse(await getText(apiUrl.replace(/\/$/, '') + '/api/recipes'));
    extra = Array.isArray(j) ? j : (j.recipes || []);
  } catch (e) {
    log(`[import] API recipes skipped: ${e.message}`);
  }

  const all = [...seeded.map(r => normalize(r)), ...extra.map(r => normalize(r, 'protein-plate-user'))];
  db.exec('BEGIN');
  try { all.forEach(upsertRecipe); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  setMeta('protein_plate_imported_at', new Date().toISOString());
  log(`[import] ${seeded.length} seeded + ${extra.length} API recipes imported`);
  return { seeded: seeded.length, api: extra.length, total: all.length };
}
