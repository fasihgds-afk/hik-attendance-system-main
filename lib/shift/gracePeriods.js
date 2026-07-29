/** Defaults and resolution for per-shift check-in / check-out grace (minutes). */

export const DEFAULT_GRACE_PERIOD = 20;

/**
 * Resolve effective grace minutes from a shift document (lean or hydrated).
 * Legacy `gracePeriod` applies to both sides when the per-side fields are absent.
 */
export function resolveShiftGracePeriods(shift) {
  if (!shift || typeof shift !== 'object') {
    return { checkIn: DEFAULT_GRACE_PERIOD, checkOut: DEFAULT_GRACE_PERIOD };
  }
  const legacy =
    shift.gracePeriod != null && shift.gracePeriod !== ''
      ? Number(shift.gracePeriod)
      : null;
  const checkIn =
    shift.checkInGracePeriod != null && shift.checkInGracePeriod !== ''
      ? Number(shift.checkInGracePeriod)
      : legacy != null
        ? legacy
        : DEFAULT_GRACE_PERIOD;
  const checkOut =
    shift.checkOutGracePeriod != null && shift.checkOutGracePeriod !== ''
      ? Number(shift.checkOutGracePeriod)
      : legacy != null
        ? legacy
        : DEFAULT_GRACE_PERIOD;
  return {
    checkIn: Number.isFinite(checkIn) ? checkIn : DEFAULT_GRACE_PERIOD,
    checkOut: Number.isFinite(checkOut) ? checkOut : DEFAULT_GRACE_PERIOD,
  };
}

/**
 * Grace that applies on a given calendar day (YYYY-MM-DD), using optional policy-change fields on the shift:
 * - `graceEffectiveFrom`: first day the **stored** checkInGracePeriod / checkOutGracePeriod apply.
 * - Days strictly before that use `priorCheckInGracePeriod` / `priorCheckOutGracePeriod` when set.
 */
export function resolveGracePeriodsForCalendarDate(shift, calendarDateYmd) {
  if (!shift || typeof shift !== 'object') {
    return { checkIn: DEFAULT_GRACE_PERIOD, checkOut: DEFAULT_GRACE_PERIOD };
  }
  const day = String(calendarDateYmd || '').slice(0, 10);
  const eff = shift.graceEffectiveFrom ? String(shift.graceEffectiveFrom).slice(0, 10) : '';
  if (!eff || !day || day >= eff) {
    return resolveShiftGracePeriods(shift);
  }
  const pin = shift.priorCheckInGracePeriod;
  const pout = shift.priorCheckOutGracePeriod;
  if (pin != null && pin !== '' && pout != null && pout !== '') {
    const ci = Number(pin);
    const co = Number(pout);
    return {
      checkIn: Number.isFinite(ci) ? ci : DEFAULT_GRACE_PERIOD,
      checkOut: Number.isFinite(co) ? co : DEFAULT_GRACE_PERIOD,
    };
  }
  // No prior* on file: do not use current checkIn/checkOut (those are the "new" policy, e.g. 0).
  // Default gives stable reports for past months until HR saves explicit prior on the shift.
  return { checkIn: DEFAULT_GRACE_PERIOD, checkOut: DEFAULT_GRACE_PERIOD };
}

/** Shift object with checkInGracePeriod / checkOutGracePeriod set for `calendarDateYmd`. */
export function shiftWithGraceResolvedForDate(shiftObj, calendarDateYmd) {
  if (!shiftObj?.startTime) return shiftObj;
  const g = resolveGracePeriodsForCalendarDate(shiftObj, calendarDateYmd);
  return {
    ...shiftObj,
    checkInGracePeriod: g.checkIn,
    checkOutGracePeriod: g.checkOut,
  };
}

/**
 * Merge API body with existing shift for create/update.
 * If only legacy `gracePeriod` is sent (no per-side keys), both sides get that value.
 */
export function mergeGraceFromBody(body, existing = null) {
  const cur = existing
    ? resolveShiftGracePeriods(existing)
    : { checkIn: DEFAULT_GRACE_PERIOD, checkOut: DEFAULT_GRACE_PERIOD };

  let checkIn = cur.checkIn;
  let checkOut = cur.checkOut;

  const hasIn = body.checkInGracePeriod !== undefined;
  const hasOut = body.checkOutGracePeriod !== undefined;
  const hasLegacy = body.gracePeriod !== undefined;

  if (hasLegacy && !hasIn && !hasOut) {
    const v = Number(body.gracePeriod);
    if (Number.isFinite(v) && v >= 0) {
      checkIn = v;
      checkOut = v;
    }
  } else {
    if (hasIn) {
      const v = Number(body.checkInGracePeriod);
      if (Number.isFinite(v) && v >= 0) checkIn = v;
    }
    if (hasOut) {
      const v = Number(body.checkOutGracePeriod);
      if (Number.isFinite(v) && v >= 0) checkOut = v;
    }
  }

  return { checkInGracePeriod: checkIn, checkOutGracePeriod: checkOut };
}

/**
 * Late/early calculations:
 * - For **today and future** calendar dates: use `shiftObj` as already resolved upstream (live / date-based policy).
 * - For **past** dates:
 *   - If the shift has **graceEffectiveFrom** (policy change with prior grace), always use `shiftObj` only.
 *     Row-level punch snapshots are ignored: they can be wrong after shift edits or re-syncs and would
 *     override “April = prior, from May 1 = new” incorrectly.
 *   - Otherwise (legacy shifts): use grace minutes snapshotted on `ShiftAttendance` when present.
 */
export function shiftWithGracePolicyForAttendanceRow(
  shiftObj,
  attendanceDoc,
  attendanceDateYmd,
  companyTodayYmd
) {
  if (!shiftObj?.startTime) return shiftObj;
  const rowDate = String(attendanceDateYmd || '').slice(0, 10);
  const today = String(companyTodayYmd || '').slice(0, 10);
  if (!rowDate || !today || rowDate >= today) {
    return shiftObj;
  }
  const hasEffectivePolicy =
    shiftObj.graceEffectiveFrom != null &&
    String(shiftObj.graceEffectiveFrom).trim() !== '';
  if (hasEffectivePolicy) {
    return shiftObj;
  }
  const inG = attendanceDoc?.checkInGracePeriod;
  const outG = attendanceDoc?.checkOutGracePeriod;
  const hasSnap =
    attendanceDoc &&
    Number.isFinite(Number(inG)) &&
    Number.isFinite(Number(outG));
  if (hasSnap) {
    return {
      ...shiftObj,
      checkInGracePeriod: Number(inG),
      checkOutGracePeriod: Number(outG),
    };
  }
  return shiftObj;
}
