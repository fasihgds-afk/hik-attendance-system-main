/**
 * Business date with 6 AM boundary.
 * Day runs from 6:00 AM to 5:59:59 AM next day (instead of midnight to midnight).
 * - 2:00 AM March 7 → business date = March 6 (still "yesterday's day")
 * - 6:00 AM March 7 → business date = March 7 (new day started)
 *
 * @param {string} offset - Timezone offset e.g. '+05:00'
 * @param {Date} [now] - Optional timestamp (default: now)
 * @returns {string} YYYY-MM-DD
 */
export function getBusinessDate(offset = '+05:00', now = new Date()) {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(offset).trim());
  if (!m) return now.toISOString().slice(0, 10);

  const sign = m[1] === '-' ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  const totalMin = sign * (hh * 60 + mm);
  const adjusted = new Date(now.getTime() + totalMin * 60 * 1000);

  const hour = adjusted.getUTCHours();
  const dateStr = adjusted.toISOString().slice(0, 10);

  if (hour < 6) {
    const prev = new Date(adjusted);
    prev.setUTCDate(prev.getUTCDate() - 1);
    return prev.toISOString().slice(0, 10);
  }
  return dateStr;
}
