// app/api/hr/assets/[id]/route.js — get / update / delete one asset
import { connectDB } from '../../../../../lib/db';
import Asset, { ASSET_TYPES, ASSET_STATUSES, ASSET_CONDITIONS } from '../../../../../models/Asset';
import AssetAssignmentHistory from '../../../../../models/AssetAssignmentHistory';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { requirePermission } from '../../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../../lib/errors/errorHandler';
import mongoose from 'mongoose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseOptionalDate(value) {
  if (value === null || value === '') return null;
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function loadAsset(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid asset id');
  }
  const asset = await Asset.findById(id).lean().maxTimeMS(1500);
  if (!asset) throw new NotFoundError('Asset');
  return asset;
}

// GET /api/hr/assets/:id — asset + recent history
export async function GET(_req, { params }) {
  try {
    await requirePermission('assets', 'view');
    await connectDB();
    const { id } = await params;
    const asset = await loadAsset(id);
    const history = await AssetAssignmentHistory.find({ assetId: asset._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .maxTimeMS(2000);
    return successResponse({ asset, history }, 'Asset retrieved', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err);
  }
}

// PATCH /api/hr/assets/:id — update inventory fields (not assign/return)
export async function PATCH(req, { params }) {
  try {
    const { user } = await requirePermission('assets', 'update');
    await connectDB();
    const { id } = await params;
    const existing = await loadAsset(id);
    const body = await req.json();

    const $set = {};

    if (body.assetTag !== undefined) {
      const assetTag = String(body.assetTag || '').trim();
      if (!assetTag) throw new ValidationError('assetTag cannot be empty');
      if (assetTag !== existing.assetTag) {
        const dup = await Asset.findOne({ assetTag }).lean().maxTimeMS(1500);
        if (dup) throw new ValidationError(`Asset tag "${assetTag}" already exists`);
      }
      $set.assetTag = assetTag;
    }

    if (body.type !== undefined) {
      const type = String(body.type || '').trim().toLowerCase();
      if (!ASSET_TYPES.includes(type)) {
        throw new ValidationError(`type must be one of: ${ASSET_TYPES.join(', ')}`);
      }
      $set.type = type;
    }

    if (body.brand !== undefined) $set.brand = String(body.brand || '').trim();
    if (body.model !== undefined) $set.model = String(body.model || '').trim();

    if (body.serialNumber !== undefined) {
      const serialNumber = String(body.serialNumber || '').trim();
      if (serialNumber && serialNumber !== existing.serialNumber) {
        const dup = await Asset.findOne({ serialNumber }).lean().maxTimeMS(1500);
        if (dup) throw new ValidationError(`Serial number "${serialNumber}" already exists`);
      }
      $set.serialNumber = serialNumber;
    }

    if (body.condition !== undefined) {
      const condition = String(body.condition || '').trim().toLowerCase();
      if (!ASSET_CONDITIONS.includes(condition)) {
        throw new ValidationError(`condition must be one of: ${ASSET_CONDITIONS.join(', ')}`);
      }
      $set.condition = condition;
    }

    if (body.notes !== undefined) $set.notes = String(body.notes || '').trim();

    if (body.purchaseDate !== undefined) {
      const d = parseOptionalDate(body.purchaseDate);
      if (body.purchaseDate && d === undefined) throw new ValidationError('Invalid purchaseDate');
      $set.purchaseDate = d === undefined ? existing.purchaseDate : d;
    }

    if (body.warrantyExpiry !== undefined) {
      const d = parseOptionalDate(body.warrantyExpiry);
      if (body.warrantyExpiry && d === undefined) throw new ValidationError('Invalid warrantyExpiry');
      $set.warrantyExpiry = d === undefined ? existing.warrantyExpiry : d;
    }

    // Status changes that don't go through assign/return (repair / retired / restock when free)
    if (body.status !== undefined) {
      const status = String(body.status || '').trim().toLowerCase();
      if (!ASSET_STATUSES.includes(status)) {
        throw new ValidationError(`status must be one of: ${ASSET_STATUSES.join(', ')}`);
      }
      if (status === 'assigned' && !existing.assignedToEmpCode) {
        throw new ValidationError('Use assign endpoint to mark an asset as assigned');
      }
      if ((status === 'in_stock' || status === 'retired' || status === 'repair') && existing.assignedToEmpCode) {
        throw new ValidationError('Return the asset from the employee before changing status');
      }
      $set.status = status;

      if (status !== existing.status) {
        let action = 'restock';
        if (status === 'repair') action = 'repair';
        if (status === 'retired') action = 'retire';
        await AssetAssignmentHistory.create({
          assetId: existing._id,
          assetTag: $set.assetTag || existing.assetTag,
          action,
          empCode: null,
          notes: String(body.statusNote || '').trim(),
          performedBy: user.email || user.id || '',
        });
      }
    }

    const asset = await Asset.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true })
      .lean()
      .maxTimeMS(2000);

    return successResponse({ asset }, 'Asset updated', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    if (err?.code === 11000) {
      return errorResponse('Asset tag or serial number already exists', 400);
    }
    return errorResponseFromException(err, req);
  }
}

// DELETE /api/hr/assets/:id — only allow when not assigned
export async function DELETE(_req, { params }) {
  try {
    await requirePermission('assets', 'delete');
    await connectDB();
    const { id } = await params;
    const existing = await loadAsset(id);

    if (existing.status === 'assigned' || existing.assignedToEmpCode) {
      throw new ValidationError('Return the asset before deleting it');
    }

    await Asset.findByIdAndDelete(id);
    await AssetAssignmentHistory.deleteMany({ assetId: existing._id });

    return successResponse({ deleted: true, id }, 'Asset deleted', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err);
  }
}
