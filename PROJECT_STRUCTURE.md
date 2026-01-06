# 📁 Project Structure Documentation

This document describes the professional folder and file organization of the HIK Attendance System.

---

## 🏗️ Root Structure

```
next-app/
├── app/                    # Next.js App Router (pages & API routes)
├── components/             # React components
├── lib/                    # Shared libraries & utilities
├── models/                 # MongoDB/Mongoose models
├── public/                 # Static assets
├── types/                  # TypeScript types (if used) / Constants
├── hooks/                  # Custom React hooks
├── services/               # Business logic layer
├── config/                 # Configuration files
└── docs/                   # Documentation
```

---

## 📂 Detailed Structure

### **`/app`** - Next.js App Router
```
app/
├── api/                              # API Routes
│   ├── auth/                        # Authentication endpoints
│   │   ├── [...nextauth]/          # NextAuth catch-all
│   │   │   └── route.js            # NextAuth configuration
│   │   ├── login/                  # Login endpoint
│   │   │   └── route.js
│   │   └── register/               # Registration endpoint
│   │       └── route.js
│   │
│   ├── employees/                   # Employee-related endpoints
│   │   ├── route.js                # GET/POST employees
│   │   └── attendance/             # Employee attendance
│   │       └── route.js
│   │
│   ├── hr/                          # HR-specific endpoints
│   │   ├── attendance/
│   │   │   ├── daily/              # Daily attendance
│   │   │   │   └── route.js
│   │   │   └── monthly/            # Monthly attendance
│   │   │       └── route.js
│   │   ├── employees/              # HR employee management
│   │   │   └── route.js
│   │   ├── shifts/                 # Shift management
│   │   │   ├── route.js
│   │   │   ├── [id]/              # Dynamic shift ID
│   │   │   │   └── route.js
│   │   │   └── migrate/
│   │   │       └── route.js
│   │   └── employee-shifts/        # Employee shift assignments
│   │       ├── route.js
│   │       ├── auto-detect/
│   │       │   └── route.js
│   │       └── bulk-create/
│   │           └── route.js
│   │
│   └── upload/                      # File upload endpoints
│       └── route.js
│
├── (auth)/                          # Auth route group
│   ├── login/
│   │   └── page.jsx
│   └── register/
│       └── page.jsx
│
├── (dashboard)/                     # Dashboard route group
│   ├── hr/                          # HR dashboard
│   │   ├── dashboard/
│   │   │   └── page.jsx
│   │   ├── employees/
│   │   │   ├── page.jsx            # Employee list
│   │   │   └── manage/
│   │   │       └── page.jsx        # Employee management
│   │   ├── attendance/
│   │   │   ├── daily/
│   │   │   │   └── page.jsx
│   │   │   └── monthly/
│   │   │       └── page.jsx
│   │   └── shifts/
│   │       └── page.jsx
│   │
│   └── employee/                    # Employee dashboard
│       ├── dashboard/
│       │   └── page.jsx
│       └── attendance/
│           └── page.jsx
│
├── layout.js                        # Root layout
├── page.jsx                         # Home page
├── providers.jsx                    # React context providers
└── globals.css                      # Global styles
```

---

### **`/components`** - React Components
```
components/
├── ui/                              # Reusable UI components
│   ├── Button.jsx
│   ├── Input.jsx
│   ├── Modal.jsx
│   ├── Table.jsx
│   └── Card.jsx
│
├── layout/                          # Layout components
│   ├── Header.jsx
│   ├── Sidebar.jsx
│   ├── Footer.jsx
│   └── Navigation.jsx
│
├── employees/                       # Employee-related components
│   ├── EmployeeAvatar.jsx
│   ├── EmployeeCard.jsx
│   ├── EmployeeForm.jsx
│   ├── EmployeeTable.jsx
│   ├── EmployeeRow.jsx
│   ├── EmployeeFilters.jsx
│   └── EmployeeList.jsx
│
├── attendance/                      # Attendance-related components
│   ├── AttendanceCalendar.jsx
│   ├── AttendanceTable.jsx
│   ├── AttendanceRow.jsx
│   ├── AttendanceFilters.jsx
│   └── AttendanceStats.jsx
│
├── shifts/                          # Shift-related components
│   ├── ShiftCard.jsx
│   ├── ShiftForm.jsx
│   └── ShiftList.jsx
│
├── auth/                            # Authentication components
│   ├── LoginForm.jsx
│   ├── RegisterForm.jsx
│   └── AuthGuard.jsx
│
├── common/                          # Common/shared components
│   ├── PaginationControls.jsx
│   ├── LoadingSpinner.jsx
│   ├── ErrorMessage.jsx
│   ├── EmptyState.jsx
│   └── Toast.jsx
│
└── guards/                          # Route guards
    ├── MobileOnlyGuard.jsx
    ├── AuthGuard.jsx
    └── RoleGuard.jsx
```

---

### **`/lib`** - Shared Libraries & Utilities
```
lib/
├── database/                        # Database-related
│   ├── connection.js                # DB connection (db.js renamed)
│   ├── query-optimizer.js           # Query optimization utilities
│   └── indexes.js                   # Index configuration
│
├── cache/                           # Caching utilities
│   ├── cache-helper.js
│   ├── memory-cache.js
│   └── cache-config.js              # Cache configuration
│
├── calculations/                    # Business logic calculations
│   ├── violations.js                # Violation calculations
│   ├── salary-deduction.js          # Salary deduction formulas
│   ├── attendance-rules.js          # Attendance rules & normalization
│   └── index.js                     # Barrel export
│
├── utils/                           # General utilities
│   ├── memoize.js
│   ├── date-helpers.js              # Date manipulation
│   ├── format-helpers.js            # Formatting utilities
│   └── validation.js                # Validation helpers
│
├── constants/                       # Constants & enums
│   ├── attendance-status.js         # Attendance status constants
│   ├── user-roles.js                # User role constants
│   └── api-routes.js                # API route constants
│
└── validators/                      # Validation schemas
    ├── employee-validator.js
    └── attendance-validator.js
```

