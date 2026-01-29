/**
 * First/last punch logic: per employee per day, only earliest = check-in and latest = check-out.
 * Uses MongoDB aggregation to minimize server load; single punch = check-in only, check-out empty.
 */

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
 * Fetch first and last punch per employee for the business day window (09:00 → 08:00 next day).
 * Single punch: firstPunch only, lastPunch null. No intermediate punches.
 *
 * @param {object} AttendanceEvent - Mongoose model
 * @param {Date} startLocal - Start of business window
 * @param {Date} endLocal - End of business window (08:00 next day)
 * @param {number} [maxTimeMS=5000]
 * @returns {Promise<Map<string, { firstPunch: Date, lastPunch: Date|null, count: number }>>}
 */
export async function getFirstAndLastPunchPerEmployee(AttendanceEvent, startLocal, endLocal, maxTimeMS = 5000) {
  const pipeline = [
    {
      $match: {
        eventTime: { $gte: startLocal, $lte: endLocal },
        minor: 38,
      },
    },
    { $sort: { eventTime: 1 } },
    {
      $group: {
        _id: '$empCode',
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
    map.set(key, {
      firstPunch: doc.firstPunch ? new Date(doc.firstPunch) : null,
      lastPunch: doc.lastPunch ? new Date(doc.lastPunch) : null,
      count: doc.count || 0,
    });
  }

  return map;
}

export { toEmpCodeKey as toEmpCodeKeyPunch };
