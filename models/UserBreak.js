// models/UserBreak.js
// Break sessions written by the .NET break desktop app → collection UserBreaks
import mongoose from 'mongoose';

const UserBreakSchema = new mongoose.Schema(
  {
    EmpCode: { type: String, required: true, index: true, trim: true },
    ShiftId: { type: String, default: '', index: true },
    BreakTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'BreakType', index: true },
    BreakStartTime: { type: Date, required: true, index: true },
    BreakEndTime: { type: Date, default: null },
    TotalMinutes: { type: Number, default: null },
    Comment: { type: String, default: '' },
    Status: { type: String, default: '', index: true },
  },
  {
    collection: 'UserBreaks',
    timestamps: false,
  }
);

UserBreakSchema.index({ EmpCode: 1, BreakStartTime: -1 });
UserBreakSchema.index({ Status: 1, BreakStartTime: -1 });

const UserBreak = mongoose.models.UserBreak || mongoose.model('UserBreak', UserBreakSchema);
export default UserBreak;
