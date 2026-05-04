// app/api/hr/shifts/[id]/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../../lib/db';
import { requireHR } from '../../../../../lib/auth/requireAuth';
import Shift, { mergeGraceFromBody, resolveShiftGracePeriods } from '../../../../../models/Shift';
import { DEFAULT_GRACE_PERIOD } from '../../../../../lib/shift/gracePeriods.js';
import { getCompanyTodayYmd } from '../../../../../lib/time/companyToday.js';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { NotFoundError, ValidationError } from '../../../../../lib/errors/errorHandler';

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/hr/shifts/[id] - Get a specific shift
export async function GET(req, { params }) {
  try {
    await requireHR();
    await connectDB();

    // Handle both Next.js 14 and 15 (params might be a promise in Next.js 15)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    // OPTIMIZATION: Select only required fields, add timeout
    const shift = await Shift.findById(id)
      .select(
        '_id name code startTime endTime crossesMidnight gracePeriod checkInGracePeriod checkOutGracePeriod graceEffectiveFrom priorCheckInGracePeriod priorCheckOutGracePeriod description isActive'
      )
      .lean()
      .maxTimeMS(2000);

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    return NextResponse.json({ shift });
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('GET /api/hr/shifts/[id] error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/hr/shifts/[id] - Update a shift
export async function PUT(req, { params }) {
  try {
    await requireHR();
    await connectDB();

    // Handle both Next.js 14 and 15 (params might be a promise in Next.js 15)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    // Updating shift

    if (!id) {
      return NextResponse.json(
        { error: 'Shift ID is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, code, startTime, endTime, crossesMidnight, description, isActive } = body;

    // Fetch the existing shift first so we only update fields that actually changed
    const existing = await Shift.findById(id).lean().maxTimeMS(2000);
    if (!existing) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    const update = {};
    if (name !== undefined && name !== existing.name) {
      // Check if another shift already uses this name
      const nameConflict = await Shift.findOne({ name, _id: { $ne: id } }).lean();
      if (nameConflict) {
        return NextResponse.json(
          { error: `Another shift already has the name "${name}"` },
          { status: 400 }
        );
      }
      update.name = name;
    }
    if (code !== undefined && code.toUpperCase() !== existing.code) {
      const upperCode = code.toUpperCase();
      const codeConflict = await Shift.findOne({ code: upperCode, _id: { $ne: id } }).lean();
      if (codeConflict) {
        return NextResponse.json(
          { error: `Another shift already has the code "${upperCode}"` },
          { status: 400 }
        );
      }
      update.code = upperCode;
    }
    if (startTime !== undefined && startTime !== existing.startTime) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime)) {
        return NextResponse.json(
          { error: 'startTime must be in HH:mm format' },
          { status: 400 }
        );
      }
      update.startTime = startTime;
    }
    if (endTime !== undefined && endTime !== existing.endTime) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(endTime)) {
        return NextResponse.json(
          { error: 'endTime must be in HH:mm format' },
          { status: 400 }
        );
      }
      update.endTime = endTime;
    }
    if (crossesMidnight !== undefined && crossesMidnight !== existing.crossesMidnight) update.crossesMidnight = crossesMidnight;

    const graceKeys = [
      'gracePeriod',
      'checkInGracePeriod',
      'checkOutGracePeriod',
      'graceEffectiveFrom',
      'priorCheckInGracePeriod',
      'priorCheckOutGracePeriod',
    ];
    const graceTouched = graceKeys.some((k) => body[k] !== undefined);
    let unsetLegacyGrace = false;
    if (graceTouched) {
      const merged = mergeGraceFromBody(body, existing);
      const before = resolveShiftGracePeriods(existing);
      const numbersChanged =
        merged.checkInGracePeriod !== before.checkIn ||
        merged.checkOutGracePeriod !== before.checkOut;

      const effFromBody =
        typeof body.graceEffectiveFrom === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(body.graceEffectiveFrom).trim())
          ? String(body.graceEffectiveFrom).trim()
          : null;

      if (effFromBody) {
        update.graceEffectiveFrom = effFromBody;
      }

      if (numbersChanged) {
        update.checkInGracePeriod = merged.checkInGracePeriod;
        update.checkOutGracePeriod = merged.checkOutGracePeriod;
        if (existing.gracePeriod != null) unsetLegacyGrace = true;
        if (!effFromBody) {
          update.graceEffectiveFrom = getCompanyTodayYmd();
        }
        update.priorCheckInGracePeriod = before.checkIn;
        update.priorCheckOutGracePeriod = before.checkOut;
      } else {
        if (
          body.priorCheckInGracePeriod !== undefined &&
          body.priorCheckOutGracePeriod !== undefined
        ) {
          const pi = Number(body.priorCheckInGracePeriod);
          const po = Number(body.priorCheckOutGracePeriod);
          if (Number.isFinite(pi) && pi >= 0 && Number.isFinite(po) && po >= 0) {
            update.priorCheckInGracePeriod = pi;
            update.priorCheckOutGracePeriod = po;
          }
        } else if (
          effFromBody &&
          (existing.priorCheckInGracePeriod == null || existing.priorCheckOutGracePeriod == null)
        ) {
          update.priorCheckInGracePeriod = DEFAULT_GRACE_PERIOD;
          update.priorCheckOutGracePeriod = DEFAULT_GRACE_PERIOD;
        }
      }
    }

    if (description !== undefined && description !== (existing.description || '')) update.description = description;
    if (isActive !== undefined && isActive !== existing.isActive) update.isActive = isActive;

    const mongoUpdate = {};
    if (Object.keys(update).length > 0) mongoUpdate.$set = update;
    if (unsetLegacyGrace) mongoUpdate.$unset = { gracePeriod: '' };

    // If nothing changed, return the existing shift as-is
    if (!mongoUpdate.$set && !mongoUpdate.$unset) {
      return NextResponse.json({ shift: existing });
    }

    const shift = await Shift.findByIdAndUpdate(
      id, 
      mongoUpdate, 
      { new: true, runValidators: true }
    )
      .select(
        '_id name code startTime endTime crossesMidnight gracePeriod checkInGracePeriod checkOutGracePeriod graceEffectiveFrom priorCheckInGracePeriod priorCheckOutGracePeriod description isActive'
      )
      .lean()
      .maxTimeMS(3000);

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    return NextResponse.json({ shift });
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('PUT /api/hr/shifts/[id] error:', err);
    if (err.name === 'CastError' || err.message?.includes('Cast to ObjectId')) {
      return NextResponse.json(
        { error: 'Invalid shift ID format' },
        { status: 400 }
      );
    }
    if (err.code === 11000 || String(err.code) === '11000' || err.message?.includes('E11000')) {
      const dupField = err.message?.includes('name_1') ? 'name' : 
                        err.message?.includes('code_1') ? 'code' : 'name or code';
      return NextResponse.json(
        { error: `Shift with this ${dupField} already exists` },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/hr/shifts/[id] - Delete a shift
// Query param: ?permanent=true for permanent deletion, otherwise soft delete (deactivate)
export async function DELETE(req, { params }) {
  try {
    await requireHR();
    await connectDB();

    // Handle both Next.js 14 and 15 (params might be a promise in Next.js 15)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    
    // Check if permanent deletion is requested
    const { searchParams } = new URL(req.url);
    const permanent = searchParams.get('permanent') === 'true';
    
    if (permanent) {
      // Permanent deletion - remove from database
      const shift = await Shift.findByIdAndDelete(id).lean();

      if (!shift) {
        throw new NotFoundError('Shift');
      }

      return successResponse(
        { shift },
        'Shift permanently deleted successfully',
        HTTP_STATUS.OK
      );
    } else {
      // Soft delete - set isActive to false
      const shift = await Shift.findByIdAndUpdate(
        id,
        { $set: { isActive: false } },
        { new: true }
      ).lean();

      if (!shift) {
        throw new NotFoundError('Shift');
      }

      return successResponse(
        { shift },
        'Shift deactivated successfully',
        HTTP_STATUS.OK
      );
    }
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return errorResponseFromException(err, req);
  }
}

