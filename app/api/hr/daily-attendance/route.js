// app/api/hr/daily-attendance/route.js
// Punch-based: first punch = check-in, last punch = check-out. Aggregation for efficiency.
// Preserves paid leave and manual attendance edits.

import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';
import AttendanceEvent from '../../../../models/AttendanceEvent';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import Shift from '../../../../models/Shift';

import { getNextDateStr, classifyByTime } from './attendance/time-utils.js';
import { getFirstAndLastPunchPerEmployee } from './attendance/punch-helpers.js';
import { ensureCheckInBeforeCheckOut } from './attendance/validation.js';
import { getShiftsForEmployeesOnDate } from '../../../../lib/shift/getShiftForDate.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Normalize empCode to string for Map keys (device may send number). */
function toEmpCodeKey(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

/**
 * Extract shift code from emp.shift / emp.shiftId (string, ObjectId, or formatted).
 */
function extractShiftCode(shiftValue, shiftById) {
  if (!shiftValue) return '';
  const stringValue = String(shiftValue).trim();
  if (!stringValue) return '';
  if (/^[0-9a-fA-F]{24}$/.test(stringValue)) {
    const shiftCode = shiftById.get(stringValue);
    return shiftCode || '';
  }
  const directMatch = stringValue.match(/^([A-Z]\d+)$/i);
  if (directMatch) return directMatch[1].toUpperCase();
  const formattedMatch = stringValue.match(/^([A-Z]\d+)/i);
  if (formattedMatch) return formattedMatch[1].toUpperCase();
  if (/^[A-Z]\d+$/.test(stringValue)) return stringValue;
  return stringValue.toUpperCase();
}

/** Statuses that are manual/leave and must not be overwritten by punch-derived Present/Absent. */
const MANUAL_OR_LEAVE_STATUSES = new Set([
  'Paid Leave',
  'Un Paid Leave',
  'Sick Leave',
  'Half Day',
  'Leave Without Inform',
  'Work From Home',
  'Holiday',
]);

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    if (!date) {
      throw new ValidationError('Missing "date" query parameter');
    }

    await connectDB();

    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';
    const nextDateStr = getNextDateStr(date);

    const allShifts = await Shift.find({ isActive: true })
      .select('_id name code startTime endTime crossesMidnight gracePeriod')
      .lean()
      .maxTimeMS(2000);

    if (allShifts.length === 0) {
      throw new ValidationError('No active shifts found. Please create shifts first.');
    }

    const startLocal = new Date(`${date}T09:00:00${TZ}`);
    const endLocal = new Date(`${nextDateStr}T08:00:00${TZ}`);

    const [allEmployees, existingRecords, punchMap] = await Promise.all([
      Employee.find()
        .select('empCode name shift shiftId department designation')
        .lean()
        .maxTimeMS(2000),
      ShiftAttendance.find({ date })
        .select('date empCode checkIn checkOut shift attendanceStatus reason leaveType')
        .lean()
        .maxTimeMS(2000),
      getFirstAndLastPunchPerEmployee(AttendanceEvent, startLocal, endLocal, 5000),
    ]);

    const shiftByCode = new Map();
    const shiftById = new Map();
    for (const shift of allShifts) {
      shiftByCode.set(shift.code, shift);
      if (shift._id) {
        shiftById.set(shift._id.toString(), shift.code);
        shiftById.set(String(shift._id), shift.code);
      }
    }

    const empCodesForDate = allEmployees.map((e) => toEmpCodeKey(e.empCode)).filter(Boolean);
    const shiftForDateMap = await getShiftsForEmployeesOnDate(empCodesForDate, date, {
      employees: allEmployees,
      shiftById,
    });

    const empInfoMap = new Map();
    for (const emp of allEmployees) {
      const empKey = toEmpCodeKey(emp.empCode);
      if (!empKey) continue;
      const employeeShift = shiftForDateMap.get(empKey) ?? '';
      empInfoMap.set(empKey, {
        name: emp.name || '',
        shift: employeeShift,
        department: emp.department || '',
        designation: emp.designation || '',
      });
    }

    const existingByEmpCode = new Map();
    for (const record of existingRecords) {
      const key = toEmpCodeKey(record.empCode);
      if (!key) continue;
      const existing = existingByEmpCode.get(key);
      if (!existing || (!existing.checkOut && record.checkOut)) {
        existingByEmpCode.set(key, record);
      }
    }

    const items = [];

    for (const emp of allEmployees) {
      const empKey = toEmpCodeKey(emp.empCode);
      const existingRecord = existingByEmpCode.get(empKey);
      const punches = punchMap.get(empKey);

      let checkIn = null;
      let checkOut = null;
      let totalPunches = 0;

      if (punches) {
        checkIn = punches.firstPunch || null;
        checkOut = punches.count > 1 ? punches.lastPunch : null;
        totalPunches = punches.count;
      }

      if (!checkIn && existingRecord?.checkIn) {
        checkIn = new Date(existingRecord.checkIn);
        if (totalPunches === 0) totalPunches = checkOut ? 2 : 1;
      }
      if (!checkOut && existingRecord?.checkOut && totalPunches >= 1) {
        const existingCheckOut = new Date(existingRecord.checkOut);
        if (!isNaN(existingCheckOut.getTime())) checkOut = ensureCheckInBeforeCheckOut(checkIn, existingCheckOut) || checkOut;
        if (checkOut && totalPunches === 1) totalPunches = 2;
      }

      checkOut = ensureCheckInBeforeCheckOut(checkIn, checkOut);

      const assignedShift = shiftForDateMap.get(empKey) || empInfoMap.get(empKey)?.shift || '';
      let shift = assignedShift || 'Unknown';

      let attendanceStatus = totalPunches > 0 ? 'Present' : 'Absent';
      if (existingRecord && MANUAL_OR_LEAVE_STATUSES.has(existingRecord.attendanceStatus)) {
        attendanceStatus = existingRecord.attendanceStatus;
      }

      const info = empInfoMap.get(empKey) || {};
      items.push({
        empCode: emp.empCode,
        employeeName: emp.name || info.name || '',
        department: emp.department || info.department || '',
        designation: emp.designation || info.designation || '',
        shift,
        checkIn,
        checkOut,
        totalPunches,
        attendanceStatus,
        reason: existingRecord?.reason ?? '',
        leaveType: existingRecord?.leaveType ?? null,
      });
    }

    const presentItems = items.filter((item) => item.totalPunches > 0 || MANUAL_OR_LEAVE_STATUSES.has(item.attendanceStatus));

    const bulkOps = presentItems.map((item) => {
      const existing = existingByEmpCode.get(toEmpCodeKey(item.empCode));
      const preserveManual = existing && MANUAL_OR_LEAVE_STATUSES.has(existing.attendanceStatus);

      const update = {
        date,
        empCode: item.empCode,
        employeeName: item.employeeName,
        department: item.department || '',
        designation: item.designation || '',
        shift: item.shift,
        checkIn: item.checkIn,
        checkOut: item.checkOut || null,
        totalPunches: item.totalPunches,
        updatedAt: new Date(),
      };

      if (preserveManual) {
        update.attendanceStatus = existing.attendanceStatus;
        if (existing.reason != null) update.reason = existing.reason;
        if (existing.leaveType != null) update.leaveType = existing.leaveType;
      } else {
        update.attendanceStatus = item.attendanceStatus;
      }

      return {
        updateOne: {
          filter: { date, empCode: item.empCode, shift: item.shift },
          update: { $set: update },
          upsert: true,
        },
      };
    });

    if (bulkOps.length > 0) {
      // Single-collection bulk write does not need a transaction; avoiding it reduces latency.
      await ShiftAttendance.bulkWrite(bulkOps, { ordered: false, maxTimeMS: 5000 });
    }

    const shiftOrder = new Map();
    allShifts.forEach((s, idx) => shiftOrder.set(s.code, idx + 1));
    shiftOrder.set('Unknown', 999);
    items.sort((a, b) => {
      const sa = shiftOrder.get(a.shift) ?? 999;
      const sb = shiftOrder.get(b.shift) ?? 999;
      if (sa !== sb) return sa - sb;
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    return successResponse(
      { date, savedCount: presentItems.length, items },
      'Daily attendance saved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
