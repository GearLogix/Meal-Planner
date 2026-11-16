// Builds a combined grocery list from planned meals and ad hoc additions.
import { db, rowToRecipe } from './db.js';
import { scaleAmount, parseLead, formatQty } from '../shared/scale.js';

const AISLES = [
  ['Frozen', ['frozen']],
  ['Pantry', ['broth', 'stock', 'sauce', 'paste', 'canned', 'can ', 'dried', 'powder', 'seasoning']],
  ['Meat & Seafood', ['salmon', 'shrimp', 'chicken', 'beef', 'pork', 'lamb', 'turkey', 'steak', 'fish', 'cod', 'tuna',
    'scallop', 'sausage', 'bacon', 'prosciutto', 'brisket', 'chuck', 'tenderloin', 'sirloin', 'halibut', 'mahi', 'crab',
    'lobster', 'mussel', 'clam', 'tilapia', 'trout', 'ham', 'chorizo', 'ground']],
  ['Dairy & Eggs', ['yogurt', 'milk', 'cheese', 'butter', 'egg', 'cream', 'feta', 'parmesan', 'mozzarella', 'ricotta',
    'cottage', 'kefir', 'ghee']],
  ['Produce', ['lemon', 'lime', 'orange', 'dill', 'potato', 'asparagus', 'fennel', 'garlic', 'onion', 'shallot', 'ginger',
    'cabbage', 'coleslaw', 'mushroom', 'bell pepper', 'jalape', 'chile', 'cilantro', 'parsley', 'basil', 'mint', 'thyme',
    'rosemary', 'spinach', 'kale', 'broccoli', 'avocado', 'tomato', 'cucumber', 'carrot', 'celery', 'zucchini', 'squash',
    'apple', 'mango', 'peach', 'berr', 'lettuce', 'arugula', 'romaine', 'bok choy', 'brussels', 'cauliflower', 'beet',
    'pomegranate', 'grape', 'pear', 'herb', 'scallion', 'green bean', 'corn', 'sweet potato', 'radish', 'leek']],
  ['Bakery', ['bread', 'tortilla', 'pita', 'bun', 'naan', 'crispbread', 'roll', 'wrapper', 'bagel']],
  ['Pantry', ['oil', 'vinegar', 'rice', 'quinoa', 'farro', 'couscous', 'pasta', 'noodle', 'bean', 'lentil', 'chickpea',
    'flour', 'sugar', 'honey', 'maple', 'mustard', 'soy', 'miso', 'tahini', 'nut', 'almond', 'pecan', 'walnut', 'seed',
    'oat', 'spice', 'cumin', 'paprika', 'cinnamon', 'salsa', 'sriracha', 'harissa', 'pesto', 'olive', 'caper', 'bulgur']],
];

export function aisleFor(name) {
  const n = ` ${name.toLowerCase()} `;
  for (const [aisle, keys] of AISLES) if (keys.some(k => n.includes(k))) return aisle;
  return 'Other';
}

const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());

export const STORES = {
  publix: { name: 'Publix', url: q => `https://www.instacart.com/store/publix/s?k=${encodeURIComponent(q)}` },
  aldi: { name: 'Aldi', url: q => `https://www.instacart.com/store/aldi/s?k=${encodeURIComponent(q)}` },
  target: { name: 'Target', url: q => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}` },
  walmart: { name: 'Walmart', url: q => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
  instacart: { name: 'Instacart', url: q => `https://www.instacart.com/store/s?k=${encodeURIComponent(q)}` },
};

/** sources: [{ recipe_id, servings }] plus manual text items. */
export function buildList(profileId, { from, to }) {
  const sources = [];
  if (from && to) {
    sources.push(...db.prepare(`SELECT recipe_id, SUM(servings) servings FROM plan_items
      WHERE profile_id=? AND date BETWEEN ? AND ? AND recipe_id IS NOT NULL GROUP BY recipe_id`).all(profileId, from, to)
      .map(r => ({ ...r, origin: 'plan' })));
  }
  const extras = db.prepare('SELECT * FROM grocery_extra WHERE profile_id=? ORDER BY id').all(profileId);
  for (const e of extras) if (e.recipe_id) sources.push({ recipe_id: e.recipe_id, servings: e.servings, origin: 'added', extra_id: e.id });

  const items = new Map();
  const recipesUsed = [];
  for (const s of sources) {
    const r = rowToRecipe(db.prepare('SELECT * FROM recipes WHERE id=?').get(s.recipe_id));
    if (!r) continue;
    const factor = (s.servings || r.servings) / (r.servings || 4);
    recipesUsed.push({ id: r.id, title: r.title, servings: s.servings, origin: s.origin, extra_id: s.extra_id });
    for (const ing of r.ingredients) {
      if (ing.pantry || ing.sharedPurchase) continue;
      const term = (ing.shopTerms?.[0] || ing.name).toLowerCase().trim();
      const key = term;
      const amount = scaleAmount(ing.amount, factor);
      if (!items.has(key)) items.set(key, { key, name: titleCase(term), aisle: aisleFor(term), amounts: [], recipes: new Set() });
      const it = items.get(key);
      it.amounts.push(amount);
      it.recipes.add(r.title);
    }
  }

  for (const e of extras) if (e.text) {
    const key = `manual:${e.id}`;
    items.set(key, { key, name: e.text, aisle: aisleFor(e.text), amounts: [], recipes: new Set(), manual_id: e.id });
  }

  const checks = new Set(db.prepare('SELECT item_key FROM grocery_checks WHERE profile_id=?').all(profileId).map(r => r.item_key));
  const list = [...items.values()].map(it => ({
    key: it.key, name: it.name, aisle: it.aisle, manual_id: it.manual_id ?? null,
    quantity: combineAmounts(it.amounts), recipes: [...it.recipes], checked: checks.has(it.key),
  }));
  const order = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen', 'Other'];
  list.sort((a, b) => order.indexOf(a.aisle) - order.indexOf(b.aisle) || a.name.localeCompare(b.name));
  return { items: list, recipes: recipesUsed };
}

/** Sum amounts that share a unit; otherwise list them. */
export function combineAmounts(amounts) {
  if (!amounts.length) return '';
  if (amounts.length === 1) return amounts[0];
  const parsed = amounts.map(parseLead);
  if (parsed.every(Boolean) && parsed.every(p => p.unit === parsed[0].unit)) {
    const total = parsed.reduce((s, p) => s + p.qty, 0);
    return `${formatQty(total)}${parsed[0].unit ? ' ' + parsed[0].unit : ''}`;
  }
  return amounts.join(' + ');
}
