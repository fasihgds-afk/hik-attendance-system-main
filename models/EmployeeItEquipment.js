// models/EmployeeItEquipment.js
// One row per employee — matches IT sheet: laptop + IP + accessories + extras
import mongoose from 'mongoose';

export const WORK_LOCATIONS = ['Work From Office', 'Work From Home', 'Hybrid', 'Other'];

const EmployeeItEquipmentSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    employeeName: { type: String, default: '', trim: true },
    department: { type: String, default: '', trim: true },
    /** Device login / local password (IT-only). Optional. */
    devicePassword: { type: String, default: '', trim: true },
    /** Free-text laptop / PC description (e.g. Dell Latitude E5470-I5 6gen/8GB/128GB) */
    laptop: { type: String, default: '', trim: true },
    /** Linked inventory asset (optional) */
    laptopAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      default: null,
    },
    ip: { type: String, default: '', trim: true },
    workLocation: {
      type: String,
      default: 'Work From Office',
      trim: true,
    },
    headphone: { type: Boolean, default: false },
    mouse: { type: Boolean, default: false },
    keyboard: { type: Boolean, default: false },
    monitor: { type: Boolean, default: false },
    /** Free-text: dock, webcam, other odds and ends */
    extraEquipment: { type: String, default: '', trim: true },
    /** e.g. Admin rights, software install permission */
    laptopPermission: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

EmployeeItEquipmentSchema.index({ employeeName: 1 });
EmployeeItEquipmentSchema.index({ department: 1 });

const EmployeeItEquipment =
  mongoose.models.EmployeeItEquipment ||
  mongoose.model('EmployeeItEquipment', EmployeeItEquipmentSchema);

export default EmployeeItEquipment;
