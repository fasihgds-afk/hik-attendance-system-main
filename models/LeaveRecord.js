// models/LeaveRecord.js
import mongoose from 'mongoose';

const LeaveRecordSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
      index: true,
    },
    leaveType: {
      type: String,
      enum: ['casual', 'annual'],
      required: true,
    },
    reason: {
      type: String,
      default: '',
    },
    markedBy: {
      type: String, // HR user who marked the leave
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookups by empCode and date
LeaveRecordSchema.index({ empCode: 1, date: 1 }, { unique: true });

// Index for date range queries
LeaveRecordSchema.index({ date: 1 });

// Index for year-based queries (for yearly reports)
LeaveRecordSchema.index({ empCode: 1, date: 1 });

const LeaveRecord = mongoose.models.LeaveRecord || mongoose.model('LeaveRecord', LeaveRecordSchema);

export default LeaveRecord;
