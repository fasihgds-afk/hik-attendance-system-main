import mongoose from 'mongoose';

const AttendanceSyncRequestSchema = new mongoose.Schema(
  {
    empCode: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    key: { type: String, required: true },
  },
  { timestamps: true }
);

AttendanceSyncRequestSchema.index({ empCode: 1, deviceId: 1, key: 1 }, { unique: true });
AttendanceSyncRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }); // 24h

export default mongoose.models.AttendanceSyncRequest ||
  mongoose.model('AttendanceSyncRequest', AttendanceSyncRequestSchema);
