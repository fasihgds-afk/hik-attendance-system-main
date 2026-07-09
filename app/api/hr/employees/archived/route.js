// app/api/hr/employees/archived/route.js
import { connectDB } from '../../../../../lib/db';
import Employee from '../../../../../models/Employee';
import User from '../../../../../models/User';
import { buildEmployeeFilter } from '../../../../../lib/db/queryOptimizer';
import {
  mergeArchivedFilter,
  EMPLOYEE_STATUS,
} from '../../../../../lib/employees/activeFilter';
import {
  successResponse,
  errorResponse,
  errorResponseFromException,
  HTTP_STATUS,
} from '../../../../../lib/api/response';
import { requirePermission } from '../../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../../lib/errors/errorHandler';
import { decryptBankDetails } from '../../../../../lib/security/bankDetailsCrypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIST_PROJECTION = {
  _id: 1,
  empCode: 1,
  name: 1,
  email: 1,
  department: 1,
  designation: 1,
  shift: 1,
  monthlySalary: 1,
  phoneNumber: 1,
  status: 1,
  deletedAt: 1,
  deletedBy: 1,
  deleteReason: 1,
  lastWorkingDay: 1,
  createdAt: 1,
};

function formatArchivedEmployee(emp) {
  const row = { ...emp };
  if (row.bankDetails) {
    row.bankDetails = decryptBankDetails(row.bankDetails);
  }
  return row;
}

// GET /api/hr/employees/archived?page=1&limit=50&search=
export async function GET(req) {
  try {
    await requirePermission('archivedEmployees', 'view');
    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const search = (searchParams.get('search') || '').trim();
    const empCode = (searchParams.get('empCode') || '').trim();

    let queryFilter;
    if (empCode) {
      queryFilter = mergeArchivedFilter({ empCode });
    } else {
      const { filter } = buildEmployeeFilter({ search, shift: '', department: '' });
      queryFilter = mergeArchivedFilter(Object.keys(filter).length > 0 ? filter : {});
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Employee.find(queryFilter)
        .select(LIST_PROJECTION)
        .sort({ deletedAt: -1, empCode: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(2500),
      Employee.countDocuments(queryFilter).maxTimeMS(2000),
    ]);

    return successResponse(
      {
        items: items.map(formatArchivedEmployee),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
      'Archived employees retrieved',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}

// POST /api/hr/employees/archived  { empCode } — restore to active
export async function POST(req) {
  try {
    const { user } = await requirePermission('archivedEmployees', 'update');
    await connectDB();

    const body = await req.json();
    const empCode = String(body?.empCode || '').trim();
    if (!empCode) throw new ValidationError('empCode is required');

    const employee = await Employee.findOne(mergeArchivedFilter({ empCode })).maxTimeMS(2000);
    if (!employee) throw new NotFoundError(`Archived employee ${empCode}`);

    employee.status = EMPLOYEE_STATUS.ACTIVE;
    employee.deletedAt = null;
    employee.deletedBy = null;
    employee.deleteReason = null;
    employee.lastWorkingDay = null;
    await employee.save();

    await User.updateMany(
      { role: 'EMPLOYEE', employeeEmpCode: empCode },
      { $set: { isActive: true } }
    ).catch(() => {});

    const restored = employee.toObject();

    return successResponse(
      {
        employee: formatArchivedEmployee(restored),
        restoredBy: user?.email || user?.name || 'HR',
      },
      `Employee ${empCode} restored successfully`,
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
