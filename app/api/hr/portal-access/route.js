// app/api/hr/portal-access/route.js
// HR: list employees and toggle employee portal access (portalEnabled).
import { connectDB } from '../../../../lib/db';
import Employee from '../../../../models/Employee';
import { buildEmployeeFilter } from '../../../../lib/db/queryOptimizer';
import { isPortalEnabled } from '../../../../lib/auth/portalAccess';
import { mergeActiveFilter } from '../../../../lib/employees/activeFilter';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requireHR } from '../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIST_PROJECTION = {
  _id: 1,
  empCode: 1,
  name: 1,
  email: 1,
  department: 1,
  designation: 1,
  portalEnabled: 1,
};

function normalizePortalFlag(emp) {
  return {
    ...emp,
    portalEnabled: isPortalEnabled(emp),
  };
}

// GET /api/hr/portal-access?page=1&limit=50&search=&status=all|active|blocked
export async function GET(req) {
  try {
    await requireHR();
    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const search = (searchParams.get('search') || '').trim();
    const status = (searchParams.get('status') || 'all').toLowerCase();

    const { filter } = buildEmployeeFilter({ search, shift: '', department: '' });

    if (status === 'active') {
      filter.portalEnabled = { $ne: false };
    } else if (status === 'blocked') {
      filter.portalEnabled = false;
    }

    const skip = (page - 1) * limit;
    const queryFilter = mergeActiveFilter(Object.keys(filter).length > 0 ? filter : {});

    const [items, total, blockedCount, activeCount] = await Promise.all([
      Employee.find(queryFilter)
        .select(LIST_PROJECTION)
        .sort({ empCode: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(2500),
      Employee.countDocuments(queryFilter).maxTimeMS(2000),
      Employee.countDocuments(mergeActiveFilter({ portalEnabled: false })).maxTimeMS(2000),
      Employee.countDocuments(mergeActiveFilter({ portalEnabled: { $ne: false } })).maxTimeMS(2000),
    ]);

    return successResponse(
      {
        items: items.map(normalizePortalFlag),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        stats: {
          totalEmployees: activeCount + blockedCount,
          portalActive: activeCount,
          portalBlocked: blockedCount,
        },
      },
      'Portal access list retrieved',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}

// PATCH /api/hr/portal-access  { empCode, portalEnabled: boolean }
export async function PATCH(req) {
  try {
    const { user } = await requireHR();
    await connectDB();

    const body = await req.json();
    const empCode = String(body?.empCode || '').trim();
    if (!empCode) throw new ValidationError('empCode is required');
    if (typeof body.portalEnabled !== 'boolean') {
      throw new ValidationError('portalEnabled must be a boolean');
    }

    const employee = await Employee.findOneAndUpdate(
      mergeActiveFilter({ empCode }),
      { $set: { portalEnabled: body.portalEnabled } },
      { new: true, runValidators: true }
    )
      .select(LIST_PROJECTION)
      .lean()
      .maxTimeMS(2000);

    if (!employee) throw new NotFoundError(`Employee ${empCode}`);

    return successResponse(
      {
        employee: normalizePortalFlag(employee),
        updatedBy: user?.email || user?.name || 'HR',
      },
      body.portalEnabled
        ? 'Employee portal access enabled'
        : 'Employee portal access blocked',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
