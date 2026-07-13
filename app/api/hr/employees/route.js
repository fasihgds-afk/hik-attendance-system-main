// next-app/app/api/hr/employees/route.js
import { connectDB } from "../../../../lib/db";
import Employee from "../../../../models/Employee";
import { mergeActiveFilter } from "../../../../lib/employees/activeFilter";
import { buildEmployeeFilter } from "../../../../lib/db/queryOptimizer";
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from "../../../../lib/api/response";
import { requirePermission } from "../../../../lib/auth/requireAuth";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// OPTIMIZATION: Minimal field selection for list views
const EMPLOYEE_LIST_FIELDS = 'empCode name email monthlySalary salaryHistory shift shiftId department designation saturdayGroup';

export async function GET(req) {
  const startTime = Date.now();
  
  try {
    await requirePermission('employees', 'view');
    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const search = (searchParams.get('search') || '').trim();
    const department = (searchParams.get('department') || '').trim();
    const skip = (page - 1) * limit;

    const { filter, sortOptions, useTextScore } = buildEmployeeFilter({
      search,
      shift: '',
      department: department && department !== 'ALL' ? department : '',
    });

    const activeFilter = mergeActiveFilter(Object.keys(filter).length > 0 ? filter : {});

    const selectFields = useTextScore
      ? { empCode: 1, name: 1, email: 1, monthlySalary: 1, salaryHistory: 1, shift: 1, shiftId: 1, department: 1, designation: 1, saturdayGroup: 1, score: { $meta: 'textScore' } }
      : EMPLOYEE_LIST_FIELDS;

    // Prefer department+empCode sort for directory browsing; textScore when searching
    const sort = useTextScore
      ? sortOptions
      : (department ? { empCode: 1 } : { department: 1, empCode: 1 });

    const [total, employees] = await Promise.all([
      Employee.countDocuments(activeFilter).maxTimeMS(2500),
      Employee.find(activeFilter)
        .select(selectFields)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(2500),
    ]);

    const hasNext = skip + employees.length < total;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const responseData = { employees };
    const meta = {
      total,
      page,
      limit,
      totalPages,
      hasNext,
      hasPrev: page > 1,
    };

    const responseTime = Date.now() - startTime;
    if (responseTime > 1000) {
      console.warn(`[employees] Slow response: ${responseTime}ms`);
    }

    return successResponse(
      responseData,
      'Employees retrieved successfully',
      HTTP_STATUS.OK,
      meta
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    const responseTime = Date.now() - startTime;
    console.error(`[employees] Error after ${responseTime}ms:`, err.message);
    return errorResponseFromException(err, req);
  }
}
