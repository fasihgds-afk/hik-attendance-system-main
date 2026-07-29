// app/api/hr/assets/[id]/assign/route.js — assign asset + optional accessories sheet fields
import { connectDB } from '../../../../../../lib/db';
import Asset, { formatAssetLabel } from '../../../../../../models/Asset';
import AssetAssignmentHistory from '../../../../../../models/AssetAssignmentHistory';
import Employee from '../../../../../../models/Employee';
import EmployeeItEquipment from '../../../../../../models/EmployeeItEquipment';
import { mergeActiveFilter } from '../../../../../../lib/employees/activeFilter';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../../lib/api/response';
import { requirePermission } from '../../../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../../../lib/errors/errorHandler';
import mongoose from 'mongoose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bool(value, fallback = false) {
  if (value === true || value === 'true' || value === 'TRUE' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 'FALSE' || value === 0 || value === '0') return false;
  return fallback;
}

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
      .select('empCode name department')
      .lean()
      .maxTimeMS(1500);
    if (!employee) throw new NotFoundError(`Employee ${empCode}`);

    const notes = String(body.notes || '').trim();
    const performedBy = user.email || user.id || '';
    const fromEmpCode = asset.assignedToEmpCode || null;

    const headphone = bool(body.headphone);
    const mouse = bool(body.mouse);
    const keyboard = bool(body.keyboard);
    const monitor = bool(body.monitor);
    const charger = bool(body.charger);
    const takeHomeAllowed = bool(body.takeHomeAllowed);
    const extraEquipment = String(body.extraEquipment || '').trim();
    const ip = String(body.ip || '').trim();
    const workLocation = String(body.workLocation || 'Work From Office').trim() || 'Work From Office';
    const laptopPermission = takeHomeAllowed ? 'Take home allowed' : '';
    const devicePassword = String(body.devicePassword || '').trim();

    asset.status = 'assigned';
    asset.assignedToEmpCode = employee.empCode;
    asset.assignedToName = employee.name || '';
    asset.assignedAt = new Date();
    asset.assignedBy = performedBy;
    if (notes) asset.notes = notes;
    await asset.save();

    const accessoryNote = [
      mouse ? 'mouse' : null,
      keyboard ? 'keyboard' : null,
      headphone ? 'headphone' : null,
      monitor ? 'monitor' : null,
      charger ? 'charger' : null,
      takeHomeAllowed ? 'take-home' : null,
      extraEquipment || null,
    ]
      .filter(Boolean)
      .join(', ');

    await AssetAssignmentHistory.create({
      assetId: asset._id,
      assetTag: asset.assetTag,
      action: fromEmpCode ? 'transfer' : 'assign',
      empCode: employee.empCode,
      employeeName: employee.name || '',
      fromEmpCode,
      notes: [notes, accessoryNote].filter(Boolean).join(' | '),
      performedBy,
    });

    // Upsert sheet row for this employee (laptop + extras)
    const laptopLabel = String(body.laptop || '').trim() || formatAssetLabel(asset);

    const equipment = await EmployeeItEquipment.findOneAndUpdate(
      { empCode: employee.empCode },
      {
        $set: {
          empCode: employee.empCode,
          employeeName: employee.name || '',
          department: employee.department || '',
          laptop: laptopLabel,
          laptopAssetId: asset._id,
          devicePassword,
          ip,
          workLocation,
          headphone,
          mouse,
          keyboard,
          monitor,
          charger,
          takeHomeAllowed,
          extraEquipment,
          laptopPermission,
          notes,
          updatedBy: performedBy,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    return successResponse(
      { asset: asset.toObject(), equipment },
      'Asset assigned with accessories',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
