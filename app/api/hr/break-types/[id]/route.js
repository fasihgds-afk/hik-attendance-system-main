// PATCH / DELETE /api/hr/break-types/[id]
import { connectDB } from '../../../../../lib/db';
import BreakType from '../../../../../models/BreakType';
import UserBreak from '../../../../../models/UserBreak';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { requirePermission } from '../../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../../lib/errors/errorHandler';
import { isValidObjectId } from '../../../../../lib/breaks/crudHelpers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  try {
    await requirePermission('breakMonitoring', 'update');
    await connectDB();

    const { id } = await params;
    if (!isValidObjectId(id)) throw new ValidationError('Invalid break type id');

    const body = await req.json();
    const name = String(body.name || body.Name || '').trim();
    if (!name) throw new ValidationError('name is required');

    const dup = await BreakType.findOne({
      _id: { $ne: id },
      Name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    }).lean();
    if (dup) throw new ValidationError('Break type with this name already exists');

    const doc = await BreakType.findByIdAndUpdate(id, { Name: name }, { new: true }).lean();
    if (!doc) throw new NotFoundError('Break type not found');

    return successResponse(
      { breakType: { id: String(doc._id), name: doc.Name } },
      'Break type updated',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err);
  }
}

export async function DELETE(_req, { params }) {
  try {
    await requirePermission('breakMonitoring', 'delete');
    await connectDB();

    const { id } = await params;
    if (!isValidObjectId(id)) throw new ValidationError('Invalid break type id');

    const inUse = await UserBreak.countDocuments({ BreakTypeId: id }).maxTimeMS(3000);
    if (inUse > 0) {
      throw new ValidationError(`Cannot delete: ${inUse} break session(s) still use this type`);
    }

    const doc = await BreakType.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundError('Break type not found');

    return successResponse({ id: String(doc._id) }, 'Break type deleted', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err);
  }
}
