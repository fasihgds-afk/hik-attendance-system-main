// app/api/hr/complaints/[id]/route.js
// Get one complaint (HR sees all including internalNote), PATCH to respond/update status
import { connectDB } from '../../../../../lib/db';
import Complaint from '../../../../../models/Complaint';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { ValidationError, NotFoundError } from '../../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// GET /api/hr/complaints/[id]
export async function GET(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    if (!id) throw new ValidationError('Complaint ID is required');

    const doc = await Complaint.findById(id).lean().maxTimeMS(2000);
    if (!doc) throw new NotFoundError('Complaint not found');

    return successResponse({ complaint: doc }, 'Complaint retrieved', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// PATCH /api/hr/complaints/[id] – update status, hrResponse, internalNote
export async function PATCH(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    if (!id) throw new ValidationError('Complaint ID is required');

    const body = await req.json();
    const { status, hrResponse, internalNote } = body;

    const update = {};
    if (status && VALID_STATUSES.includes(status)) update.status = status;
    if (hrResponse !== undefined) update.hrResponse = String(hrResponse || '').trim();
    if (internalNote !== undefined) update.internalNote = String(internalNote || '').trim();
    if (update.status || update.hrResponse !== undefined) {
      update.hrRespondedAt = new Date();
      update.hrRespondedBy = body.hrRespondedBy || 'HR';
    }

    const doc = await Complaint.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .lean()
      .maxTimeMS(2000);

    if (!doc) throw new NotFoundError('Complaint not found');

    return successResponse({ complaint: doc }, 'Complaint updated', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
