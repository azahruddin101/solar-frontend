'use client';

import { useCallback } from 'react';
import { can } from './permissions.js';
import { useSession } from './session.js';
import { canEditCatalog } from './tenant.js';

/** `const may = useCan(); may('finances', 'create_bill')` — the signed-in user's permissions (owner: always true). */
export function useCan() {
  const user = useSession((s) => s.user);
  return useCallback((area, action) => can(user, area, action), [user]);
}

/**
 * Like useCan, for changing the shared product catalog (categories, parent categories, products): in a company with
 * branches only the company admin changes it (see canEditCatalog). Receiving stock and suppliers use useCan.
 */
export function useCatalogCan() {
  const user = useSession((s) => s.user);
  return useCallback((area, action) => can(user, area, action) && (area !== 'inventory' || canEditCatalog(user)), [user]);
}
