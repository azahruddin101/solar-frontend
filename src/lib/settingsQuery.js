/** Merge URL search params for Settings (keeps `tab=integrations` when switching lead sources). */
export function settingsSearchUrl(pathname, searchParams, patch, { remove = [] } = {}) {
  const p = new URLSearchParams(typeof searchParams?.toString === 'function' ? searchParams.toString() : '');
  remove.forEach((k) => p.delete(k));
  Object.entries(patch).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') p.delete(k);
    else p.set(k, String(v));
  });
  if (pathname.includes('/settings') && (p.get('source') || p.get('meta'))) {
    p.set('tab', 'integrations');
  }
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function resolveSettingsTab(tabParam, searchParams) {
  const ids = ['profile', 'branding', 'proposal', 'invoices', 'plan', 'support', 'integrations', 'account'];
  if (tabParam && ids.includes(tabParam)) return tabParam;
  const sp = searchParams;
  const get = (k) => (typeof sp?.get === 'function' ? sp.get(k) : null);
  if (get('source') || get('meta')) return 'integrations';
  return 'profile';
}
