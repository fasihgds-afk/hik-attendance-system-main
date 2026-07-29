// models/CompanySettings.js
// Single global company settings document (configId: 'default').
// All fields default to the values that were previously hardcoded, so introducing
// this model changes NO behavior until a value is explicitly edited by HR.
import mongoose from 'mongoose';

const CompanySettingsSchema = new mongoose.Schema(
  {
    configId: { type: String, required: true, unique: true, default: 'default' },

    // Company timezone offset, e.g. "+05:00". Previously hardcoded across the codebase.
    timezoneOffset: { type: String, default: '+05:00', trim: true },

    // Business-day rollover cutoff (company-local HH:MM). Previously hardcoded "08:55".
    businessDayCutoff: { type: String, default: '08:55', trim: true },

    // Weekly off days as day-of-week numbers (0 = Sunday … 6 = Saturday).
    // Default [0] preserves "Sunday is always off". Saturday handled by department policy.
    weeklyOffDays: { type: [Number], default: [0] },

    // Night-shift checkout boundary (company-local HH:MM). Previously hardcoded "08:00".
    nightCheckoutCutoff: { type: String, default: '08:00', trim: true },

    // Which calendar day a cross-midnight (night) shift's off-day is anchored to.
    // 'start' = the shift that STARTS on the off weekday is off (current behavior).
    nightShiftOffAnchor: { type: String, enum: ['start', 'end'], default: 'start' },

    // How working-days-per-month is computed for per-day salary.
    // 'legacy' = daysInMonth - 6 (current behavior, preserved by default).
    // 'actual' = count real off days; 'fixed' = use fixedDaysPerMonth.
    workingDaysMode: { type: String, enum: ['legacy', 'actual', 'fixed'], default: 'legacy' },
    fixedDaysPerMonth: { type: Number, default: 26, min: 1, max: 31 },

    currency: { type: String, default: 'PKR', trim: true },

    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

const CompanySettings =
  mongoose.models.CompanySettings || mongoose.model('CompanySettings', CompanySettingsSchema);

export default CompanySettings;
