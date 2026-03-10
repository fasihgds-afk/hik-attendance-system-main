/**
 * HR Break Log API — CRUD for break records (no device verification)
 * Used by HR monitoring page to add, edit, delete breaks.
 */

import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';
import Employee from '../../../../models/Employee';
import Shift from '../../../../models/Shift';
import BreakLog from '../../../../models/BreakLog';
import { resolveShiftWindow, clipIntervalToShiftWindow } from '../../../../lib/shift/resolveShiftWindow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HR_DEVICE_ID = 'hr-manual';
const allowedByCategory = { Official: 9999, General: 60, Namaz: 25 };

function normalizeCategory(val) {
  const s = String(val || '').trim();
  if (/^official$/i.test(s)) return 'Official';
  if (/^general$/i.test(s)) return 'General';
  if (/^namaz$/i.test(s)) return 'Namaz';
  return s || 'General';
}

/** POST — Create break (HR adds manual break) */
export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { empCode, category, reason, breakStartTime, breakEndTime } = body;

    if (!empCode || !category || !reason?.trim()) {
      throw new ValidationError('empCode, category, and reason are required');
    }

    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';
    const date = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);

    const emp = await Employee.findOne({ empCode }).select('shift shiftId').lean().maxTimeMS(2000);
    if (!emp) throw new ValidationError(`Employee ${empCode} not found`);

    let shiftObj = null;
    if (emp.shiftId) {
      shiftObj = await Shift.findById(emp.shiftId).lean().maxTimeMS(2000);
    }
    if (!shiftObj && emp.shift) {
      shiftObj = await Shift.findOne({ code: String(emp.shift).toUpperCase() }).lean().maxTimeMS(2000);
    }
    if (!shiftObj) throw new ValidationError(`No shift for employee ${empCode}`);

    const shiftCode = shiftObj.code || emp.shift || '';

    const window = resolveShiftWindow({ date, shift: shiftObj, timezoneOffset: TZ });
    if (!window) throw new ValidationError('Could not resolve shift window');

    const startTimeStr = breakStartTime || '12:00';
    const breakStartAt = new Date(`${date}T${startTimeStr.length === 5 ? startTimeStr + ':00' : startTimeStr}${TZ}`);
    const endTimeStr = breakEndTime?.length === 5 ? `${breakEndTime}:00` : breakEndTime;
    const breakEndAt = breakEndTime
      ? new Date(`${date}T${endTimeStr}${TZ}`)
      : new Date(breakStartAt.getTime() + 15 * 60 * 1000); // default 15 min

    if (breakEndAt.getTime() <= breakStartAt.getTime()) {
      throw new ValidationError('Break end must be after start');
    }

    const clipped = clipIntervalToShiftWindow(breakStartAt, breakEndAt, window);
    const durationMin = clipped.durationMin;
    const cat = normalizeCategory(category);
    const allowedMin = allowedByCategory[cat] ?? 60;
    const exceededDurationMin = Math.max(0, durationMin - allowedMin);

    const created = await BreakLog.create({
      empCode,
      deviceId: HR_DEVICE_ID,
      category: cat,
      reason: String(reason).trim(),
      status: 'CLOSED',
      breakStartAt,
      breakEndAt,
      shiftDate: date,
      shiftCode,
      shiftStartAt: window.shiftStart,
      shiftEndAt: window.shiftEnd,
      durationMin,
      allowedDurationMin: allowedMin,
      exceededDurationMin,
    });

    return successResponse(
      { breakId: String(created._id) },
      'Break added',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

/** PATCH — Update break (category, reason, duration) */
export async function PATCH(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { breakId, empCode, category, reason, durationMin } = body;

    if (!breakId || !empCode) {
      throw new ValidationError('breakId and empCode are required');
    }

    const doc = await BreakLog.findOne({ _id: breakId, empCode }).maxTimeMS(2000);
    if (!doc) throw new ValidationError('Break not found');

    if (category) doc.category = normalizeCategory(category);
    if (reason !== undefined) doc.reason = String(reason).trim();
    if (durationMin != null) {
      const d = Number(durationMin);
      if (d < 0) throw new ValidationError('Duration cannot be negative');
      doc.durationMin = Math.round(d);
      const allowed = allowedByCategory[doc.category] ?? 60;
      doc.allowedDurationMin = allowed;
      doc.exceededDurationMin = Math.max(0, doc.durationMin - allowed);
      doc.breakEndAt = new Date(doc.breakStartAt.getTime() + doc.durationMin * 60 * 1000);
    }

    await doc.save();

    return successResponse(
      { breakId: String(doc._id) },
      'Break updated',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

/** DELETE — Remove break record */
export async function DELETE(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const breakId = searchParams.get('breakId');
    const empCode = searchParams.get('empCode');

    if (!breakId || !empCode) {
      throw new ValidationError('breakId and empCode are required');
    }

    const result = await BreakLog.deleteOne({ _id: breakId, empCode }).maxTimeMS(2000);
    if (result.deletedCount === 0) throw new ValidationError('Break not found');

    return successResponse(null, 'Break deleted', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
