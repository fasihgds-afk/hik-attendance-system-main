/**
 * Keep EmployeeShiftHistory aligned with Employee.shift / shiftId.
 * Monthly attendance is history-first, so a stale open history row causes
 * wrong late/early scoring even when the employee card shows the new shift.
 */

import EmployeeShiftHistory from '../../models/EmployeeShiftHistory.js';
import Shift from '../../models/Shift.js';

function toYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Day before YYYY-MM-DD (UTC calendar math). */
export function dayBeforeYmd(effectiveDate) {
  const base = new Date(`${effectiveDate}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - 1);
  return toYmd(base);
}

/**
 * Assign a shift in history from effectiveDate (closes any open row the day before).
 * No-op if the open history already matches this shift code.
 *
 * @returns {Promise<{ changed: boolean, shiftCode: string|null, message?: string }>}
 */
export async function syncEmployeeShiftHistory({
  empCode,
  shiftId = null,
  shiftCode = null,
  effectiveDate,
  reason = 'Synced from employee update',
  changedBy = 'system',
  previousShiftCode = null,
  previousShiftId = null,
}) {
  if (!empCode || !effectiveDate) {
    return { changed: false, shiftCode: null, message: 'empCode and effectiveDate required' };
  }

  let shift = null;
  if (shiftId) {
    shift = await Shift.findById(shiftId).lean();
  }
  if (!shift && shiftCode) {
    shift = await Shift.findOne({ code: String(shiftCode).trim().toUpperCase() }).lean();
  }
  if (!shift?.code) {
    return { changed: false, shiftCode: null, message: 'Shift not found' };
  }

  const nextCode = String(shift.code).toUpperCase();
  const open = await EmployeeShiftHistory.findOne({ empCode, endDate: null })
    .sort({ effectiveDate: -1 })
    .lean();

  if (open && String(open.shiftCode || '').toUpperCase() === nextCode) {
    return { changed: false, shiftCode: nextCode, message: 'History already matches' };
  }

  const prevEndStr = dayBeforeYmd(effectiveDate);

  const existingHistory = await EmployeeShiftHistory.find({ empCode })
    .sort({ effectiveDate: -1 })
    .lean();

  if (existingHistory.length === 0) {
    const prevCode = previousShiftCode || null;
    const prevId = previousShiftId || null;
    if (
      (prevCode && String(prevCode).toUpperCase() !== nextCode) ||
      (prevId && String(prevId) !== String(shift._id))
    ) {
      let prevShift = prevId ? await Shift.findById(prevId).lean() : null;
      if (!prevShift && prevCode) {
        prevShift = await Shift.findOne({ code: String(prevCode).toUpperCase() }).lean();
      }
      if (prevShift) {
        await EmployeeShiftHistory.create({
          empCode,
          shiftId: prevShift._id,
          shiftCode: prevShift.code,
          effectiveDate: '2020-01-01',
          endDate: prevEndStr,
          reason: 'Auto-created: previous shift before first change',
          changedBy,
        });
      }
    }
  } else {
    await EmployeeShiftHistory.updateMany(
      { empCode, endDate: null },
      { $set: { endDate: prevEndStr } }
    );
  }

  await EmployeeShiftHistory.create({
    empCode,
    shiftId: shift._id,
    shiftCode: shift.code,
    effectiveDate,
    endDate: null,
    reason,
    changedBy,
  });

  return { changed: true, shiftCode: nextCode };
}

/** Derive crossesMidnight from clock times (end before start => next-day end). */
export function crossesMidnightFromTimes(startTime, endTime) {
  const parse = (t) => {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return parse(endTime) < parse(startTime);
}
