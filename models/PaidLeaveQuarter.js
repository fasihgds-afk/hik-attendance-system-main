// models/PaidLeaveQuarter.js
// Quarter-based paid leave with restricted carry-forward:
// - Q1 remaining can carry to Q2
// - Q3 remaining can carry to Q4
// - No carry-forward to next year
import mongoose from 'mongoose';
import { LEAVES_PER_QUARTER } from '../lib/leave/quarterUtils';

const PaidLeaveQuarterSchema = new mongoose.Schema(
  {
    empCode: { type: String, required: true, index: true },
    year: { type: Number, required: true, index: true },
    quarter: { type: Number, required: true, min: 1, max: 4, index: true },
    leavesAllocated: { type: Number, default: LEAVES_PER_QUARTER, min: 0 },
    leavesTaken: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

PaidLeaveQuarterSchema.index({ empCode: 1, year: 1, quarter: 1 }, { unique: true });

PaidLeaveQuarterSchema.virtual('leavesRemaining').get(function () {
  return Math.max(0, (this.leavesAllocated || 0) - (this.leavesTaken || 0));
});

PaidLeaveQuarterSchema.set('toJSON', { virtuals: true });
PaidLeaveQuarterSchema.set('toObject', { virtuals: true });

/**
 * @param {string} empCode
 * @param {number} year
 * @param {number} quarter
 * @param {number} [leavesPerQuarter] - Optional; from LeavePolicy. If omitted, uses LEAVES_PER_QUARTER.
 * @param {import('mongoose').ClientSession} [session] - Optional; for use inside a transaction.
 */
PaidLeaveQuarterSchema.statics.getOrCreate = async function (empCode, year, quarter, leavesPerQuarter, session) {
  const allocated = leavesPerQuarter != null ? leavesPerQuarter : LEAVES_PER_QUARTER;
  const query = this.findOne({ empCode, year, quarter });
  if (session) query.session(session);
  let doc = await query.exec();
  if (!doc) {
    const opts = session ? { session } : {};
    const created = await this.create(
      [{ empCode, year, quarter, leavesAllocated: allocated, leavesTaken: 0 }],
      opts
    );
    doc = Array.isArray(created) ? created[0] : created;
  }
  return doc;
};

/**
 * Effective allocation for a quarter under carry-forward rules:
 * - Q1 -> Q2 allowed
 * - Q3 -> Q4 allowed
 * - No carry-forward to next year
 *
 * @param {string} empCode
 * @param {number} year
 * @param {number} quarter
 * @param {number} [leavesPerQuarter]
 * @param {import('mongoose').ClientSession} [session]
 * @returns {Promise<number>}
 */
PaidLeaveQuarterSchema.statics.getMaxAllowedForQuarter = async function (
  empCode,
  year,
  quarter,
  leavesPerQuarter,
  session
) {
  const base = leavesPerQuarter != null ? leavesPerQuarter : LEAVES_PER_QUARTER;

  // Carry is only allowed from Q1->Q2 and Q3->Q4 in the same year.
  let sourceQuarter = null;
  if (quarter === 2) sourceQuarter = 1;
  if (quarter === 4) sourceQuarter = 3;
  if (sourceQuarter == null) return base;

  const sourceQuery = this.findOne({ empCode, year, quarter: sourceQuarter });
  if (session) sourceQuery.session(session);
  const sourceDoc = await sourceQuery.exec();

  // No source record means no leave taken in source quarter yet -> full base carry.
  if (!sourceDoc) return base + base;

  const sourceAllocated = sourceDoc.leavesAllocated != null ? sourceDoc.leavesAllocated : base;
  const sourceTaken = sourceDoc.leavesTaken || 0;
  const carryForward = Math.max(0, sourceAllocated - sourceTaken);
  return base + carryForward;
};

const PaidLeaveQuarter = mongoose.models.PaidLeaveQuarter || mongoose.model('PaidLeaveQuarter', PaidLeaveQuarterSchema);
export default PaidLeaveQuarter;
