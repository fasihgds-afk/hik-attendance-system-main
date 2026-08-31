/**
 * Credentials sign-in that avoids a NextAuth client bug:
 * with redirect:false it does `new URL(data.url)` which throws
 * "Failed to construct 'URL': Invalid URL" when data.url is relative/empty.
 * Auth often still succeeds — we verify the session and continue.
 */
import { signIn } from 'next-auth/react';

function isInvalidUrlError(err) {
  const msg = String(err?.message || err || '');
  return /Failed to construct ['"]?URL['"]?|Invalid URL|URL constructor/i.test(msg);
}

/**
 * @param {object} params
 * @param {'HR'|'EMPLOYEE'} params.mode
 * @param {string} params.callbackPath - absolute path e.g. "/employee/dashboard"
 * @param {Record<string, string>} [params.credentials] - extra credential fields
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export async function safeCredentialsSignIn({ mode, callbackPath, credentials = {} }) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  const callbackUrl = origin
    ? `${origin}${callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`}`
    : callbackPath;

  let result = null;
  try {
    result = await signIn('credentials', {
      redirect: false,
      callbackUrl,
      mode,
      ...credentials,
    });
  } catch (err) {
    if (!isInvalidUrlError(err)) throw err;
    // Fall through — session may already be established
  }

  if (result?.ok && !result?.error) {
    return { ok: true, error: null };
  }

  // Recover when NextAuth threw or returned a broken url but session exists
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'include' });
    if (res.ok) {
      const session = await res.json();
      const role = String(session?.user?.role || '').toUpperCase();
      if (session?.user && role === String(mode).toUpperCase()) {
        return { ok: true, error: null };
      }
      if (mode === 'HR' && session?.user && ['HR', 'ADMIN'].includes(role)) {
        return { ok: true, error: null };
      }
    }
  } catch {
    // ignore — treat as failed login below
  }

  if (result?.error) {
    return { ok: false, error: result.error };
  }
  return { ok: false, error: 'CredentialsSignin' };
}
