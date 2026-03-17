/**
 * API Route Auth Helpers
 * Use at the start of protected API routes to enforce authentication and role checks.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

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
 * Require EMPLOYEE role. Returns { session, user } or throws.
 * @throws {Error} 'UNAUTHORIZED_EMPLOYEE' if not authenticated or wrong role
 */
export async function requireEmployee() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'EMPLOYEE') {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED_EMPLOYEE';
    throw err;
  }
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
  return { session, user: session.user };
}

/**
 * Handle auth errors - returns NextResponse with 401, or rethrows.
 */
export function handleAuthError(err) {
  if (err?.code === 'UNAUTHORIZED_HR' || err?.code === 'UNAUTHORIZED_EMPLOYEE' || err?.code === 'UNAUTHORIZED') {
    return { unauthorized: true };
  }
  return null;
}
