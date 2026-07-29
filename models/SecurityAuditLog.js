import mongoose from 'mongoose';

const SecurityAuditLogSchema = new mongoose.Schema(
  {
    actorRole: { type: String, default: 'SYSTEM', index: true },
    actorId: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    target: { type: String, default: '' },
    status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true, index: true },
    ip: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

SecurityAuditLogSchema.index({ createdAt: -1, action: 1 });

export default mongoose.models.SecurityAuditLog || mongoose.model('SecurityAuditLog', SecurityAuditLogSchema);
