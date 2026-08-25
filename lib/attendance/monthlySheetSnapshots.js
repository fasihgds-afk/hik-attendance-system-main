// lib/attendance/monthlySheetSnapshots.js
// Persist / read / invalidate full monthly attendance sheets (day grid).
import MonthlySheetSnapshot from '../../models/MonthlySheetSnapshot';

function toMonthKey(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return '';
}

/** Past months are stable until invalidated; current/future need matching company day + short TTL. */
const CURRENT_MONTH_TTL_MS = 90 * 1000;

export function isMonthlySnapshotFresh(doc, month, companyTodayYmd) {
  if (!doc || !month) return false;
  const todayMonth = toMonthKey(companyTodayYmd) || String(companyTodayYmd || '').slice(0, 7);
  if (month < todayMonth) return true;
  if (String(doc.companyTodayYmd || '') !== String(companyTodayYmd || '')) return false;
  const computedAt = doc.computedAt ? new Date(doc.computedAt).getTime() : 0;
  if (!computedAt) return false;
  return Date.now() - computedAt < CURRENT_MONTH_TTL_MS;
}

/**
 * @returns {Promise<{ month, daysInMonth, employees, companyTodayYmd, computedAt } | null>}
 */
export async function getMonthlySheetSnapshot(month, { companyTodayYmd = '' } = {}) {
  const monthKey = toMonthKey(month);
  if (!monthKey) return null;
  const doc = await MonthlySheetSnapshot.findOne({ month: monthKey })
    .lean()
    .maxTimeMS(4000);
  if (!isMonthlySnapshotFresh(doc, monthKey, companyTodayYmd)) return null;
  return doc;
}

/**
 * Upsert full-month sheet (employees should already be compactMonthlyEmployee with days).
 */
export async function upsertMonthlySheetSnapshot(
  month,
  { daysInMonth, employees, companyTodayYmd = '' }
) {
  const monthKey = toMonthKey(month);
  if (!monthKey || !Array.isArray(employees)) return { ok: false };

  const now = new Date();
  await MonthlySheetSnapshot.findOneAndUpdate(
    { month: monthKey },
    {
      $set: {
        month: monthKey,
        daysInMonth: Number(daysInMonth) || 0,
        companyTodayYmd: String(companyTodayYmd || ''),
        employeeCount: employees.length,
        employees,
        computedAt: now,
      },
    },
    { upsert: true, new: false }
  ).maxTimeMS(8000);

  return { ok: true, employeeCount: employees.length };
}

export async function invalidateMonthlySheetSnapshotForMonth(month) {
  const monthKey = toMonthKey(month);
  if (!monthKey) return { deleted: 0 };
  const res = await MonthlySheetSnapshot.deleteMany({ month: monthKey }).maxTimeMS(3000);
  return { deleted: res.deletedCount || 0 };
}

export async function invalidateMonthlySheetSnapshotForDate(dateYmd) {
  return invalidateMonthlySheetSnapshotForMonth(toMonthKey(dateYmd));
}

export async function invalidateAllMonthlySheetSnapshots() {
  const res = await MonthlySheetSnapshot.deleteMany({}).maxTimeMS(8000);
  return { deleted: res.deletedCount || 0 };
}

export { toMonthKey, CURRENT_MONTH_TTL_MS };
