// next-app/app/api/hr/employees/dept-stats/route.js
import { connectDB } from '../../../../../lib/db';
import Employee from '../../../../../models/Employee';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { requireHR } from '../../../../../lib/auth/requireAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/employees/dept-stats
 * Returns accurate department counts for ALL employees (not paginated).
 * Used by HR Employees overview "Employees by Department" section.
 */
export async function GET(req) {
  try {
    await requireHR();
    await connectDB();

    const departmentCounts = await Employee.aggregate(
      [
        { $group: { _id: { $ifNull: ['$department', 'Unassigned'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ],
      { maxTimeMS: 3000 }
    );

    const total = departmentCounts.reduce((sum, d) => sum + d.count, 0);

    return successResponse(
      { departmentCounts, total },
      'Department stats retrieved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
