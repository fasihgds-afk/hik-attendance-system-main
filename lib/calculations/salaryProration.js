/**
 * Mid-month salary raise proration.
 *
 * When HR sets an increment with an effectiveDate mid-month (e.g. July 11),
 * payable gross for that month is blended by calendar day:
 *   days before raise × (old / daysInMonth) + days from raise × (new / daysInMonth)
 */

/**
 * @param {object} entry
 * @returns {string} YYYY-MM-DD
 */
export function salaryEntryEffectiveDate(entry) {
  if (!entry) return '';
  const d = String(entry.effectiveDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = String(entry.effectiveMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) return `${m}-01`;
  return '';
}

/**
 * Normalize and sort salary history oldest → newest by effective date.
 * @param {Array} salaryHistory
 * @returns {Array<{ previousAmount: number, amount: number, effectiveDate: string, effectiveMonth: string }>}
 */
export function normalizeSalaryHistory(salaryHistory = []) {
  return (salaryHistory || [])
    .map((entry) => {
      const effectiveDate = salaryEntryEffectiveDate(entry);
      if (!effectiveDate) return null;
      return {
        previousAmount: Number(entry.previousAmount) || 0,
        amount: Number(entry.amount) || 0,
        effectiveDate,
        effectiveMonth: String(entry.effectiveMonth || effectiveDate.slice(0, 7)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

/**
 * Gross salary that applies on a specific calendar date.
 * @param {Array} salaryHistory
 * @param {string} dateYmd YYYY-MM-DD
 * @param {number} fallbackGross
 * @returns {number}
 */
export function resolveSalaryOnDate(salaryHistory, dateYmd, fallbackGross = 0) {
  const entries = normalizeSalaryHistory(salaryHistory);
  const date = String(dateYmd || '');
  if (!date) return Number(fallbackGross) || 0;

  let applicable = null;
  for (const entry of entries) {
    if (entry.effectiveDate <= date) applicable = entry;
    else break;
  }

  if (applicable) return Number(applicable.amount) || 0;

  const upcoming = entries.find((e) => e.effectiveDate > date);
  if (upcoming && Number.isFinite(Number(upcoming.previousAmount))) {
    return Number(upcoming.previousAmount) || 0;
  }

  return Number(fallbackGross) || 0;
}

/**
 * Prorate monthly gross from salaryHistory using calendar days.
 *
 * @param {object} params
 * @param {string} params.monthPrefix YYYY-MM
 * @param {number} params.daysInMonth
 * @param {Array} params.salaryHistory
 * @param {number} [params.fallbackGross] used when history cannot resolve a rate
 * @returns {{
 *   gross: number,
 *   isProrated: boolean,
 *   nominalGross: number,
 *   effectiveDate: string|null,
 *   previousAmount: number|null,
 *   newAmount: number|null,
 *   daysBefore: number,
 *   daysFromEffective: number,
 * }}
 */
export function calculateProratedMonthlyGross({
  monthPrefix,
  daysInMonth,
  salaryHistory = [],
  fallbackGross = 0,
}) {
  const days = Math.max(1, Number(daysInMonth) || 30);
  const month = String(monthPrefix || '');
  const fallback = Number(fallbackGross) || 0;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return {
      gross: fallback,
      isProrated: false,
      nominalGross: fallback,
      effectiveDate: null,
      previousAmount: null,
      newAmount: null,
      daysBefore: 0,
      daysFromEffective: days,
    };
  }

  const entries = normalizeSalaryHistory(salaryHistory);
  const raisesInMonth = entries.filter((e) => e.effectiveMonth === month);

  let total = 0;
  for (let day = 1; day <= days; day += 1) {
    const dateYmd = `${month}-${String(day).padStart(2, '0')}`;
    const amount = resolveSalaryOnDate(entries, dateYmd, fallback);
    total += amount / days;
  }

  const gross = Number(total.toFixed(2));
  const lastDay = `${month}-${String(days).padStart(2, '0')}`;
  const nominalGross = resolveSalaryOnDate(entries, lastDay, fallback);

  const midMonthRaise = raisesInMonth.find((e) => {
    const dayNum = Number(e.effectiveDate.slice(8, 10));
    return dayNum > 1 && Number(e.amount) !== Number(e.previousAmount);
  });

  if (!midMonthRaise) {
    return {
      gross: Number((nominalGross || fallback).toFixed(2)),
      isProrated: false,
      nominalGross: Number((nominalGross || fallback).toFixed(2)),
      effectiveDate: raisesInMonth[0]?.effectiveDate || null,
      previousAmount: raisesInMonth[0] != null ? raisesInMonth[0].previousAmount : null,
      newAmount: raisesInMonth[0] != null ? raisesInMonth[0].amount : null,
      daysBefore: 0,
      daysFromEffective: days,
    };
  }

  const effectiveDay = Number(midMonthRaise.effectiveDate.slice(8, 10));
  const daysBefore = Math.max(0, effectiveDay - 1);
  const daysFromEffective = Math.max(0, days - daysBefore);

  return {
    gross,
    isProrated: true,
    nominalGross: Number(midMonthRaise.amount) || nominalGross,
    effectiveDate: midMonthRaise.effectiveDate,
    previousAmount: Number(midMonthRaise.previousAmount) || 0,
    newAmount: Number(midMonthRaise.amount) || 0,
    daysBefore,
    daysFromEffective,
  };
}
