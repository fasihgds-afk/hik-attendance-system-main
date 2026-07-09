/**
 * Client-side permission helpers (mirrors server resolve/hasPermission).
 */
import {
  createEmptyPermissions,
  createFullPermissions,
  resolvePermissions as resolvePermissionsServer,
  hasPermission as hasPermissionServer,
  PERMISSION_MODULES,
  PRESET_LIST,
  PERMISSION_PRESETS,
  normalizePermissions,
} from '@/lib/auth/permissions';

export {
  PERMISSION_MODULES,
  PRESET_LIST,
  PERMISSION_PRESETS,
  createEmptyPermissions,
  createFullPermissions,
  normalizePermissions,
};

export function resolvePermissions(user) {
  return resolvePermissionsServer(user);
}

export function hasPermission(user, moduleKey, action = 'view') {
  return hasPermissionServer(user, moduleKey, action);
}

/** Hook-friendly check from a NextAuth session object. */
export function sessionHasPermission(session, moduleKey, action = 'view') {
  if (!session?.user) return false;
  return hasPermission(session.user, moduleKey, action);
}
