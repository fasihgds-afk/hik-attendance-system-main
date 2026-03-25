/**
 * Company-local calendar date YYYY-MM-DD (08:55 cutoff), given offset like +05:00.
 */

export function parseOffsetToMinutes(offsetStr) {
  const str = String(offsetStr).trim();
  const m = /^([+-])?(\d{1,2})(?::?(\d{2}))?$/.exec(str);
  if (!m) return 5 * 60;

  const sign = m[1] === '-' ? -1 : 1;
  const hours = parseInt(m[2] || '0', 10);
  const mins = parseInt(m[3] || '0', 10);
  return sign * (hours * 60 + mins);
}

export function getCompanyTodayYmdFromOffset(offsetStr) {
  const offsetMs = parseOffsetToMinutes(offsetStr) * 60 * 1000;
  const nowUtc = new Date();
  const localMs = nowUtc.getTime() + offsetMs;
  const local = new Date(localMs);

  const h = local.getUTCHours();
  const mi = local.getUTCMinutes();

  if (h < 8 || (h === 8 && mi < 55)) {
    local.setUTCDate(local.getUTCDate() - 1);
  }

  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
