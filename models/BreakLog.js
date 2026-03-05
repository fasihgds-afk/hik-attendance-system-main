import mongoose from 'mongoose';

const BreakLogSchema = new mongoose.Schema(
  {
    empCode: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    category: { type: String, required: true }, // Official | General | Namaz
    reason: { type: String, required: true },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', index: true },

    breakStartAt: { type: Date, required: true, index: true },
    breakEndAt: { type: Date, default: null },

    shiftDate: { type: String, required: true, index: true }, // YYYY-MM-DD
    shiftCode: { type: String, required: true },
    shiftStartAt: { type: Date, required: true },
    shiftEndAt: { type: Date, required: true },

    durationMin: { type: Number, default: 0 },
    allowedDurationMin: { type: Number, default: 0 },
    exceededDurationMin: { type: Number, default: 0 }
  },
  { timestamps: true }
);

BreakLogSchema.index({ empCode: 1, shiftDate: 1, createdAt: -1 });

export default mongoose.models.BreakLog || mongoose.model('BreakLog', BreakLogSchema);
