// app/api/auth/register/route.js
import { connectDB } from '../../../../lib/db';
import User from '../../../../models/User';
import Employee from '../../../../models/Employee';
import bcrypt from 'bcryptjs';
import { ValidationError, NotFoundError } from '../../../../lib/errors/errorHandler';
import { rateLimiters } from '../../../../lib/middleware/rateLimit';
import { z } from 'zod';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requirePermission } from '../../../../lib/auth/requireAuth';
import { mergeActiveFilter } from '../../../../lib/employees/activeFilter';
import SecurityAuditLog from '../../../../models/SecurityAuditLog';
import {
  createFullPermissions,
  normalizePermissions,
} from '../../../../lib/auth/permissions';

// Zod v4: z.record requires (key, value). Nested module → action → boolean.
const permissionsSchema = z
  .record(z.string(), z.record(z.string(), z.boolean()))
  .optional();

// Validation schema for user registration
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['HR', 'EMPLOYEE', 'ADMIN'], {
    errorMap: () => ({ message: 'Invalid role. Use HR, EMPLOYEE, or ADMIN.' }),
  }),
  empCode: z.string().optional(),
  permissions: permissionsSchema,
  permissionPreset: z.string().optional(),
});

export async function POST(req) {
  // Apply strict rate limiting for auth endpoints
  const rateLimitResponse = await rateLimiters.auth(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { user: actor } = await requirePermission('users', 'create');
    await connectDB();

    const body = await req.json();
    
    // Validate input
    let validated;
    try {
      validated = registerSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Safely handle errors array - ensure it exists and is an array
        const errors = (error.errors && Array.isArray(error.errors)) 
          ? error.errors.map(e => ({
              field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
              message: e.message || 'Validation error',
            }))
          : [{ field: 'unknown', message: 'Validation failed' }];
        
        throw new ValidationError('Validation failed', errors);
      }
      throw error;
    }

    const { email, password, role, empCode, permissions: rawPermissions } = validated;
    const actorRole = String(actor?.role || '').toUpperCase();
    const actorId = String(actor?.email || actor?.empCode || 'unknown');

    // Privileged role protection: only ADMIN can create ADMIN users.
    if (role === 'ADMIN' && actorRole !== 'ADMIN') {
      throw new ValidationError('Only ADMIN can create ADMIN users');
    }

    // For EMPLOYEE users, require valid empCode that exists in Employee collection
    let employeeDoc = null;
    if (role === 'EMPLOYEE') {
      if (!empCode) {
        throw new ValidationError('empCode is required for EMPLOYEE role');
      }

      employeeDoc = await Employee.findOne(mergeActiveFilter({ empCode }))
        .select('empCode')
        .lean()
        .maxTimeMS(1500);
      if (!employeeDoc) {
        throw new NotFoundError(`Employee with empCode ${empCode}`);
      }
    }

    // Check if email already exists
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      throw new ValidationError('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let permissionsToSave;
    if (role === 'ADMIN') {
      permissionsToSave = createFullPermissions();
    } else if (role === 'HR') {
      permissionsToSave = rawPermissions
        ? normalizePermissions(rawPermissions)
        : createFullPermissions();
    } else {
      permissionsToSave = undefined;
    }

    const newUser = await User.create({
      email,
      passwordHash,
      role,
      employeeEmpCode: role === 'EMPLOYEE' ? employeeDoc.empCode : undefined,
      ...(permissionsToSave ? { permissions: permissionsToSave } : {}),
    });

    await SecurityAuditLog.create({
      actorRole,
      actorId,
      action: 'USER_REGISTER',
      target: email,
      status: 'SUCCESS',
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown',
      details: {
        createdRole: role,
        permissionPreset: validated.permissionPreset || null,
        hasCustomPermissions: !!rawPermissions,
      },
    });

    return successResponse(
      {
        userId: newUser._id,
        role: newUser.role,
        permissions: permissionsToSave || null,
      },
      'User registered successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    if (err?.code === 'FORBIDDEN_PERMISSION') {
      return errorResponse(err.message || 'Forbidden', 403);
    }
    try {
      await SecurityAuditLog.create({
        actorRole: 'UNKNOWN',
        actorId: 'unknown',
        action: 'USER_REGISTER',
        target: 'unknown',
        status: 'FAILED',
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown',
        details: { message: err?.message || 'register_failed' },
      });
    } catch {}
    return errorResponseFromException(err, req);
  }
}
