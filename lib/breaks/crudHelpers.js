/**
 * Shared helpers for HR break CRUD against UserBreaks (PascalCase fields).
 */

import mongoose from 'mongoose';
import { TZ_OFFSET } from './generalLimit.js';

export function roundMinutes(msOrMin, fromMs = false) {
  const mins = fromMs ? msOrMin / 60_000 : msOrMin;
  return Math.round(Math.max(0, mins) * 100) / 100;
}

/** Parse datetime-local / ISO as Pakistan local (+05:00) → Date (UTC instant) */
export function parsePakistanDateTime(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  if (!raw) return null;

  // Already has timezone
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // datetime-local: YYYY-MM-DDTHH:mm or with seconds
  let normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    normalized = `${normalized}:00`;
  }
  const d = new Date(`${normalized}${TZ_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toPakistanDateTimeLocal(isoOrDate) {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function computeTotalMinutes(start, end) {
  if (!start || !end) return null;
  const a = start instanceof Date ? start : new Date(start);
  const b = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  if (b.getTime() < a.getTime()) return null;
  return roundMinutes(b.getTime() - a.getTime(), true);
}

export function normalizeStatus(status, hasEnd) {
  const s = String(status || '').trim();
  if (s) {
    const lower = s.toLowerCase();
    if (lower === 'open' || lower === 'active') return 'Open';
    if (lower === 'closed') return 'Closed';
    return s;
  }
  return hasEnd ? 'Closed' : 'Open';
}

export function serializeUserBreak(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(o._id),
    empCode: o.EmpCode || '',
    shiftId: o.ShiftId || '',
    breakTypeId: o.BreakTypeId ? String(o.BreakTypeId) : '',
    breakStartTime: o.BreakStartTime ? new Date(o.BreakStartTime).toISOString() : null,
    breakEndTime: o.BreakEndTime ? new Date(o.BreakEndTime).toISOString() : null,
    totalMinutes: o.TotalMinutes ?? null,
    comment: o.Comment || '',
    status: o.Status || '',
  };
}

export function isValidObjectId(id) {
  return !!id && mongoose.Types.ObjectId.isValid(String(id));
}
