# Extraordinary Leaves – Implementation Plan

**Date:** March 17, 2025  
**Purpose:** Add extraordinary leaves to the monthly attendance sheet so HR can mark employee absences under specific paid leave sub-categories.

---

## 1. Overview

### Current System
- **Monthly sheet** shows each employee’s daily attendance status (Present, Absent, Holiday, Sick Leave, Paid Leave, etc.).
- HR can click a day and change the status via a dropdown.
- **Paid Leave** = 0 salary deduction (counts against quarter/annual balance).
- **Un Paid Leave** and **Sick Leave** = 1 day deduction each.

### Extraordinary Leaves (All Paid – No Deduction)

| Leave Type | Days | Eligibility |
|------------|------|-------------|
| Marriage Leave | 5 | Confirmed employees |
| Death Leave | 3 | Confirmed + probationary (parents, spouse, children, siblings) |
| Maternity Leave | 15 | Confirmed female employees |
| Paternity Leave | 3 | Confirmed male employees |
| Pilgrimage Leave (Hajj) | 21 | Confirmed employees (once in employment) |
| Umrah Leave | 7 | Confirmed employees |

These are **in addition to** the 24 annual leaves and are **paid** (no salary deduction).

---

## 2. Proposed Approach

### Option A: Separate Statuses (Recommended)

Add 6 new attendance statuses:

- Marriage Leave  
- Death Leave  
- Maternity Leave  
- Paternity Leave  
- Hajj Leave  
- Umrah Leave  

**Pros:**
- Simple to implement.
- Clear in reports and Excel export.
- Each type is visible in the monthly sheet.
- No schema changes.

**Cons:**
- More options in the status dropdown (can be grouped in UI later).

### Option B: Paid Leave + Sub-Type

Keep status as “Paid Leave” and add a `leaveSubType` field (marriage, death, maternity, etc.).

**Pros:**
- Fewer status values.

**Cons:**
- Requires schema changes.
- More logic to handle sub-types everywhere.
- Harder to filter/report by extraordinary leave type.

**Recommendation:** Use **Option A** for clarity and minimal complexity.

---

## 3. Salary Deduction Logic

All extraordinary leaves behave like **Paid Leave**:

- **Deduction days:** 0  
- **Excluded from:** absent days, unpaid leave days, missing punch logic  
- **Not counted against:** annual/quarter leave balance (they are separate entitlements)

---

## 4. Files to Modify

### 4.1 `lib/calculations/attendanceRules.js`
- Add 6 new constants to `ATTENDANCE_STATUSES`.
- Extend `normalizeStatus()` for each new status (and common abbreviations).
- Update `isLeaveType()` to include all extraordinary leaves.
- Update `isNonDeductibleStatus()` so they are treated like Paid Leave.
- Add short codes in `getStatusShortCode()` (e.g. ML, DL, MatL, PatL, Hajj, Umrah).

### 4.2 `lib/calculations/salaryDeduction.js`
- In `getLeaveDeductionDays()`, add cases for all 6 extraordinary leaves returning `0`.

### 4.3 `app/api/hr/monthly-attendance/route.js`
- Add all extraordinary leaves to the `isAbsentDay` exclusion list.
- Add all extraordinary leaves to the “no deduction” logic (same as Paid Leave).
- In POST handler: when saving an extraordinary leave, set `leaveType` appropriately (e.g. `'marriage'`, `'death'`, etc.) for future reporting.
- Ensure paid leave / quarter logic does not deduct from balance for extraordinary leaves.

### 4.4 `app/hr/attendance/monthly/page.jsx`
- Add short codes in `statusShortCode()` for all 6 types.
- Update `getCellStyle()` so extraordinary leaves use the same styling as Paid Leave (e.g. yellow/amber).
- Add all 6 options to the status dropdown.
- Update Excel export logic to show the correct status text for each type.
- Update any `isLeaveType` checks to include extraordinary leaves.

### 4.5 `app/api/hr/daily-attendance/route.js`
- Add all 6 statuses to the allowed status list (if used for validation).

### 4.6 `app/employee/dashboard/page.jsx`
- Update leave-type checks so extraordinary leaves are treated like Paid Leave (e.g. for display and summaries).

### 4.7 `models/ShiftAttendance.js` (Optional)
- `leaveType` already exists. Use it to store sub-type when status is an extraordinary leave (e.g. `'marriage'`, `'death'`, `'maternity'`, `'paternity'`, `'hajj'`, `'umrah'`).
- No schema change required; `leaveType` is a string.

---

## 5. UI Changes – Monthly Sheet

### Status Dropdown (Edit Day Modal)

Current options:
- Present, Holiday, Absent, Sick Leave, Paid Leave, Un Paid Leave, Leave Without Inform, Work From Home, Half Day

New options (grouped under “Extraordinary Leaves”):

```
--- Extraordinary Leaves (Paid) ---
Marriage Leave (ML)
Death Leave (DL)
Maternity Leave (MatL)
Paternity Leave (PatL)
Hajj Leave (Hajj)
Umrah Leave (Umrah)
```

Or as a single list with a separator.

### Cell Display

- Same color as Paid Leave (yellow/amber).
- Short code in cell: ML, DL, MatL, PatL, Hajj, Umrah.
- Full status name in tooltip.

### Excel Export

- Day columns show full status text (e.g. “Marriage Leave”, “Death Leave”).
- Same format as existing leave types.

---

## 6. Short Codes Summary

| Status | Short Code |
|--------|------------|
| Marriage Leave | ML |
| Death Leave | DL |
| Maternity Leave | MatL |
| Paternity Leave | PatL |
| Hajj Leave | Hajj |
| Umrah Leave | Umrah |

---

## 7. Implementation Order

1. **Phase 1 – Core logic**
   - `attendanceRules.js` – status constants and normalization.
   - `salaryDeduction.js` – 0 deduction for all extraordinary leaves.
   - `monthly-attendance/route.js` – exclude from absent logic and ensure no deduction.

2. **Phase 2 – UI**
   - `monthly/page.jsx` – dropdown, short codes, cell styling, Excel export.

3. **Phase 3 – Other areas**
   - `daily-attendance/route.js` – validation.
   - `employee/dashboard/page.jsx` – display and leave-type checks.

4. **Phase 4 – Optional**
   - HR Leaves page – if you want to manage extraordinary leaves separately.
   - Reports – filters by extraordinary leave type.

---

## 8. Eligibility Rules (Future Enhancement)

The plan above does **not** enforce eligibility (e.g. Marriage Leave only for confirmed employees). That would require:

- Employee confirmation status.
- Gender for Maternity/Paternity.
- Tracking usage (e.g. Hajj once per employment).

For now, HR can manually select the correct extraordinary leave type. Eligibility checks can be added later.

---

## 9. Summary

| Item | Action |
|------|--------|
| New statuses | 6 (Marriage, Death, Maternity, Paternity, Hajj, Umrah) |
| Salary deduction | 0 for all |
| Schema changes | None (reuse `leaveType` for sub-type) |
| Files to modify | ~7 |
| Estimated effort | 2–3 hours |

---

## 10. Approval

If you agree with this plan, reply with your approval and we can proceed with implementation. Any changes you want (e.g. different short codes, grouping in dropdown, eligibility checks) can be incorporated before coding.
