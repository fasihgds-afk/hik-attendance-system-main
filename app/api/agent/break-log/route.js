import { z } from 'zod';
import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import {
  normalizeBreakCategory,
  requiredString,
  verifyDevice
} from '../../../../lib/agent/common';
import Employee from '../../../../models/Employee';
import Shift from '../../../../models/Shift';
import BreakLog from '../../../../models/BreakLog';
import { resolveShiftWindow, clipIntervalToShiftWindow } from '../../../../lib/shift/resolveShiftWindow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedByCategory = {
  Official: 60,
  General: 30,
  Namaz: 30
};

const openSchema = z.object({
  empCode: z.string().min(1),
  deviceId: z.string().min(1),
  category: z.string().min(1),
  reason: z.string().optional().default(''),
  atIso: z.string().datetime().optional()
});

const patchSchema = z.object({
  empCode: z.string().min(1),
  deviceId: z.string().min(1),
  breakId: z.string().min(1),
  action: z.enum(['update-reason', 'end-break']),
  category: z.string().optional(),
  reason: z.string().optional(),
  atIso: z.string().datetime().optional()
});

async function resolveEmployeeShift(empCode) {
  const employee = await Employee.findOne({ empCode }).select('shift shiftId').lean().maxTimeMS(2000);
  if (!employee) throw new Error(`Employee not found: ${empCode}`);

  if (employee.shiftId) {
    const byId = await Shift.findById(employee.shiftId).lean().maxTimeMS(2000);
    if (byId) return byId;
  }
  if (employee.shift) {
    const byCode = await Shift.findOne({ code: String(employee.shift).toUpperCase() }).lean().maxTimeMS(2000);
    if (byCode) return byCode;
  }
  throw new Error(`No active shift for employee ${empCode}`);
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export async function POST(req) {
  try {
    const body = openSchema.parse(await req.json());
    const empCode = requiredString(body.empCode, 'empCode');
    const deviceId = requiredString(body.deviceId, 'deviceId');
    const category = normalizeBreakCategory(body.category);
    if (!category) throw new Error('Invalid break category');

    await connectDB();
    await verifyDevice(req, empCode, deviceId);

    const breakStartAt = body.atIso ? new Date(body.atIso) : new Date();
    const shift = await resolveEmployeeShift(empCode);
    const shiftDate = toDateStr(breakStartAt);
    const window = resolveShiftWindow({
      date: shiftDate,
      shift,
      timezoneOffset: process.env.TIMEZONE_OFFSET || '+05:00'
    });
    if (!window) throw new Error('Unable to resolve shift window');
    if (breakStartAt.getTime() < window.shiftStart.getTime()) {
      throw new Error('Break cannot start before shift start');
    }

    const created = await BreakLog.create({
      empCode,
      deviceId,
      category,
      reason: String(body.reason || '').trim(),
      status: 'OPEN',
      breakStartAt,
      shiftDate,
      shiftCode: shift.code,
      shiftStartAt: window.shiftStart,
      shiftEndAt: window.shiftEnd,
      allowedDurationMin: allowedByCategory[category] || 0
    });

    return successResponse(
      { breakId: String(created._id), status: created.status },
      'Break opened',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

export async function PATCH(req) {
  try {
    const body = patchSchema.parse(await req.json());
    const empCode = requiredString(body.empCode, 'empCode');
    const deviceId = requiredString(body.deviceId, 'deviceId');
    await connectDB();
    await verifyDevice(req, empCode, deviceId);

    const doc = await BreakLog.findOne({
      _id: body.breakId,
      empCode,
      deviceId
    }).maxTimeMS(2000);
    if (!doc) throw new Error('Break log not found');

    if (body.action === 'update-reason') {
      const category = body.category ? normalizeBreakCategory(body.category) : normalizeBreakCategory(doc.category);
      const reason = String(body.reason || '').trim();
      if (!category) throw new Error('Invalid break category');
      if (!reason) throw new Error('Reason is required');

      doc.category = category;
      doc.reason = reason;
      doc.allowedDurationMin = allowedByCategory[category] || doc.allowedDurationMin || 0;
      await doc.save();

      return successResponse(
        { breakId: String(doc._id), category: doc.category, reason: doc.reason },
        'Break reason updated',
        HTTP_STATUS.OK
      );
    }

    // action=end-break
    const reason = String(body.reason ?? doc.reason ?? '').trim();
    const category = normalizeBreakCategory(body.category || doc.category);
    if (!reason || !category) {
      throw new Error('Category and reason are required before ending break');
    }

    const breakEndAt = body.atIso ? new Date(body.atIso) : new Date();
    const window = {
      shiftStart: doc.shiftStartAt,
      shiftEnd: doc.shiftEndAt
    };
    const clipped = clipIntervalToShiftWindow(doc.breakStartAt, breakEndAt, window);

    doc.category = category;
    doc.reason = reason;
    doc.breakEndAt = breakEndAt;
    doc.status = 'CLOSED';
    doc.durationMin = clipped.durationMin;
    doc.exceededDurationMin = Math.max(0, doc.durationMin - (doc.allowedDurationMin || 0));
    await doc.save();

    return successResponse(
      {
        breakId: String(doc._id),
        durationMin: doc.durationMin,
        allowedDurationMin: doc.allowedDurationMin,
        exceededDurationMin: doc.exceededDurationMin
      },
      'Break ended',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
