// app/api/employee/complaints/[id]/route.js
// Get one complaint (employee can only view own)
import { connectDB } from '../../../../../lib/db';
import Complaint from '../../../../../models/Complaint';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { requireEmployee } from '../../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/employee/complaints/[id]?empCode=XXX
export async function GET(req, { params }) {
  try {
    const { user } = await requireEmployee();
    await connectDB();
    const { id } = await params;
    const empCode = user.empCode; // Employees can only view their own complaints
    if (!id) throw new ValidationError('Complaint ID is required');

    const doc = await Complaint.findOne({ _id: id, empCode }).lean().maxTimeMS(2000);
    if (!doc) throw new NotFoundError('Complaint not found');

    return successResponse({ complaint: doc }, 'Complaint retrieved', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_EMPLOYEE') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
