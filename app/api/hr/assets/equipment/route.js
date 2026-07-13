// app/api/hr/assets/equipment/route.js — employee IT sheet (laptop + accessories)
import { connectDB } from '../../../../../lib/db';
import EmployeeItEquipment from '../../../../../models/EmployeeItEquipment';
import Employee from '../../../../../models/Employee';
import Asset, { formatAssetLabel } from '../../../../../models/Asset';
import AssetAssignmentHistory from '../../../../../models/AssetAssignmentHistory';
import { mergeActiveFilter } from '../../../../../lib/employees/activeFilter';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { requirePermission } from '../../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bool(value, fallback = false) {
  if (value === true || value === 'true' || value === 'TRUE' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 'FALSE' || value === 0 || value === '0') return false;
  return fallback;
}

function sanitizeBody(body = {}) {
  return {
    devicePassword: String(body.devicePassword ?? '').trim(),
    laptop: String(body.laptop ?? '').trim(),
    ip: String(body.ip ?? '').trim(),
    workLocation: String(body.workLocation ?? 'Work From Office').trim() || 'Work From Office',
    headphone: bool(body.headphone),
    mouse: bool(body.mouse),
    keyboard: bool(body.keyboard),
    monitor: bool(body.monitor),
    extraEquipment: String(body.extraEquipment ?? '').trim(),
    laptopPermission: String(body.laptopPermission ?? '').trim(),
    notes: String(body.notes ?? '').trim(),
    laptopAssetId: body.laptopAssetId || null,
  };
}

/** GET — list all employee IT equipment rows (sheet view) */
export async function GET(req) {
  try {
    await requirePermission('assets', 'view');
    await connectDB();

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const filter = {};
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { empCode: re },
        { employeeName: re },
        { department: re },
        { laptop: re },
        { ip: re },
        { extraEquipment: re },
      ];
    }

    const rows = await EmployeeItEquipment.find(filter)
      .sort({ employeeName: 1, empCode: 1 })
      .lean()
      .maxTimeMS(3000);

    const stats = {
      total: rows.length,
      withLaptop: rows.filter((r) => !!r.laptop).length,
      withMouse: rows.filter((r) => r.mouse).length,
      withKeyboard: rows.filter((r) => r.keyboard).length,
      withHeadphone: rows.filter((r) => r.headphone).length,
      withMonitor: rows.filter((r) => r.monitor).length,
    };

    return successResponse({ rows, stats }, 'IT equipment list', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err);
  }
}

/**
 * POST — create / upsert equipment row for an employee.
 * Optionally assigns a laptop asset from inventory at the same time.
 */
export async function POST(req) {
  try {
    const { user } = await requirePermission('assets', 'create');
    await connectDB();

    const body = await req.json();
    const empCode = String(body.empCode || '').trim();
    if (!empCode) throw new ValidationError('empCode is required');

    const employee = await Employee.findOne(mergeActiveFilter({ empCode }))
      .select('empCode name department')
      .lean()
      .maxTimeMS(1500);
    if (!employee) throw new NotFoundError(`Employee ${empCode}`);

    const fields = sanitizeBody(body);
    const performedBy = user.email || user.id || '';

    let assetId = fields.laptopAssetId;
    if (!assetId) {
      throw new ValidationError('Pick a laptop / PC from inventory (manual entry is not allowed)');
    }

    {
      const asset = await Asset.findById(assetId).maxTimeMS(1500);
      if (!asset) throw new NotFoundError('Laptop asset');
      if (asset.status === 'retired') throw new ValidationError('Cannot assign a retired asset');
      if (asset.status === 'assigned' && asset.assignedToEmpCode && asset.assignedToEmpCode !== empCode) {
        throw new ValidationError(
          `Asset ${asset.assetTag} is already assigned to ${asset.assignedToName || asset.assignedToEmpCode}`
        );
      }

      fields.laptop = formatAssetLabel(asset);

      asset.status = 'assigned';
      asset.assignedToEmpCode = employee.empCode;
      asset.assignedToName = employee.name || '';
      asset.assignedAt = new Date();
      asset.assignedBy = performedBy;
      await asset.save();

      await AssetAssignmentHistory.create({
        assetId: asset._id,
        assetTag: asset.assetTag,
        action: 'assign',
        empCode: employee.empCode,
        employeeName: employee.name || '',
        notes: [
          fields.mouse ? 'mouse' : null,
          fields.keyboard ? 'keyboard' : null,
          fields.headphone ? 'headphone' : null,
          fields.monitor ? 'monitor' : null,
          fields.extraEquipment || null,
        ]
          .filter(Boolean)
          .join(', '),
        performedBy,
      });

      assetId = asset._id;
    }

    const row = await EmployeeItEquipment.findOneAndUpdate(
      { empCode: employee.empCode },
      {
        $set: {
          empCode: employee.empCode,
          employeeName: employee.name || '',
          department: employee.department || '',
          ...fields,
          laptopAssetId: assetId,
          updatedBy: performedBy,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    return successResponse({ row }, 'Equipment saved', HTTP_STATUS.CREATED);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}

/** PATCH — update one employee equipment row */
export async function PATCH(req) {
  try {
    const { user } = await requirePermission('assets', 'update');
    await connectDB();

    const body = await req.json();
    const empCode = String(body.empCode || '').trim();
    if (!empCode) throw new ValidationError('empCode is required');

    const existing = await EmployeeItEquipment.findOne({ empCode }).lean().maxTimeMS(1500);
    if (!existing) throw new NotFoundError(`IT equipment for ${empCode}`);

    const fields = sanitizeBody({ ...existing, ...body });
    const performedBy = user.email || user.id || '';

    // Refresh name/dept from Employee if still active
    const employee = await Employee.findOne({ empCode })
      .select('empCode name department')
      .lean()
      .maxTimeMS(1500);

    const row = await EmployeeItEquipment.findOneAndUpdate(
      { empCode },
      {
        $set: {
          ...fields,
          employeeName: employee?.name || existing.employeeName,
          department: employee?.department || existing.department,
          updatedBy: performedBy,
        },
      },
      { new: true, runValidators: true }
    ).lean();

    return successResponse({ row }, 'Equipment updated', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}

/** DELETE — remove equipment row (does not delete inventory asset; clears assignment link) */
export async function DELETE(req) {
  try {
    await requirePermission('assets', 'delete');
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = String(searchParams.get('empCode') || '').trim();
    if (!empCode) throw new ValidationError('empCode is required');

    const existing = await EmployeeItEquipment.findOne({ empCode }).lean().maxTimeMS(1500);
    if (!existing) throw new NotFoundError(`IT equipment for ${empCode}`);

    if (existing.laptopAssetId) {
      const asset = await Asset.findById(existing.laptopAssetId).maxTimeMS(1500);
      if (asset && asset.assignedToEmpCode === empCode) {
        asset.status = 'in_stock';
        asset.assignedToEmpCode = null;
        asset.assignedToName = '';
        asset.assignedAt = null;
        asset.assignedBy = '';
        await asset.save();
      }
    }

    await EmployeeItEquipment.deleteOne({ empCode });
    return successResponse({ deleted: true, empCode }, 'Equipment row removed', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err);
  }
}
