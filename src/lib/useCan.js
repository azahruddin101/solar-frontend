'use client';

import { useCallback } from 'react';
import { can } from './permissions.js';
import { useSession } from './session.js';

/** `const may = useCan(); may('finances', 'create_bill')` — the signed-in user's permissions (owner: always true). */
export function useCan() {
  const user = useSession((s) => s.user);
  return useCallback((area, action) => can(user, area, action), [user]);
}
