// Scales the leading quantity in an ingredient amount string, e.g. "2¼ lb" x 1.5 -> "3⅜ lb".
const UNI = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅙': 1 / 6, '⅚': 5 / 6 };
const FRACS = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'], [1, '']];
const UNI_CLASS = Object.keys(UNI).join('');

// Leading quantity: "2", "2.5", "2¼", "¼", "1/2", "1 1/2", optional range "2-3" / "2–3".
const NUM = `(?:\\d+(?:\\.\\d+)?(?:\\s*[${UNI_CLASS}]|\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|[${UNI_CLASS}])`;
const LEAD = new RegExp(`^(${NUM})(?:\\s*[-–]\\s*(${NUM}))?`);

export function parseQty(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  if ((m = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*([${UNI_CLASS}])$`)))) return (m[1] ? +m[1] : 0) + UNI[m[2]];
  return parseFloat(s);
}

export function formatQty(n) {
  if (n >= 10) return String(Math.round(n));
  let whole = Math.floor(n);
  const frac = n - whole;
  let best = FRACS[0];
  for (const f of FRACS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  if (best[0] === 1) { whole += 1; best = FRACS[0]; }
  if (!whole && !best[1]) return '⅛';
  return `${whole || ''}${best[1]}`;
}

export function scaleAmount(amount, factor) {
  if (!amount || factor === 1) return amount;
  const m = amount.match(LEAD);
  if (!m) return amount;
  const a = formatQty(parseQty(m[1]) * factor);
  const b = m[2] ? '–' + formatQty(parseQty(m[2]) * factor) : '';
  return a + b + amount.slice(m[0].length);
}

const UNIT_ALIASES = {
  lbs: 'lb', pound: 'lb', pounds: 'lb', ounce: 'oz', ounces: 'oz', cups: 'cup', tablespoon: 'tbsp', tablespoons: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', cloves: 'clove', cans: 'can', bunches: 'bunch', heads: 'head', bags: 'bag',
  packages: 'package', pkg: 'package', slices: 'slice', stalks: 'stalk', sprigs: 'sprig', pints: 'pint', quarts: 'quart',
};

/** Split "1½ lb, halved" into { qty: 1.5, unit: 'lb' }. Returns null when there is no leading quantity. */
export function parseLead(amount) {
  if (!amount) return null;
  const m = amount.match(LEAD);
  if (!m || m[2]) return null; // ranges are not summed
  const qty = parseQty(m[1]);
  if (!Number.isFinite(qty)) return null;
  const rest = amount.slice(m[0].length).trim();
  const w = (rest.match(/^([a-zA-Z]+)\.?/) || [])[1]?.toLowerCase() || '';
  const unit = UNIT_ALIASES[w] || (['lb', 'oz', 'cup', 'tbsp', 'tsp', 'clove', 'can', 'bunch', 'head', 'bag', 'package', 'slice', 'stalk', 'sprig', 'pint', 'quart', 'large', 'medium', 'small'].includes(w) ? w : '');
  return { qty, unit };
}
