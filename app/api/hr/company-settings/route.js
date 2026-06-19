// app/api/hr/company-settings/route.js
// Read and update the single company settings document (HR/ADMIN only).
import { connectDB } from '../../../../lib/db';
import CompanySettings from '../../../../models/CompanySettings';
import { getCompanySettings, invalidateCompanySettingsCache, DEFAULT_COMPANY_SETTINGS } from '../../../../lib/settings/getCompanySettings';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { requireHR } from '../../../../lib/auth/requireAuth';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const OFFSET_RE = /^[+-](0\d|1[0-4]):([0-5]\d)$/;

function validateUpdate(body) {
  const update = {};

  if (body.timezoneOffset !== undefined) {
    const v = String(body.timezoneOffset).trim();
    if (!OFFSET_RE.test(v)) throw new ValidationError('timezoneOffset must look like "+05:00"');
    update.timezoneOffset = v;
  }
  if (body.businessDayCutoff !== undefined) {
    const v = String(body.businessDayCutoff).trim();
    if (!TIME_RE.test(v)) throw new ValidationError('businessDayCutoff must be HH:MM (24h)');
    update.businessDayCutoff = v;
  }
  if (body.nightCheckoutCutoff !== undefined) {
    const v = String(body.nightCheckoutCutoff).trim();
    if (!TIME_RE.test(v)) throw new ValidationError('nightCheckoutCutoff must be HH:MM (24h)');
    update.nightCheckoutCutoff = v;
  }
  if (body.weeklyOffDays !== undefined) {
    if (!Array.isArray(body.weeklyOffDays)) throw new ValidationError('weeklyOffDays must be an array');
    const days = [...new Set(body.weeklyOffDays.map((d) => Number(d)))];
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new ValidationError('weeklyOffDays must contain integers 0-6 (0=Sunday)');
    }
    update.weeklyOffDays = days;
  }
  if (body.nightShiftOffAnchor !== undefined) {
    const v = String(body.nightShiftOffAnchor);
    if (!['start', 'end'].includes(v)) throw new ValidationError('nightShiftOffAnchor must be "start" or "end"');
    update.nightShiftOffAnchor = v;
  }
  if (body.workingDaysMode !== undefined) {
    const v = String(body.workingDaysMode);
    if (!['legacy', 'actual', 'fixed'].includes(v)) throw new ValidationError('workingDaysMode must be legacy|actual|fixed');
    update.workingDaysMode = v;
  }
  if (body.fixedDaysPerMonth !== undefined) {
    const v = Number(body.fixedDaysPerMonth);
    if (!Number.isFinite(v) || v < 1 || v > 31) throw new ValidationError('fixedDaysPerMonth must be 1-31');
    update.fixedDaysPerMonth = v;
  }
  if (body.currency !== undefined) {
    const v = String(body.currency).trim();
    if (!v || v.length > 8) throw new ValidationError('currency must be 1-8 characters');
    update.currency = v;
  }

  return update;
}

// GET /api/hr/company-settings - current settings (creates defaults if missing)
export async function GET() {
  try {
    await requireHR();
    const settings = await getCompanySettings({ fresh: true });
    return successResponse({ settings }, 'Company settings retrieved', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err);
  }
}

// PATCH /api/hr/company-settings - update one or more settings fields
export async function PATCH(req) {
  try {
    const { user } = await requireHR();
    await connectDB();
    const body = await req.json();
    const update = validateUpdate(body);

    if (Object.keys(update).length === 0) {
      throw new ValidationError('No valid settings fields provided');
    }
    update.updatedBy = user?.email || user?.name || 'unknown';

    // Ensure the singleton document exists (creates defaults if missing).
    // Avoid upsert with overlapping $set + $setOnInsert fields — MongoDB rejects that on insert (500).
    await getCompanySettings({ fresh: true });

    let doc = await CompanySettings.findOneAndUpdate(
      { configId: 'default' },
      { $set: update },
      { new: true, runValidators: true }
    ).lean().maxTimeMS(2000);

    if (!doc) {
      const seed = {
        ...DEFAULT_COMPANY_SETTINGS,
        timezoneOffset: process.env.TIMEZONE_OFFSET || DEFAULT_COMPANY_SETTINGS.timezoneOffset,
        ...update,
      };
      const created = await CompanySettings.create({ configId: 'default', ...seed });
      doc = created.toObject ? created.toObject() : created;
    }

    invalidateCompanySettingsCache();
    const settings = await getCompanySettings({ fresh: true });
    return successResponse({ settings, _raw: doc }, 'Company settings updated', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
