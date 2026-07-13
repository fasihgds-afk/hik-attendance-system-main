// app/api/hr/assets/[id]/assign/route.js — assign asset to employee
import { connectDB } from '../../../../../../lib/db';
import Asset from '../../../../../../models/Asset';
import AssetAssignmentHistory from '../../../../../../models/AssetAssignmentHistory';
import Employee from '../../../../../../models/Employee';
import { mergeActiveFilter } from '../../../../../../lib/employees/activeFilter';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../../lib/api/response';
import { requirePermission } from '../../../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../../../lib/errors/errorHandler';
import mongoose from 'mongoose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  try {
    const { user } = await requirePermission('assets', 'update');
    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError('Invalid asset id');
    }

    const body = await req.json();
    const empCode = String(body.empCode || '').trim();
    if (!empCode) throw new ValidationError('empCode is required');

    const asset = await Asset.findById(id).maxTimeMS(1500);
    if (!asset) throw new NotFoundError('Asset');

    if (asset.status === 'retired') {
      throw new ValidationError('Cannot assign a retired asset');
    }
    if (asset.status === 'assigned' && asset.assignedToEmpCode) {
      throw new ValidationError(
        `Asset is already assigned to ${asset.assignedToName || asset.assignedToEmpCode}. Return it first.`
      );
    }

    const employee = await Employee.findOne(mergeActiveFilter({ empCode }))
      .select('empCode name')
      .lean()
      .maxTimeMS(1500);
    if (!employee) throw new NotFoundError(`Employee ${empCode}`);

    const fromEmpCode = asset.assignedToEmpCode || null;
    const notes = String(body.notes || '').trim();
    const performedBy = user.email || user.id || '';

    asset.status = 'assigned';
    asset.assignedToEmpCode = employee.empCode;
    asset.assignedToName = employee.name || '';
    asset.assignedAt = new Date();
    asset.assignedBy = performedBy;
    if (notes) asset.notes = notes;
    await asset.save();

    await AssetAssignmentHistory.create({
      assetId: asset._id,
      assetTag: asset.assetTag,
      action: fromEmpCode ? 'transfer' : 'assign',
      empCode: employee.empCode,
      employeeName: employee.name || '',
      fromEmpCode,
      notes,
      performedBy,
    });

    return successResponse({ asset: asset.toObject() }, 'Asset assigned', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
