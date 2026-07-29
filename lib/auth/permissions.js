/**
 * Module-level CRUD permissions for HR portal users.
 * ADMIN always has full access. Legacy HR users with no permissions object
 * are treated as full access for backward compatibility.
 */

export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete', 'export'];

/** Modules shown in the register UI and enforced on APIs / hub. */
export const PERMISSION_MODULES = [
  { key: 'employees', label: 'Employees', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'archivedEmployees', label: 'Former Employees', actions: ['view', 'update'] },
  { key: 'portalAccess', label: 'Portal Access', actions: ['view', 'update'] },
  { key: 'users', label: 'Users & Registration', actions: ['view', 'create'] },
  { key: 'shifts', label: 'Shifts', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'employeeShifts', label: 'Employee Shifts', actions: ['view', 'create', 'update'] },
  { key: 'dailyAttendance', label: 'Daily Attendance', actions: ['view', 'create', 'export'] },
  { key: 'monthlyAttendance', label: 'Monthly Attendance', actions: ['view', 'update', 'export'] },
  { key: 'salaryReport', label: 'Salary Report', actions: ['view', 'export'] },
  { key: 'departments', label: 'Departments', actions: ['view', 'create', 'update'] },
  { key: 'companySettings', label: 'Company Settings', actions: ['view', 'update'] },
  { key: 'violationRules', label: 'Violation Rules', actions: ['view', 'create', 'update'] },
  { key: 'leavePolicy', label: 'Leave Policy', actions: ['view', 'update'] },
  { key: 'leaves', label: 'Leave Management', actions: ['view', 'create', 'delete'] },
  { key: 'complaints', label: 'Complaints', actions: ['view', 'update'] },
  { key: 'bankDetails', label: 'Bank Details Export', actions: ['view', 'export'] },
  { key: 'assets', label: 'IT Assets', actions: ['view', 'create', 'update', 'delete'] },
];

const MODULE_KEYS = PERMISSION_MODULES.map((m) => m.key);

function emptyActions(actions) {
  return Object.fromEntries(actions.map((a) => [a, false]));
}

function fullActions(actions) {
  return Object.fromEntries(actions.map((a) => [a, true]));
}

/** Build a full permissions object (all true). */
export function createFullPermissions() {
  const out = {};
  for (const mod of PERMISSION_MODULES) {
    out[mod.key] = fullActions(mod.actions);
  }
  return out;
}

/** Build an empty permissions object (all false). */
export function createEmptyPermissions() {
  const out = {};
  for (const mod of PERMISSION_MODULES) {
    out[mod.key] = emptyActions(mod.actions);
  }
  return out;
}

function clonePermissions(src) {
  const base = createEmptyPermissions();
  if (!src || typeof src !== 'object') return base;
  for (const mod of PERMISSION_MODULES) {
    const incoming = src[mod.key];
    if (!incoming || typeof incoming !== 'object') continue;
    for (const action of mod.actions) {
      base[mod.key][action] = !!incoming[action];
    }
    // view off → force other actions off
    if (!base[mod.key].view) {
      for (const action of mod.actions) {
        if (action !== 'view') base[mod.key][action] = false;
      }
    }
  }
  return base;
}

/** Normalize / sanitize a permissions payload from the client. */
export function normalizePermissions(input) {
  return clonePermissions(input);
}

