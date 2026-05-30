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

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Returns the Saturday-shift fields, defaulting to current behavior ('own_time').
function normalizeSaturdayShift(body) {
  const mode = body.saturdayShiftMode === 'unified_time' ? 'unified_time' : 'own_time';
  const start = TIME_RE.test(String(body.saturdayUnifiedStart || '')) ? body.saturdayUnifiedStart : '21:00';
  const end = TIME_RE.test(String(body.saturdayUnifiedEnd || '')) ? body.saturdayUnifiedEnd : '06:00';
  const crosses = body.saturdayUnifiedCrossesMidnight === undefined
    ? true
    : !!body.saturdayUnifiedCrossesMidnight;
  return {
    saturdayShiftMode: mode,
    saturdayUnifiedStart: start,
    saturdayUnifiedEnd: end,
    saturdayUnifiedCrossesMidnight: crosses,
  };
}

const DEPT_SELECT = 'name saturdayPolicy fifthSaturdayPolicy saturdayShiftMode saturdayUnifiedStart saturdayUnifiedEnd saturdayUnifiedCrossesMidnight';

// GET /api/hr/departments - List all departments (name, saturdayPolicy, fifthSaturdayPolicy)
export async function GET() {
  try {
    await requireHR();
    await connectDB();
    const departments = await Department.find()
      .select(DEPT_SELECT)
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
    const saturdayShift = normalizeSaturdayShift(body);
    const existing = await Department.findOne({ name }).lean().maxTimeMS(1500);
    if (existing) throw new ValidationError(`Department "${name}" already exists`);
    const doc = await Department.create({ name, saturdayPolicy, fifthSaturdayPolicy, ...saturdayShift });
    return successResponse(
      {
        department: {
          _id: doc._id,
          name: doc.name,
          saturdayPolicy: doc.saturdayPolicy,
          fifthSaturdayPolicy: doc.fifthSaturdayPolicy,
          saturdayShiftMode: doc.saturdayShiftMode,
          saturdayUnifiedStart: doc.saturdayUnifiedStart,
          saturdayUnifiedEnd: doc.saturdayUnifiedEnd,
          saturdayUnifiedCrossesMidnight: doc.saturdayUnifiedCrossesMidnight,
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
    const $set = { saturdayPolicy, fifthSaturdayPolicy };
    // Only touch Saturday-shift fields when the caller actually sent them, so the
    // existing Saturday-off dropdowns don't reset a configured unified timing.
    if (body.saturdayShiftMode !== undefined) {
      Object.assign($set, normalizeSaturdayShift(body));
    }
    const doc = await Department.findOneAndUpdate(
      { name },
      { $set },
      { new: true, runValidators: true }
    )
      .select(DEPT_SELECT)
      .lean()
      .maxTimeMS(1500);
    if (!doc) throw new ValidationError(`Department "${name}" not found`);
    return successResponse({ department: doc }, 'Department updated', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
