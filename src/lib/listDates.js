/** Append inclusive `from`/`to` (`YYYY-MM-DD`) to a list API path. */
export function withDateRange(path, from, to) {
  const p = new URLSearchParams();
  const q = path.includes('?') ? path.split('?')[1] : '';
  if (q) new URLSearchParams(q).forEach((v, k) => p.set(k, v));
  if (from && to) {
    p.set('from', from);
    p.set('to', to);
  }
  const base = path.split('?')[0];
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}
