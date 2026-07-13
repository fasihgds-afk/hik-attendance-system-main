// app/api/hr/assets/route.js — list + create IT assets
import { connectDB } from '../../../../lib/db';
import Asset, {
  ASSET_TYPES,
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  COMPUTE_ASSET_TYPES,
} from '../../../../models/Asset';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requirePermission } from '../../../../lib/auth/requireAuth';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeType(value) {
  const t = String(value || '').trim().toLowerCase();
  return ASSET_TYPES.includes(t) ? t : null;
}

function normalizeStatus(value) {
  const s = String(value || '').trim().toLowerCase();
  return ASSET_STATUSES.includes(s) ? s : null;
}

function normalizeCondition(value) {
  const c = String(value || '').trim().toLowerCase();
  return ASSET_CONDITIONS.includes(c) ? c : 'good';
}

// GET /api/hr/assets?status=&type=&q=&empCode=&page=&limit=
export async function GET(req) {
  try {
    await requirePermission('assets', 'view');
    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const filter = {};
    const status = normalizeStatus(searchParams.get('status'));
    const type = normalizeType(searchParams.get('type'));
    const empCode = String(searchParams.get('empCode') || '').trim();
    const q = String(searchParams.get('q') || '').trim();

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (empCode) filter.assignedToEmpCode = empCode;
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { assetTag: re },
        { processor: re },
        { ram: re },
        { rom: re },
        { notes: re },
        { assignedToName: re },
        { assignedToEmpCode: re },
      ];
    }

    const [total, assets, statusAgg, typeStatusAgg] = await Promise.all([
      Asset.countDocuments(filter).maxTimeMS(2500),
      Asset.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .maxTimeMS(2500),
      Asset.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).option({ maxTimeMS: 2500 }),
      Asset.aggregate([
        {
          $group: {
            _id: { type: '$type', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]).option({ maxTimeMS: 2500 }),
    ]);

    const stats = { in_stock: 0, assigned: 0, repair: 0, retired: 0, total: 0 };
    for (const row of statusAgg) {
      if (row._id && stats[row._id] !== undefined) {
        stats[row._id] = row.count;
        stats.total += row.count;
      }
    }

    const byType = {};
    for (const t of ASSET_TYPES) {
      byType[t] = { in_stock: 0, assigned: 0, repair: 0, retired: 0, total: 0 };
    }
    for (const row of typeStatusAgg) {
      const type = row?._id?.type;
      const status = row?._id?.status;
      if (!type || !byType[type]) continue;
      if (status && byType[type][status] !== undefined) {
        byType[type][status] = row.count;
      }
      byType[type].total += row.count;
    }

    return successResponse(
      { assets, stats, byType },
      'Assets retrieved',
      HTTP_STATUS.OK,
      {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: skip + assets.length < total,
        hasPrev: page > 1,
      }
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err);
  }
}

// POST /api/hr/assets — create asset
export async function POST(req) {
  try {
    await requirePermission('assets', 'create');
    await connectDB();

    const body = await req.json();
    const assetTag = String(body.assetTag || '').trim();
    if (!assetTag) throw new ValidationError('assetTag is required');

    const type = normalizeType(body.type);
    if (!type) throw new ValidationError(`type must be one of: ${ASSET_TYPES.join(', ')}`);

    const existing = await Asset.findOne({ assetTag }).lean().maxTimeMS(1500);
    if (existing) throw new ValidationError(`Asset tag "${assetTag}" already exists`);

    const isCompute = COMPUTE_ASSET_TYPES.includes(type);
    const processor = isCompute ? String(body.processor || '').trim() : '';
    const ram = isCompute ? String(body.ram || '').trim() : '';
    const rom = isCompute ? String(body.rom || '').trim() : '';

    if (isCompute && !processor && !ram && !rom) {
      throw new ValidationError('For laptop/desktop, enter at least Processor, RAM, or ROM');
    }

    const doc = await Asset.create({
      assetTag,
      type,
      processor,
      ram,
      rom,
      status: 'in_stock',
      condition: normalizeCondition(body.condition),
      notes: String(body.notes || '').trim(),
      assignedToEmpCode: null,
      assignedToName: '',
      assignedAt: null,
      assignedBy: '',
    });

    return successResponse({ asset: doc.toObject() }, 'Asset created', HTTP_STATUS.CREATED);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    if (err?.code === 11000) {
      return errorResponse('Asset tag already exists', 400);
    }
    return errorResponseFromException(err, req);
  }
}
