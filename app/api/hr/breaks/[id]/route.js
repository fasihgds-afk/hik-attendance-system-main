// PATCH / DELETE /api/hr/breaks/[id]
import { connectDB } from '../../../../../lib/db';
import UserBreak from '../../../../../models/UserBreak';
import BreakType from '../../../../../models/BreakType';
import Employee from '../../../../../models/Employee';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { requirePermission } from '../../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../../lib/errors/errorHandler';
import {
  parsePakistanDateTime,
  computeTotalMinutes,
  normalizeStatus,
  serializeUserBreak,
  isValidObjectId,
} from '../../../../../lib/breaks/crudHelpers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  try {
    await requirePermission('breakMonitoring', 'update');
    await connectDB();

    const { id } = await params;
    if (!isValidObjectId(id)) throw new ValidationError('Invalid break id');

    const existing = await UserBreak.findById(id);
    if (!existing) throw new NotFoundError('Break not found');

    const body = await req.json();

    if (body.empCode != null || body.EmpCode != null) {
      const empCode = String(body.empCode || body.EmpCode || '').trim();
      if (!empCode) throw new ValidationError('empCode cannot be empty');
      const employee = await Employee.findOne({ empCode }).select('empCode').lean();
      if (!employee) throw new NotFoundError('Employee not found');
      existing.EmpCode = empCode;
    }

    if (body.breakTypeId != null || body.BreakTypeId != null) {
      const breakTypeId = String(body.breakTypeId || body.BreakTypeId || '').trim();
      if (!isValidObjectId(breakTypeId)) throw new ValidationError('Invalid breakTypeId');
      const breakType = await BreakType.findById(breakTypeId).lean();
      if (!breakType) throw new NotFoundError('Break type not found');
      existing.BreakTypeId = breakTypeId;
    }

    if (body.shiftId != null || body.ShiftId != null) {
      existing.ShiftId = String(body.shiftId || body.ShiftId || '').trim();
    }

    if (body.breakStartTime != null || body.BreakStartTime != null) {
      const start = parsePakistanDateTime(body.breakStartTime ?? body.BreakStartTime);
      if (!start) throw new ValidationError('Invalid breakStartTime');
      existing.BreakStartTime = start;
    }

    if (body.breakEndTime !== undefined || body.BreakEndTime !== undefined) {
      const endRaw = body.breakEndTime !== undefined ? body.breakEndTime : body.BreakEndTime;
      if (endRaw === null || endRaw === '') {
        existing.BreakEndTime = null;
        existing.TotalMinutes = null;
      } else {
        const end = parsePakistanDateTime(endRaw);
        if (!end) throw new ValidationError('Invalid breakEndTime');
        existing.BreakEndTime = end;
      }
    }

    if (body.comment != null || body.Comment != null) {
      existing.Comment = String(body.comment ?? body.Comment ?? '').trim();
    }

    if (body.status != null || body.Status != null) {
      existing.Status = normalizeStatus(body.status ?? body.Status, !!existing.BreakEndTime);
    } else {
      existing.Status = normalizeStatus(existing.Status, !!existing.BreakEndTime);
    }

    if (existing.BreakEndTime && existing.BreakStartTime) {
      if (existing.BreakEndTime.getTime() < existing.BreakStartTime.getTime()) {
        throw new ValidationError('breakEndTime must be after breakStartTime');
      }
      if (body.totalMinutes != null && body.totalMinutes !== '') {
        existing.TotalMinutes = Number(body.totalMinutes);
      } else {
        existing.TotalMinutes = computeTotalMinutes(existing.BreakStartTime, existing.BreakEndTime);
      }
    }

    await existing.save();

    return successResponse({ break: serializeUserBreak(existing) }, 'Break updated', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err);
  }
}

export async function DELETE(_req, { params }) {
  try {
    await requirePermission('breakMonitoring', 'delete');
    await connectDB();

    const { id } = await params;
    if (!isValidObjectId(id)) throw new ValidationError('Invalid break id');

    const existing = await UserBreak.findByIdAndDelete(id).lean();
    if (!existing) throw new NotFoundError('Break not found');

    return successResponse({ id: String(existing._id) }, 'Break deleted', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err);
  }
}
