// app/api/hr/monthly-attendance/bulk-day/route.js
//
// =============================================================================
// BULK DAY ATTENDANCE API
// -----------------------------------------------------------------------------
// POST /api/hr/monthly-attendance/bulk-day
//
// Marks a single attendance status (e.g. "Eid Holiday", "Holiday", "Present")
// on one or more dates for ALL employees in one go. Designed for company-wide
// off-days like Eid where HR would otherwise edit every employee one by one.
//
// Body: { dates: string[] (YYYY-MM-DD), status: string, reason?: string }
//
// Notes:
// - HR/ADMIN only.
// - Paid Leave is intentionally NOT allowed here because it affects per-employee
//   quarter balances (use the single-day editor / HR Leaves page for that).
// - No punch times are written (holidays have no check in/out). Existing punches
//   for those dates are cleared so the day reads cleanly as the chosen status.
// - manuallyEdited is set so the device punch-sync won't overwrite these.
// =============================================================================

import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import { requireHR } from '../../../../../lib/auth/requireAuth';
import { ValidationError } from '../../../../../lib/errors/errorHandler';

import { connectDB } from '../../../../../lib/db';
import Employee from '../../../../../models/Employee';
import ShiftAttendance from '../../../../../models/ShiftAttendance';
import Shift from '../../../../../models/Shift';
import { normalizeStatus, extractShiftCode } from '../../../../../lib/calculations';
import { getShiftsForEmployeesOnDate } from '../../../../../lib/shift/getShiftForDate.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Statuses HR may apply in bulk. Paid Leave is excluded on purpose (quarter balance side effects).
const ALLOWED_BULK_STATUSES = new Set([
  'Present',
  'Holiday',
  'Eid Holiday',
  'Absent',
  'Work From Home',
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req) {
  try {
    await requireHR();
    await connectDB();

    const body = await req.json();
    const { dates, status, reason } = body || {};

    if (!Array.isArray(dates) || dates.length === 0) {
      throw new ValidationError('Please select at least one date.');
    }
    if (!status) {
      throw new ValidationError('A status is required.');
    }
    if (!ALLOWED_BULK_STATUSES.has(status)) {
      throw new ValidationError(
        `"${status}" cannot be applied in bulk. Allowed: ${[...ALLOWED_BULK_STATUSES].join(', ')}.`
      );
    }

    // Validate + de-duplicate dates
    const uniqueDates = [...new Set(dates.map((d) => String(d).trim()))];
    for (const d of uniqueDates) {
      if (!DATE_RE.test(d)) {
        throw new ValidationError(`Invalid date format: "${d}". Expected YYYY-MM-DD.`);
      }
    }

    const [allShifts, employees] = await Promise.all([
      Shift.find({}).select('_id code').lean().maxTimeMS(2000),
      Employee.find({})
        .select('empCode name department designation shift shiftId')
        .lean()
        .maxTimeMS(3000),
    ]);

    if (!employees || employees.length === 0) {
      throw new ValidationError('No employees found to update.');
    }

    const shiftById = new Map();
    allShifts.forEach((s) => {
      if (s && s._id && s.code) shiftById.set(s._id.toString(), s.code);
    });

    const empCodes = employees.map((e) => e.empCode).filter(Boolean);

    // HR explicitly set a status, so weekend auto-overrides are skipped (isWeekendOff: false).
    const attendanceStatus = normalizeStatus(status, { isWeekendOff: false });

    const ops = [];
    const now = new Date();

    for (const date of uniqueDates) {
      const shiftForDateMap = await getShiftsForEmployeesOnDate(empCodes, date, {
        employees,
        shiftById,
      });

      for (const emp of employees) {
        if (!emp.empCode) continue;

        let shiftCode = shiftForDateMap.get(String(emp.empCode).trim()) || '';
        if (!shiftCode) {
          shiftCode =
            extractShiftCode(emp.shift, shiftById) ||
            extractShiftCode(emp.shiftId != null ? String(emp.shiftId) : '', shiftById) ||
            emp.shift ||
            '';
        }

        const update = {
          date,
          empCode: emp.empCode,
          employeeName: emp.name || '',
          department: emp.department || '',
          designation: emp.designation || '',
          shift: shiftCode,
          checkIn: null,
          checkOut: null,
          totalPunches: 0,
          attendanceStatus,
          reason: reason || '',
          late: false,
          earlyLeave: false,
          excused: false,
          lateExcused: false,
          earlyExcused: false,
          leaveType: null,
          manuallyEdited: true,
          updatedAt: now,
        };

        ops.push({
          updateOne: {
            filter: { date, empCode: emp.empCode, shift: shiftCode },
            update: { $set: update },
            upsert: true,
          },
        });
      }
    }

    let modified = 0;
    let upserted = 0;
    if (ops.length > 0) {
      const result = await ShiftAttendance.bulkWrite(ops, { ordered: false });
      modified = result.modifiedCount || 0;
      upserted = result.upsertedCount || 0;
    }

    return successResponse(
      {
        datesApplied: uniqueDates.length,
        employeesAffected: empCodes.length,
        recordsWritten: modified + upserted,
        status: attendanceStatus,
      },
      `Marked "${attendanceStatus}" for ${empCodes.length} employees on ${uniqueDates.length} day(s).`,
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
