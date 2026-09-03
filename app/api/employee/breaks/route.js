// GET /api/employee/breaks — logged-in employee only (UserBreaks)
import mongoose from 'mongoose';
import { connectDB } from '../../../../lib/db';
import UserBreak from '../../../../models/UserBreak';
import BreakType from '../../../../models/BreakType';
import Employee from '../../../../models/Employee';
import Shift from '../../../../models/Shift';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requireEmployee } from '../../../../lib/auth/requireAuth';
import {
  TZ_OFFSET,
  GENERAL_LIMIT_MINUTES,
  NAMAZ_LIMIT_MINUTES,
  toLocalDateStr,
  addDaysStr,
  localDayBounds,
  resolveBreakMinutes,
  isOpenBreak,
  allocateBreakCountedSegments,
  normalizeBreakTypeName,
  isGeneralBreakType,
  isNamazBreakType,
} from '../../../../lib/breaks/generalLimit.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function monthRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) return null;
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function resolveRange(searchParams) {
  const today = toLocalDateStr(new Date(), TZ_OFFSET);
  const preset = (searchParams.get('preset') || 'today').trim().toLowerCase();
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (year && month) {
    const mr = monthRange(year, month);
    if (mr) return { ...mr, preset: 'month' };
  }
  if (preset === 'yesterday') {
    const y = addDaysStr(today, -1);
    return { from: y, to: y, preset };
  }
  if (preset === 'week') return { from: addDaysStr(today, -6), to: today, preset };
  if (preset === 'month') {
    const [y, m] = today.split('-');
    return { ...(monthRange(y, m) || { from: today, to: today }), preset };
  }
  // today (default) — include yesterday too so night-shift start day still visible on daily card
  if (preset === 'today' || preset === 'daily') {
    return { from: addDaysStr(today, -1), to: today, preset: 'daily' };
  }
  let from = (searchParams.get('from') || '').trim() || today;
  let to = (searchParams.get('to') || '').trim() || from;
  if (from > to) return { from: to, to: from, preset: 'custom' };
  return { from, to, preset: 'custom' };
}

