import mongoose from 'mongoose';

const AgentActivityLogSchema = new mongoose.Schema(
  {
    empCode: { type: String, required: true, index: true },
    type: { type: String, required: true }, // session_start | break | lock | idle | violation
    sessionStart: { type: Date },
    totalIdle: { type: Number, default: 0 },
    reason: { type: String, default: '' },
    category: { type: String, default: '' },
    timestamp: { type: Date, required: true, index: true },
    deviceId: { type: String, default: '' },
    raw: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

AgentActivityLogSchema.index({ empCode: 1, timestamp: -1 });

export default mongoose.models.AgentActivityLog || mongoose.model('AgentActivityLog', AgentActivityLogSchema);
