/**
 * Weekend / Saturday policy helpers.
 *
 * Supports:
 * - Department policy: 'all_off' (every Saturday off) or 'alternate' (even/odd by employee group).
 * - Department 5th Saturday policy (when saturdayPolicy='alternate'):
 *     - 'working_all'    => 5th Saturday is working for everyone
 *     - 'off_all'        => 5th Saturday is off for everyone
 *     - 'group_alternate'=> group-based (A off on odd Saturdays, B off on even Saturdays)
 * - Employee saturdayGroup:
 *     'A' = off 1st & 3rd Saturday, works 2nd & 4th Saturday
 *     'B' = off 2nd & 4th Saturday, works 1st & 3rd Saturday
 *
 * @param {number} saturdayIndex - Which Saturday of the month (1..5).
 * @param {{ saturdayGroup?: string }} employee - Must have saturdayGroup 'A' or 'B' when policy is 'alternate'.
 * @param {Map<string, string|{saturdayPolicy?: string, fifthSaturdayPolicy?: string}>} departmentPolicyMap
 *   Map of department name -> policy config.
 * @param {string} [departmentName] - Employee's department name (optional; if missing, 'alternate' is assumed).
 * @returns {boolean} - True if this Saturday is off for this employee.
 */
export function isSaturdayOffForEmployee(saturdayIndex, employee, departmentPolicyMap, departmentName = '') {
  const normalizedDept = (departmentName || '').trim().toLowerCase();
  const deptConfig = (departmentPolicyMap && departmentPolicyMap.get(normalizedDept)) || 'alternate';
  const policy =
    typeof deptConfig === 'string'
      ? deptConfig
      : (deptConfig?.saturdayPolicy || 'alternate');
  const fifthSaturdayPolicy =
    typeof deptConfig === 'string'
      ? 'working_all'
      : (deptConfig?.fifthSaturdayPolicy || 'working_all');

  if (policy === 'all_off') {
    return true;
  }

  // policy === 'alternate': use employee's saturdayGroup
  // A → OFF on 1st & 3rd, works 2nd & 4th (odd Saturdays off)
  // B → OFF on 2nd & 4th, works 1st & 3rd (even Saturdays off)
  const group = (employee && employee.saturdayGroup) || 'A';
  if (saturdayIndex === 5) {
    if (fifthSaturdayPolicy === 'off_all') return true;
    if (fifthSaturdayPolicy === 'group_alternate') {
      // Group A: odd Saturdays off (1,3,5). Group B: even Saturdays off (2,4).
      return group === 'A';
    }
    // Default/current behaviour.
    return false;
  }
  if (group === 'A') {
    return saturdayIndex === 1 || saturdayIndex === 3;
  }
  if (group === 'B') {
    return saturdayIndex === 2 || saturdayIndex === 4;
  }
  return saturdayIndex === 1 || saturdayIndex === 3; // default like A
}

/**
 * Get which Saturday of the month a date is (1..5), in company timezone.
 * Use when you already know the date is a Saturday (dow === 6).
 *
 * @param {number} year - Full year
 * @param {number} monthIndex - Month 0-11
 * @param {number} dayOfMonth - Day of month (1-31)
 * @param {number} dowOfDay - Day of week for this day (0-6, 6 = Saturday)
 * @param {number} dowOfFirstDayOfMonth - Day of week for 1st of month (0-6)
 * @returns {number|null} - 1..5 for 1st–5th Saturday, or null if not Saturday
 */
export function getSaturdayIndexInMonth(year, monthIndex, dayOfMonth, dowOfDay, dowOfFirstDayOfMonth) {
  if (dowOfDay !== 6) return null;
  const firstSatDay = 1 + (6 - dowOfFirstDayOfMonth + 7) % 7;
  return 1 + Math.floor((dayOfMonth - firstSatDay) / 7);
}
