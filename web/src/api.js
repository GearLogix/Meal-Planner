async function j(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}

export const api = {
  health: () => j('/api/health'),
  list: () => j('/api/recipes'),
  get: id => j(`/api/recipes/${encodeURIComponent(id)}`),
};
