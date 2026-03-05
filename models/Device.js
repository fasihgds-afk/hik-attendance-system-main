import mongoose from 'mongoose';

const DeviceSchema = new mongoose.Schema(
  {
    empCode: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    deviceToken: { type: String, required: true },
    hostName: { type: String, default: '' },
    os: { type: String, default: '' },
    appVersion: { type: String, default: '' },
    currentStatus: {
      type: String,
      enum: ['ACTIVE', 'IDLE', 'BREAK', 'SUSPICIOUS', 'OFFLINE'],
      default: 'OFFLINE',
      index: true
    },
    suspiciousActive: { type: Boolean, default: false, index: true },
    lastSeenAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

DeviceSchema.index({ empCode: 1, deviceId: 1 }, { unique: true });

export default mongoose.models.Device || mongoose.model('Device', DeviceSchema);
