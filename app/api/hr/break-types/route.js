// GET / POST /api/hr/break-types
import { connectDB } from '../../../../lib/db';
import BreakType from '../../../../models/BreakType';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requirePermission } from '../../../../lib/auth/requireAuth';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePermission('breakMonitoring', 'view');
    await connectDB();
    const list = await BreakType.find({}).sort({ Name: 1 }).lean().maxTimeMS(3000);
    return successResponse(
      {
        breakTypes: list.map((t) => ({ id: String(t._id), name: t.Name || '' })),
      },
      'Break types retrieved',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err);
  }
}

export async function POST(req) {
  try {
    await requirePermission('breakMonitoring', 'create');
    await connectDB();
    const body = await req.json();
    const name = String(body.name || body.Name || '').trim();
    if (!name) throw new ValidationError('name is required');

    const existing = await BreakType.findOne({ Name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
    if (existing) throw new ValidationError('Break type with this name already exists');

    const doc = await BreakType.create({ Name: name });
    return successResponse(
      { breakType: { id: String(doc._id), name: doc.Name } },
      'Break type created',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err);
  }
}
