// models/AssetAssignmentHistory.js — assign / return / transfer / repair trail
import mongoose from 'mongoose';

export const ASSET_HISTORY_ACTIONS = ['assign', 'return', 'transfer', 'repair', 'retire', 'restock'];

const AssetAssignmentHistorySchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
      index: true,
    },
    assetTag: { type: String, default: '', index: true },
    action: {
      type: String,
      required: true,
      enum: ASSET_HISTORY_ACTIONS,
    },
    empCode: { type: String, default: null, index: true },
    employeeName: { type: String, default: '' },
    fromEmpCode: { type: String, default: null },
    notes: { type: String, default: '' },
    performedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

AssetAssignmentHistorySchema.index({ assetId: 1, createdAt: -1 });

const AssetAssignmentHistory =
  mongoose.models.AssetAssignmentHistory ||
  mongoose.model('AssetAssignmentHistory', AssetAssignmentHistorySchema);

export default AssetAssignmentHistory;
