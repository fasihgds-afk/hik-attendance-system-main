// app/api/hr/assets/employees-lookup/route.js
// Lightweight active-employee search for IT assign UI (assets permission only).
import { connectDB } from '../../../../../lib/db';
import Employee from '../../../../../models/Employee';
import { mergeActiveFilter } from '../../../../../lib/employees/activeFilter';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { requirePermission } from '../../../../../lib/auth/requireAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    await requirePermission('assets', 'view');
    await connectDB();

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const limit = Math.min(30, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    if (!q) {
      return successResponse({ employees: [] }, 'OK', HTTP_STATUS.OK);
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    const filter = mergeActiveFilter({
      $or: [{ empCode: re }, { name: re }, { email: re }, { department: re }],
    });

    const employees = await Employee.find(filter)
      .select('empCode name department designation')
      .sort({ name: 1 })
      .limit(limit)
      .lean()
      .maxTimeMS(2000);

    return successResponse({ employees }, 'Employees found', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err);
  }
}
