# Calculation Modules Documentation

This directory contains configurable calculation modules for salary deductions, violations, and attendance rules.

## 📁 Module Structure

### `violations.js`
Handles late/early violation calculations based on shift timing and grace periods.

**Key Functions:**
- `computeLateEarly(shift, checkIn, checkOut, allShiftsMap)` - Calculate violations for a day
- `DEFAULT_GRACE_PERIOD` - Default grace period constant (15 minutes)

**Usage:**
```javascript
import { computeLateEarly } from '@/lib/calculations';

const { late, earlyLeave, lateMinutes, earlyMinutes } = computeLateEarly(
  shiftObject,
  checkInDate,
  checkOutDate,
  shiftsMap
);
```

---

### `salaryDeduction.js`
Handles all salary deduction calculations.

**Key Functions:**
- `calculateViolationDeductions(violations)` - Calculate violation-based deductions
- `calculateTotalDeductionDays(params)` - Calculate total deduction days
- `calculateSalaryAmounts(grossSalary, deductionDays)` - Calculate final salary amounts
- `getLeaveDeductionDays(leaveType)` - Get deduction for a leave type
- `getMissingPunchDeductionDays(bothMissing, partialPunch)` - Get deduction for missing punches

**Configuration Objects:**
- `VIOLATION_CONFIG` - Violation deduction settings
- `ABSENT_CONFIG` - Absent/missing punch settings
- `LEAVE_CONFIG` - Leave deduction settings
- `SALARY_CONFIG` - Salary calculation settings

**Usage:**
```javascript
import { 
  calculateViolationDeductions,
  calculateTotalDeductionDays,
  calculateSalaryAmounts,
  VIOLATION_CONFIG 
} from '@/lib/calculations';

// Calculate violations
const violations = [
  { violationNumber: 3, violationMinutes: 10 },
  { violationNumber: 4, violationMinutes: 30 },
];

const { violationFullDays, perMinuteFineDays } = 
  calculateViolationDeductions(violations);

// Calculate total deduction
const totalDays = calculateTotalDeductionDays({
  violationFullDays: 1,
  perMinuteFineDays: 0.21,
  unpaidLeaveDays: 2,
  absentDays: 1.5,
  halfDays: 0.5,
});

// Calculate salary
const { perDaySalary, deductionAmount, netSalary } = 
  calculateSalaryAmounts(30000, totalDays);
```

---

### `attendanceRules.js`
Handles status normalization and attendance rule logic.

**Key Functions:**
- `normalizeStatus(rawStatus, options)` - Normalize status strings
- `isLeaveType(status)` - Check if status is a leave type
- `isNonDeductibleStatus(status)` - Check if status should not deduct salary
- `extractShiftCode(shiftStr)` - Extract shift code from formatted string
- `getStatusShortCode(status)` - Get short code for display

**Constants:**
- `ATTENDANCE_STATUSES` - All valid status types

**Usage:**
```javascript
import { normalizeStatus, ATTENDANCE_STATUSES } from '@/lib/calculations';

const status = normalizeStatus('sl', { isWeekendOff: false });
// Returns: 'Sick Leave'

if (status === ATTENDANCE_STATUSES.SICK_LEAVE) {
  // Handle sick leave
}
```

---

## ⚙️ How to Modify Formulas

### Changing Violation Deduction Rules

Edit `next-app/lib/calculations/salaryDeduction.js`:

```javascript
export const VIOLATION_CONFIG = {
  FREE_VIOLATIONS: 2,           // Change number of free violations
  MILESTONE_INTERVAL: 3,        // Change milestone pattern (3rd, 6th, 9th...)
  PER_MINUTE_RATE: 0.007,       // Change per-minute fine rate
  MAX_PER_MINUTE_FINE: 1.0,     // Change max fine per violation
};
```

### Changing Leave Deductions

Edit `next-app/lib/calculations/salaryDeduction.js`:

```javascript
export const LEAVE_CONFIG = {
  UNPAID_LEAVE_DAYS: 1.0,       // Change unpaid leave deduction
  SICK_LEAVE_DAYS: 1.0,         // Change sick leave deduction
  HALF_DAY_DAYS: 0.5,           // Change half-day deduction
  PAID_LEAVE_DAYS: 0.0,         // Change paid leave deduction
};
```

### Changing Absent/Missing Punch Deductions

Edit `next-app/lib/calculations/salaryDeduction.js`:

```javascript
export const ABSENT_CONFIG = {
  BOTH_MISSING_DAYS: 1.0,       // Change both punches missing deduction
  PARTIAL_PUNCH_DAYS: 1.0,      // Change partial punch deduction
  LEAVE_WITHOUT_INFORM_DAYS: 1.5, // Change LWI deduction
};
```

### Changing Salary Calculation

Edit `next-app/lib/calculations/salaryDeduction.js`:

```javascript
export const SALARY_CONFIG = {
  DAYS_PER_MONTH: 30,           // Change days per month (26, 30, 31)
};
```

### Changing Grace Period

Edit `next-app/lib/calculations/violations.js`:

```javascript
export const DEFAULT_GRACE_PERIOD = 15; // Change default grace period
```

Or set per shift in the database (recommended).

---

## 🔄 Migration Guide

To use these modules in existing routes:

### Before (in route file):
```javascript
// Complex inline calculation
const violationBaseDays = Math.floor(violationCount / 3);
const perMinuteFineDays = violations.reduce((sum, v) => {
  if (v.violationNumber > 3 && v.violationNumber % 3 !== 0) {
    return sum + Math.min(v.violationMinutes * 0.007, 1.0);
  }
  return sum;
}, 0);
```

### After (using modules):
```javascript
import { calculateViolationDeductions } from '@/lib/calculations';

const { violationFullDays, perMinuteFineDays } = 
  calculateViolationDeductions(violations);
```

---

## ✅ Benefits

1. **Easy to Modify** - All formulas in one place
2. **Testable** - Functions can be unit tested
3. **Reusable** - Use same logic across routes
4. **Documented** - Clear comments and examples
5. **Type-Safe** - Clear function signatures
6. **Configurable** - Change behavior without code changes

---

## 📝 Next Steps

1. ✅ Modules created
2. ⏳ Update monthly-attendance route to use these modules
3. ⏳ Update daily-attendance route if needed
4. ⏳ Add unit tests for calculation functions
5. ⏳ Consider environment variable configuration

