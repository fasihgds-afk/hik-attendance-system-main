// app/api/hr/assets/[id]/return/route.js — return asset to stock (or mark repair)
import { connectDB } from '../../../../../../lib/db';
import Asset, { ASSET_STATUSES } from '../../../../../../models/Asset';
import AssetAssignmentHistory from '../../../../../../models/AssetAssignmentHistory';
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

    const body = await req.json().catch(() => ({}));
    const asset = await Asset.findById(id).maxTimeMS(1500);
    if (!asset) throw new NotFoundError('Asset');

    if (!asset.assignedToEmpCode && asset.status !== 'assigned') {
      throw new ValidationError('Asset is not currently assigned');
    }

    const returnStatus = String(body.status || 'in_stock').trim().toLowerCase();
    if (!['in_stock', 'repair', 'retired'].includes(returnStatus)) {
      throw new ValidationError('status must be in_stock, repair, or retired');
    }
    if (!ASSET_STATUSES.includes(returnStatus)) {
      throw new ValidationError('Invalid status');
    }

    const notes = String(body.notes || '').trim();
    const performedBy = user.email || user.id || '';
    const prevEmp = asset.assignedToEmpCode;
    const prevName = asset.assignedToName;

    asset.status = returnStatus;
    asset.assignedToEmpCode = null;
    asset.assignedToName = '';
    asset.assignedAt = null;
    asset.assignedBy = '';
    if (notes) asset.notes = notes;
    await asset.save();

    await AssetAssignmentHistory.create({
      assetId: asset._id,
      assetTag: asset.assetTag,
      action: returnStatus === 'repair' ? 'repair' : returnStatus === 'retired' ? 'retire' : 'return',
      empCode: prevEmp,
      employeeName: prevName || '',
      notes,
      performedBy,
    });

    return successResponse({ asset: asset.toObject() }, 'Asset returned', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
