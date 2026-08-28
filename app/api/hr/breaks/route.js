// GET /api/hr/breaks — Employee break monitoring from UserBreaks + BreakType
import mongoose from 'mongoose';
import { connectDB } from '../../../../lib/db';
import UserBreak from '../../../../models/UserBreak';
import BreakType from '../../../../models/BreakType';
import Employee from '../../../../models/Employee';
import Shift from '../../../../models/Shift';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requirePermission } from '../../../../lib/auth/requireAuth';
import { ValidationError, NotFoundError } from '../../../../lib/errors/errorHandler';
import {
  parsePakistanDateTime,
  computeTotalMinutes,
  normalizeStatus,
  serializeUserBreak,
  isValidObjectId,
} from '../../../../lib/breaks/crudHelpers.js';
import {
  TZ_OFFSET,
  GENERAL_LIMIT_MINUTES,
  NAMAZ_LIMIT_MINUTES,
  toLocalDateStr,
  addDaysStr,
  localDayBounds,
  resolveBreakMinutes,
  isOpenBreak,
  resolveBreakShiftDate,
  normalizeBreakTypeName,
  isGeneralBreakType,
  isNamazBreakType,
} from '../../../../lib/breaks/generalLimit.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function monthRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) return null;
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function resolveDateRange(searchParams) {
  const today = toLocalDateStr(new Date(), TZ_OFFSET);
  const preset = (searchParams.get('preset') || '').trim().toLowerCase();
  let from = (searchParams.get('from') || '').trim();
  let to = (searchParams.get('to') || '').trim();
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (year && month) {
    const mr = monthRange(year, month);
    if (mr) return mr;
  }

  if (preset === 'today' || (!from && !to && !preset)) {
    return { from: today, to: today };
  }
  if (preset === 'yesterday') {
    const y = addDaysStr(today, -1);
    return { from: y, to: y };
  }
  if (preset === 'week') {
    return { from: addDaysStr(today, -6), to: today };
  }
  if (preset === 'month') {
    const [y, m] = today.split('-');
    return monthRange(y, m) || { from: today, to: today };
  }

  if (!from) from = today;
  if (!to) to = from;
  if (from > to) return { from: to, to: from };
  return { from, to };
}

