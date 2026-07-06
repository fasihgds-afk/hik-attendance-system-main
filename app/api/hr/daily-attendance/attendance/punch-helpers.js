/**
 * First/last punch logic: per employee per day, earliest = check-in and latest = check-out.
 * Single evening punch (after 17:00) = check-in only.
 * Single early-morning punch (before 09:00) = check-out only (night-shift end).
 */

import { getLocalTimeMinutes } from './time-utils.js';
import { ensureCheckInBeforeCheckOut } from './validation.js';

const EVENING_CHECKIN_MIN = 17 * 60; // 17:00
const MORNING_CHECKOUT_MAX = 9 * 60; // 09:00

/**
 * Normalize empCode to string for Map keys (device may send number).
 * @param {string|number} value
 * @returns {string}
 */
function toEmpCodeKey(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

/**
 * Classify a lone punch within the business window.
 * @param {Date} punch
 * @param {string} tzOffset
 * @returns {'checkIn'|'checkOut'|'checkIn'}
 */
function classifySinglePunch(punch, tzOffset) {
  const mins = getLocalTimeMinutes(punch, tzOffset);
  if (mins < MORNING_CHECKOUT_MAX) return 'checkOut';
  if (mins >= EVENING_CHECKIN_MIN) return 'checkIn';
  return 'checkIn';
}

/**
 * Fetch first and last punch per employee for the business day window (09:00 → 08:00 next day).
 *
 * @param {object} AttendanceEvent - Mongoose model
 * @param {Date} startLocal - Start of business window
 * @param {Date} endLocal - End of business window (08:00 next day)
 * @param {number} [maxTimeMS=5000]
 * @param {string} [tzOffset='+05:00']
 * @returns {Promise<Map<string, { firstPunch: Date|null, lastPunch: Date|null, count: number, checkoutOnly?: boolean }>>}
 */
export async function getFirstAndLastPunchPerEmployee(
  AttendanceEvent,
  startLocal,
  endLocal,
  maxTimeMS = 5000,
  tzOffset = '+05:00'
) {
  const pipeline = [
    {
      $match: {
        eventTime: { $gte: startLocal, $lte: endLocal },
        minor: { $in: [38, 39] },
      },
    },
    {
      $addFields: {
        _empCodeKey: { $trim: { input: { $toString: '$empCode' } } },
        _eventSecond: {
          $dateToString: { format: '%Y-%m-%dT%H:%M:%S', date: '$eventTime', timezone: 'UTC' },
        },
      },
    },
    {
      $match: {
        _empCodeKey: { $nin: ['', 'null', 'undefined'] },
      },
    },
    // Collapse repeated device records of the same employee in the same second.
    {
      $group: {
        _id: { empCode: '$_empCodeKey', sec: '$_eventSecond' },
        eventTime: { $min: '$eventTime' },
      },
    },
    { $sort: { eventTime: 1 } },
    {
      $group: {
        _id: '$_id.empCode',
        firstPunch: { $first: '$eventTime' },
        lastPunch: { $last: '$eventTime' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        firstPunch: 1,
        lastPunch: { $cond: [{ $gt: ['$count', 1] }, '$lastPunch', null] },
        count: 1,
      },
    },
  ];

  const cursor = AttendanceEvent.aggregate(pipeline).option({ maxTimeMS });
  const results = await cursor.exec();
  const map = new Map();

  for (const doc of results) {
    const key = toEmpCodeKey(doc._id);
    if (!key) continue;

    const firstPunch = doc.firstPunch ? new Date(doc.firstPunch) : null;
    const lastPunch = doc.lastPunch ? new Date(doc.lastPunch) : null;
    const count = doc.count || 0;

    if (count === 1 && firstPunch) {
      const kind = classifySinglePunch(firstPunch, tzOffset);
      if (kind === 'checkOut') {
        map.set(key, { firstPunch: null, lastPunch: firstPunch, count: 1, checkoutOnly: true });
        continue;
      }
    }

    map.set(key, {
      firstPunch,
      lastPunch,
      count,
    });
  }

  return map;
}

/**
 * Derive check-out from punch map when check-in is already known (e.g. manual edit).
 * Handles multi-punch days and a single later punch after check-in (e.g. OUT at 21:00).
 *
 * @param {Date|null} checkIn
 * @param {{ firstPunch?: Date|null, lastPunch?: Date|null, count?: number, checkoutOnly?: boolean }|undefined} punches
 * @returns {Date|null}
 */
export function resolveCheckOutFromPunches(checkIn, punches) {
  if (!punches) return null;

  if (punches.checkoutOnly) {
    const out = punches.lastPunch || null;
    return checkIn ? ensureCheckInBeforeCheckOut(checkIn, out) : out;
  }

  if (punches.count > 1 && punches.lastPunch) {
    return ensureCheckInBeforeCheckOut(checkIn, punches.lastPunch);
  }

  if (checkIn && punches.count === 1 && punches.firstPunch) {
    return ensureCheckInBeforeCheckOut(checkIn, punches.firstPunch);
  }

  return null;
}

export { toEmpCodeKey as toEmpCodeKeyPunch };
