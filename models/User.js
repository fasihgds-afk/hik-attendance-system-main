// next-app/models/User.js
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['HR', 'EMPLOYEE', 'ADMIN'],
      required: true,
      index: true, // Index for role-based queries
    },
    // Module-level CRUD permissions (HR portal). ADMIN ignores this (full access).
    // Mixed so new modules (e.g. breakMonitoring) persist without schema recompile issues.
    // Legacy HR users with no permissions are treated as full access at runtime.
    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    // (optional but very useful)
    employeeEmpCode: {
      type: String, // same code as in Employee.empCode
      index: true,
    },
    /** When false, login is blocked (e.g. employee deactivated). */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// ✅ PERFORMANCE: Additional indexes for common query patterns
// Composite index for role + email lookups (common in auth)
UserSchema.index({ role: 1, email: 1 });

// Index for employee code lookups (for employee authentication)
UserSchema.index({ employeeEmpCode: 1, role: 1 });

// Drop cached model so schema changes (permissions Mixed) apply after hot reload / restart
if (mongoose.models.User) {
  delete mongoose.models.User;
}
if (mongoose.modelSchemas?.User) {
  delete mongoose.modelSchemas.User;
}

export default mongoose.model('User', UserSchema);