export async function GET(req) {
  try {
    const { user } = await requireEmployee();
    await connectDB();

    const empCode = String(user.empCode || '').trim();
    if (!empCode) {
      return errorResponse('Employee code missing from session', 401);
    }

    const { searchParams } = new URL(req.url);
    const { from, to, preset } = resolveRange(searchParams);
    const view = (searchParams.get('view') || (preset === 'daily' ? 'daily' : 'history')).trim().toLowerCase();

    const padFrom = addDaysStr(from, -1);
    const padTo = addDaysStr(to, 1);
    const { start: queryStart } = localDayBounds(padFrom, TZ_OFFSET);
    const { end: queryEnd } = localDayBounds(padTo, TZ_OFFSET);

    const [breakTypes, rawBreaks, employee] = await Promise.all([
      BreakType.find({}).lean().maxTimeMS(3000),
      UserBreak.find({
        EmpCode: empCode,
        BreakStartTime: { $gte: queryStart, $lt: queryEnd },
      })
        .sort({ BreakStartTime: -1 })
        .limit(2000)
        .lean()
        .maxTimeMS(6000),
      Employee.findOne({ empCode })
        .select('empCode name shiftId shift department')
        .lean()
        .maxTimeMS(2000),
    ]);

    const typeById = new Map(
      breakTypes.map((t) => [String(t._id), { id: String(t._id), name: t.Name || 'Unknown' }])
    );

    const shiftIds = [
      ...new Set(
        rawBreaks
          .map((b) => String(b.ShiftId || '').trim())
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      ),
    ];
    if (employee?.shiftId && mongoose.Types.ObjectId.isValid(String(employee.shiftId))) {
      shiftIds.push(String(employee.shiftId));
    }

    const shifts = shiftIds.length
      ? await Shift.find({ _id: { $in: [...new Set(shiftIds)] } })
          .select('name code startTime endTime crossesMidnight breakMinutes')
          .lean()
          .maxTimeMS(3000)
      : [];
    const shiftById = new Map(shifts.map((s) => [String(s._id), s]));

    const now = new Date();
    const sessions = [];
    for (const row of rawBreaks) {
      const typeMeta = typeById.get(String(row.BreakTypeId || '')) || { id: '', name: 'Unknown' };
      const shift = shiftById.get(String(row.ShiftId || '').trim()) || null;
      const startAt = row.BreakStartTime ? new Date(row.BreakStartTime) : null;
      if (!startAt || Number.isNaN(startAt.getTime())) continue;
      const open = isOpenBreak(row);
      const endAt = row.BreakEndTime ? new Date(row.BreakEndTime) : null;
      const rawMinutes = resolveBreakMinutes(row, now);
      const segments = allocateBreakCountedSegments({
        startAt,
        endAt,
        shift,
        timezoneOffset: TZ_OFFSET,
        now,
      });
      if (!segments.length) continue;

      segments.forEach((seg, idx) => {
        if (!seg.shiftDate || seg.shiftDate < from || seg.shiftDate > to) return;
        const minutes = Math.round(seg.durationMin * 100) / 100;
        if (minutes <= 0) return;
        const multi = segments.length > 1;
        sessions.push({
          id: multi ? `${row._id}::${seg.shiftDate}` : String(row._id),
          sourceBreakId: String(row._id),
          empCode,
          breakTypeId: typeMeta.id,
          breakTypeName: typeMeta.name,
          breakStartTime: startAt.toISOString(),
          breakEndTime: endAt && !Number.isNaN(endAt.getTime()) ? endAt.toISOString() : null,
          totalMinutes: minutes,
          rawTotalMinutes: Math.round(rawMinutes * 100) / 100,
          comment: row.Comment || '',
          status: open ? 'Open' : String(row.Status || 'Closed'),
          isOpen: open && idx === segments.length - 1,
          shiftDate: seg.shiftDate,
          shiftName: shift?.name || '',
          shiftCode: shift?.code || '',
          isGeneral: isGeneralBreakType(typeMeta.name),
          isNamaz: isNamazBreakType(typeMeta.name),
        });
      });
    }

    const byDay = new Map();
    for (const s of sessions) {
      if (!byDay.has(s.shiftDate)) {
        byDay.set(s.shiftDate, {
          shiftDate: s.shiftDate,
          shiftName: s.shiftName,
          shiftCode: s.shiftCode,
          generalMinutes: 0,
          namazMinutes: 0,
          officialMinutes: 0,
          otherMinutes: 0,
          sessionCount: 0,
          openCount: 0,
        });
      }
      const d = byDay.get(s.shiftDate);
      d.sessionCount += 1;
      if (s.isOpen) d.openCount += 1;
      if (s.shiftName) d.shiftName = s.shiftName;
      if (s.shiftCode) d.shiftCode = s.shiftCode;
      const n = normalizeBreakTypeName(s.breakTypeName);
      if (n === 'general') d.generalMinutes += s.totalMinutes;
      else if (n === 'namaz') d.namazMinutes += s.totalMinutes;
      else if (n === 'official') d.officialMinutes += s.totalMinutes;
      else d.otherMinutes += s.totalMinutes;
    }

    const round2 = (n) => Math.round(n * 100) / 100;
    const dayRows = [...byDay.values()]
      .map((d) => ({
        ...d,
        generalMinutes: round2(d.generalMinutes),
        namazMinutes: round2(d.namazMinutes),
        officialMinutes: round2(d.officialMinutes),
        otherMinutes: round2(d.otherMinutes),
        generalLimitMinutes: GENERAL_LIMIT_MINUTES,
        namazLimitMinutes: NAMAZ_LIMIT_MINUTES,
        officialUnlimited: true,
        overGeneralLimit: d.generalMinutes > GENERAL_LIMIT_MINUTES,
        overNamazLimit: d.namazMinutes > NAMAZ_LIMIT_MINUTES,
      }))
      .sort((a, b) => b.shiftDate.localeCompare(a.shiftDate));

    // Daily card: prefer shift day that still has an open break, else latest day in range, else today empty shell
    const today = toLocalDateStr(now, TZ_OFFSET);
    let daily = dayRows.find((d) => d.openCount > 0) || dayRows[0] || null;
    if (!daily && preset === 'daily') {
      const empShift =
        shiftById.get(String(employee?.shiftId || '')) ||
        shifts.find((s) => String(s.code || '').toUpperCase() === String(employee?.shift || '').toUpperCase()) ||
        null;
      daily = {
        shiftDate: today,
        shiftName: empShift?.name || '',
        shiftCode: empShift?.code || employee?.shift || '',
        generalMinutes: 0,
        namazMinutes: 0,
        officialMinutes: 0,
        otherMinutes: 0,
        sessionCount: 0,
        openCount: 0,
        generalLimitMinutes: GENERAL_LIMIT_MINUTES,
        namazLimitMinutes: NAMAZ_LIMIT_MINUTES,
        officialUnlimited: true,
        overGeneralLimit: false,
        overNamazLimit: false,
      };
    }

    const dailySessions = daily
      ? sessions
          .filter((s) => s.shiftDate === daily.shiftDate)
          .sort((a, b) => String(a.breakStartTime).localeCompare(String(b.breakStartTime)))
      : [];

    if (view === 'daily') {
      return successResponse(
        {
          view: 'daily',
          empCode,
          employeeName: employee?.name || '',
          range: { from, to, timezone: TZ_OFFSET },
          daily,
          sessions: dailySessions,
          limits: {
            general: GENERAL_LIMIT_MINUTES,
            namaz: NAMAZ_LIMIT_MINUTES,
            officialUnlimited: true,
          },
        },
        'Daily breaks retrieved',
        HTTP_STATUS.OK
      );
    }

    return successResponse(
      {
        view: 'history',
        empCode,
        employeeName: employee?.name || '',
        range: { from, to, timezone: TZ_OFFSET, preset },
        days: dayRows,
        sessions: sessions.sort((a, b) => String(b.breakStartTime).localeCompare(String(a.breakStartTime))),
        limits: {
          general: GENERAL_LIMIT_MINUTES,
          namaz: NAMAZ_LIMIT_MINUTES,
          officialUnlimited: true,
        },
      },
      'Break history retrieved',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_EMPLOYEE') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
