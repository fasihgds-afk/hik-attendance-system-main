import Employee from '../../models/Employee';
import { buildEmployeeFilter } from '../db/queryOptimizer';
import { mergeActiveFilter } from './activeFilter';

const LIST_PROJECTION = {
  _id: 1,
  empCode: 1,
  name: 1,
  email: 1,
  monthlySalary: 1,
  shift: 1,
  shiftId: 1,
  department: 1,
  designation: 1,
  saturdayGroup: 1,
  allowWebClockIn: 1,
  portalEnabled: 1,
};

/**
 * Paginated active-employee list used by /api/employee and /api/hr/bootstrap.
 */
export async function queryEmployeeList({
  page = 1,
  limit = 50,
  search = '',
  shift = '',
  department = '',
} = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const searchTerm = String(search || '').trim();
  let shiftFilter = String(shift || '').trim();
  if (shiftFilter === 'All Shifts' || shiftFilter === 'all shifts') shiftFilter = '';
  const departmentFilter = String(department || '').trim();

  const { filter, sortOptions, useTextScore } = buildEmployeeFilter({
    search: searchTerm,
    shift: shiftFilter,
    department: departmentFilter && departmentFilter !== 'ALL' ? departmentFilter : '',
  });

  const skip = (safePage - 1) * safeLimit;
  const queryFilter = mergeActiveFilter(Object.keys(filter).length > 0 ? filter : {});
  const optimizedSort = sortOptions || { empCode: 1 };

  const listProjection = { ...LIST_PROJECTION };
  if (useTextScore) {
    listProjection.score = { $meta: 'textScore' };
  }

  let employees;
  let total;

  if (searchTerm) {
    const rows = await Employee.find(queryFilter)
      .select(listProjection)
      .sort(optimizedSort)
      .skip(skip)
      .limit(safeLimit + 1)
      .lean()
      .maxTimeMS(2000)
      .exec();
    const hasMore = rows.length > safeLimit;
    employees = hasMore ? rows.slice(0, safeLimit) : rows;
    total = skip + employees.length + (hasMore ? 1 : 0);
  } else {
    [employees, total] = await Promise.all([
      Employee.find(queryFilter)
        .select(listProjection)
        .sort(optimizedSort)
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .maxTimeMS(2000)
        .exec(),
      Employee.countDocuments(queryFilter).maxTimeMS(1500).exec(),
    ]);
  }

  await normalizeShiftCodes(employees || []);

  return {
    employees: employees || [],
    total: total || 0,
    page: safePage,
    limit: safeLimit,
  };
}

async function normalizeShiftCodes(employees) {
  const shiftObjectIds = new Set();
  for (const emp of employees) {
    if (!emp.shift) continue;
    const shiftString = String(emp.shift).trim();
    if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
      shiftObjectIds.add(shiftString);
    } else {
      emp.shift = shiftString.toUpperCase();
    }
  }

  if (shiftObjectIds.size === 0) return;

  const Shift = (await import('../../models/Shift')).default;
  const shifts = await Shift.find({ _id: { $in: Array.from(shiftObjectIds) } })
    .select('_id code')
    .lean()
    .maxTimeMS(1000);

  const shiftMap = new Map();
  for (const s of shifts) {
    shiftMap.set(s._id.toString(), s.code);
  }

  for (const emp of employees) {
    if (!emp.shift) continue;
    const shiftString = String(emp.shift).trim();
    if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
      emp.shift = shiftMap.get(shiftString) || '';
    }
  }
}
