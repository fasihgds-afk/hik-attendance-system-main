# AMS — Dynamic System Implementation Plan

**Goal:** Make the attendance system *fully dynamic* — business rules (timezone, weekends, holidays, leave types, shift overrides, salary rules) become HR-configurable data instead of hardcoded values — while fixing the highest-impact correctness/security bugs along the way.

**Guiding principle:** Configuration is only safe for payroll if policy changes apply *going forward* and never silently rewrite finalized history. Therefore **effective-dating + month-lock** are part of the plan, not an afterthought.

---

## 1. Current state (baseline)

### Already dynamic (good foundation — keep & extend)
| Area | Where | Notes |
|---|---|---|
| Shifts | `models/Shift.js`, `EmployeeShiftHistory.js` | Catalog + per-employee + effective-dated history |
| Saturday off policy | `models/Department.js`, `lib/calculations/weekendPolicy.js` | `all_off` / `alternate` + 5th-Saturday, per department |
| Violation/salary rules | `models/ViolationRules.js` | free violations, milestone, per-minute rate, absent/leave/salary configs |
| Leave policy | `models/LeavePolicy.js` | leaves per quarter + carry-forward |
| Grace periods | `lib/shift/gracePeriods.js` | per-shift, per-side, date-effective snapshots |

### Still hardcoded (targets of this plan)
| # | Hardcoded thing | Location | Impact |
|---|---|---|---|
| H1 | Timezone `+05:00` | `lib/time/companyTodayCore.js`, `lib/calculations/violations.js`, several routes | Can't change region; sub-hour offsets break |
| H2 | No holiday calendar (Eid/national marked per-day manually) | n/a (no model) | Repetitive manual entry every year |
| H3 | Attendance statuses / leave types are code enums | `lib/calculations/attendanceRules.js:16-44` | New leave type = code change in 5+ files |
| H4 | Business-day cutoff `08:55`; night cutoffs `06:00`/`08:00` | `companyTodayCore.js:25`, `violations.js:129` | Magic numbers; inconsistent across paths |
| H5 | `workingDaysInMonth = daysInMonth - 6` | `monthly-attendance/route.js:~1230` | Wrong per-day salary in 5-weekend months |
| H6 | Weekly off = Sunday (implicit) | `monthly-attendance/route.js:691,1527` | Can't configure Friday/2-day weekends |
| H7 | Quarter dates + carry map (Q1→Q2, Q3→Q4) | `lib/leave/quarterUtils.js` | Can't switch accrual model |
| H8 | Duplicate `computeLateEarly` (one correct, one buggy) | `violations.js` vs `monthly-attendance/route.js` | Inconsistent fines (see audit) |

---

## 2. Architecture: three pillars

### Pillar A — `CompanySettings` (single source of truth)
A singleton config document HR can edit. Removes ~6 classes of hardcoded behavior.

```js
// models/CompanySettings.js  (configId: 'default')
{
  timezoneOffset: "+05:00",        // replaces hardcoded +05:00 (H1)
  businessDayCutoff: "08:55",      // replaces magic cutoff (H4)
  weeklyOffDays: [0],              // 0=Sun … dynamic weekly off (H6)
  nightCheckoutCutoff: "08:00",    // night-shift boundary (H4)
  nightShiftOffAnchor: "start",    // "start" | "end" (off-day anchor for night shifts)
  workingDaysMode: "actual",       // "actual" | "fixed"  (fixes H5)
  fixedDaysPerMonth: 26,
  currency: "PKR"
}
```

### Pillar B — Data-driven reference data
- **`LeaveType`** — replaces hardcoded status enum + `EXTRAORDINARY_LEAVE_STATUSES` (H3).
- **`Holiday`** — real holiday calendar (H2).
- **`Role`/`Permission`** — optional, later.

### Pillar C — One calculation engine, fed by config
Centralize a **single** `computeLateEarly` / day-status engine in `lib/calculations/` that takes
`(punches, shift, companySettings, violationRules, leaveTypes, holidays)`.
Every caller (monthly, daily, web-clock) uses it. Kills duplication (H8) and scattered magic numbers (H4).

---

## 3. Phased roadmap

### Phase 1 — Foundation (also fixes audit bugs)
**Deliverables**
1. `models/CompanySettings.js` + HR settings UI + `GET/PATCH /api/hr/company-settings` (requireHR).
2. Wire timezone, `weeklyOffDays`, business-day cutoff, night cutoffs through `CompanySettings` (replace constants in `companyTodayCore.js`, `violations.js`, `resolveShiftWindow.js`).
3. **Unified calculation engine**: one `computeLateEarly` used everywhere; delete the inline copy in `monthly-attendance/route.js`. (Fixes audit bug: night-shift late check-in + inconsistent fines.)
4. Single shift-aware `isOffDay(date, shift, employee, settings, deptPolicy)` helper used by both monthly & daily paths.
5. Fix `workingDaysInMonth` to use actual off-day count or `salaryConfig.daysPerMonth` (H5).
6. **Saturday unified-shift-time toggle** (see §4) — off by default.

**Acceptance**
- Changing `weeklyOffDays` to `[5]` makes Friday the off day with no code change.
- Web-clock and monthly sheet produce identical late/early results for the same punch.
- With defaults unchanged, all existing numbers stay identical (regression-safe).

