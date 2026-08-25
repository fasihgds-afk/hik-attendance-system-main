// GET /api/hr/bootstrap
// One round-trip for employee manager first paint: employees + shifts + departments.
import { connectDB } from '../../../../lib/db';
import Shift from '../../../../models/Shift';
import Department from '../../../../models/Department';
import { queryEmployeeList } from '../../../../lib/employees/queryEmployeeList';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requireHR } from '../../../../lib/auth/requireAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEPT_SELECT =
  'name saturdayPolicy fifthSaturdayPolicy saturdayShiftMode saturdayUnifiedStart saturdayUnifiedEnd saturdayUnifiedCrossesMidnight';

export async function GET(req) {
  try {
    await requireHR();
    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';
    const search = (searchParams.get('search') || '').trim();
    const department = (searchParams.get('department') || '').trim();
    const includeLookups = searchParams.get('lookups') !== '0';

    const [list, shifts, departments] = await Promise.all([
      queryEmployeeList({ page, limit, search, department }),
      includeLookups
        ? Shift.find({ isActive: true })
            .select(
              '_id name code startTime endTime crossesMidnight gracePeriod checkInGracePeriod checkOutGracePeriod graceEffectiveFrom priorCheckInGracePeriod priorCheckOutGracePeriod description isActive'
            )
            .sort({ code: 1 })
            .lean()
            .maxTimeMS(1500)
        : Promise.resolve([]),
      includeLookups
        ? Department.find().select(DEPT_SELECT).sort({ name: 1 }).lean().maxTimeMS(1500)
        : Promise.resolve([]),
    ]);

    const totalPages = Math.max(1, Math.ceil((list.total || 0) / list.limit));

    return successResponse(
      {
        items: list.employees,
        shifts: shifts || [],
        departments: departments || [],
      },
      'HR bootstrap retrieved successfully',
      HTTP_STATUS.OK,
      {
        pagination: {
          page: list.page,
          limit: list.limit,
          total: list.total,
          totalPages,
        },
      }
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
