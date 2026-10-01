'use client';

// Remembers the last dashboard/portal page visited (anything outside the design builder itself), so the
// builder's back button can return there even after several in-builder step changes push their own history entries.
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export const RETURN_PAGE_KEY = 'sp.returnPage';

export default function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname && !pathname.startsWith('/design/')) sessionStorage.setItem(RETURN_PAGE_KEY, pathname);
  }, [pathname]);
  return null;
}