export async function GET(req) {
  try {
    await requirePermission('breakMonitoring', 'view');
    await connectDB();

    const { searchParams } = new URL(req.url);
    const { from, to } = resolveDateRange(searchParams);
    const breakTypeFilter = (searchParams.get('breakType') || '').trim(); // Official|General|Namaz or id
    const statusFilter = (searchParams.get('status') || '').trim().toLowerCase(); // open|closed|all
    const search = (searchParams.get('search') || '').trim();
    // overLimit: general | namaz | any | 1/true (alias of general)
    const overLimitRaw = (searchParams.get('overLimit') || '').trim().toLowerCase();
    const overLimitMode =
      overLimitRaw === '1' || overLimitRaw === 'true' || overLimitRaw === 'general'
        ? 'general'
        : overLimitRaw === 'namaz'
          ? 'namaz'
          : overLimitRaw === 'any'
            ? 'any'
            : '';
    const view = (searchParams.get('view') || 'sessions').trim().toLowerCase(); // sessions|summary
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));

    // Pad query window so night-shift tails are included
    const padFrom = addDaysStr(from, -1);
    const padTo = addDaysStr(to, 1);
    const { start: queryStart } = localDayBounds(padFrom, TZ_OFFSET);
    const { end: queryEnd } = localDayBounds(padTo, TZ_OFFSET);

    const [breakTypes, rawBreaks] = await Promise.all([
      BreakType.find({}).lean().maxTimeMS(3000),
      UserBreak.find({
        BreakStartTime: { $gte: queryStart, $lt: queryEnd },
      })
        .sort({ BreakStartTime: -1 })
        .limit(5000)
        .lean()
        .maxTimeMS(8000),
    ]);

    const typeById = new Map(
      breakTypes.map((t) => [String(t._id), { id: String(t._id), name: t.Name || 'Unknown' }])
    );

    let typeIdFilter = null;
    if (breakTypeFilter) {
      if (mongoose.Types.ObjectId.isValid(breakTypeFilter)) {
        typeIdFilter = breakTypeFilter;
      } else {
        const match = breakTypes.find(
          (t) => normalizeBreakTypeName(t.Name) === normalizeBreakTypeName(breakTypeFilter)
        );
        if (match) typeIdFilter = String(match._id);
      }
    }

    const empCodes = [...new Set(rawBreaks.map((b) => String(b.EmpCode || '').trim()).filter(Boolean))];
    const shiftIds = [
      ...new Set(
        rawBreaks
          .map((b) => String(b.ShiftId || '').trim())
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      ),
    ];

    const [employees, shifts] = await Promise.all([
      empCodes.length
        ? Employee.find({ empCode: { $in: empCodes } })
            .select('empCode name department designation status shiftId shift')
            .lean()
            .maxTimeMS(4000)
        : Promise.resolve([]),
      shiftIds.length
        ? Shift.find({ _id: { $in: shiftIds } })
            .select('name code startTime endTime crossesMidnight breakMinutes isActive')
            .lean()
            .maxTimeMS(3000)
        : Promise.resolve([]),
    ]);

    const empByCode = new Map(employees.map((e) => [String(e.empCode), e]));
    const shiftById = new Map(shifts.map((s) => [String(s._id), s]));

    const now = new Date();
    const enriched = [];

    for (const row of rawBreaks) {
      const typeMeta = typeById.get(String(row.BreakTypeId || '')) || { id: '', name: 'Unknown' };
      if (typeIdFilter && String(row.BreakTypeId) !== typeIdFilter) continue;

      const open = isOpenBreak(row);
      if (statusFilter === 'open' && !open) continue;
      if (statusFilter === 'closed' && open) continue;

      const emp = empByCode.get(String(row.EmpCode || '').trim());
      const shift = shiftById.get(String(row.ShiftId || '').trim()) || null;
      const startAt = row.BreakStartTime ? new Date(row.BreakStartTime) : null;
      if (!startAt || Number.isNaN(startAt.getTime())) continue;

      const shiftDate = resolveBreakShiftDate({ breakAt: startAt, shift, timezoneOffset: TZ_OFFSET });
      if (!shiftDate || shiftDate < from || shiftDate > to) continue;

      if (search) {
        const q = search.toLowerCase();
        const hay = `${row.EmpCode || ''} ${emp?.name || ''} ${emp?.department || ''}`.toLowerCase();
        if (!hay.includes(q) && !String(row.EmpCode || '').startsWith(search)) continue;
      }

      const minutes = resolveBreakMinutes(row, now);

      enriched.push({
        id: String(row._id),
        empCode: String(row.EmpCode || ''),
        employeeName: emp?.name || '',
        department: emp?.department || '',
        designation: emp?.designation || '',
        shiftId: String(row.ShiftId || ''),
        shiftName: shift?.name || '',
        shiftCode: shift?.code || '',
        shiftStartTime: shift?.startTime || '',
        shiftEndTime: shift?.endTime || '',
        crossesMidnight: !!shift?.crossesMidnight,
        breakTypeId: typeMeta.id,
        breakTypeName: typeMeta.name,
        breakStartTime: startAt.toISOString(),
        breakEndTime: row.BreakEndTime ? new Date(row.BreakEndTime).toISOString() : null,
        totalMinutes: Math.round(minutes * 100) / 100,
        comment: row.Comment || '',
        status: open ? 'Open' : String(row.Status || 'Closed'),
        isOpen: open,
        shiftDate,
        isGeneral: isGeneralBreakType(typeMeta.name),
        isNamaz: isNamazBreakType(typeMeta.name),
      });
    }

    // Type totals per empCode + shiftDate
    const generalKeyTotals = new Map();
    const namazKeyTotals = new Map();
    for (const b of enriched) {
      const key = `${b.empCode}::${b.shiftDate}`;
      if (b.isGeneral) generalKeyTotals.set(key, (generalKeyTotals.get(key) || 0) + b.totalMinutes);
      if (b.isNamaz) namazKeyTotals.set(key, (namazKeyTotals.get(key) || 0) + b.totalMinutes);
    }

    const withFlags = enriched.map((b) => {
      const key = `${b.empCode}::${b.shiftDate}`;
      const generalUsed = Math.round((generalKeyTotals.get(key) || 0) * 100) / 100;
      const namazUsed = Math.round((namazKeyTotals.get(key) || 0) * 100) / 100;
      const overGeneral = generalUsed > GENERAL_LIMIT_MINUTES;
      const overNamaz = namazUsed > NAMAZ_LIMIT_MINUTES;
      return {
        ...b,
        generalUsedMinutes: generalUsed,
        generalLimitMinutes: GENERAL_LIMIT_MINUTES,
        generalRemainingMinutes: Math.max(0, Math.round((GENERAL_LIMIT_MINUTES - generalUsed) * 100) / 100),
        overGeneralLimit: overGeneral,
        namazUsedMinutes: namazUsed,
        namazLimitMinutes: NAMAZ_LIMIT_MINUTES,
        namazRemainingMinutes: Math.max(0, Math.round((NAMAZ_LIMIT_MINUTES - namazUsed) * 100) / 100),
        overNamazLimit: overNamaz,
        overAnyLimit: overGeneral || overNamaz,
      };
    });

    const matchesOverFilter = (row) => {
      if (!overLimitMode) return true;
      if (overLimitMode === 'general') return row.overGeneralLimit;
      if (overLimitMode === 'namaz') return row.overNamazLimit;
      return row.overAnyLimit;
    };

    let filtered = withFlags;
    if (overLimitMode) {
      filtered = withFlags.filter(matchesOverFilter);
    }

    // Summary KPIs (before pagination)
    const onBreakNow = withFlags.filter((b) => b.isOpen).length;
    const overGeneralEmployees = new Set(
      withFlags.filter((b) => b.overGeneralLimit).map((b) => `${b.empCode}::${b.shiftDate}`)
    ).size;
    const overNamazEmployees = new Set(
      withFlags.filter((b) => b.overNamazLimit).map((b) => `${b.empCode}::${b.shiftDate}`)
    ).size;
    const overLimitEmployees = new Set(
      withFlags.filter((b) => b.overAnyLimit).map((b) => `${b.empCode}::${b.shiftDate}`)
    ).size;

    const byType = { Official: 0, General: 0, Namaz: 0, Other: 0 };
    let totalMinutesAll = 0;
    for (const b of withFlags) {
      totalMinutesAll += b.totalMinutes;
      const n = normalizeBreakTypeName(b.breakTypeName);
      if (n === 'official') byType.Official += b.totalMinutes;
      else if (n === 'general') byType.General += b.totalMinutes;
      else if (n === 'namaz') byType.Namaz += b.totalMinutes;
      else byType.Other += b.totalMinutes;
    }

    const round2 = (n) => Math.round(n * 100) / 100;

    const summaryPayload = {
      onBreakNow,
      overLimitEmployees,
      overGeneralEmployees,
      overNamazEmployees,
      sessionCount: withFlags.length,
      totalMinutes: round2(totalMinutesAll),
      byType: {
        Official: round2(byType.Official),
        General: round2(byType.General),
        Namaz: round2(byType.Namaz),
        Other: round2(byType.Other),
      },
      generalLimitMinutes: GENERAL_LIMIT_MINUTES,
      namazLimitMinutes: NAMAZ_LIMIT_MINUTES,
      officialUnlimited: true,
    };

    if (view === 'summary') {
      const summaryMap = new Map();
      for (const b of filtered) {
        const key = `${b.empCode}::${b.shiftDate}`;
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            empCode: b.empCode,
            employeeName: b.employeeName,
            department: b.department,
            shiftDate: b.shiftDate,
            shiftName: b.shiftName,
            shiftCode: b.shiftCode,
            officialMinutes: 0,
            generalMinutes: 0,
            namazMinutes: 0,
            otherMinutes: 0,
            totalMinutes: 0,
            sessionCount: 0,
            openCount: 0,
            generalLimitMinutes: GENERAL_LIMIT_MINUTES,
            namazLimitMinutes: NAMAZ_LIMIT_MINUTES,
            officialUnlimited: true,
            overGeneralLimit: false,
            overNamazLimit: false,
          });
        }
        const s = summaryMap.get(key);
        s.sessionCount += 1;
        if (b.isOpen) s.openCount += 1;
        s.totalMinutes += b.totalMinutes;
        const n = normalizeBreakTypeName(b.breakTypeName);
        if (n === 'official') s.officialMinutes += b.totalMinutes;
        else if (n === 'general') s.generalMinutes += b.totalMinutes;
        else if (n === 'namaz') s.namazMinutes += b.totalMinutes;
        else s.otherMinutes += b.totalMinutes;
        s.overGeneralLimit = s.generalMinutes > GENERAL_LIMIT_MINUTES;
        s.overNamazLimit = s.namazMinutes > NAMAZ_LIMIT_MINUTES;
      }

      let rows = [...summaryMap.values()].map((s) => ({
        ...s,
        officialMinutes: round2(s.officialMinutes),
        generalMinutes: round2(s.generalMinutes),
        namazMinutes: round2(s.namazMinutes),
        otherMinutes: round2(s.otherMinutes),
        totalMinutes: round2(s.totalMinutes),
        generalRemainingMinutes: Math.max(0, round2(GENERAL_LIMIT_MINUTES - s.generalMinutes)),
        namazRemainingMinutes: Math.max(0, round2(NAMAZ_LIMIT_MINUTES - s.namazMinutes)),
        overAnyLimit: s.overGeneralLimit || s.overNamazLimit,
      }));

      if (overLimitMode === 'general') rows = rows.filter((r) => r.overGeneralLimit);
      else if (overLimitMode === 'namaz') rows = rows.filter((r) => r.overNamazLimit);
      else if (overLimitMode === 'any') rows = rows.filter((r) => r.overAnyLimit);

      rows.sort((a, b) => {
        if (a.shiftDate !== b.shiftDate) return b.shiftDate.localeCompare(a.shiftDate);
        const aOver = a.overAnyLimit ? 1 : 0;
        const bOver = b.overAnyLimit ? 1 : 0;
        if (aOver !== bOver) return bOver - aOver;
        return b.generalMinutes - a.generalMinutes;
      });

      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const slice = rows.slice((page - 1) * limit, page * limit);

      return successResponse(
        {
          view: 'summary',
          rows: slice,
          breakTypes: breakTypes.map((t) => ({ id: String(t._id), name: t.Name })),
          range: { from, to, timezone: TZ_OFFSET },
          summary: summaryPayload,
        },
        'Break summaries retrieved',
        HTTP_STATUS.OK,
        { pagination: { page, limit, total, totalPages } }
      );
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const sessions = filtered.slice((page - 1) * limit, page * limit);

    return successResponse(
      {
        view: 'sessions',
        sessions,
        breakTypes: breakTypes.map((t) => ({ id: String(t._id), name: t.Name })),
        range: { from, to, timezone: TZ_OFFSET },
        summary: summaryPayload,
      },
      'Breaks retrieved',
      HTTP_STATUS.OK,
      { pagination: { page, limit, total, totalPages } }
    );
  } catch (err) {
    return errorResponseFromException(err);
  }
}

