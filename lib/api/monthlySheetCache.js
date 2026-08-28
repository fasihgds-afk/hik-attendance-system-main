/**
 * Short in-process cache for GET /api/hr/monthly-attendance.
 * Avoids recomputing the full sheet on repeat views (reload, salary report,
 * employee dashboard). Invalidated on attendance / leave / salary writes.
 * Per serverless instance only — still a win for burst traffic on a warm lambda.
 */

const TTL_MS = 45 * 1000;
const MAX_ENTRIES = 24;

const cache = new Map();

export function monthlySheetCacheKey({ month, search = '', role = '', empCode = '', companyTodayYmd = '', mode = 'full' }) {
  return `${month}|${search}|${role}|${empCode}|${companyTodayYmd}|${mode}`;
}

export function getMonthlySheetCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

export function setMonthlySheetCache(key, data) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), data });
}

export function invalidateMonthlySheetCache(monthOrDate) {
  cache.clear();
  // Drop persisted salary rollups + monthly sheet snapshots after writes.
  Promise.all([
    import('../salary/salarySummaries.js').then(async (mod) => {
      if (monthOrDate) {
        await mod.invalidateSalarySummariesForDate(monthOrDate);
        return;
      }
      await mod.invalidateAllSalarySummaries();
    }),
    import('../attendance/monthlySheetSnapshots.js').then(async (mod) => {
      if (monthOrDate) {
        await mod.invalidateMonthlySheetSnapshotForDate(monthOrDate);
        return;
      }
      await mod.invalidateAllMonthlySheetSnapshots();
    }),
  ]).catch(() => {});
}

export function compactDay(day) {
  if (!day) return day;
  const out = { date: day.date };
  if (day.shift) out.shift = day.shift;
  if (day.status) out.status = day.status;
  if (day.reason) out.reason = day.reason;
  if (day.checkIn) out.checkIn = day.checkIn;
  if (day.checkOut) out.checkOut = day.checkOut;
  if (day.late) out.late = true;
  if (day.earlyLeave) out.earlyLeave = true;
  if (day.excused) out.excused = true;
  // Always keep false when the day is late/early — omitting false made the UI
  // fall back to legacy `excused` and show green while Late Violations still counted.
  if (typeof day.lateExcused === 'boolean') out.lateExcused = day.lateExcused;
  if (typeof day.earlyExcused === 'boolean') out.earlyExcused = day.earlyExcused;
  if (day.leaveType) out.leaveType = day.leaveType;
  if (day.awayHours) out.awayHours = day.awayHours;
  if (day.awayDeductionDays) out.awayDeductionDays = day.awayDeductionDays;
  if (day.awayNote) out.awayNote = day.awayNote;
  if (day.awayReportedBy) out.awayReportedBy = day.awayReportedBy;
  if (day.shiftHours) out.shiftHours = day.shiftHours;
  if (day.shiftGrossHours) out.shiftGrossHours = day.shiftGrossHours;
  if (day.breakMinutes) out.breakMinutes = day.breakMinutes;
  if (day.isFuture) out.isFuture = true;
  return out;
}

export function compactMonthlyEmployee(emp) {
  const out = { ...emp };
  if (Array.isArray(emp.days)) out.days = emp.days.map(compactDay);
  if (!out.salaryProration) delete out.salaryProration;
  if (Array.isArray(out.deductionRemarks) && out.deductionRemarks.length === 0) {
    delete out.deductionRemarks;
  }
  return out;
}
