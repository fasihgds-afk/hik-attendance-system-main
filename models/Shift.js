// models/Shift.js
import mongoose from 'mongoose';
import { DEFAULT_GRACE_PERIOD } from '../lib/shift/gracePeriods.js';

export {
  DEFAULT_GRACE_PERIOD,
  resolveShiftGracePeriods,
  mergeGraceFromBody,
  resolveGracePeriodsForCalendarDate,
  shiftWithGraceResolvedForDate,
} from '../lib/shift/gracePeriods.js';

const ShiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    startTime: {
      type: String,
      required: true,
      // Format: "HH:mm" (24-hour format, e.g., "09:00", "12:00", "18:00")
    },
    endTime: {
      type: String,
      required: true,
      // Format: "HH:mm" (24-hour format, e.g., "18:00", "21:00", "03:00")
    },
    crossesMidnight: {
      type: Boolean,
      default: false,
      // true if shift end time is next day (e.g., 18:00-03:00)
    },
    checkInGracePeriod: {
      type: Number,
      default: DEFAULT_GRACE_PERIOD,
      // Minutes after shift start still counted as on-time for arrival
    },
    checkOutGracePeriod: {
      type: Number,
      default: DEFAULT_GRACE_PERIOD,
      // Minutes before shift end still counted as on-time for departure (early-leave threshold)
    },
    /** @deprecated Use checkInGracePeriod / checkOutGracePeriod; kept for existing documents */
    gracePeriod: {
      type: Number,
    },
    /** First calendar day (YYYY-MM-DD) when current checkInGracePeriod / checkOutGracePeriod apply */
    graceEffectiveFrom: {
      type: String,
      trim: true,
    },
    /** Grace minutes before graceEffectiveFrom when no per-row snapshot exists */
    priorCheckInGracePeriod: { type: Number },
    priorCheckOutGracePeriod: { type: Number },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true }
);

// Index for quick lookups
// Note: 'code' already has an index from 'unique: true', so we don't need to define it again
ShiftSchema.index({ isActive: 1 });

export default mongoose.models.Shift ||
  mongoose.model('Shift', ShiftSchema);
