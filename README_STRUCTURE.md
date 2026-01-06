# 📚 Project Structure Quick Guide

## 🎯 Quick Navigation

### **API Routes** → `app/api/`
- `/api/auth/*` - Authentication endpoints
- `/api/employees/*` - Employee management
- `/api/hr/*` - HR-specific operations

### **Pages** → `app/`
- `/login`, `/register` - Auth pages
- `/hr/*` - HR dashboard pages
- `/employee/*` - Employee dashboard pages

### **Components** → `components/`
- `/ui` - Reusable UI components (Button, Input, etc.)
- `/employees` - Employee-related components
- `/attendance` - Attendance-related components
- `/common` - Shared/common components

### **Business Logic** → `services/`
- `employee-service.js` - Employee operations
- `attendance-service.js` - Attendance calculations
- `shift-service.js` - Shift management

### **Database** → `lib/database/`
- `connection.js` - Database connection
- `query-optimizer.js` - Query optimization utilities

### **Utilities** → `lib/utils/`
- `memoize.js` - Memoization helpers
- `date-helpers.js` - Date manipulation
- `format-helpers.js` - Formatting utilities

### **Constants** → `lib/constants/`
- `attendance-status.js` - Status constants
- `user-roles.js` - Role constants

### **Models** → `models/`
- `Employee.js`, `Shift.js`, etc.

---

## 📝 Naming Rules

- **Components:** `PascalCase.jsx` (e.g., `EmployeeTable.jsx`)
- **Services:** `kebab-case-service.js` (e.g., `employee-service.js`)
- **Hooks:** `use-kebab-case.js` (e.g., `use-employees.js`)
- **Utils:** `kebab-case.js` (e.g., `date-helpers.js`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`)

---

## 🔍 Where to Put New Code?

| What | Where |
|------|-------|
| New API endpoint | `app/api/[feature]/route.js` |
| New page | `app/[route]/page.jsx` |
| New component | `components/[category]/ComponentName.jsx` |
| Business logic | `services/[feature]-service.js` |
| Utility function | `lib/utils/[feature]-helpers.js` |
| Constant | `lib/constants/[feature].js` |
| Custom hook | `hooks/use-[feature].js` |

---

For detailed documentation, see `PROJECT_STRUCTURE.md`

