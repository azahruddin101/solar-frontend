import { redirect } from 'next/navigation';

/** Legacy URL — preserve OAuth/query params when moving into Settings. */
export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  p.set('tab', 'integrations');
  if (sp?.meta) {
    p.set('meta', String(sp.meta));
    p.set('source', 'meta');
  }
  if (sp?.reason) p.set('reason', String(sp.reason));
  if (sp?.source) p.set('source', String(sp.source));
  redirect(`/dashboard/settings?${p.toString()}`);
}
