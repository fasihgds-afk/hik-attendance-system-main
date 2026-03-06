import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { ForbiddenError } from '../../../../lib/errors/errorHandler';
import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import BreakLog from '../../../../models/BreakLog';
import SuspiciousLog from '../../../../models/SuspiciousLog';
import { getEffectiveBreakCategory } from '../../../../lib/agent/common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const categories = ['Official', 'General', 'Namaz'];

function toNum(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function getDayBounds(dateStr, tz = '+05:00') {
  const start = new Date(`${dateStr}T00:00:00${tz}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function overlapMinutes(startAt, endAt, dayStart, dayEnd) {
  if (!startAt || !endAt) return 0;
  const a = Math.max(new Date(startAt).getTime(), dayStart.getTime());
  const b = Math.min(new Date(endAt).getTime(), dayEnd.getTime());
  return Math.max(0, Math.floor((b - a) / 60000));
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const empCode = String(searchParams.get('empCode') || '').trim();
    const date = String(searchParams.get('date') || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!empCode) throw new Error('empCode is required');

    // Require auth; employees can only fetch their own data; HR can fetch any
    if (!session?.user) {
      throw new ForbiddenError('Please sign in to view productivity');
    }
    if (session.user.role === 'EMPLOYEE' && String(session.user.empCode || '') !== empCode) {
      throw new ForbiddenError('You can only view your own productivity');
    }

    await connectDB();
    const { start: dayStart, end: dayEnd } = getDayBounds(date, process.env.TIMEZONE_OFFSET || '+05:00');

    const [attendanceRows, breakLogs, suspiciousLogs] = await Promise.all([
      ShiftAttendance.find({ empCode, date }).sort({ checkIn: 1 }).lean().maxTimeMS(3000),
      BreakLog.find({ empCode, shiftDate: date, status: 'CLOSED' })
        .sort({ breakStartAt: 1 })
        .lean()
        .maxTimeMS(3000),
      SuspiciousLog.find({
        empCode,
        startedAt: { $lt: dayEnd },
        $or: [{ endedAt: null }, { endedAt: { $gt: dayStart } }]
      })
        .lean()
        .maxTimeMS(3000)
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date();

    let shiftDurationHrs = 0;
    let totalWorkedHrs = 0;
    let checkIn = null;
    let checkOut = null;

    const attendance = attendanceRows.find((a) => a.checkIn || a.checkOut) || attendanceRows[0];
    if (attendance) {
      checkIn = attendance.checkIn ? new Date(attendance.checkIn) : null;
      checkOut = attendance.checkOut ? new Date(attendance.checkOut) : null;
      if (checkIn && checkOut) {
        const ms = checkOut.getTime() - checkIn.getTime();
        totalWorkedHrs = Math.max(0, ms / 36e5);
        shiftDurationHrs = totalWorkedHrs;
      } else if (checkIn && !checkOut) {
        const effectiveCheckOut = date === todayStr ? now : new Date(`${date}T23:59:59${process.env.TIMEZONE_OFFSET || '+05:00'}`);
        const ms = effectiveCheckOut.getTime() - checkIn.getTime();
        totalWorkedHrs = Math.max(0, ms / 36e5);
        shiftDurationHrs = totalWorkedHrs;
      }
    }

    const totalBreakMin = breakLogs.reduce((acc, b) => acc + toNum(b.durationMin), 0);

    if (totalWorkedHrs === 0 && breakLogs.length > 0) {
      const firstBreakStart = breakLogs[0].breakStartAt ? new Date(breakLogs[0].breakStartAt) : null;
      const lastBreak = breakLogs[breakLogs.length - 1];
      const lastBreakEnd = lastBreak.breakEndAt ? new Date(lastBreak.breakEndAt) : null;
      const spanEnd = lastBreakEnd || (date === todayStr ? now : null);
      if (firstBreakStart && spanEnd) {
        const spanHrs = Math.max(0, (spanEnd.getTime() - firstBreakStart.getTime()) / 36e5);
        totalWorkedHrs = Math.max(0, spanHrs - totalBreakMin / 60);
      }
      if (totalWorkedHrs > 0 && shiftDurationHrs === 0) shiftDurationHrs = totalWorkedHrs;
    }
    const generalMin = breakLogs
      .filter((b) => getEffectiveBreakCategory(b) === 'General')
      .reduce((acc, b) => acc + toNum(b.durationMin), 0);
    const namazMin = breakLogs
      .filter((b) => getEffectiveBreakCategory(b) === 'Namaz')
      .reduce((acc, b) => acc + toNum(b.durationMin), 0);
    const allowedBreakMin = breakLogs.reduce((acc, b) => acc + toNum(b.allowedDurationMin), 0);
    const deductedBreakMin = breakLogs.reduce((acc, b) => acc + toNum(b.exceededDurationMin), 0);

    // General: 60min allowed — only exceeded reduces productivity. Namaz: 25min — only exceeded. Official: always productive
    const deductibleBreakMin = Math.max(0, generalMin - 60) + Math.max(0, namazMin - 25);

    const breakDown = categories.map((cat) => {
      const rows = breakLogs.filter((b) => getEffectiveBreakCategory(b) === cat);
      return {
        category: cat,
        totalMin: rows.reduce((a, r) => a + toNum(r.durationMin), 0),
        exceededMin: rows.reduce((a, r) => a + toNum(r.exceededDurationMin), 0),
        count: rows.length
      };
    });

    const suspiciousClosedMin = suspiciousLogs.reduce((acc, s) => {
      const endAt = s.endedAt ? new Date(s.endedAt) : now;
      const minutes = overlapMinutes(s.startedAt, endAt, dayStart, dayEnd);
      if (s.active && !s.endedAt) return acc;
      return acc + minutes;
    }, 0);
    const suspiciousLiveMin = suspiciousLogs.reduce((acc, s) => {
      if (!(s.active && !s.endedAt)) return acc;
      return acc + overlapMinutes(s.startedAt, now, dayStart, dayEnd);
    }, 0);
    const suspiciousMin = suspiciousClosedMin + suspiciousLiveMin;

    const productiveHrs = Math.max(0, totalWorkedHrs - deductibleBreakMin / 60);
    const suspiciousHrs = suspiciousMin / 60;
    const netProductiveHrs = Math.max(0, productiveHrs - suspiciousHrs);
    const productivityPct =
      shiftDurationHrs > 0 ? Number(((netProductiveHrs / shiftDurationHrs) * 100).toFixed(2)) : 0;

    const allowedHrs = allowedBreakMin / 60;
    const allowedBreakDisplay = allowedHrs > 24 ? 'Unlimited' : Number((allowedBreakMin / 60).toFixed(2));

    return successResponse(
      {
        empCode,
        date,
        shiftDurationHrs: Number(shiftDurationHrs.toFixed(2)),
        totalWorkedHrs: Number(totalWorkedHrs.toFixed(2)),
        totalBreakHrs: Number((totalBreakMin / 60).toFixed(2)),
        allowedBreakHrs: allowedBreakDisplay,
        deductedBreakHrs: Number((deductedBreakMin / 60).toFixed(2)),
        productiveHrs: Number(productiveHrs.toFixed(2)),
        suspiciousHrs: Number(suspiciousHrs.toFixed(2)),
        suspiciousHistoricalHrs: Number((suspiciousClosedMin / 60).toFixed(2)),
        suspiciousLiveHrs: Number((suspiciousLiveMin / 60).toFixed(2)),
        suspiciousActiveNow: suspiciousLiveMin > 0,
        netProductiveHrs: Number(netProductiveHrs.toFixed(2)),
        productivityPct,
        breakDown,
        history: breakLogs.map((b) => ({
          _id: String(b._id),
          category: getEffectiveBreakCategory(b) || b.category,
          reason: b.reason,
          breakStartAt: b.breakStartAt,
          breakEndAt: b.breakEndAt,
          durationMin: b.durationMin || 0,
          allowedDurationMin: b.allowedDurationMin || 0,
          exceededDurationMin: b.exceededDurationMin || 0
        }))
      },
      'Productivity metrics calculated',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
