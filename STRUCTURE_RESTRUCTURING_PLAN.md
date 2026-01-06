# 🔄 Structure Restructuring Plan

This document outlines the plan to restructure the codebase for better organization and maintainability.

---

## 📋 Current Issues

1. ❌ Inconsistent naming (kebab-case vs camelCase)
2. ❌ Business logic mixed with API routes
3. ❌ No clear separation between services and utilities
4. ❌ Missing hooks folder
5. ❌ Components not well-organized by feature
6. ❌ No constants/types folder
7. ❌ Configuration files scattered

---

## ✅ Proposed Improvements

### Phase 1: Create Missing Folders ✅
- [x] Create `/services` folder
- [x] Create `/hooks` folder
- [x] Create `/types` folder
- [x] Create `/config` folder

### Phase 2: Reorganize Existing Files
- [ ] Move business logic from API routes to services
- [ ] Extract custom hooks
- [ ] Organize components by feature
- [ ] Move constants to dedicated files

### Phase 3: Standardize Naming
- [ ] Rename files to follow conventions
- [ ] Update imports
- [ ] Update documentation

### Phase 4: Add Supporting Files
- [ ] Create barrel exports (index.js)
- [ ] Add path aliases
- [ ] Create README files for each major folder

---

## 🎯 Implementation Steps

### Step 1: Create New Folder Structure
```
next-app/
├── services/
├── hooks/
├── types/
└── config/
```

### Step 2: Extract Services from API Routes
- Employee service from `/app/api/employee/route.js`
- Attendance service from `/app/api/hr/daily-attendance/route.js`
- Monthly attendance service from `/app/api/hr/monthly-attendance/route.js`

### Step 3: Create Custom Hooks
- `use-employees.js` - Employee data fetching
- `use-attendance.js` - Attendance data fetching
- `use-pagination.js` - Pagination logic

### Step 4: Organize Components
- Move to feature-based folders
- Create UI components folder
- Separate layout components

### Step 5: Extract Constants
- Move constants from scattered files
- Create type definitions
- Organize by feature

---

## 📝 File Renaming Map

| Current | New | Location |
|---------|-----|----------|
| `lib/db.js` | `lib/database/connection.js` | Same |
| `lib/db/queryOptimizer.js` | `lib/database/query-optimizer.js` | Renamed |
| `lib/cache/cacheHelper.js` | `lib/cache/cache-helper.js` | Renamed |
| `lib/cache/memoryCache.js` | `lib/cache/memory-cache.js` | Renamed |
| `lib/calculations/violations.js` | `lib/calculations/violations.js` | Same |
| `lib/calculations/salaryDeduction.js` | `lib/calculations/salary-deduction.js` | Renamed |
| `lib/calculations/attendanceRules.js` | `lib/calculations/attendance-rules.js` | Renamed |

---

## ⚠️ Breaking Changes

- Import paths will change
- Some functions moved to services
- Component imports may change

**Mitigation:**
- Create migration script
- Update all imports at once
- Test thoroughly before merging

---

## 📅 Timeline

- **Day 1:** Create new folders, extract services
- **Day 2:** Create hooks, organize components
- **Day 3:** Extract constants, rename files
- **Day 4:** Update imports, test
- **Day 5:** Documentation, final review

---

## ✅ Success Criteria

- [ ] All files follow naming conventions
- [ ] Business logic separated from API routes
- [ ] Components organized by feature
- [ ] Hooks extracted and reusable
- [ ] Constants centralized
- [ ] All imports updated
- [ ] Tests passing
- [ ] Documentation complete