// POST /api/hr/breaks — create a break session (HR correction / manual entry)
export async function POST(req) {
  try {
    await requirePermission('breakMonitoring', 'create');
    await connectDB();

    const body = await req.json();
    const empCode = String(body.empCode || body.EmpCode || '').trim();
    if (!empCode) throw new ValidationError('empCode is required');

    const breakTypeId = String(body.breakTypeId || body.BreakTypeId || '').trim();
    if (!isValidObjectId(breakTypeId)) throw new ValidationError('Valid breakTypeId is required');

    const breakType = await BreakType.findById(breakTypeId).lean();
    if (!breakType) throw new NotFoundError('Break type not found');

    const employee = await Employee.findOne({ empCode })
      .select('empCode name shiftId shift status')
      .lean();
    if (!employee) throw new NotFoundError('Employee not found');

    const start = parsePakistanDateTime(body.breakStartTime || body.BreakStartTime);
    if (!start) throw new ValidationError('breakStartTime is required (Pakistan local time)');

    const endRaw = body.breakEndTime ?? body.BreakEndTime;
    const end = endRaw === null || endRaw === '' || endRaw === undefined
      ? null
      : parsePakistanDateTime(endRaw);
    if (endRaw && !end) throw new ValidationError('Invalid breakEndTime');
    if (end && end.getTime() < start.getTime()) {
      throw new ValidationError('breakEndTime must be after breakStartTime');
    }

    let shiftId = String(body.shiftId || body.ShiftId || '').trim();
    if (!shiftId) {
      shiftId = employee.shiftId ? String(employee.shiftId) : '';
    }

    const totalMinutes =
      body.totalMinutes != null && body.totalMinutes !== ''
        ? Number(body.totalMinutes)
        : computeTotalMinutes(start, end);

    if (end && (totalMinutes == null || Number.isNaN(totalMinutes))) {
      throw new ValidationError('Could not compute totalMinutes');
    }

    const status = normalizeStatus(body.status || body.Status, !!end);

    const doc = await UserBreak.create({
      EmpCode: empCode,
      ShiftId: shiftId,
      BreakTypeId: breakTypeId,
      BreakStartTime: start,
      BreakEndTime: end,
      TotalMinutes: end ? totalMinutes : null,
      Comment: String(body.comment || body.Comment || '').trim(),
      Status: status,
    });

    return successResponse(
      {
        break: serializeUserBreak(doc),
        breakTypeName: breakType.Name || '',
        employeeName: employee.name || '',
      },
      'Break created',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err);
  }
}
