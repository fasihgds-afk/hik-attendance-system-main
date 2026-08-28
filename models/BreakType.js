// models/BreakType.js
// Lookup collection written by the .NET break desktop app (Official / General / Namaz)
import mongoose from 'mongoose';

const BreakTypeSchema = new mongoose.Schema(
  {
    Name: { type: String, required: true, trim: true },
  },
  {
    collection: 'BreakType',
    timestamps: false,
  }
);

const BreakType = mongoose.models.BreakType || mongoose.model('BreakType', BreakTypeSchema);
export default BreakType;
