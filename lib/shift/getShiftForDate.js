/**
 * Resolve effective shift for employee(s) on a given date from EmployeeShiftHistory.
 * Used so that attendance/reports use the shift that was in effect on that date,
 * not just the current shift (e.g. N1 for 1–4 Feb, N2 from 5 Feb).
 */

import EmployeeShiftHistory from '../../models/EmployeeShiftHistory.js';

/** Normalize empCode for Map keys */
function toKey(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

/**
 * Extract shift code from shift value (string or ObjectId) using shiftById map.
 */
export function extractShiftCode(shiftValue, shiftById) {
  if (!shiftValue) return '';
  const stringValue = String(shiftValue).trim();
  if (!stringValue) return '';
  if (shiftById && /^[0-9a-fA-F]{24}$/.test(stringValue)) {
    const code = shiftById.get(stringValue);
    if (code) return code;
  }
  const match = stringValue.match(/^([A-Z]\d+)$/i);
  if (match) return match[1].toUpperCase();
  return stringValue.toUpperCase();
}

/**
 * Get effective shift code for each employee on a single date.
 * History-first: if EmployeeShiftHistory has a record for (empCode, date), use that shiftCode.
 * Fallback: use employee's current shift (from employees array + shiftById).
 *
 * @param {string[]} empCodes - list of employee codes
 * @param {string} date - YYYY-MM-DD
 * @param {{ employees: Array<{empCode, shift?, shiftId?}>, shiftById: Map<string, string> }} options - employees and shiftById (for resolving shiftId to code)
 * @returns {Promise<Map<string, string>>} Map of empCode -> shiftCode
 */
export async function getShiftsForEmployeesOnDate(empCodes, date, options = {}) {
  const { employees = [], shiftById = new Map() } = options;
  const empCodesSet = new Set(empCodes.map(toKey).filter(Boolean));
  const result = new Map();

  if (empCodesSet.size === 0) return result;

  const history = await EmployeeShiftHistory.find({
    empCode: { $in: [...empCodesSet] },
    effectiveDate: { $lte: date },
    $or: [{ endDate: null }, { endDate: { $gte: date } }],
  })
    .sort({ effectiveDate: -1 })
    .select('empCode shiftCode')
    .lean()
    .maxTimeMS(3000);

  for (const h of history) {
    const key = toKey(h.empCode);
    if (key && !result.has(key)) result.set(key, h.shiftCode || '');
  }

  const empByCode = new Map();
  for (const e of employees) {
    const k = toKey(e.empCode);
    if (k) empByCode.set(k, e);
  }

  for (const code of empCodesSet) {
    if (result.has(code)) continue;
    const emp = empByCode.get(code);
    const shiftCode = emp
      ? extractShiftCode(emp.shift, shiftById) || extractShiftCode(emp.shiftId != null ? String(emp.shiftId) : '', shiftById)
      : '';
    result.set(code, shiftCode || '');
  }

  return result;
}

/**
 * Get effective shift code for each (employee, date) in a date range.
 * Used by monthly attendance: one history query, then in-memory resolution per (empCode, date).
 *
 * @param {string[]} empCodes
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {{ employees: Array<{empCode, shift?, shiftId?}>, shiftById: Map<string, string> }} options
 * @returns {Promise<Map<string, string>>} Map of `${empCode}|${date}` -> shiftCode
 */
export async function getShiftsForEmployeesInDateRange(empCodes, startDate, endDate, options = {}) {
  const { employees = [], shiftById = new Map() } = options;
  const result = new Map();
  const empCodesList = empCodes.map(toKey).filter(Boolean);
  if (empCodesList.length === 0) return result;

  const history = await EmployeeShiftHistory.find({
    empCode: { $in: empCodesList },
    effectiveDate: { $lte: endDate },
    $or: [{ endDate: null }, { endDate: { $gte: startDate } }],
  })
    .sort({ effectiveDate: -1 })
    .select('empCode shiftCode effectiveDate endDate')
    .lean()
    .maxTimeMS(5000);

  const empByCode = new Map();
  for (const e of employees) {
    const k = toKey(e.empCode);
    if (k) empByCode.set(k, e);
  }

  const dates = [];
  const d = new Date(startDate);
  const end = new Date(endDate);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  // Group history once per employee to avoid repeated filter/sort work.
  const historyByEmp = new Map();
  for (const h of history) {
    const code = toKey(h.empCode);
    if (!code) continue;
    const list = historyByEmp.get(code);
    if (list) list.push(h);
    else historyByEmp.set(code, [h]);
  }

  // Ensure deterministic order within each employee history list.
  for (const list of historyByEmp.values()) {
    list.sort((a, b) => String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || '')));
  }

  for (const empCode of empCodesList) {
    const emp = empByCode.get(empCode);
    const fallbackCode = emp
      ? extractShiftCode(emp.shift, shiftById) ||
        extractShiftCode(emp.shiftId != null ? String(emp.shiftId) : '', shiftById)
      : '';

    const empHistory = historyByEmp.get(empCode) || [];

    for (const date of dates) {
      let shiftCode = '';
      for (const h of empHistory) {
        if (h.effectiveDate <= date && (h.endDate == null || h.endDate >= date)) {
          shiftCode = h.shiftCode || '';
          break;
        }
      }
      if (!shiftCode) shiftCode = fallbackCode;
      result.set(`${empCode}|${date}`, shiftCode);
    }
  }

  return result;
}
