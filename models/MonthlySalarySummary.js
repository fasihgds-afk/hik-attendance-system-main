// models/MonthlySalarySummary.js
// Persisted per-employee monthly salary totals for fast salary reports.
import mongoose from 'mongoose';

const MonthlySalarySummarySchema = new mongoose.Schema(
  {
    month: { type: String, required: true, index: true }, // YYYY-MM
    empCode: { type: String, required: true, index: true },
    name: { type: String, default: '' },
    department: { type: String, default: '' },
    designation: { type: String, default: '' },
    shift: { type: String, default: '' },
    monthlySalary: { type: Number, default: 0 }, // payable gross
    recordedMonthlySalary: { type: Number, default: 0 },
    nominalMonthlySalary: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    salaryDeductAmount: { type: Number, default: 0 },
    lateCount: { type: Number, default: 0 },
    earlyCount: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    unpaidLeaveDays: { type: Number, default: 0 },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

MonthlySalarySummarySchema.index({ month: 1, empCode: 1 }, { unique: true });
MonthlySalarySummarySchema.index({ month: 1, department: 1 });

export default mongoose.models.MonthlySalarySummary ||
  mongoose.model('MonthlySalarySummary', MonthlySalarySummarySchema);
