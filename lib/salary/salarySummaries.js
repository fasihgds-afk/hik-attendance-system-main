// lib/salary/salarySummaries.js
// Persist / read / invalidate monthly salary rollups used by the salary report.
import MonthlySalarySummary from '../../models/MonthlySalarySummary';

function toMonthKey(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return '';
}

/**
 * Upsert salary summary rows for one month from monthly-attendance employee objects.
 * @param {string} month YYYY-MM
 * @param {Array<object>} employees
 */
export async function upsertSalarySummariesFromEmployees(month, employees) {
  const monthKey = toMonthKey(month);
  if (!monthKey || !Array.isArray(employees) || employees.length === 0) return { upserted: 0 };

  const ops = [];
  const now = new Date();
  for (const emp of employees) {
    const empCode = String(emp?.empCode || '').trim();
    if (!empCode) continue;
    ops.push({
      updateOne: {
        filter: { month: monthKey, empCode },
        update: {
          $set: {
            month: monthKey,
            empCode,
            name: emp.name || '',
            department: emp.department || '',
            designation: emp.designation || '',
            shift: emp.shift || '',
            monthlySalary: Number(emp.monthlySalary ?? 0),
            recordedMonthlySalary: Number(
              emp.recordedMonthlySalary ?? emp.monthlySalary ?? 0
            ),
            nominalMonthlySalary: Number(
              emp.nominalMonthlySalary ?? emp.monthlySalary ?? 0
            ),
            netSalary: Number(emp.netSalary ?? 0),
            salaryDeductAmount: Number(emp.salaryDeductAmount ?? 0),
            lateCount: Number(emp.lateCount ?? 0),
            earlyCount: Number(emp.earlyCount ?? 0),
            absentDays: Number(emp.absentDays ?? 0),
            unpaidLeaveDays: Number(emp.unpaidLeaveDays ?? 0),
            computedAt: now,
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length === 0) return { upserted: 0 };
  const result = await MonthlySalarySummary.bulkWrite(ops, {
    ordered: false,
  });
  return {
    upserted: (result.upsertedCount || 0) + (result.modifiedCount || 0),
  };
}

/**
 * Load summaries for months. Optionally filter by empCode.
 * @returns {Promise<Map<string, object[]>>} month -> employees
 */
export async function getSalarySummariesByMonths(months, { empCode = '' } = {}) {
  const monthKeys = [...new Set((months || []).map(toMonthKey).filter(Boolean))];
  if (monthKeys.length === 0) return new Map();

  const filter = { month: { $in: monthKeys } };
  const code = String(empCode || '').trim();
  if (code) filter.empCode = code;

  const rows = await MonthlySalarySummary.find(filter)
    .select(
      'month empCode name department designation shift monthlySalary recordedMonthlySalary nominalMonthlySalary netSalary salaryDeductAmount lateCount earlyCount absentDays unpaidLeaveDays computedAt'
    )
    .sort({ department: 1, empCode: 1 })
    .lean()
    .maxTimeMS(4000);

  const byMonth = new Map(monthKeys.map((m) => [m, []]));
  for (const row of rows) {
    const list = byMonth.get(row.month);
    if (list) list.push(row);
  }
  return byMonth;
}

export async function invalidateSalarySummariesForMonth(month) {
  const monthKey = toMonthKey(month);
  if (!monthKey) return { deleted: 0 };
  const res = await MonthlySalarySummary.deleteMany({ month: monthKey }).maxTimeMS(3000);
  return { deleted: res.deletedCount || 0 };
}

export async function invalidateSalarySummariesForDate(dateYmd) {
  const monthKey = toMonthKey(dateYmd);
  if (!monthKey) return { deleted: 0 };
  return invalidateSalarySummariesForMonth(monthKey);
}

export async function invalidateAllSalarySummaries() {
  const res = await MonthlySalarySummary.deleteMany({}).maxTimeMS(5000);
  return { deleted: res.deletedCount || 0 };
}

export { toMonthKey };