---

### **`/services`** - Business Logic Layer
```
services/
├── employee-service.js              # Employee business logic
├── attendance-service.js            # Attendance business logic
├── shift-service.js                 # Shift business logic
├── auth-service.js                  # Authentication logic
└── report-service.js                # Report generation
```

**Purpose:** Separate business logic from API routes for better testability and reusability.

---

### **`/models`** - Database Models
```
models/
├── Employee.js                      # Employee model
├── AttendanceEvent.js               # Attendance event model
├── ShiftAttendance.js               # Shift attendance record
├── Shift.js                         # Shift definition
├── EmployeeShiftHistory.js          # Employee shift history
├── User.js                          # User/authentication model
└── MonthlyAttendance.js             # Monthly attendance summary
```

**Naming Convention:** PascalCase for model names.

---

### **`/hooks`** - Custom React Hooks
```
hooks/
├── use-employees.js                 # Employee data fetching
├── use-attendance.js                # Attendance data fetching
├── use-auth.js                      # Authentication state
├── use-pagination.js                # Pagination logic
└── use-toast.js                     # Toast notifications
```

**Naming Convention:** `use-` prefix, kebab-case.

---

### **`/types`** - Type Definitions & Constants
```
types/
├── employee.js                      # Employee type definitions
├── attendance.js                    # Attendance type definitions
├── api.js                           # API response types
└── constants.js                     # Application constants
```

**Note:** If using TypeScript, these would be `.ts` files with proper types.

---

### **`/config`** - Configuration Files
```
config/
├── database.js                      # Database configuration
├── next-auth.js                     # NextAuth configuration
├── constants.js                     # App-wide constants
└── env.js                           # Environment variable handling
```

---

## 📝 Naming Conventions

### **Files & Folders**

#### **Components**
- **Format:** `PascalCase.jsx`
- **Example:** `EmployeeTable.jsx`, `AttendanceCalendar.jsx`
- **Rule:** One component per file, named after the component

#### **Hooks**
- **Format:** `use-kebab-case.js`
- **Example:** `use-employees.js`, `use-attendance.js`
- **Rule:** Always start with `use-`

#### **Services**
- **Format:** `kebab-case-service.js`
- **Example:** `employee-service.js`, `attendance-service.js`
- **Rule:** End with `-service.js`

#### **Utilities**
- **Format:** `kebab-case.js`
- **Example:** `date-helpers.js`, `format-helpers.js`
- **Rule:** Descriptive, action-oriented names

#### **API Routes**
- **Format:** `route.js` (Next.js convention)
- **Location:** `app/api/[feature]/route.js`
- **Rule:** One route per folder

#### **Models**
- **Format:** `PascalCase.js`
- **Example:** `Employee.js`, `ShiftAttendance.js`
- **Rule:** Singular noun, matches collection name

---

### **Code Naming**

#### **Variables & Functions**
- **camelCase** for variables and functions
- **Example:** `getEmployeeById`, `attendanceRecords`

#### **Constants**
- **UPPER_SNAKE_CASE** for constants
- **Example:** `MAX_RETRY_COUNT`, `API_BASE_URL`

#### **Classes & Components**
- **PascalCase** for classes and components
- **Example:** `EmployeeService`, `AttendanceTable`

---

## 🎯 File Organization Principles

### 1. **Separation of Concerns**
- API routes handle HTTP requests/responses
- Services contain business logic
- Components handle UI/UX
- Utilities provide reusable functions

### 2. **Feature-Based Grouping**
- Group related files together (e.g., all employee-related files)
- Co-locate related components and hooks

### 3. **Barrel Exports**
- Use `index.js` files for clean imports
- **Example:** `import { computeLateEarly } from '@/lib/calculations'`

### 4. **Consistent Structure**
- Same structure across similar features
- Predictable file locations

---

## 📦 Import Path Aliases

Configure in `jsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@/components/*": ["./components/*"],
      "@/lib/*": ["./lib/*"],
      "@/services/*": ["./services/*"],
      "@/hooks/*": ["./hooks/*"],
      "@/types/*": ["./types/*"],
      "@/models/*": ["./models/*"]
    }
  }
}
```

**Usage:**
```javascript
import { EmployeeService } from '@/services/employee-service';
import { useEmployees } from '@/hooks/use-employees';
import { ATTENDANCE_STATUS } from '@/types/constants';
```

---

## 🔍 Quick Reference

### **Where to find...**

| What | Where |
|------|-------|
| API endpoints | `/app/api/[feature]/route.js` |
| Page components | `/app/[route]/page.jsx` |
| Reusable components | `/components/[category]/` |
| Business logic | `/services/[feature]-service.js` |
| Database models | `/models/[Model].js` |
| Utilities | `/lib/utils/` |
| Constants | `/lib/constants/` or `/types/constants.js` |
| Custom hooks | `/hooks/use-[feature].js` |
| Configuration | `/config/` |

---

## ✅ Benefits of This Structure

1. **Discoverability** - Easy to find files
2. **Scalability** - Easy to add new features
3. **Maintainability** - Clear organization
4. **Testability** - Separated concerns
5. **Collaboration** - Consistent structure
6. **Onboarding** - New developers understand quickly

---

## 🚀 Migration Guide

See `MIGRATION_GUIDE.md` for step-by-step instructions on migrating to this structure.

