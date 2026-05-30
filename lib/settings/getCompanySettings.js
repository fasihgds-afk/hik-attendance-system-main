// lib/settings/getCompanySettings.js
// Returns the single company settings document, creating defaults if none exists.
// Includes a short in-process cache with explicit invalidation on write.
import { connectDB } from '../db';
import CompanySettings from '../../models/CompanySettings';

export const DEFAULT_COMPANY_SETTINGS = {
  timezoneOffset: '+05:00',
  businessDayCutoff: '08:55',
  weeklyOffDays: [0],
  nightCheckoutCutoff: '08:00',
  nightShiftOffAnchor: 'start',
  workingDaysMode: 'legacy',
  fixedDaysPerMonth: 26,
  currency: 'PKR',
};

const CACHE_TTL_MS = 60 * 1000;
let _cache = null;
let _cacheAt = 0;

function normalize(doc) {
  return {
    timezoneOffset: doc.timezoneOffset ?? DEFAULT_COMPANY_SETTINGS.timezoneOffset,
    businessDayCutoff: doc.businessDayCutoff ?? DEFAULT_COMPANY_SETTINGS.businessDayCutoff,
    weeklyOffDays: Array.isArray(doc.weeklyOffDays) && doc.weeklyOffDays.length
      ? doc.weeklyOffDays
      : DEFAULT_COMPANY_SETTINGS.weeklyOffDays,
    nightCheckoutCutoff: doc.nightCheckoutCutoff ?? DEFAULT_COMPANY_SETTINGS.nightCheckoutCutoff,
    nightShiftOffAnchor: doc.nightShiftOffAnchor ?? DEFAULT_COMPANY_SETTINGS.nightShiftOffAnchor,
    workingDaysMode: doc.workingDaysMode ?? DEFAULT_COMPANY_SETTINGS.workingDaysMode,
    fixedDaysPerMonth: doc.fixedDaysPerMonth ?? DEFAULT_COMPANY_SETTINGS.fixedDaysPerMonth,
    currency: doc.currency ?? DEFAULT_COMPANY_SETTINGS.currency,
  };
}

/** Invalidate the in-process cache (call after any settings write). */
export function invalidateCompanySettingsCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Get company settings (cached). Creates the default document if none exists.
 * Always returns a fully-populated object with safe fallbacks.
 */
export async function getCompanySettings({ fresh = false } = {}) {
  if (!fresh && _cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache;
  }
  try {
    await connectDB();
    let doc = await CompanySettings.findOne({ configId: 'default' }).lean().maxTimeMS(2000);
    if (!doc) {
      // Seed timezone from the existing env config so introducing this model
      // does not change the company's current timezone behavior.
      const seed = {
        ...DEFAULT_COMPANY_SETTINGS,
        timezoneOffset: process.env.TIMEZONE_OFFSET || DEFAULT_COMPANY_SETTINGS.timezoneOffset,
      };
      const created = await CompanySettings.create({ configId: 'default', ...seed });
      doc = created.toObject ? created.toObject() : created;
    }
    _cache = normalize(doc);
    _cacheAt = Date.now();
    return _cache;
  } catch {
    // Never let settings lookup break a request — fall back to defaults.
    return { ...DEFAULT_COMPANY_SETTINGS };
  }
}
