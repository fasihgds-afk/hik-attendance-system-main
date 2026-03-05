import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requiredString, verifyDevice } from '../../../../lib/agent/common';
import Employee from '../../../../models/Employee';
import Shift from '../../../../models/Shift';
import { resolveShiftWindow } from '../../../../lib/shift/resolveShiftWindow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toDateStr(v) {
  if (!v) return new Date().toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const empCode = requiredString(searchParams.get('empCode'), 'empCode');
    const deviceId = requiredString(searchParams.get('deviceId'), 'deviceId');
    const date = toDateStr(searchParams.get('date'));

    await connectDB();
    await verifyDevice(req, empCode, deviceId);

    const employee = await Employee.findOne({ empCode })
      .select('empCode shift shiftId')
      .lean()
      .maxTimeMS(2000);
    if (!employee) throw new Error(`Employee not found: ${empCode}`);

    let shift = null;
    if (employee.shiftId) {
      shift = await Shift.findById(employee.shiftId)
        .select('code name startTime endTime crossesMidnight gracePeriod')
        .lean()
        .maxTimeMS(2000);
    }
    if (!shift && employee.shift) {
      shift = await Shift.findOne({ code: String(employee.shift).toUpperCase() })
        .select('code name startTime endTime crossesMidnight gracePeriod')
        .lean()
        .maxTimeMS(2000);
    }
    if (!shift) throw new Error(`No shift assigned for employee ${empCode}`);

    const window = resolveShiftWindow({
      date,
      shift,
      timezoneOffset: process.env.TIMEZONE_OFFSET || '+05:00'
    });

    return successResponse(
      {
        empCode,
        date,
        shift: {
          code: shift.code,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          crossesMidnight: !!shift.crossesMidnight,
          gracePeriod: Number(shift.gracePeriod || 0)
        },
        window: {
          shiftStart: window?.shiftStart?.toISOString() || null,
          shiftEnd: window?.shiftEnd?.toISOString() || null,
          latestAllowedCheckIn: window?.latestAllowedCheckIn?.toISOString() || null,
          earliestAllowedCheckOut: window?.earliestAllowedCheckOut?.toISOString() || null
        }
      },
      'Shift info resolved',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
