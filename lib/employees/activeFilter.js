/**
 * Employee active / archived query helpers for soft-delete support.
 */

export const EMPLOYEE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  TERMINATED: 'terminated',
};

/** Missing status = active (pre-migration records). */
export function isEmployeeActive(employee) {
  if (!employee) return false;
  const status = employee.status;
  return !status || status === EMPLOYEE_STATUS.ACTIVE;
}

export const ACTIVE_EMPLOYEE_FILTER = {
  $or: [{ status: { $exists: false } }, { status: EMPLOYEE_STATUS.ACTIVE }],
};

export const ARCHIVED_EMPLOYEE_FILTER = {
  status: { $in: [EMPLOYEE_STATUS.INACTIVE, EMPLOYEE_STATUS.TERMINATED] },
};

export function mergeActiveFilter(filter = {}) {
  if (!filter || Object.keys(filter).length === 0) {
    return { ...ACTIVE_EMPLOYEE_FILTER };
  }
  return { $and: [ACTIVE_EMPLOYEE_FILTER, filter] };
}

export function mergeArchivedFilter(filter = {}) {
  if (!filter || Object.keys(filter).length === 0) {
    return { ...ARCHIVED_EMPLOYEE_FILTER };
  }
  return { $and: [ARCHIVED_EMPLOYEE_FILTER, filter] };
}

/**
 * Employees for monthly attendance:
 * - Current/future months: active only
 * - Past months: active + archived who have attendance records in that month
 */
export async function fetchEmployeesForMonthlySheet(
  Employee,
  ShiftAttendance,
  { monthStartDate, monthEndDate, monthRelation, empCodeFilter, projection, maxTimeMS = 2500 }
) {
  const select = projection || 'empCode name department designation shift shiftId monthlySalary saturdayGroup';

  if (empCodeFilter) {
    return Employee.find({ empCode: empCodeFilter })
      .select(select)
      .lean()
      .maxTimeMS(maxTimeMS);
  }

  const activeEmployees = await Employee.find(mergeActiveFilter({}))
    .select(select)
    .lean()
    .maxTimeMS(maxTimeMS);

  if (monthRelation >= 0) {
    return activeEmployees;
  }

  const codesInMonth = await ShiftAttendance.distinct('empCode', {
    date: { $gte: monthStartDate, $lte: monthEndDate },
  });

  const activeCodes = new Set(activeEmployees.map((e) => e.empCode));
  const extraCodes = codesInMonth.filter((c) => c && !activeCodes.has(c));

  if (extraCodes.length === 0) {
    return activeEmployees;
  }

  const archivedEmployees = await Employee.find(
    mergeArchivedFilter({ empCode: { $in: extraCodes } })
  )
    .select(select)
    .lean()
    .maxTimeMS(maxTimeMS);

  return [...activeEmployees, ...archivedEmployees];
}
