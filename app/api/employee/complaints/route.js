// app/api/employee/complaints/route.js
// List (GET) and create (POST) complaints for the logged-in employee
import { connectDB } from '../../../../lib/db';
import Complaint from '../../../../models/Complaint';
import Employee from '../../../../models/Employee';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requireEmployee } from '../../../../lib/auth/requireAuth';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/employee/complaints?empCode=XXX – list my complaints (newest first)
export async function GET(req) {
  try {
    const { user } = await requireEmployee();
    await connectDB();
    const { searchParams } = new URL(req.url);
    const empCode = (searchParams.get('empCode') || user.empCode || '').trim();
    if (String(empCode) !== String(user.empCode || '')) return errorResponse('Unauthorized', 401);
    if (!empCode) throw new ValidationError('empCode is required');

    const list = await Complaint.find({ empCode })
      .sort({ createdAt: -1 })
      .lean()
      .maxTimeMS(2000);

    return successResponse({ complaints: list }, 'Complaints retrieved', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// POST /api/employee/complaints – submit new complaint (subject + description only; category default 'other')
export async function POST(req) {
  try {
    const { user } = await requireEmployee();
    await connectDB();
    const body = await req.json();
    const { subject, description } = body;
    const empCode = user.empCode; // Use session empCode only - employees can only submit for themselves

    if (!subject || !description) {
      throw new ValidationError('subject and description are required');
    }

    const emp = await Employee.findOne({ empCode }).select('empCode name department designation').lean().maxTimeMS(2000);
    if (!emp) throw new ValidationError('Employee not found');

    const doc = await Complaint.create({
      empCode: emp.empCode,
      employeeName: emp.name || '',
      department: emp.department || '',
      designation: emp.designation || '',
      category: 'other',
      subject: (subject || '').trim(),
      description: (description || '').trim(),
      status: 'open',
    });

    const complaint = doc.toObject ? doc.toObject() : doc;
    return successResponse({ complaint }, 'Complaint submitted successfully', HTTP_STATUS.CREATED);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_EMPLOYEE') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
