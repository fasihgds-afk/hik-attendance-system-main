/**
 * Shift window resolver shared by monitoring and attendance APIs.
 * Enforces strict shift-start policy and inclusive grace thresholds.
 */

import { resolveShiftGracePeriods } from './gracePeriods.js';

function parseTime(timeStr) {
  const [h, m] = String(timeStr || "00:00").split(":").map((v) => Number(v || 0));
  return { h, m };
}

function atLocal(dateStr, timeStr, tz = "+05:00") {
  return new Date(`${dateStr}T${timeStr}:00${tz}`);
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

export function resolveShiftWindow({ date, shift, timezoneOffset = "+05:00" }) {
  if (!date || !shift?.startTime || !shift?.endTime) return null;

  const shiftStart = atLocal(date, shift.startTime, timezoneOffset);
  const endDate = shift.crossesMidnight ? addDays(date, 1) : date;
  const shiftEnd = atLocal(endDate, shift.endTime, timezoneOffset);
  const { checkIn: checkInGraceMin, checkOut: checkOutGraceMin } = resolveShiftGracePeriods(shift);

  const latestAllowedCheckIn = new Date(shiftStart.getTime() + checkInGraceMin * 60_000);
  const earliestAllowedCheckOut = new Date(shiftEnd.getTime() - checkOutGraceMin * 60_000);

  return {
    shiftStart,
    shiftEnd,
    latestAllowedCheckIn,
    earliestAllowedCheckOut,
    checkInGraceMin,
    checkOutGraceMin
  };
}

/**
 * Clip any break interval to shift window boundaries.
 * No pre-shift / post-shift time is counted.
 */
export function clipIntervalToShiftWindow(startAt, endAt, window) {
  if (!startAt || !endAt || !window) return { clippedStart: null, clippedEnd: null, durationMin: 0 };
  const clippedStart = new Date(Math.max(startAt.getTime(), window.shiftStart.getTime()));
  const clippedEnd = new Date(Math.min(endAt.getTime(), window.shiftEnd.getTime()));
  const durationMs = Math.max(0, clippedEnd.getTime() - clippedStart.getTime());
  return {
    clippedStart: durationMs > 0 ? clippedStart : null,
    clippedEnd: durationMs > 0 ? clippedEnd : null,
    durationMin: durationMs / 60_000
  };
}

/**
 * Split a break across every shift-day window it overlaps.
 * Left-open / forgotten sessions only count the minutes inside each
 * employee's own shift hours (e.g. N2 9pm→6am), not wall-clock span.
 *
 * Returns [{ shiftDate, window, durationMin, clippedStart, clippedEnd }].
 */
export function allocateBreakToShiftDays({
  startAt,
  endAt,
  shift,
  timezoneOffset = "+05:00",
  now = new Date(),
}) {
  if (!startAt || Number.isNaN(startAt.getTime()) || !shift?.startTime || !shift?.endTime) {
    return [];
  }

  const end = endAt && !Number.isNaN(endAt.getTime()) ? endAt : now;
  if (end.getTime() <= startAt.getTime()) return [];

  const startDate = toDateStrInTz(startAt, timezoneOffset);
  const endDate = toDateStrInTz(end, timezoneOffset);
  // Night shifts: a break after midnight still belongs to the previous start day.
  const cursorStart = shift.crossesMidnight ? addDays(startDate, -1) : startDate;

  const out = [];
  let cursor = cursorStart;
  // Include endDate so a long overnight span can touch the next night's start.
  const lastCandidate = endDate;
  let steps = 0;
  while (cursor <= lastCandidate && steps < 16) {
    steps += 1;
    const window = resolveShiftWindow({ date: cursor, shift, timezoneOffset });
    if (window) {
      const clipped = clipIntervalToShiftWindow(startAt, end, window);
      if (clipped.durationMin > 0) {
        out.push({
          shiftDate: cursor,
          window,
          durationMin: clipped.durationMin,
          clippedStart: clipped.clippedStart,
          clippedEnd: clipped.clippedEnd,
        });
      }
    }
    cursor = addDays(cursor, 1);
  }

  return out;
}

export function isLateByGrace(checkIn, window) {
  if (!checkIn || !window?.latestAllowedCheckIn) return false;
  // Inclusive threshold: check-in at exact minute is NOT late.
  return checkIn.getTime() > window.latestAllowedCheckIn.getTime();
}

export function isEarlyByGrace(checkOut, window) {
  if (!checkOut || !window?.earliestAllowedCheckOut) return false;
  // Inclusive threshold: checkout at exact minute is NOT early.
  return checkOut.getTime() < window.earliestAllowedCheckOut.getTime();
}

/**
 * Get local date string (YYYY-MM-DD) for a timestamp in the given timezone.
 */
function toDateStrInTz(d, tzOffset = "+05:00") {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(tzOffset).trim());
  if (!m) return toDateOnly(d);
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  const totalMin = sign * (hh * 60 + mm);
  const localMs = d.getTime() + totalMin * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

/**
 * Resolve shiftDate for a break that occurs at breakAt.
 * - Day shift (11am-9pm same day): shiftDate = break's calendar date
 * - Night shift (8pm Mar 5 - 4am Mar 6): shiftDate = Mar 5 for ALL breaks in that window
 * - If break starts before the window but later overlaps it (forgotten close),
 *   uses the first overlapping shift-start day.
 * Returns { shiftDate, window } or null.
 */
export function resolveShiftDateForBreak({
  breakAt,
  breakEndAt = null,
  shift,
  timezoneOffset = "+05:00",
  now = new Date(),
}) {
  if (!breakAt || !shift?.startTime || !shift?.endTime) return null;

  const breakDate = toDateStrInTz(breakAt, timezoneOffset);

  const windowSameDay = resolveShiftWindow({ date: breakDate, shift, timezoneOffset });
  if (windowSameDay) {
    const t = breakAt.getTime();
    if (t >= windowSameDay.shiftStart.getTime() && t < windowSameDay.shiftEnd.getTime()) {
      return { shiftDate: breakDate, window: windowSameDay };
    }
  }

  if (shift.crossesMidnight) {
    const prevDate = addDays(breakDate, -1);
    const windowPrev = resolveShiftWindow({ date: prevDate, shift, timezoneOffset });
    if (windowPrev) {
      const t = breakAt.getTime();
      if (t >= windowPrev.shiftStart.getTime() && t < windowPrev.shiftEnd.getTime()) {
        return { shiftDate: prevDate, window: windowPrev };
      }
    }
  }

  // Interval overlap (e.g. started early / left open past shift end)
  const allocations = allocateBreakToShiftDays({
    startAt: breakAt,
    endAt: breakEndAt,
    shift,
    timezoneOffset,
    now,
  });
  if (allocations.length) {
    const first = allocations[0];
    return { shiftDate: first.shiftDate, window: first.window };
  }

  return null;
}
