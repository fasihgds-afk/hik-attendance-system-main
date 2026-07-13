// models/Asset.js — IT inventory: laptops, PCs, monitors, accessories
import mongoose from 'mongoose';

export const ASSET_TYPES = [
  'laptop',
  'desktop',
  'monitor',
  'keyboard',
  'mouse',
  'headset',
  'dock',
  'phone',
  'other',
];

export const ASSET_STATUSES = ['in_stock', 'assigned', 'repair', 'retired'];

export const ASSET_CONDITIONS = ['new', 'good', 'fair', 'poor'];

const AssetSchema = new mongoose.Schema(
  {
    assetTag: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ASSET_TYPES,
      index: true,
    },
    brand: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    serialNumber: { type: String, default: '', trim: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ASSET_STATUSES,
      default: 'in_stock',
      index: true,
    },
    condition: {
      type: String,
      enum: ASSET_CONDITIONS,
      default: 'good',
    },
    purchaseDate: { type: Date },
    warrantyExpiry: { type: Date },
    notes: { type: String, default: '', trim: true },
    /** Currently assigned employee (null when in stock / retired / repair without holder) */
    assignedToEmpCode: { type: String, default: null, index: true },
    assignedToName: { type: String, default: '' },
    assignedAt: { type: Date },
    assignedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

AssetSchema.index({ status: 1, type: 1 });
AssetSchema.index({ assignedToEmpCode: 1, status: 1 });

const Asset = mongoose.models.Asset || mongoose.model('Asset', AssetSchema);
export default Asset;
