// models/MonthlySheetSnapshot.js
// One document per month: full compacted employee×day sheet for fast HR monthly opens.
import mongoose from 'mongoose';

const MonthlySheetSnapshotSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true, index: true }, // YYYY-MM
    daysInMonth: { type: Number, required: true },
    companyTodayYmd: { type: String, default: '' }, // used to detect "today" roll for current month
    employeeCount: { type: Number, default: 0 },
    // Full compactMonthlyEmployee payloads (including days[])
    employees: { type: [mongoose.Schema.Types.Mixed], default: [] },
    computedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.MonthlySheetSnapshot ||
  mongoose.model('MonthlySheetSnapshot', MonthlySheetSnapshotSchema);
