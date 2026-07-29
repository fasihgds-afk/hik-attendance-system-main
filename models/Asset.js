// models/Asset.js — IT inventory: laptops, PCs, monitors, accessories
import mongoose from 'mongoose';

export const ASSET_TYPES = [
  'laptop',
  'desktop',
  'monitor',
  'keyboard',
  'mouse',
  'headset',
  'charger',
  'dock',
  'phone',
  'other',
];

export const ASSET_STATUSES = ['in_stock', 'assigned', 'repair', 'retired'];

export const ASSET_CONDITIONS = ['new', 'good', 'fair', 'poor'];

/** Types that use processor / RAM / ROM specs */
export const COMPUTE_ASSET_TYPES = ['laptop', 'desktop'];

/** Types that show brand name */
export const BRAND_ASSET_TYPES = ['laptop', 'desktop', 'monitor'];

/** Types that can be added in bulk (quantity) */
export const BULK_ASSET_TYPES = ['keyboard', 'mouse', 'charger'];

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
    /** Specs for laptop / desktop */
    processor: { type: String, default: '', trim: true },
    ram: { type: String, default: '', trim: true },
    rom: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    serialNumber: { type: String, default: '', trim: true },
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
    notes: { type: String, default: '', trim: true },
    assignedToEmpCode: { type: String, default: null, index: true },
    assignedToName: { type: String, default: '' },
    assignedAt: { type: Date },
    assignedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

AssetSchema.index({ status: 1, type: 1 });
AssetSchema.index({ assignedToEmpCode: 1, status: 1 });

/** Human-readable label from type-specific fields */
export function formatAssetLabel(asset) {
  if (!asset) return '';
  if (COMPUTE_ASSET_TYPES.includes(asset.type)) {
    const parts = [
      asset.brand || null,
      asset.assetTag,
      asset.processor ? `CPU ${asset.processor}` : null,
      asset.ram ? `RAM ${asset.ram}` : null,
      asset.rom ? `ROM ${asset.rom}` : null,
    ].filter(Boolean);
    return parts.join(' / ') || asset.assetTag;
  }
  if (asset.type === 'monitor') {
    return [asset.brand, asset.assetTag, asset.notes].filter(Boolean).join(' · ') || asset.assetTag;
  }
  return [asset.brand, asset.assetTag, asset.type, asset.notes].filter(Boolean).join(' · ');
}

const Asset = mongoose.models.Asset || mongoose.model('Asset', AssetSchema);
export default Asset;
