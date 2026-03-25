/**
 * Company-local "today" (server: TIMEZONE_OFFSET).
 */

import { getCompanyTodayYmdFromOffset } from './companyTodayCore.js';

/** YYYY-MM-DD for current company day (before 08:55 = previous calendar day). */
export function getCompanyTodayYmd() {
  return getCompanyTodayYmdFromOffset(process.env.TIMEZONE_OFFSET || '+05:00');
}
