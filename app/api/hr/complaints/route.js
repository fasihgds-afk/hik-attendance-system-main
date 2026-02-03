// app/api/hr/complaints/route.js
// List all complaints with optional filters (status, category, search)
import { connectDB } from '../../../../lib/db';
import Complaint from '../../../../models/Complaint';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_CATEGORIES = ['salary_increment', 'leave', 'attendance', 'work_environment', 'hr_policy', 'other'];

// GET /api/hr/complaints?status=...&search=...&period=all|week|month
// period: all = all time, week = last 7 days, month = last 30 days. Results sorted latest first.
export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || '').trim();
    const category = (searchParams.get('category') || '').trim();
    const search = (searchParams.get('search') || '').trim();
    const period = (searchParams.get('period') || 'all').toLowerCase();

    const filter = {};
    if (status && VALID_STATUSES.includes(status)) filter.status = status;
    if (category && VALID_CATEGORIES.includes(category)) filter.category = category;
    if (search) {
      filter.$or = [
        { empCode: new RegExp(search, 'i') },
        { employeeName: new RegExp(search, 'i') },
        { department: new RegExp(search, 'i') },
        { designation: new RegExp(search, 'i') },
        { subject: new RegExp(search, 'i') },
      ];
    }

    if (period === 'week' || period === 'month') {
      const since = new Date();
      if (period === 'week') since.setDate(since.getDate() - 7);
      else if (period === 'month') since.setDate(since.getDate() - 30);
      filter.createdAt = { $gte: since };
    }

    const list = await Complaint.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(3000);

    return successResponse({ complaints: list }, 'Complaints retrieved', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
