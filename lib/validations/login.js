// lib/validations/login.js
import { z } from 'zod';

const MAX_EMAIL = 254;
const MAX_PASSWORD = 128;
const MAX_EMP_CODE = 20;

/**
 * Reject objects/arrays (NoSQL operator injection) and non-string values.
 * Returns a trimmed string or null.
 */
export function asPlainString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  // Block null bytes / control chars that can confuse parsers
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

export const hrLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(MAX_EMAIL)
    .email('Invalid email format')
    .refine((v) => !/[<>`"\\]/.test(v), 'Invalid email characters'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(MAX_PASSWORD, 'Password is too long'),
});

export const employeeLoginSchema = z.object({
  empCode: z
    .string()
    .trim()
    .min(1, 'Employee code is required')
    .max(MAX_EMP_CODE)
    .regex(/^[A-Za-z0-9]+$/, 'Employee code must be letters and numbers only'),
});

/**
 * Parse and sanitize HR login credentials.
 * @returns {{ ok: true, data: { email: string, password: string } } | { ok: false, error: string }}
 */
export function parseHrLogin({ email, password }) {
  const safeEmail = asPlainString(email, MAX_EMAIL);
  const safePassword =
    typeof password === 'string' && password.length > 0 && password.length <= MAX_PASSWORD
      ? password
      : null;

  if (!safeEmail || !safePassword) {
    return { ok: false, error: 'Invalid email or password format' };
  }

  const result = hrLoginSchema.safeParse({ email: safeEmail, password: safePassword });
  if (!result.success) {
    const msg = result.error.issues?.[0]?.message || 'Invalid credentials format';
    return { ok: false, error: msg };
  }
  return { ok: true, data: result.data };
}

/**
 * Parse and sanitize employee login credentials.
 * @returns {{ ok: true, data: { empCode: string } } | { ok: false, error: string }}
 */
export function parseEmployeeLogin({ empCode }) {
  const safeCode = asPlainString(empCode, MAX_EMP_CODE);
  if (!safeCode) {
    return { ok: false, error: 'Invalid employee code format' };
  }

  const result = employeeLoginSchema.safeParse({ empCode: safeCode });
  if (!result.success) {
    const msg = result.error.issues?.[0]?.message || 'Invalid employee code format';
    return { ok: false, error: msg };
  }
  return { ok: true, data: { empCode: result.data.empCode } };
}

export const LOGIN_LIMITS = {
  MAX_EMAIL,
  MAX_PASSWORD,
  MAX_EMP_CODE,
};