export const PERMISSION_PRESETS = {
  full_access: {
    id: 'full_access',
    label: 'Full Access (HR Manager)',
    description: 'All modules — view, create, update, delete',
    build: () => createFullPermissions(),
  },
  attendance_officer: {
    id: 'attendance_officer',
    label: 'Attendance Officer',
    description: 'Daily/monthly attendance + shifts; no salary or settings',
    build: () => {
      const p = createEmptyPermissions();
      p.employees = { view: true, create: false, update: false, delete: false };
      p.shifts = { view: true, create: false, update: false, delete: false };
      p.employeeShifts = { view: true, create: true, update: true };
      p.dailyAttendance = { view: true, create: true, export: true };
      p.monthlyAttendance = { view: true, update: true };
      p.leaves = { view: true, create: true, delete: false };
      return p;
    },
  },
  payroll_officer: {
    id: 'payroll_officer',
    label: 'Payroll Officer',
    description: 'Salary report, bank export, monthly attendance view',
    build: () => {
      const p = createEmptyPermissions();
      p.employees = { view: true, create: false, update: false, delete: false };
      p.monthlyAttendance = { view: true, update: false };
      p.salaryReport = { view: true, export: true };
      p.bankDetails = { view: true, export: true };
      p.leaves = { view: true, create: false, delete: false };
      return p;
    },
  },
  read_only: {
    id: 'read_only',
    label: 'Read Only',
    description: 'View all modules; no create/update/delete',
    build: () => {
      const p = createEmptyPermissions();
      for (const mod of PERMISSION_MODULES) {
        p[mod.key] = emptyActions(mod.actions);
        p[mod.key].view = true;
      }
      // Keep user registration off for read-only
      p.users = { view: false, create: false };
      p.bankDetails = { view: true, export: false };
      return p;
    },
  },
  hr_assistant: {
    id: 'hr_assistant',
    label: 'HR Assistant',
    description: 'Employees, leaves, complaints — no company settings',
    build: () => {
      const p = createEmptyPermissions();
      p.employees = { view: true, create: true, update: true, delete: false };
      p.archivedEmployees = { view: true, update: false };
      p.portalAccess = { view: true, update: true };
      p.shifts = { view: true, create: false, update: false, delete: false };
      p.employeeShifts = { view: true, create: true, update: true };
      p.dailyAttendance = { view: true, create: false, export: false };
      p.monthlyAttendance = { view: true, update: false };
      p.departments = { view: true, create: false, update: false };
      p.leaves = { view: true, create: true, delete: true };
      p.leavePolicy = { view: true, update: false };
      p.complaints = { view: true, update: true };
      return p;
    },
  },
  it_officer: {
    id: 'it_officer',
    label: 'IT Admin',
    description: 'IT Assets only — inventory & assign/return; no HR/payroll modules',
    build: () => {
      const p = createEmptyPermissions();
      p.assets = { view: true, create: true, update: true, delete: true };
      return p;
    },
  },
};

export const PRESET_LIST = Object.values(PERMISSION_PRESETS);

/**
 * Resolve effective permissions for a user document / session payload.
 * - ADMIN → full
 * - Missing/empty permissions on HR → full (legacy)
 * - Otherwise → normalized stored permissions
 */
export function resolvePermissions(user) {
  const role = String(user?.role || '').toUpperCase();
  if (role === 'ADMIN') return createFullPermissions();
  if (role !== 'HR') return createEmptyPermissions();

  const raw = user?.permissions;
  const hasAny =
    raw &&
    typeof raw === 'object' &&
    MODULE_KEYS.some((key) => raw[key] && typeof raw[key] === 'object');

  if (!hasAny) return createFullPermissions();
  return normalizePermissions(raw);
}

/**
 * Check if a user may perform an action on a module.
 */
export function hasPermission(user, moduleKey, action = 'view') {
  const role = String(user?.role || '').toUpperCase();
  if (role === 'ADMIN') return true;
  if (role !== 'HR') return false;

  const perms = resolvePermissions(user);
  const mod = perms[moduleKey];
  if (!mod) return false;
  return !!mod[action];
}

/**
 * Mongoose subdocument shape for User.permissions
 */
export function buildPermissionsSchemaDefinition(Schema) {
  const moduleShape = {};
  for (const mod of PERMISSION_MODULES) {
    const actionShape = {};
    for (const action of mod.actions) {
      actionShape[action] = { type: Boolean, default: false };
    }
    moduleShape[mod.key] = actionShape;
  }
  return new Schema(moduleShape, { _id: false });
}
