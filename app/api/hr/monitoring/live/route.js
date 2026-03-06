import { connectDB } from '../../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import Device from '../../../../../models/Device';
import Employee from '../../../../../models/Employee';
import Shift, { DEFAULT_GRACE_PERIOD } from '../../../../../models/Shift';
import ShiftAttendance from '../../../../../models/ShiftAttendance';
import BreakLog from '../../../../../models/BreakLog';
import SuspiciousLog from '../../../../../models/SuspiciousLog';
import { resolveShiftWindow } from '../../../../../lib/shift/resolveShiftWindow';
import { getEffectiveBreakCategory } from '../../../../../lib/agent/common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVE_OFFLINE_MS = 120 * 1000; // 2 min — reduces false "offline" when heartbeat delayed

function toDateStrInOffset(offset = '+05:00') {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(offset).trim());
  if (!m) return new Date().toISOString().slice(0, 10);
  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  const totalMin = sign * (hh * 60 + mm);
  return new Date(Date.now() + totalMin * 60 * 1000).toISOString().slice(0, 10);
}

function round(v, n = 1) {
  return Number(Number(v || 0).toFixed(n));
}

function toHoursFromDates(a, b) {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms > 0 ? ms / 36e5 : 0;
}

export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const date = String(searchParams.get('date') || toDateStrInOffset(process.env.TIMEZONE_OFFSET || '+05:00')).slice(0, 10);
    const now = new Date();

    const [devices, employees, shifts, attendanceRows, breakRows, suspiciousRows] = await Promise.all([
      Device.find({})
        .select('empCode deviceId currentStatus suspiciousActive lastSeenAt')
        .lean()
        .maxTimeMS(4000),
      Employee.find({})
        .select('empCode name department designation shift')
        .lean()
        .maxTimeMS(4000),
      Shift.find({ isActive: true }).select('code startTime endTime crossesMidnight gracePeriod').lean().maxTimeMS(4000),
      ShiftAttendance.find({ date })
        .select('empCode checkIn checkOut shift')
        .lean()
        .maxTimeMS(4000),
      BreakLog.find({ shiftDate: date })
        .select('empCode category reason status durationMin allowedDurationMin exceededDurationMin breakStartAt breakEndAt')
        .lean()
        .maxTimeMS(4000),
      SuspiciousLog.find({
        startedAt: { $lte: now },
        $or: [{ endedAt: null }, { endedAt: { $gte: new Date(`${date}T00:00:00.000Z`) } }]
      })
        .select('empCode active startedAt endedAt durationMin')
        .lean()
        .maxTimeMS(4000)
    ]);

    const empMap = new Map(employees.map((e) => [String(e.empCode), e]));
    const attMap = new Map(attendanceRows.map((a) => [String(a.empCode), a]));
    const shiftByCode = new Map(shifts.map((s) => [String(s.code || '').toUpperCase(), s]));

    const breaksByEmp = new Map();
    for (const b of breakRows) {
      const key = String(b.empCode);
      const list = breaksByEmp.get(key) || [];
      list.push(b);
      breaksByEmp.set(key, list);
    }

    const suspiciousByEmp = new Map();
    for (const s of suspiciousRows) {
      const key = String(s.empCode);
      const list = suspiciousByEmp.get(key) || [];
      list.push(s);
      suspiciousByEmp.set(key, list);
    }

    const rows = devices.map((d) => {
      const empCode = String(d.empCode);
      const emp = empMap.get(empCode) || {};
      const att = attMap.get(empCode) || {};
      const breakList = breaksByEmp.get(empCode) || [];
      const suspiciousList = suspiciousByEmp.get(empCode) || [];

      const lastSeenMs = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      const online = now.getTime() - lastSeenMs <= LIVE_OFFLINE_MS;
      const status = online ? d.currentStatus : 'OFFLINE';

      const isPendingBreak = (b) => {
        const r = String(b.reason || '').toLowerCase();
        return r === 'pending' || r.includes('waiting for employee');
      };
      const validBreaks = breakList.filter((b) => !isPendingBreak(b));

      const effectiveCheckOut = att.checkOut || (att.checkIn ? now : null);
      const checkIn = att.checkIn ? new Date(att.checkIn) : null;
      const tzOffset = process.env.TIMEZONE_OFFSET || '+05:00';
      const shiftCode = String(att.shift || emp.shift || '').toUpperCase();
      const shiftObj = shiftCode ? shiftByCode.get(shiftCode) : null;
      const window = shiftObj ? resolveShiftWindow({ date, shift: shiftObj, timezoneOffset: tzOffset }) : null;
      const graceMin = Number(shiftObj?.gracePeriod ?? DEFAULT_GRACE_PERIOD);
      const latestAllowedCheckIn = window ? new Date(window.shiftStart.getTime() + graceMin * 60_000) : null;
      const productivityStart = (checkIn && window && latestAllowedCheckIn && checkIn.getTime() <= latestAllowedCheckIn.getTime())
        ? window.shiftStart
        : checkIn;
      const workedHrs = toHoursFromDates(productivityStart, effectiveCheckOut);
      const getBreakMin = (b) => {
        if (String(b.status || '').toUpperCase() === 'OPEN' && b.breakStartAt) {
          return Math.max(0, Math.floor((now.getTime() - new Date(b.breakStartAt).getTime()) / 60000));
        }
        return Number(b.durationMin || 0);
      };
      const catKey = (b) => getEffectiveBreakCategory(b) || null;
      const totalBreakMin = validBreaks.reduce((acc, b) => acc + getBreakMin(b), 0);
      const allowedBreakMin = validBreaks.reduce((acc, b) => acc + Number(b.allowedDurationMin || 0), 0);
      const deductedBreakMin = validBreaks.reduce((acc, b) => acc + Number(b.exceededDurationMin || 0), 0);

      let generalMin = 0;
      let namazMin = 0;
      for (const b of validBreaks) {
        const k = catKey(b);
        const m = getBreakMin(b);
        if (k === 'General') generalMin += m;
        else if (k === 'Namaz') namazMin += m;
      }
      // General: 60min allowed — only exceeded portion reduces productivity
      // Namaz: 25min allowed — only exceeded portion reduces productivity
      // Official: unlimited — always productive
      const deductibleBreakMin = Math.max(0, generalMin - 60) + Math.max(0, namazMin - 25);

      const suspiciousMin = suspiciousList.reduce((acc, s) => {
        if (s.active && !s.endedAt) {
          return acc + Math.max(0, Math.floor((now.getTime() - new Date(s.startedAt).getTime()) / 60000));
        }
        return acc + Number(s.durationMin || 0);
      }, 0);

      const productiveHrs = Math.max(0, workedHrs - deductibleBreakMin / 60 - suspiciousMin / 60);
      const score = workedHrs > 0 ? Math.max(0, Math.min(100, Math.round((productiveHrs / workedHrs) * 100))) : 0;

      const byCategory = {
        Official: { totalMin: 0, allowedMin: 0 },
        General: { totalMin: 0, allowedMin: 0 },
        Namaz: { totalMin: 0, allowedMin: 0 }
      };
      for (const b of validBreaks) {
        const key = catKey(b);
        if (!key) continue;

        const runningDurationMin =
          String(b.status || '').toUpperCase() === 'OPEN' && b.breakStartAt
            ? Math.max(0, Math.floor((now.getTime() - new Date(b.breakStartAt).getTime()) / 60000))
            : Number(b.durationMin || 0);

        byCategory[key].totalMin += runningDurationMin;
        byCategory[key].allowedMin += Number(b.allowedDurationMin || 0);
      }

      const allowedHrs = allowedBreakMin / 60;
      const allowedBreakDisplay = allowedHrs > 24 ? 'Unlimited' : round(allowedBreakMin / 60, 1);

      return {
        empCode,
        name: emp.name || empCode,
        department: emp.department || '-',
        shift: att.shift || emp.shift || '-',
        status,
        suspiciousLive: online && !!d.suspiciousActive,
        score,
        checkIn: att.checkIn || null,
        shiftHrs: round(workedHrs || 8, 1),
        workedHrs: round(workedHrs, 1),
        breaksHrs: round(totalBreakMin / 60, 1),
        allowedBreakHrs: allowedBreakDisplay,
        deductedBreakHrs: round(deductedBreakMin / 60, 1),
        productiveHrs: round(productiveHrs, 1),
        productivityPct: workedHrs > 0 ? Math.round((productiveHrs / workedHrs) * 100) : 0,
        breakDown: byCategory,
        breakHistory: validBreaks
          .sort((a, b) => new Date(a.breakStartAt).getTime() - new Date(b.breakStartAt).getTime())
          .slice(-8)
          .map((b) => ({ ...b, displayCategory: getEffectiveBreakCategory(b) || b.category }))
      };
    });

    const summary = {
      total: rows.length,
      active: rows.filter((r) => r.status === 'ACTIVE' && !r.suspiciousLive).length,
      idle: rows.filter((r) => (r.status === 'IDLE' || r.status === 'BREAK') && !r.suspiciousLive).length,
      offline: rows.filter((r) => r.status === 'OFFLINE').length,
      suspicious: rows.filter((r) => r.suspiciousLive).length
    };

    return successResponse({ date, summary, rows }, 'Live monitoring data', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
