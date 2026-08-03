/**
 * Mid-month salary change proration (raises or decreases).
 *
 * Accuracy model (any salary amounts):
 * 1. Resolve the contractual monthly rate that applies on each day from salaryHistory.
 * 2. Prefer working days when provided (same offs as monthly attendance).
 * 3. Payable gross = average of those rates over the day set:
 *      sum(rateOnDay) / dayCount
 *    Equivalent to sharing the month across rate segments; a single rate
 *    all month always equals that full monthly salary.
 *
 * Falls back to calendar days when workingDates is omitted.
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

function toMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function changedAtMs(entry) {
  if (!entry?.changedAt) return 0;
  const t = new Date(entry.changedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Normalize salary history:
 * - drop invalid rows
 * - for the same effectiveDate, keep the latest changedAt (last write wins)
 * - sort oldest → newest by effectiveDate
 *
 * @param {Array} salaryHistory
 * @returns {Array<{ previousAmount: number, amount: number, effectiveDate: string, effectiveMonth: string, changedAt: number }>}
 */
export function normalizeSalaryHistory(salaryHistory = []) {
  const byDate = new Map();

  (salaryHistory || []).forEach((entry, index) => {
    const effectiveDate = salaryEntryEffectiveDate(entry);
    if (!effectiveDate) return;
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) return;

    const normalized = {
      previousAmount: Number(entry.previousAmount),
      amount,
      effectiveDate,
      effectiveMonth: String(entry.effectiveMonth || effectiveDate.slice(0, 7)),
      changedAt: changedAtMs(entry) || index,
    };
    if (!Number.isFinite(normalized.previousAmount)) {
      normalized.previousAmount = 0;
    }

    const existing = byDate.get(effectiveDate);
    if (!existing || normalized.changedAt >= existing.changedAt) {
      byDate.set(effectiveDate, normalized);
    }
  });

  return [...byDate.values()].sort((a, b) => {
    const byEff = a.effectiveDate.localeCompare(b.effectiveDate);
    if (byEff !== 0) return byEff;
    return a.changedAt - b.changedAt;
  });
}

/**
 * Gross monthly rate that applies on a specific calendar date.
 * @param {Array} salaryHistory - raw or already-normalized
 * @param {string} dateYmd YYYY-MM-DD
 * @param {number} fallbackGross
 * @returns {number}
 */
export function resolveSalaryOnDate(salaryHistory, dateYmd, fallbackGross = 0) {
  const entries = normalizeSalaryHistory(salaryHistory);
  const date = String(dateYmd || '');
  const fallback = toMoney(fallbackGross);
  if (!date) return fallback;

  let applicable = null;
  for (const entry of entries) {
    if (entry.effectiveDate <= date) applicable = entry;
    else break;
  }

  if (applicable) return toMoney(applicable.amount);

  const upcoming = entries.find((e) => e.effectiveDate > date);
  if (upcoming && Number.isFinite(Number(upcoming.previousAmount))) {
    return toMoney(upcoming.previousAmount);
  }

  return fallback;
}

function emptyResult(fallback, daysFromEffective = 0, basis = 'calendar') {
  const gross = toMoney(fallback);
  return {
    gross,
    isProrated: false,
    nominalGross: gross,
    effectiveDate: null,
    previousAmount: null,
    newAmount: null,
    daysBefore: 0,
    daysFromEffective,
    basis,
    rateSegments: [],
  };
}

/**
 * Build ordered unique day list for the month (working days or calendar).
 */
function buildDayList(month, daysInMonth, workingDates) {
  const workList = Array.isArray(workingDates)
    ? [...new Set(workingDates.filter((d) => typeof d === 'string' && d.startsWith(month)))].sort()
    : null;

  if (workList && workList.length > 0) {
    return { dayList: workList, basis: 'working' };
  }

  const calendar = [];
  const days = Math.max(1, Number(daysInMonth) || 30);
  for (let day = 1; day <= days; day += 1) {
    calendar.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return { dayList: calendar, basis: 'calendar' };
}

/**
 * Collapse consecutive same-rate days into segments for UI / debugging.
 */
function buildRateSegments(dayList, rates) {
  const segments = [];
  for (let i = 0; i < dayList.length; i += 1) {
    const rate = rates[i];
    const last = segments[segments.length - 1];
    if (last && last.rate === rate) {
      last.days += 1;
      last.toDate = dayList[i];
    } else {
      segments.push({
        rate,
        days: 1,
        fromDate: dayList[i],
        toDate: dayList[i],
      });
    }
  }
  return segments;
}

/**
 * Prorate monthly gross from salaryHistory for any salary amounts.
 *
 * @param {object} params
 * @param {string} params.monthPrefix YYYY-MM
 * @param {number} params.daysInMonth
 * @param {Array} params.salaryHistory
 * @param {number} [params.fallbackGross]
 * @param {string[]} [params.workingDates] YYYY-MM-DD working days in the month
 */
export function calculateProratedMonthlyGross({
  monthPrefix,
  daysInMonth,
  salaryHistory = [],
  fallbackGross = 0,
  workingDates = null,
}) {
  const days = Math.max(1, Number(daysInMonth) || 30);
  const month = String(monthPrefix || '');
  const fallback = toMoney(fallbackGross);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return emptyResult(fallback, days);
  }

  const entries = normalizeSalaryHistory(salaryHistory);
  const { dayList, basis } = buildDayList(month, days, workingDates);
  const dayCount = dayList.length;

  if (dayCount === 0) {
    return emptyResult(fallback, 0, basis);
  }

  const rates = dayList.map((dateYmd) => resolveSalaryOnDate(entries, dateYmd, fallback));
  const sumRates = rates.reduce((acc, r) => acc + r, 0);
  const gross = toMoney(sumRates / dayCount);

  const lastDay = `${month}-${String(days).padStart(2, '0')}`;
  const nominalGross = toMoney(resolveSalaryOnDate(entries, lastDay, fallback));
  const startRate = rates[0];
  const endRate = rates[rates.length - 1];
  const uniqueRates = [...new Set(rates)];
  const isProrated = uniqueRates.length > 1;

  const rateSegments = buildRateSegments(dayList, rates);

  // First day in the month set where rate differs from the opening rate
  let changeIndex = rates.findIndex((r) => r !== startRate);
  if (changeIndex < 0) changeIndex = 0;
  const effectiveDate = isProrated ? dayList[changeIndex] : (entries.find((e) => e.effectiveMonth === month)?.effectiveDate || null);
  const daysBefore = isProrated ? changeIndex : 0;
  const daysFromEffective = isProrated ? dayCount - changeIndex : dayCount;

  // Prefer history row on the change date for from/to labels; else use resolved rates
  const changeEntry = isProrated
    ? entries.find((e) => e.effectiveDate === effectiveDate)
      || entries.find((e) => e.effectiveMonth === month && e.effectiveDate <= effectiveDate)
    : entries.find((e) => e.effectiveMonth === month) || null;

  return {
    gross,
    isProrated,
    nominalGross,
    effectiveDate,
    previousAmount: isProrated ? startRate : (changeEntry != null ? toMoney(changeEntry.previousAmount) : null),
    newAmount: isProrated ? endRate : (changeEntry != null ? toMoney(changeEntry.amount) : null),
    daysBefore,
    daysFromEffective,
    basis,
    rateSegments,
  };
}
