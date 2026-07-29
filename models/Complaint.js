// models/Complaint.js
// Employee complaint: category, subject, description; HR response and internal note
import mongoose from 'mongoose';

const CATEGORIES = ['salary_increment', 'leave', 'attendance', 'work_environment', 'hr_policy', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

const ComplaintSchema = new mongoose.Schema(
  {
    empCode: { type: String, required: true, index: true },
    employeeName: { type: String, default: '' },
    department: { type: String, default: '' },
    designation: { type: String, default: '' },
    category: { type: String, default: 'other', enum: CATEGORIES },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, required: true, enum: STATUSES, default: 'open' },
    hrResponse: { type: String, default: '' },
    hrRespondedAt: { type: Date },
    hrRespondedBy: { type: String, default: '' },
    internalNote: { type: String, default: '' },
  },
  { timestamps: true }
);

ComplaintSchema.index({ status: 1, createdAt: -1 });
ComplaintSchema.index({ empCode: 1, createdAt: -1 });
ComplaintSchema.index({ category: 1 });

const Complaint = mongoose.models.Complaint || mongoose.model('Complaint', ComplaintSchema);
export default Complaint;
export { CATEGORIES, STATUSES };
