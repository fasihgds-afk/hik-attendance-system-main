# API Route Protection Plan

**Date:** March 17, 2025  
**Purpose:** Secure all API routes so that unauthorized users cannot call them via Network inspection, curl, Postman, or by modifying requests.

---

## 1. Current State Assessment

### What's Protected Today

| Layer | Scope | Status |
|-------|-------|--------|
| **Page routes** | `/hr/*`, `/employee/*`, `/register` | ✅ Protected by `proxy.ts` middleware |
| **API routes** | `/api/*` | ❌ **NOT in middleware matcher** – pages are protected, but API calls are not |

### API Routes – Auth Status

| Route | Method | Auth Check | Risk |
|-------|--------|------------|------|
| `/api/hr/monthly-attendance` | GET, POST | ❌ None | Anyone can view/edit attendance |
| `/api/hr/daily-attendance` | POST | ❌ None | Anyone can modify daily attendance |
| `/api/hr/leaves` | GET, POST | ❌ None | Anyone can view/mark leaves |
| `/api/hr/employees` | GET, POST | ❌ None | Anyone can list/create employees |
| `/api/hr/departments` | GET, POST | ❌ None | Anyone can manage departments |
| `/api/hr/shifts` | GET, POST | ❌ None | Anyone can manage shifts |
| `/api/hr/violation-rules` | GET, POST | ❌ None | Anyone can change deduction rules |
| `/api/hr/complaints` | GET, POST | ❌ None | Anyone can view/respond to complaints |
| `/api/hr/employees/bank-details` | POST | ✅ HR/ADMIN only | OK |
| `/api/employee/attendance` | GET | ❌ None | Anyone can fetch any employee's punches |
| `/api/employee/leaves` | GET | ❌ None | Anyone can view any employee's leaves |
| `/api/employee/complaints` | GET, POST | ❌ None | Anyone can view/post complaints |
| `/api/auth/login` | POST | N/A (login) | Public by design |
| `/api/auth/register` | POST | ❌ None (rate-limited) | Only HR should register – no role check |
| `/api/agent/*` | Various | ✅ Device token | Uses separate auth |
| `/api/health` | GET | N/A | Public health check |

### Attack Scenario

1. User opens DevTools → Network tab.
2. Sees request: `POST /api/hr/monthly-attendance` with body `{ empCode, date, status: "Paid Leave" }`.
3. Copies as cURL or replays in Postman **without being logged in**.
4. Request succeeds because the API does not verify session.

---

## 2. Recommended Approach

### Option A: Centralized Auth Helper + Per-Route Checks (Recommended)

1. Create a reusable auth helper in `lib/auth/requireAuth.js`.
2. Add `requireHR()` and `requireEmployee()` (and optionally `requireAuth()` for any logged-in user).
3. Call the helper at the start of each protected route.
4. Return 401 if not authenticated or wrong role.

**Pros:** Simple, explicit, easy to audit.  
**Cons:** Must remember to add to each new route.

### Option B: Middleware for `/api/*`

1. Extend `proxy.ts` (or add `middleware.ts`) to match `/api/hr/*` and `/api/employee/*`.
2. In middleware, verify session and role before the request reaches the route handler.

**Pros:** Single place for protection.  
**Cons:** NextAuth middleware with API routes can be tricky; need to handle 401 JSON (not redirect) for API calls.

### Option C: Wrapper/HOC for Route Handlers

Create a wrapper that injects auth before running the handler. Less common in Next.js App Router.

---

## 3. Implementation Plan (Option A)

### Step 1: Create Auth Helper

**File:** `lib/auth/requireAuth.js`

```javascript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * Require HR or ADMIN. Returns { session, user } or throws 401.
 */
export async function requireHR() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['HR', 'ADMIN'].includes(session.user.role)) {
    throw new Error('UNAUTHORIZED_HR');
  }
  return { session, user: session.user };
}

/**
 * Require EMPLOYEE. Returns { session, user } or throws 401.
 */
export async function requireEmployee() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'EMPLOYEE') {
    throw new Error('UNAUTHORIZED_EMPLOYEE');
  }
  return { session, user: session.user };
}

/**
 * Require any authenticated user. Returns { session, user } or throws 401.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('UNAUTHORIZED');
  }
  return { session, user: session.user };
}
```

