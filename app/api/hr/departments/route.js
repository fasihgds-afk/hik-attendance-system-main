// app/api/hr/departments/route.js
// List, create, and update departments (name + saturdayPolicy + fifthSaturdayPolicy for weekend rules).
import { connectDB } from '../../../../lib/db';
import Department from '../../../../models/Department';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requireHR } from '../../../../lib/auth/requireAuth';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeSaturdayPolicy(value) {
  return value === 'all_off' ? 'all_off' : 'alternate';
}

function normalizeFifthSaturdayPolicy(value) {
  if (value === 'off_all') return 'off_all';
  if (value === 'group_alternate') return 'group_alternate';
  return 'working_all';
}

// GET /api/hr/departments - List all departments (name, saturdayPolicy, fifthSaturdayPolicy)
export async function GET() {
  try {
    await requireHR();
    await connectDB();
    const departments = await Department.find()
      .select('name saturdayPolicy fifthSaturdayPolicy')
      .sort({ name: 1 })
      .lean()
      .maxTimeMS(1500);
    return successResponse({ departments }, 'Departments retrieved', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err);
  }
}

// POST /api/hr/departments - Create department (name required, saturdayPolicy/fifthSaturdayPolicy optional)
export async function POST(req) {
  try {
    await requireHR();
    await connectDB();
    const body = await req.json();
    const name = (body.name || '').trim();
    if (!name) throw new ValidationError('name is required');
    const saturdayPolicy = normalizeSaturdayPolicy(body.saturdayPolicy);
    const fifthSaturdayPolicy = normalizeFifthSaturdayPolicy(body.fifthSaturdayPolicy);
    const existing = await Department.findOne({ name }).lean().maxTimeMS(1500);
    if (existing) throw new ValidationError(`Department "${name}" already exists`);
    const doc = await Department.create({ name, saturdayPolicy, fifthSaturdayPolicy });
    return successResponse(
      {
        department: {
          _id: doc._id,
          name: doc.name,
          saturdayPolicy: doc.saturdayPolicy,
          fifthSaturdayPolicy: doc.fifthSaturdayPolicy,
        },
      },
      'Department created',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}

// PATCH /api/hr/departments - Update saturdayPolicy/fifthSaturdayPolicy by name
export async function PATCH(req) {
  try {
    await requireHR();
    await connectDB();
    const body = await req.json();
    const name = (body.name || '').trim();
    if (!name) throw new ValidationError('name is required');
    const saturdayPolicy = normalizeSaturdayPolicy(body.saturdayPolicy);
    const fifthSaturdayPolicy = normalizeFifthSaturdayPolicy(body.fifthSaturdayPolicy);
    const doc = await Department.findOneAndUpdate(
      { name },
      { $set: { saturdayPolicy, fifthSaturdayPolicy } },
      { new: true, runValidators: true }
    )
      .select('name saturdayPolicy fifthSaturdayPolicy')
      .lean()
      .maxTimeMS(1500);
    if (!doc) throw new ValidationError(`Department "${name}" not found`);
    return successResponse({ department: doc }, 'Department updated', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
