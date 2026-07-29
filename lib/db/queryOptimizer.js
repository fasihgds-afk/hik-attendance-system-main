/**
 * Database Query Optimization Utilities
 *
 * Provides helper functions to optimize common query patterns
 */

/**
 * Optimize Employee search query
 * Prefer indexed/prefix field matches over $text — $text is whole-word only and
 * feels broken/slow while typing partial names or codes.
 *
 * @param {string} searchTerm - Search term
 * @returns {Object} MongoDB query filter
 */
export function optimizeEmployeeSearch(searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') {
    return {};
  }

  const trimmed = searchTerm.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Digits → empCode prefix (uses empCode index for ^anchored regex when possible)
  if (/^\d+$/.test(trimmed)) {
    return { empCode: { $regex: `^${escaped}` } };
  }

  // Email → exact / prefix
  if (trimmed.includes('@')) {
    return {
      $or: [
        { email: trimmed },
        { email: { $regex: `^${escaped}`, $options: 'i' } },
      ],
    };
  }

  // Name / code / email substring — works while typing (unlike $text whole words)
  return {
    $or: [
      { empCode: { $regex: `^${escaped}`, $options: 'i' } },
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: `^${escaped}`, $options: 'i' } },
    ],
  };
}

/**
 * Build optimized filter for Employee queries
 *
 * @param {Object} params - Filter parameters
 * @param {string} params.search - Search term
 * @param {string} params.shift - Shift filter
 * @param {string} params.department - Department filter
 * @returns {{ filter: Object, sortOptions: Object, useTextScore: boolean }}
 */
export function buildEmployeeFilter({ search, shift, department }) {
  const filter = {};
  let useTextScore = false;
  let sortOptions = { empCode: 1 };

  if (search) {
    const searchFilter = optimizeEmployeeSearch(search);

    if (searchFilter.$text) {
      filter.$text = searchFilter.$text;
      useTextScore = true;
      sortOptions = { score: { $meta: 'textScore' }, empCode: 1 };
    } else if (searchFilter.$or) {
      filter.$or = searchFilter.$or;
    } else {
      Object.assign(filter, searchFilter);
    }
  }

  if (shift) {
    filter.shift = shift;
  }

  if (department) {
    filter.department = department;
  }

  return { filter, sortOptions, useTextScore };
}

/**
 * Get optimized projection for Employee queries
 * Excludes large fields like base64 images when not needed
 *
 * @param {boolean} includeImages - Whether to include image fields
 * @returns {Object} MongoDB projection
 */
export function getEmployeeProjection(includeImages = false) {
  const projection = {
    _id: 1,
    empCode: 1,
    name: 1,
    email: 1,
    monthlySalary: 1,
    shift: 1,
    shiftId: 1,
    department: 1,
    designation: 1,
    joinDate: 1,
    phoneNumber: 1,
    cnic: 1,
    bankDetails: 1,
    saturdayGroup: 1,
    allowWebClockIn: 1,
  };

  if (includeImages) {
    projection.profileImageBase64 = 1;
    projection.profileImageUrl = 1;
  } else {
    projection.profileImageUrl = 1;
  }

  return projection;
}

/**
 * Optimize date range query for ShiftAttendance
 *
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} empCode - Optional employee code
 * @returns {Object} MongoDB query filter
 */
export function buildShiftAttendanceDateRangeFilter(startDate, endDate, empCode = null) {
  const filter = {
    date: { $gte: startDate, $lte: endDate },
  };

  if (empCode) {
    filter.empCode = empCode;
  }

  return filter;
}

/**
 * Get optimized projection for ShiftAttendance queries
 *
 * @returns {Object} MongoDB projection
 */
export function getShiftAttendanceProjection() {
  return {
    date: 1,
    empCode: 1,
    checkIn: 1,
    checkOut: 1,
    shift: 1,
    attendanceStatus: 1,
    reason: 1,
    excused: 1,
    lateExcused: 1,
    earlyExcused: 1,
    late: 1,
    earlyLeave: 1,
    totalPunches: 1,
    _id: 0,
  };
}

/**
 * Optimize AttendanceEvent query for date range
 *
 * @param {Date} startTime - Start time
 * @param {Date} endTime - End time
 * @param {string} empCode - Optional employee code
 * @param {number} minor - Optional minor code filter
 * @returns {Object} MongoDB query filter
 */
export function buildAttendanceEventFilter(startTime, endTime, empCode = null, minor = null) {
  const filter = {
    eventTime: { $gte: startTime, $lte: endTime },
  };

  if (empCode) {
    filter.empCode = empCode;
  }

  if (minor !== null) {
    filter.minor = minor;
  }

  return filter;
}