### Step 2: Add 401 Response Helper

In `lib/api/response.js` (or create), add:

```javascript
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}
```

### Step 3: Protect Each Route

**HR routes** – add at the start of GET/POST:

```javascript
import { requireHR } from '@/lib/auth/requireAuth';

export async function GET(req) {
  try {
    await requireHR(); // Throws if not HR/ADMIN
    // ... rest of handler
  } catch (err) {
    if (err.message === 'UNAUTHORIZED_HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
```

**Employee routes** – add `requireEmployee()` and ensure employee can only access their own data (e.g. `empCode` from session, not from query).

### Step 4: Route-by-Route Checklist

| Route | Auth | Notes |
|-------|------|-------|
| `api/hr/monthly-attendance` | requireHR | GET, POST |
| `api/hr/daily-attendance` | requireHR | POST |
| `api/hr/leaves` | requireHR | GET, POST |
| `api/hr/employees` | requireHR | GET, POST |
| `api/hr/employees/dept-stats` | requireHR | GET |
| `api/hr/departments` | requireHR | GET, POST |
| `api/hr/shifts` | requireHR | GET, POST |
| `api/hr/shifts/[id]` | requireHR | GET, PATCH, DELETE |
| `api/hr/shifts/migrate` | requireHR | POST |
| `api/hr/violation-rules` | requireHR | GET, POST |
| `api/hr/complaints` | requireHR | GET, POST |
| `api/hr/complaints/[id]` | requireHR | GET, PATCH |
| `api/hr/leave-policy` | requireHR | GET, POST |
| `api/hr/employee-shifts` | requireHR | GET, POST |
| `api/hr/employee-shifts/auto-detect` | requireHR | POST |
| `api/hr/employee-shifts/bulk-create` | requireHR | POST |
| `api/hr/upload` | requireHR | POST |
| `api/employee/attendance` | requireEmployee | Validate empCode === session.user.empCode |
| `api/employee/leaves` | requireEmployee | Validate empCode === session.user.empCode |
| `api/employee/complaints` | requireEmployee | Use session empCode |
| `api/employee/complaints/[id]` | requireEmployee | Ensure complaint belongs to empCode |
| `api/auth/register` | requireHR | Only HR can register new users |

### Step 5: Employee Data Isolation

For `/api/employee/attendance?empCode=XXX`:

- **Before:** Anyone could pass any `empCode`.
- **After:** Ignore `empCode` from query and use `session.user.empCode` only. Employees can only see their own data.

---

## 4. Optional: Middleware for API (Option B)

If you prefer middleware-based protection:

1. Update `proxy.ts` config matcher to include:
   ```javascript
   matcher: ['/hr/:path*', '/employee/:path*', '/register', '/api/hr/:path*', '/api/employee/:path*'],
   ```

2. Add API-specific logic: for paths starting with `/api/`, return `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` instead of redirecting.

3. Exclude public routes: `/api/auth/*`, `/api/health`, `/api/agent/*`.

---

## 5. Summary

| Action | Priority |
|--------|----------|
| Create `lib/auth/requireAuth.js` | High |
| Protect all `/api/hr/*` routes with `requireHR()` | High |
| Protect all `/api/employee/*` routes with `requireEmployee()` + empCode validation | High |
| Protect `/api/auth/register` with `requireHR()` | Medium |
| Add CSRF consideration (NextAuth handles cookies; same-origin helps) | Low |
| Rate limiting on sensitive routes (already on auth) | Low |

---

## 6. Approval

If you agree with this plan, we can implement it step by step. The recommended order is:

1. Create the auth helper.
2. Protect HR routes first (highest risk).
3. Protect employee routes with proper data isolation.
4. Protect register route.
