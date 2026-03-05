/**
 * Shift window resolver shared by monitoring and attendance APIs.
 * Enforces strict shift-start policy and inclusive grace thresholds.
 */

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
  const graceMin = Number(shift.gracePeriod || 0);

  const latestAllowedCheckIn = new Date(shiftStart.getTime() + graceMin * 60_000);
  const earliestAllowedCheckOut = new Date(shiftEnd.getTime() - graceMin * 60_000);

  return {
    shiftStart,
    shiftEnd,
    latestAllowedCheckIn,
    earliestAllowedCheckOut,
    graceMin
  };
}

/**
 * Clip any break interval to shift window boundaries.
 * No pre-shift work/break is counted.
 */
export function clipIntervalToShiftWindow(startAt, endAt, window) {
  if (!startAt || !endAt || !window) return { clippedStart: null, clippedEnd: null, durationMin: 0 };
  const clippedStart = new Date(Math.max(startAt.getTime(), window.shiftStart.getTime()));
  const clippedEnd = new Date(Math.min(endAt.getTime(), window.shiftEnd.getTime()));
  const durationMs = Math.max(0, clippedEnd.getTime() - clippedStart.getTime());
  return {
    clippedStart,
    clippedEnd,
    durationMin: Math.floor(durationMs / 60_000)
  };
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
