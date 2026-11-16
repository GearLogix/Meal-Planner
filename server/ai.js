// Recipe generation through the Claude API. The API key is stored encrypted and decrypted only per request.
import { getSecret } from './secrets.js';
import { getMeta } from './db.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

const RECIPE_SCHEMA = {
  type: 'object',
  required: ['title', 'protein', 'method', 'meal_type', 'servings', 'total_min', 'active_min', 'description',
    'kcal', 'protein_g', 'carbs_g', 'sat_fat_g', 'unsat_fat_g', 'ingredients', 'steps'],
  properties: {
    title: { type: 'string' },
    protein: { type: 'string', enum: ['Salmon', 'Shrimp', 'Seafood', 'Chicken', 'Turkey', 'Beef', 'Pork', 'Lamb', 'Eggs', 'Plant-based', 'Dairy'] },
    method: { type: 'string', enum: ['Sous vide', 'Grill', 'Bake', 'Sear', 'Air fryer', 'Slow cooker', 'Stovetop', 'No-cook', 'Blender'] },
    meal_type: { type: 'string', enum: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] },
    servings: { type: 'integer', minimum: 1, maximum: 12 },
    total_min: { type: 'integer' },
    active_min: { type: 'integer' },
    description: { type: 'string' },
    kcal: { type: 'number', description: 'Calories for the ENTIRE recipe (all servings)' },
    protein_g: { type: 'number', description: 'Protein grams for the ENTIRE recipe' },
    carbs_g: { type: 'number', description: 'Carb grams for the ENTIRE recipe' },
    sat_fat_g: { type: 'number', description: 'Saturated fat grams for the ENTIRE recipe' },
    unsat_fat_g: { type: 'number', description: 'Unsaturated fat grams for the ENTIRE recipe' },
    is_soup: { type: 'boolean' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object', required: ['name', 'amount'],
        properties: {
          name: { type: 'string' },
          amount: { type: 'string', description: 'Leading quantity then unit, e.g. "1½ lb" or "2 tbsp, divided"' },
          shopTerm: { type: 'string', description: 'Plain grocery search term, e.g. "lemons" for lemon zest' },
          pantry: { type: 'boolean', description: 'True for staples like salt, pepper, water' },
        },
      },
    },
    steps: { type: 'array', items: { type: 'object', required: ['title', 'text'], properties: { title: { type: 'string' }, text: { type: 'string' } } } },
    sides: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, desc: { type: 'string' } } } },
    tip: { type: 'string' },
  },
};

function timeRange(min) {
  if (min < 30) return 'Under 30 min';
  if (min <= 60) return '30–60 min';
  if (min <= 120) return '1–2 hr';
  if (min <= 240) return '2–4 hr';
  return '4+ hr';
}
function timeLabel(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
}

export function buildPrompt(o) {
  const lines = [
    'Create one original, high-protein home-cooking recipe for a personal meal-planning app.',
    o.prompt ? `Request: ${o.prompt}` : null,
    o.meal_type ? `Meal type: ${o.meal_type}` : null,
    o.protein ? `Main protein: ${o.protein}` : null,
    o.method ? `Cooking method: ${o.method}` : null,
    `Servings: ${o.servings || 4}`,
    o.max_minutes ? `Total time at most ${o.max_minutes} minutes.` : null,
  ];
  const t = o.targets || {};
  if (Object.values(t).some(v => v)) {
    lines.push('Per-serving macro targets (stay within about 10%):' +
      (t.kcal ? ` ${t.kcal} kcal;` : '') + (t.protein_g ? ` ${t.protein_g} g protein;` : '') +
      (t.carbs_g ? ` ${t.carbs_g} g carbs;` : '') + (t.fat_g ? ` ${t.fat_g} g fat;` : ''));
  }
  if (o.avoid) lines.push(`Avoid: ${o.avoid}`);
  lines.push('Macros you report must be for the ENTIRE recipe, computed from standard USDA values for the listed amounts.',
    'Use US measurements and ingredients commonly found at Publix, Aldi, Target or Walmart.',
    'Steps: 4 to 8, each with a short imperative title and 1 to 3 sentences including temperatures and times.');
  return lines.filter(Boolean).join('\n');
}

export async function generateRecipe(opts) {
  const key = getSecret('anthropic_api_key');
  if (!key) { const e = new Error('Add your Claude API key in Settings first'); e.status = 400; throw e; }
  const model = getMeta('anthropic_model') || DEFAULT_MODEL;

  const r = await fetch(`${BASE}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      tools: [{ name: 'save_recipe', description: 'Save the finished recipe', input_schema: RECIPE_SCHEMA }],
      tool_choice: { type: 'tool', name: 'save_recipe' },
      messages: [{ role: 'user', content: buildPrompt(opts) }],
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(body?.error?.message || `Claude API error ${r.status}`); e.status = 502; throw e;
  }
  const tool = (body.content || []).find(c => c.type === 'tool_use');
  if (!tool) { const e = new Error('No recipe returned'); e.status = 502; throw e; }
  const x = tool.input;
  return {
    title: x.title, protein: x.protein, method: x.method, meal_type: x.meal_type,
    servings: x.servings, total_min: x.total_min, active_min: x.active_min,
    time_range: timeRange(x.total_min), time_label: timeLabel(x.total_min),
    description: x.description, kcal: x.kcal, protein_g: x.protein_g, carbs_g: x.carbs_g,
    sat_fat_g: x.sat_fat_g, unsat_fat_g: x.unsat_fat_g, is_soup: !!x.is_soup,
    ingredients: (x.ingredients || []).map(i => ({
      name: i.name, amount: i.amount, shopTerms: i.shopTerm ? [i.shopTerm] : [], pantry: !!i.pantry, sharedPurchase: false,
    })),
    steps: x.steps || [], sides: x.sides || [], tip: x.tip || null,
  };
}

export { timeRange, timeLabel };
