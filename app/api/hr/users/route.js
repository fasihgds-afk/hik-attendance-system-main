import { connectDB } from '../../../../lib/db';
import User from '../../../../models/User';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  successResponse,
  errorResponse,
  errorResponseFromException,
  HTTP_STATUS,
} from '../../../../lib/api/response';
import { requirePermission } from '../../../../lib/auth/requireAuth';
import {
  normalizePermissions,
  resolvePermissions,
} from '../../../../lib/auth/permissions';
import { ValidationError, NotFoundError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accept nested module → action → boolean maps; normalizePermissions sanitizes later.
const permissionsSchema = z.record(z.string(), z.record(z.string(), z.boolean())).optional();

const patchSchema = z.object({
  userId: z.string().min(1),
  permissions: permissionsSchema,
  permissionPreset: z.string().optional(),
  isActive: z.boolean().optional(),
  password: z.union([z.string().min(8), z.literal('')]).optional(),
});

/**
 * GET /api/hr/users
 * List portal login users (User collection) — not Employee records.
 */
export async function GET() {
  try {
    await requirePermission('users', 'view');
    await connectDB();

    const users = await User.find({})
      .select('_id email role employeeEmpCode isActive permissions createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(4000);

    const items = users.map((u) => ({
      id: String(u._id),
      email: u.email,
      role: u.role,
      employeeEmpCode: u.employeeEmpCode || null,
      isActive: u.isActive !== false,
      permissions: resolvePermissions(u),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return successResponse({ users: items }, 'Users loaded');
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    if (err?.code === 'FORBIDDEN_PERMISSION') {
      return errorResponse(err.message || 'Forbidden', 403);
    }
    return errorResponseFromException(err);
  }
}

/**
 * PATCH /api/hr/users
 * Update permissions / active flag / optional password for an existing portal user.
 */
export async function PATCH(req) {
  try {
    const { user: actor } = await requirePermission('users', 'create');
    await connectDB();

    const body = await req.json();
    let validated;
    try {
      validated = patchSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues || error.errors || [];
        const errors = (Array.isArray(issues) ? issues : []).map((e) => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message || 'Validation error',
        }));
        console.error('[PATCH /api/hr/users] Zod validation:', errors);
        throw new ValidationError('Validation failed', errors);
      }
      throw error;
    }

    const { userId, permissions, isActive, password } = validated;
    const passwordToSet = password && password.length >= 8 ? password : undefined;
    const target = await User.findById(userId).maxTimeMS(2000);
    if (!target) {
      throw new NotFoundError('User');
    }

    const actorRole = String(actor?.role || '').toUpperCase();
    // Only ADMIN can edit ADMIN accounts
    if (target.role === 'ADMIN' && actorRole !== 'ADMIN') {
      throw new ValidationError('Only ADMIN can edit ADMIN users');
    }

    if (permissions && (target.role === 'HR' || target.role === 'ADMIN')) {
      target.permissions = normalizePermissions(permissions);
      target.markModified('permissions');
    }

    if (typeof isActive === 'boolean') {
      target.isActive = isActive;
    }

    if (passwordToSet) {
      target.passwordHash = await bcrypt.hash(passwordToSet, 10);
    }

    await target.save();

    return successResponse(
      {
        id: String(target._id),
        email: target.email,
        role: target.role,
        isActive: target.isActive !== false,
        permissions: resolvePermissions(target),
      },
      'User updated',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    if (err?.code === 'FORBIDDEN_PERMISSION') {
      return errorResponse(err.message || 'Forbidden', 403);
    }
    return errorResponseFromException(err, req);
  }
}
