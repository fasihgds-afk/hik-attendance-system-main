'use client';

import { useSession } from 'next-auth/react';
import { sessionHasPermission } from '@/lib/auth/permissionClient';

/**
 * UI permission helpers for a single module.
 * API still enforces requirePermission — this only hides/disables write controls.
 */
export function usePermissions(moduleKey) {
  const { data: session, status } = useSession();
  const ready = status === 'authenticated';

  const can = (action = 'view') =>
    ready ? sessionHasPermission(session, moduleKey, action) : false;

  return {
    session,
    status,
    ready,
    can,
    canView: can('view'),
    canCreate: can('create'),
    canUpdate: can('update'),
    canDelete: can('delete'),
    canExport: can('export'),
  };
}

/** Check an extra module from the same session (e.g. bankDetails on monthly page). */
export function useModulePermission(moduleKey, action = 'view') {
  const { data: session, status } = useSession();
  if (status !== 'authenticated') return false;
  return sessionHasPermission(session, moduleKey, action);
}
