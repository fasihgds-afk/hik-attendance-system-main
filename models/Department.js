import mongoose from 'mongoose';

/**
 * Department model – optional config for weekend/Saturday policy.
 * Used by monthly attendance to decide if a Saturday is off for employees in this department.
 *
 * saturdayPolicy:
 * - 'all_off'   → Every Saturday is off for this department.
 * - 'alternate' → Alternate Saturdays: use employee's saturdayGroup (A = 1st & 3rd Sat off, B = 2nd & 4th Sat off).
 *
 * fifthSaturdayPolicy (used when saturdayPolicy='alternate'):
 * - 'working_all'     → 5th Saturday is working for all employees.
 * - 'off_all'         → 5th Saturday is off for all employees.
 * - 'group_alternate' → 5th Saturday follows group rule (A off on odd Saturdays, B off on even Saturdays).
 *
 * If no Department record exists for a department name, policy defaults to 'alternate'.
 */
const DepartmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    saturdayPolicy: {
      type: String,
      enum: ['all_off', 'alternate'],
      default: 'alternate',
    },
    fifthSaturdayPolicy: {
      type: String,
      enum: ['working_all', 'off_all', 'group_alternate'],
      default: 'working_all',
    },
  },
  { timestamps: true }
);

const Department = mongoose.models.Department || mongoose.model('Department', DepartmentSchema);

export default Department;
