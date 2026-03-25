import { connectDB } from '@/lib/db';
import Employee from '@/models/Employee';
import ShiftAttendance from '@/models/ShiftAttendance';
import Shift from '@/models/Shift';
import { requireEmployee } from '@/lib/auth/requireAuth';
import { getCompanyTodayYmd } from '@/lib/time/companyToday';
import { getShiftsForEmployeesOnDate } from '@/lib/shift/getShiftForDate';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '@/lib/api/response';
import { ValidationError } from '@/lib/errors/errorHandler';
import { computeLateEarly } from '@/lib/calculations/violations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadEmployeeShiftAndRecord(empCode, employee) {
  const date = getCompanyTodayYmd();
  const shiftById = new Map();
  const shifts = await Shift.find({})
    .select('_id code')
    .lean()
    .maxTimeMS(1500);
  for (const s of shifts) {
    if (s?._id && s?.code) shiftById.set(s._id.toString(), s.code);
  }
  const shiftForDateMap = await getShiftsForEmployeesOnDate([empCode], date, {
    employees: [employee],
    shiftById,
  });
  let shiftCode = (shiftForDateMap.get(empCode) || '').trim().toUpperCase();
  if (!shiftCode) {
    shiftCode = employee.shift ? String(employee.shift).trim().toUpperCase() : '';
  }
  let record = null;
  if (shiftCode) {
    record = await ShiftAttendance.findOne({ date, empCode, shift: shiftCode })
      .select('checkIn checkOut')
      .lean()
      .maxTimeMS(2000);
  }
  return { date, shiftCode, record };
}

/**
 * GET /api/employee/web-clock — today's punch status (works regardless of month selected on dashboard).
 */
export async function GET(req) {
  try {
    const { user } = await requireEmployee();
    await connectDB();
    const empCode = String(user.empCode || '').trim();
    if (!empCode) {
      return errorResponse('Employee code missing from session', 401);
    }

    const employee = await Employee.findOne({ empCode })
      .select('empCode shift shiftId allowWebClockIn')
      .lean()
      .maxTimeMS(2000);

    if (!employee?.allowWebClockIn) {
      return successResponse(
        { allowWebClockIn: false, date: getCompanyTodayYmd(), shift: '', checkIn: null, checkOut: null },
        'Web clock not enabled',
        HTTP_STATUS.OK
      );
    }

    const { date, shiftCode, record } = await loadEmployeeShiftAndRecord(empCode, employee);

    return successResponse(
      {
        allowWebClockIn: true,
        date,
        shift: shiftCode || '',
        checkIn: record?.checkIn ? new Date(record.checkIn).toISOString() : null,
        checkOut: record?.checkOut ? new Date(record.checkOut).toISOString() : null,
      },
      'OK',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_EMPLOYEE') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}

/**
 * POST /api/employee/web-clock
 * Body: { action: 'in' | 'out' }
 * Employee-only. Requires allowWebClockIn on the employee record.
 */
export async function POST(req) {
  try {
    const { user } = await requireEmployee();
    await connectDB();

    const empCode = String(user.empCode || '').trim();
    if (!empCode) {
      return errorResponse('Employee code missing from session', 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'out' ? 'out' : body?.action === 'in' ? 'in' : null;
    if (!action) {
      throw new ValidationError('action must be "in" or "out"');
    }

    const employee = await Employee.findOne({ empCode })
      .select('empCode name department designation shift shiftId allowWebClockIn')
      .lean()
      .maxTimeMS(2000);

    if (!employee) {
      return errorResponse('Employee not found', 404);
    }

    if (!employee.allowWebClockIn) {
      return errorResponse('Web clock in/out is not enabled for your account', 403);
    }

    const date = getCompanyTodayYmd();

    const shiftById = new Map();
    const allShiftsMap = new Map();
    const shifts = await Shift.find({})
      .select('_id code startTime endTime crossesMidnight gracePeriod')
      .lean()
      .maxTimeMS(1500);
    for (const s of shifts) {
      if (s?._id && s?.code) {
        shiftById.set(s._id.toString(), s.code);
        allShiftsMap.set(s._id.toString(), s);
        allShiftsMap.set(s.code, s);
      }
    }

    const shiftForDateMap = await getShiftsForEmployeesOnDate([empCode], date, {
      employees: [employee],
      shiftById,
    });
    let shiftCode = (shiftForDateMap.get(empCode) || '').trim().toUpperCase();
    if (!shiftCode) {
      shiftCode = employee.shift ? String(employee.shift).trim().toUpperCase() : '';
    }
    if (!shiftCode) {
      throw new ValidationError('No shift assigned. HR must assign a shift before you can clock in.');
    }

    const now = new Date();

    const existing = await ShiftAttendance.findOne({ date, empCode, shift: shiftCode })
      .select('_id checkIn checkOut attendanceStatus manuallyEdited')
      .lean()
      .maxTimeMS(2000);

    if (action === 'in') {
      if (existing?.checkIn && !existing?.checkOut) {
        return errorResponse('You are already clocked in. Clock out first.', 400);
      }
      if (existing?.checkIn && existing?.checkOut) {
        return errorResponse('Attendance for today is already complete.', 400);
      }

      if (existing && existing.manuallyEdited) {
        return errorResponse('Today was set by HR. Contact HR to adjust attendance.', 400);
      }

      await ShiftAttendance.findOneAndUpdate(
        { date, empCode, shift: shiftCode },
        {
          $set: {
            date,
            empCode,
            shift: shiftCode,
            employeeName: employee.name || '',
            department: employee.department || '',
            designation: employee.designation || '',
            checkIn: now,
            checkOut: null,
            totalPunches: 1,
            attendanceStatus: 'Present',
            reason: '',
            late: false,
            earlyLeave: false,
            webSelfService: true,
            manuallyEdited: false,
            updatedAt: now,
          },
        },
        { upsert: true, new: true }
      );

      return successResponse(
        { date, action: 'in', checkIn: now.toISOString(), shift: shiftCode },
        'Clock in recorded',
        HTTP_STATUS.OK
      );
    }

    // clock out
    if (!existing?.checkIn) {
      return errorResponse('Clock in first before clocking out.', 400);
    }
    if (existing.checkOut) {
      return errorResponse('You have already clocked out for today.', 400);
    }
    if (existing.manuallyEdited) {
      return errorResponse('Today was set by HR. Contact HR to adjust attendance.', 400);
    }

    let checkOut = now;
    const checkInDate = new Date(existing.checkIn);
    if (checkOut.getTime() <= checkInDate.getTime()) {
      checkOut = new Date(checkInDate.getTime() + 60 * 1000);
    }

    const { late, earlyLeave } = computeLateEarly(
      shiftCode,
      checkInDate,
      checkOut,
      allShiftsMap
    );

    await ShiftAttendance.updateOne(
      { _id: existing._id },
      {
        $set: {
          checkOut,
          totalPunches: 2,
          attendanceStatus: 'Present',
          late,
          earlyLeave,
          webSelfService: true,
          updatedAt: now,
        },
      }
    );

    return successResponse(
      {
        date,
        action: 'out',
        checkIn: checkInDate.toISOString(),
        checkOut: checkOut.toISOString(),
        shift: shiftCode,
      },
      'Clock out recorded',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_EMPLOYEE') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
