/**
 * API Route Auth Helpers
 * Use at the start of protected API routes to enforce authentication and role checks.
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { assertEmployeePortalEnabled } from '@/lib/auth/portalAccess';
import { hasPermission, resolvePermissions } from '@/lib/auth/permissions';

/**
 * Require HR or ADMIN role. Returns { session, user } or throws.
 * @throws {Error} 'UNAUTHORIZED_HR' if not authenticated or wrong role
 */
export async function requireHR() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['HR', 'ADMIN'].includes(session.user.role)) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED_HR';
    throw err;
  }
  return { session, user: session.user };
}

/**
 * Require HR/ADMIN with a specific module permission.
 * ADMIN always passes. Legacy HR (no permissions in session) treated as full via resolvePermissions.
 * @param {string} moduleKey
 * @param {string} action - view | create | update | delete | export
 * @throws {Error} 'UNAUTHORIZED_HR' | 'FORBIDDEN_PERMISSION'
 */
export async function requirePermission(moduleKey, action = 'view') {
  const { session, user } = await requireHR();
  const effectiveUser = {
    role: user.role,
    permissions: user.permissions ?? resolvePermissions(user),
  };

  if (!hasPermission(effectiveUser, moduleKey, action)) {
    const err = new Error(`Missing permission: ${moduleKey}.${action}`);
    err.code = 'FORBIDDEN_PERMISSION';
    throw err;
  }

  return { session, user: { ...user, permissions: effectiveUser.permissions } };
}

/**
 * Require EMPLOYEE role. Returns { session, user } or throws.
 * @throws {Error} 'UNAUTHORIZED_EMPLOYEE' if not authenticated or wrong role
 */
export async function requireEmployee() {
  const session = await getServerSession(authOptions);
  const role = String(session?.user?.role || '').toUpperCase();
  if (!session?.user || role !== 'EMPLOYEE') {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED_EMPLOYEE';
    throw err;
  }
  await assertEmployeePortalEnabled(session.user.empCode);
  return { session, user: session.user };
}

/**
 * Require any authenticated user. Returns { session, user } or throws.
 * @throws {Error} 'UNAUTHORIZED' if not authenticated
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  if (String(session.user.role || '').toUpperCase() === 'EMPLOYEE') {
    await assertEmployeePortalEnabled(session.user.empCode);
  }
  return { session, user: session.user };
}

/**
 * Handle auth errors - returns NextResponse with 401, or rethrows.
 */
export function handleAuthError(err) {
  if (
    err?.code === 'UNAUTHORIZED_HR' ||
    err?.code === 'UNAUTHORIZED_EMPLOYEE' ||
    err?.code === 'UNAUTHORIZED' ||
    err?.code === 'FORBIDDEN_PERMISSION'
  ) {
    return { unauthorized: true, code: err.code };
  }
  return null;
}