### Phase 2 — Reference data dynamic
1. `models/Holiday.js` (date, name, type, scope all/department, recurring) + HR calendar UI + auto-apply in attendance (replaces manual per-day Eid marking).
2. `models/LeaveType.js` (name, isPaid, isDeductible, deductionDays, countsAsPresent, requiresApproval, maxPerYear, color, active) + HR UI. Migrate hardcoded statuses → seed data. Salary/UI read from it.
3. Per-department weekend overrides for `weeklyOffDays` (extend Department).

### Phase 3 — Safety (makes "dynamic" payroll-safe)
1. **Effective-dating** for `ViolationRules`, `LeavePolicy`, `CompanySettings`, Saturday config (store `effectiveFrom`; never mutate history). Mirrors existing `EmployeeShiftHistory` / grace-snapshot pattern.
2. **Month-lock**: closed payroll months become immutable; recompute ignores locked months.
3. Config-change audit log (reuse `SecurityAuditLog`) + config cache with explicit invalidation on write.
4. Configurable leave accrual (monthly/quarterly/annual + which periods carry).

### Phase 4 — Expansion
- Versioned payroll export API, notifications/events layer, custom roles/permissions, pre-aggregated analytics (`MonthlyAttendance` becomes the summary store).

---

## 4. Feature spec — Saturday unified-shift-time toggle

**Requirement:** Today, on Saturday each shift keeps its own time (no change). In the future, optionally collapse *all* shifts to one configurable Saturday timing (e.g. 9pm–6am, or any value). Per-department, editable, no redeploy.

**Reuses the existing department Saturday-policy pattern (model → API → UI → calc).**

### Model — extend `models/Department.js`
```js
saturdayShiftMode: { type: String, enum: ['own_time', 'unified_time'], default: 'own_time' },
saturdayUnifiedStart: { type: String, default: '21:00' },           // used only when unified_time
saturdayUnifiedEnd:   { type: String, default: '06:00' },
saturdayUnifiedCrossesMidnight: { type: Boolean, default: true },
```
`own_time` (default) = current behavior, zero impact.

### API — `app/api/hr/departments/route.js`
Extend `POST`/`PATCH` + add a `normalizeSaturdayShift()` sanitizer (validate `HH:MM`, mode enum). Same `requireHR()` guard.

### UI — `app/hr/departments/page.jsx`
Add one `<select>` ("Saturday shift time: Each shift's own / One unified time") + two time inputs, greyed out unless `unified_time` (and disabled when `saturdayPolicy === 'all_off'`, since no Saturday work then) — identical disabling pattern to the existing 5th-Saturday control.

### Calc — shift-resolution step (`monthly-attendance` + daily + engine)
In the per-day shift resolution (where `shiftForDate`/`employeeShiftObj` is chosen), insert first:
```
if (dow === 6 && saturdayIsWorked && dept.saturdayShiftMode === 'unified_time') {
    shiftWindow = { start: dept.saturdayUnifiedStart, end: dept.saturdayUnifiedEnd,
                    crossesMidnight: dept.saturdayUnifiedCrossesMidnight };
}
```
Everything downstream (late/early, grace, night-shift checkout retrieval) runs against that window.

**Behavior matrix**
| `saturdayShiftMode` | Result on Saturday |
|---|---|
| `own_time` (default, now) | Each employee judged against their own shift |
| `unified_time` (future) | All shifts judged against the one configured timing |

---

## 5. Dynamic, shift-aware weekend/off-day engine

- Replace hardcoded `if (dow === 0) isWeekendOff = true` (lines 691, 1527) with lookup against `weeklyOffDays`.
- For `crossesMidnight` shifts, resolve the off weekday using the shift's **anchor date** (`nightShiftOffAnchor`, default `start`) instead of the raw calendar date — so night shifts get a correct, configurable off-day. Day shifts: start == end, no change.
- Centralize into the single `isOffDay()` helper (Pillar C).

---

## 6. Risks & migration

| Risk | Mitigation |
|---|---|
| Dynamic config retroactively changes finalized salaries | Phase 3 effective-dating + month-lock (do before exposing edit-heavy config widely) |
| Regression in payroll numbers during engine unification | Snapshot current monthly outputs for sample employees; assert identical after refactor |
| Defaults drift from current behavior | All new settings default to today's hardcoded values (`+05:00`, Sunday off, `own_time`, etc.) |
| Duplicate logic during transition | Delete inline `computeLateEarly` only after the shared engine passes parity tests |

**Migration approach:** additive — new models seed with current defaults; existing data untouched; features ship behind defaults that preserve present behavior.

---

## 7. Overlap with the earlier audit

Phase 1 simultaneously fixes these audit findings:
- Night-shift late check-in miscalculation (`violations.js`) — fixed by the unified engine.
- Inconsistent fines between web-clock and monthly sheet — same.
- `workingDaysInMonth = daysInMonth - 6` salary error — fixed in Phase 1.
- (Separate security fixes — passwordless employee login, rate limiting — tracked outside this dynamic-config plan.)

---

## 8. Suggested build order
1. Phase 1 (foundation + Saturday toggle + audit fixes) ← highest value
2. Phase 2 (holidays + leave types)
3. Phase 3 (effective-dating + month-lock) ← required before heavy config editing
4. Phase 4 (expansion)
