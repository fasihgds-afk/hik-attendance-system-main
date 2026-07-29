/**
 * Away-from-workstation deduction (HR-recorded hours away during shift).
 * Uses PAID work hours (default 8). Break/lunch is separate and does NOT reduce paid hours.
 * Example: 8 paid hours + 1h break → hourly rate = daily salary ÷ 8.
 */

export const DEFAULT_PAID_HOURS = 8;
export const DEFAULT_BREAK_MINUTES = 60;

function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Gross shift span in hours from start/end (supports night shifts).
 * May include break time (e.g. 9h at office = 8 paid + 1 break).
 */
export function getShiftDurationHours(shiftObj, fallbackHours = DEFAULT_PAID_HOURS) {
  if (!shiftObj?.startTime || !shiftObj?.endTime) {
    return fallbackHours;
  }

  const start = parseTimeToMinutes(shiftObj.startTime);
  let end = parseTimeToMinutes(shiftObj.endTime);
  let minutes = end - start;

  if ((shiftObj.crossesMidnight || minutes <= 0) && minutes <= 0) {
    minutes += 24 * 60;
  }

  if (minutes <= 0) return fallbackHours;
  return minutes / 60;
}

/** Lunch/break minutes (default 1 hour). Informational — not subtracted from paid hours. */
export function getShiftBreakMinutes(shiftObj) {
  const v = shiftObj?.breakMinutes;
  if (v === 0) return 0;
  if (v != null && Number(v) > 0) return Number(v);
  return DEFAULT_BREAK_MINUTES;
}

/**
 * Paid working hours used for hourly salary deduction (default 8).
 */
export function getPaidWorkHours(shiftObj) {
  if (shiftObj?.paidHoursPerDay != null && Number(shiftObj.paidHoursPerDay) > 0) {
    return Number(shiftObj.paidHoursPerDay);
  }
  return DEFAULT_PAID_HOURS;
}

/**
 * @returns {number} Fraction of a working day to deduct (e.g. 1h / 8h = 0.125)
 */
export function calculateAwayDeductionDays(hoursAway, paidWorkHours) {
  const hours = Number(hoursAway) || 0;
  const paid = Number(paidWorkHours) || DEFAULT_PAID_HOURS;
  if (hours <= 0 || paid <= 0) return 0;
  return Number((hours / paid).toFixed(4));
}

/**
 * @returns {number} PKR amount to deduct
 */
export function calculateAwayDeductionAmount(perDaySalary, hoursAway, paidWorkHours) {
  const days = calculateAwayDeductionDays(hoursAway, paidWorkHours);
  if (!perDaySalary || days <= 0) return 0;
  return Number((perDaySalary * days).toFixed(2));
}

const STATUS_DEDUCTION_TITLES = {
  'Un Paid Leave': 'Unpaid leave',
  'Sick Leave': 'Sick leave',
  'Leave Without Inform': 'Leave without inform',
  'Half Day': 'Half day',
  Absent: 'Absent / no punch',
};

/**
 * Build employee-visible deduction remark lines from monthly day rows.
 */
export function buildDeductionRemarks(days = [], perDaySalary = 0) {
  const remarks = [];

  for (const d of days) {
    if (!d || d.isFuture) continue;

    if ((Number(d.awayHours) || 0) > 0 && (Number(d.awayDeductionDays) || 0) > 0) {
      const noteParts = [];
      if (d.awayNote) noteParts.push(d.awayNote);
      if (d.awayReportedBy) noteParts.push(`Reported by: ${d.awayReportedBy}`);
      remarks.push({
        date: d.date,
        type: 'away',
        title: 'Away from workstation',
        detail: `${d.awayHours} hour(s) away`,
        days: Number(d.awayDeductionDays),
        amount: Number((perDaySalary * Number(d.awayDeductionDays)).toFixed(2)),
        note: noteParts.join(' · ') || 'Salary deducted for time away from seat',
      });
    }

    if (d.late && !d.lateExcused) {
      remarks.push({
        date: d.date,
        type: 'late',
        title: 'Late arrival',
        detail: 'Counted in monthly violation policy',
        days: null,
        amount: null,
        note: d.reason || '',
      });
    }

    if (d.earlyLeave && !d.earlyExcused) {
      remarks.push({
        date: d.date,
        type: 'early',
        title: 'Early departure',
        detail: 'Counted in monthly violation policy',
        days: null,
        amount: null,
        note: d.reason || '',
      });
    }

    if (STATUS_DEDUCTION_TITLES[d.status]) {
      remarks.push({
        date: d.date,
        type: 'status',
        title: STATUS_DEDUCTION_TITLES[d.status],
        detail: d.status,
        days: null,
        amount: null,
        note: d.reason || '',
      });
    }
  }

  return remarks;
}
