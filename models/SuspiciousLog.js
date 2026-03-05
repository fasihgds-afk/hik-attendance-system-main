import mongoose from 'mongoose';

const SuspiciousLogSchema = new mongoose.Schema(
  {
    empCode: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
    startedAt: { type: Date, required: true, index: true },
    endedAt: { type: Date, default: null },
    durationMin: { type: Number, default: 0 },
    source: { type: String, default: 'autoclicker' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

SuspiciousLogSchema.index({ empCode: 1, startedAt: -1 });

export default mongoose.models.SuspiciousLog ||
  mongoose.model('SuspiciousLog', SuspiciousLogSchema);
