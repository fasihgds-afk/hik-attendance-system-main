/**
 * HR break monitoring helpers.
 * Limits are per shift-start day (+05:00):
 * - General: 60 minutes
 * - Namaz: 40 minutes
 * - Official: unlimited
 * Night-shift breaks after midnight still count on the shift start date.
 */

import { resolveShiftDateForBreak } from '../shift/resolveShiftWindow.js';

export const TZ_OFFSET = '+05:00';
export const GENERAL_LIMIT_MINUTES = 60;
export const NAMAZ_LIMIT_MINUTES = 40;
/** Official has no cap — kept for UI copy only */
export const OFFICIAL_UNLIMITED = true;

export function normalizeBreakTypeName(name) {
  return String(name || '').trim().toLowerCase();
}

export function isGeneralBreakType(name) {
  return normalizeBreakTypeName(name) === 'general';
}

export function isNamazBreakType(name) {
  return normalizeBreakTypeName(name) === 'namaz';
}

export function isOfficialBreakType(name) {
  return normalizeBreakTypeName(name) === 'official';
}

/** Local YYYY-MM-DD in +05:00 */
export function toLocalDateStr(d, tzOffset = TZ_OFFSET) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(tzOffset).trim());
  if (!m) return date.toISOString().slice(0, 10);
  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  const localMs = date.getTime() + sign * (hh * 60 + mm) * 60 * 1000;
  return new Date(localMs).toISOString().slice(0, 10);
}

export function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Start/end of a local calendar day in +05:00, as UTC Date bounds */
export function localDayBounds(dateStr, tzOffset = TZ_OFFSET) {
  const start = new Date(`${dateStr}T00:00:00${tzOffset}`);
  const end = new Date(`${addDaysStr(dateStr, 1)}T00:00:00${tzOffset}`);
  return { start, end };
}

/**
 * Minutes for a break row. Open breaks use elapsed time until now.
 */
export function resolveBreakMinutes(row, now = new Date()) {
  const status = String(row?.Status || '').trim().toLowerCase();
  const start = row?.BreakStartTime ? new Date(row.BreakStartTime) : null;
  const end = row?.BreakEndTime ? new Date(row.BreakEndTime) : null;
  const stored = Number(row?.TotalMinutes);
  const isOpen = !end || status === 'open' || status === 'active';

  if (!isOpen && Number.isFinite(stored) && stored >= 0) return stored;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
  }
  if (isOpen && start && !Number.isNaN(start.getTime())) {
    return Math.max(0, (now.getTime() - start.getTime()) / 60_000);
  }
  if (Number.isFinite(stored) && stored >= 0) return stored;
  return 0;
}

export function isOpenBreak(row) {
  const status = String(row?.Status || '').trim().toLowerCase();
  if (status === 'closed') return false;
  if (!row?.BreakEndTime) return true;
  return status === 'open' || status === 'active';
}

/**
 * Assign shiftDate for a break using ShiftId → shift window.
 * Falls back to local calendar date of BreakStartTime when shift is missing.
 */
export function resolveBreakShiftDate({ breakAt, shift, timezoneOffset = TZ_OFFSET }) {
  if (shift) {
    const resolved = resolveShiftDateForBreak({ breakAt, shift, timezoneOffset });
    if (resolved?.shiftDate) return resolved.shiftDate;
  }
  return toLocalDateStr(breakAt, timezoneOffset);
}
