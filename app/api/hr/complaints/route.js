// app/api/hr/complaints/route.js
// List all complaints with optional filters (status, category, search) + pagination
import { connectDB } from '../../../../lib/db';
import Complaint from '../../../../models/Complaint';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requirePermission } from '../../../../lib/auth/requireAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_CATEGORIES = ['salary_increment', 'leave', 'attendance', 'work_environment', 'hr_policy', 'other'];
const EMP_CODE_ONLY_REGEX = /^\d+$/;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/hr/complaints?status=...&search=...&period=all|week|month&page=1&limit=50
export async function GET(req) {
  try {
    await requirePermission('complaints', 'view');
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || '').trim();
    const category = (searchParams.get('category') || '').trim();
    const search = (searchParams.get('search') || '').trim();
    const period = (searchParams.get('period') || 'all').toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const filter = {};
    if (status && VALID_STATUSES.includes(status)) filter.status = status;
    if (category && VALID_CATEGORIES.includes(category)) filter.category = category;
    if (search) {
      const safeSearch = escapeRegex(search);
      if (EMP_CODE_ONLY_REGEX.test(search)) {
        filter.empCode = search;
      } else {
        filter.$or = [
          { empCode: new RegExp(`^${safeSearch}`, 'i') },
          { employeeName: new RegExp(safeSearch, 'i') },
          { department: new RegExp(safeSearch, 'i') },
          { designation: new RegExp(safeSearch, 'i') },
          { subject: new RegExp(safeSearch, 'i') },
        ];
      }
    }

    if (period === 'week' || period === 'month') {
      const since = new Date();
      if (period === 'week') since.setDate(since.getDate() - 7);
      else if (period === 'month') since.setDate(since.getDate() - 30);
      filter.createdAt = { $gte: since };
    }

    // Summary counts ignore status filter so KPI cards stay stable when filtering by status
    const summaryFilter = { ...filter };
    delete summaryFilter.status;

    const [list, total, statusGroups] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(3000),
      Complaint.countDocuments(filter).maxTimeMS(2000),
      Complaint.aggregate([
        { $match: summaryFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).option({ maxTimeMS: 2000 }),
    ]);

    const summary = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
      total: 0,
    };
    for (const row of statusGroups) {
      if (row?._id && Object.prototype.hasOwnProperty.call(summary, row._id)) {
        summary[row._id] = row.count || 0;
      }
      summary.total += row.count || 0;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return successResponse(
      { complaints: list, summary },
      'Complaints retrieved',
      HTTP_STATUS.OK,
      {
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      }
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
