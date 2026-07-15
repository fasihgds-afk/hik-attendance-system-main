// next-app/app/hr/employees/page.jsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmployeeTable from '../../../../components/employees/EmployeeTable';
import EmployeeFilters from '../../../../components/employees/EmployeeFilters';
import PaginationControls from '../../../../components/common/PaginationControls';
import EmployeeForm from '../../../../components/employees/EmployeeForm';
import Modal from '../../../../components/ui/Modal';
import Toast from '../../../../components/common/Toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePermissions, useModulePermission } from '@/hooks/usePermissions';
import { api } from '@/lib/api/client';
import { getCachedLookup, LOOKUP_KEYS } from '@/lib/api/lookupCache';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { spinnerRingStyle } from '@/lib/theme/styles';

export default function EmployeeShiftPage() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);
  const { canCreate, canUpdate, canDelete } = usePermissions('employees');
  const canViewBankDetails = useModulePermission('bankDetails', 'view');
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const skipSearchPageReset = React.useRef(true);

  const [toast, setToast] = useState({ type: '', text: '' });

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    employee: null,
  });
  const [deleteReason, setDeleteReason] = useState('Resigned');
  const [lastWorkingDay, setLastWorkingDay] = useState('');

  // Shift history for modal (if needed)
  const [shiftHistory, setShiftHistory] = useState([]);
  const [showShiftHistory, setShowShiftHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // --- helpers --------------------------------------------------------------

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((t) => (t.text === text ? { type: '', text: '' } : t));
    }, 2600);
  }

  async function loadShifts() {
    try {
      const shiftsList = await getCachedLookup(LOOKUP_KEYS.shiftsActive, async () => {
        const response = await api.get('/api/hr/shifts?activeOnly=true', {
          requestKey: 'hr-shifts-active',
          // Static lookup — don't abort concurrent mounts (e.g. React Strict Mode)
          abortDuplicate: false,
        });
        if (response.aborted) {
          throw Object.assign(new Error('aborted'), { aborted: true });
        }
        if (!response.success) {
          throw new Error(response.error || response.message || 'Failed to load shifts');
        }
        return response.data?.shifts || response.data?.items || [];
      });
      setShifts(Array.isArray(shiftsList) ? shiftsList : []);
    } catch (err) {
      if (err?.aborted) return;
      console.error('Failed to load shifts:', err);
    }
  }

  async function loadDepartments() {
    try {
      const list = await getCachedLookup(LOOKUP_KEYS.departments, async () => {
        const response = await api.get('/api/hr/departments', {
          requestKey: 'hr-departments',
          abortDuplicate: false,
        });
        if (response.aborted) {
          throw Object.assign(new Error('aborted'), { aborted: true });
        }
        if (!response.success) {
          throw new Error(response.error || response.message || 'Failed to load departments');
        }
        return response.data?.departments ?? [];
      });
      setDepartments(Array.isArray(list) ? list : []);
    } catch (err) {
      if (err?.aborted) return;
      console.error('Failed to load departments:', err);
    }
  }

  async function loadEmployees() {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', '50');
      if (searchQuery) {
        params.set('search', searchQuery);
      }

      const response = await api.get(`/api/employee?${params.toString()}`, {
        requestKey: 'employee-list',
      });

      if (response.aborted) return;

      if (!response.success) {
        throw new Error(response.error || response.message || 'Failed to load employees');
      }

      const items = response.data?.items || [];
      const paginationMeta = response.meta?.pagination || response.data?.pagination || null;

      setEmployees(items);
      if (paginationMeta) {
        setPagination(paginationMeta);
      }
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }

  // OPTIMIZATION: Load shifts and departments once on mount (TTL-cached)
  useEffect(() => {
    loadShifts();
    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search and reset page together so we only fire one list request
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      if (skipSearchPageReset.current) {
        skipSearchPageReset.current = false;
      } else {
        setCurrentPage(1);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reload employees when page or debounced search changes
  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery]);

  function handleShiftChange(index, newShift) {
    setEmployees((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], shift: newShift };
      return copy;
    });
  }

  // quick save from table row
  async function handleSaveRow(emp) {
    try {
      setSavingId(emp._id || emp.empCode);

      // Get the latest employee data from state to ensure we have the updated shift
      const currentEmployee = employees.find(e => e.empCode === emp.empCode) || emp;

      // Normalize shift code to uppercase (Shift model stores codes in uppercase)
      const normalizedShift = currentEmployee.shift 
        ? String(currentEmployee.shift).trim().toUpperCase() 
        : '';

      // Capture the ORIGINAL shift from emp (before user edit in table) — this is the true previous shift
      const prevShiftCode = String(emp.shift || '').trim().toUpperCase();
      const prevShiftId = String(emp.shiftId || emp._shiftId || '').trim();

      // IMPORTANT: Record shift history BEFORE saving employee so the old shift is still in DB
      if (normalizedShift && normalizedShift !== prevShiftCode) {
        const shiftObj = shifts.find((s) => (s.code || '').toUpperCase() === normalizedShift);
        if (shiftObj?._id) {
          try {
            const today = new Date().toISOString().slice(0, 10);
            const shiftRes = await fetch('/api/hr/employee-shifts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                empCode: emp.empCode,
                shiftId: shiftObj._id.toString(),
                effectiveDate: today,
                reason: 'Changed from table',
                changedBy: 'HR',
                previousShiftCode: prevShiftCode,
                previousShiftId: /^[0-9a-fA-F]{24}$/.test(prevShiftId) ? prevShiftId : undefined,
              }),
            });
            if (!shiftRes.ok) {
              const errData = await shiftRes.json().catch(() => ({}));
              showToast('warning', errData.error || 'Shift history not updated.');
            }
          } catch (e) {
            console.error('Shift history update:', e);
            showToast('warning', 'Shift history not updated.');
          }
        }
      }

      // Now save the employee (shift history is already recorded with the old shift info)
      const res = await fetch('/api/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode: currentEmployee.empCode,
          name: currentEmployee.name,
          email: currentEmployee.email,
          monthlySalary: currentEmployee.monthlySalary,
          shift: normalizedShift,
          department: currentEmployee.department,
          designation: currentEmployee.designation,
          phoneNumber: currentEmployee.phoneNumber,
          cnic: currentEmployee.cnic,
          profileImageBase64: currentEmployee.profileImageBase64,
          profileImageUrl: currentEmployee.profileImageUrl,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save employee (${res.status})`);
      }

      const data = await res.json();

      // Update local state immediately for instant feedback
      // IMPORTANT: Use the returned employee data which has the updated shift
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.empCode === data.employee.empCode) {
            // Merge the returned employee data to ensure shift is updated
            return { ...e, ...data.employee };
          }
          return e;
        })
      );

      showToast(
        'success',
        `Saved ${data.employee.empCode} (${data.employee.name || 'No name'})`
      );
      
      // Refresh the list to ensure we have the latest data from server
      // Use forceRefresh to bypass cache
      setTimeout(() => {
        loadEmployees();
      }, 500);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to save employee');
    } finally {
      setSavingId(null);
    }
  }

  // Open modal for adding new employee
  function openAddModal() {
    setEditingEmployee(null);
    loadDepartments(); // Refresh so new departments from Department Policies show in dropdown
    setIsModalOpen(true);
  }

  // Handle form submission (both add and edit) - used by EmployeeForm component
  async function handleFormSubmit(formData) {
    setIsSaving(true);
    try {
      // IMPORTANT: Record shift history BEFORE saving employee so the old shift is still on the Employee model
      if (editingEmployee && formData.shift && formData.effectiveFromDate) {
        const prevShiftRaw = String(editingEmployee.shift || '').trim();
        const prevShiftIdRaw = String(editingEmployee.shiftId || editingEmployee._shiftId || '').trim();
        const newShift = String(formData.shift).trim();

        // Resolve old shift code for comparison
        const prevCode = prevShiftRaw.toUpperCase();
        let newCode = '';
        if (/^[0-9a-fA-F]{24}$/.test(newShift)) {
          const found = shifts.find((s) => s._id?.toString() === newShift);
          newCode = found ? found.code.toUpperCase() : '';
        } else {
          newCode = newShift.toUpperCase();
        }

        if (newCode && newCode !== prevCode) {
          const shiftId = /^[0-9a-fA-F]{24}$/.test(newShift)
            ? newShift
            : (shifts.find((s) => (s.code || '').toUpperCase() === newCode)?._id?.toString?.());
          if (shiftId) {
            try {
              const shiftRes = await fetch('/api/hr/employee-shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  empCode: formData.empCode.trim(),
                  shiftId,
                  effectiveDate: formData.effectiveFromDate,
                  reason: 'Updated from Manage Employee',
                  changedBy: 'HR',
                  previousShiftCode: prevCode,
                  previousShiftId: /^[0-9a-fA-F]{24}$/.test(prevShiftIdRaw) ? prevShiftIdRaw : undefined,
                }),
              });
              if (!shiftRes.ok) {
                const errData = await shiftRes.json().catch(() => ({}));
                showToast('warning', errData.error || 'Shift history not updated; employee saved.');
              }
            } catch (e) {
              console.error('Shift history update:', e);
              showToast('warning', 'Shift history not updated; employee saved.');
            }
          }
        }
      }

      const body = {
        empCode: formData.empCode.trim(),
        name: formData.name || undefined,
        email: formData.email || undefined,
        monthlySalary: formData.monthlySalary ? Number(formData.monthlySalary) : undefined,
        salaryEffectiveDate:
          String(formData.monthlySalary ?? '') !== String(editingEmployee?.monthlySalary ?? '')
            ? formData.salaryEffectiveDate
            : undefined,
        shift: formData.shift || '',
        department: (formData.department ?? '').trim(),
        designation: formData.designation || undefined,
        joinDate: formData.joinDate || undefined,
        phoneNumber: formData.phoneNumber || undefined,
        cnic: formData.cnic || undefined,
        bankDetails: formData.bankDetails || undefined,
        profileImageBase64: formData.profileImageBase64 || undefined,
        profileImageUrl: formData.profileImageUrl || undefined,
        allowWebClockIn: !!formData.allowWebClockIn,
      };

      const res = await fetch('/api/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save employee (${res.status})`);
      }

      const data = await res.json();
      const employee = data.data?.employee ?? data.employee;
      if (!employee) {
        throw new Error('Invalid response: no employee returned');
      }

      // Update employees list
      setEmployees((prev) => {
        const exists = prev.some((e) => e.empCode === employee.empCode);
        if (exists) {
          return prev.map((e) =>
            e.empCode === employee.empCode ? employee : e
          );
        }
        return [...prev, employee].sort((a, b) =>
          String(a.empCode).localeCompare(String(b.empCode))
        );
      });

      showToast('success', editingEmployee 
        ? `Employee ${employee.empCode} updated successfully`
        : `Employee ${employee.empCode} added successfully`
      );

      setIsModalOpen(false);
      setEditingEmployee(null);
      
      // Force refresh to get latest data from server (bypass cache)
      loadEmployees();
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to save employee');
    } finally {
      setIsSaving(false);
    }
  }

  // --- modal (full edit on click) ------------------------------------------

  async function loadShiftHistory(empCode) {
    try {
      setLoadingHistory(true);
      const res = await fetch(`/api/hr/employee-shifts?empCode=${empCode}`);
      if (res.ok) {
        const data = await res.json();
        setShiftHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to load shift history:', err);
      setShiftHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function autoDetectShifts(empCode) {
    try {
      setLoadingHistory(true);
      const res = await fetch('/api/hr/employee-shifts/auto-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empCode }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        // Handle specific error cases
        if (data.error && (data.error.includes('No shifts found') || data.error.includes('shifts not found'))) {
          showToast('error', 'Shifts not found in database. Please create shifts first by visiting the Shift Management page (/hr/shifts).');
          // Optionally reload shift history to show updated state
          await loadShiftHistory(empCode);
        } else {
          showToast('error', data.error || data.message || 'Failed to auto-detect shifts');
        }
        return;
      }
      
      if (data.summary && data.summary.created > 0) {
        showToast('success', `Successfully created ${data.summary.created} shift period(s)`);
        await loadShiftHistory(empCode);
      } else if (data.summary && data.summary.exists > 0) {
        showToast('info', 'Shift history already exists for these periods');
        await loadShiftHistory(empCode);
      } else {
        showToast('warning', data.message || 'No shift history created. Check if attendance records have shift codes.');
        await loadShiftHistory(empCode);
      }
    } catch (err) {
      console.error(err);
      // Try to parse error message if it's JSON
      try {
        const errorData = JSON.parse(err.message);
        if (errorData.error) {
          showToast('error', errorData.error);
        } else {
          showToast('error', err.message || 'Failed to auto-detect shifts');
        }
      } catch {
        showToast('error', err.message || 'Failed to auto-detect shifts');
      }
    } finally {
      setLoadingHistory(false);
    }
  }

  // Open modal for editing existing employee
  async function openEditModal(emp) {
    try {
      const res = await fetch(`/api/employee?empCode=${encodeURIComponent(emp.empCode)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const response = await res.json();
        const fullEmployee = response?.data?.employee || response?.employee || emp;
        setEditingEmployee(fullEmployee);
      } else {
        setEditingEmployee(emp);
      }
    } catch {
      setEditingEmployee(emp);
    }
    loadDepartments(); // Refresh so department dropdown is up to date
    setIsModalOpen(true);
    setShowShiftHistory(false);
    loadShiftHistory(emp.empCode);
  }

  // Close modal
  function closeModal() {
    setIsModalOpen(false);
    setEditingEmployee(null);
    setShowShiftHistory(false);
    setShiftHistory([]);
  }


  // ------------------------------------------------------------------------

  const isDark = theme === 'dark';

  const headerActions = (
    <HrHeaderActions className="manage-header-buttons">
      <button
        type="button"
        onClick={() => router.push('/hr/employees/archived')}
        className="manage-button"
        style={glossPill('slate')}
      >
        Former Employees
      </button>
      <button
        type="button"
        onClick={() => loadEmployees()}
        disabled={loading}
        className="manage-button"
        style={{
          ...glossPill('neutral'),
          cursor: loading ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '999px',
                ...spinnerRingStyle('rgba(191,219,254,0.6)', '#ffffff'),
                animation: 'spin 0.7s linear infinite',
              }}
            />
            Refreshing…
          </>
        ) : (
          <>
            <span>⟳</span> Refresh
          </>
        )}
      </button>
      {canCreate && (
        <button
          type="button"
          onClick={openAddModal}
          className="manage-button"
          style={{
            ...glossPill('neutral'),
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 18 }}>+</span> Add Employee
        </button>
      )}
      <button
        type="button"
        onClick={() => router.push('/hr/employees')}
        className="manage-button"
        style={glossPill('neutral')}
      >
        HR Hub
      </button>
    </HrHeaderActions>
  );

  return (
    <React.Fragment>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .manage-table-wrapper {
            overflow-x: auto !important;
          }
          .manage-table {
            min-width: 1000px !important;
            font-size: 12px !important;
          }
          .manage-table th,
          .manage-table td {
            padding: 8px 6px !important;
            font-size: 12px !important;
          }
        }
        @media (max-width: 480px) {
          .manage-button {
            width: 100% !important;
            justify-content: center !important;
          }
          .manage-table {
            min-width: 900px !important;
            font-size: 11px !important;
          }
        }
        @media (min-width: 1024px) and (max-width: 1366px) {
          .manage-table {
            font-size: 12px !important;
          }
          .manage-table th,
          .manage-table td {
            padding: 8px 10px !important;
            font-size: 12px !important;
          }
        }
        @media (min-width: 1367px) and (max-width: 1440px) {
          .manage-table {
            font-size: 12.5px !important;
          }
        }
        @media (min-width: 1441px) {
          .manage-table {
            font-size: 13px !important;
          }
        }
      `}</style>

      <HrPageShell
        subtitle="Employee Shift Management Console · Manage shifts, details, and active staff"
        actions={headerActions}
      >
        <GlassCard style={{ marginTop: 18 }} padding={20}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: isDark ? '#f1f5f9' : (colors.text?.primary ?? '#111827'),
                  marginBottom: 6,
                  letterSpacing: '-0.025em',
                }}
              >
                Employee Directory
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: isDark ? '#94a3b8' : (colors.text?.secondary ?? '#6b7280'),
                  margin: 0,
                }}
              >
                Manage employee information, shifts, and details. Double-click a row or click{' '}
                <span style={{ color: colors.primary?.[400] ?? '#0ea5e9', fontWeight: 600 }}>View</span> to open full details.
              </p>
            </div>
            <EmployeeFilters
              searchQuery={searchInput}
              onSearchChange={(value) => {
                setSearchInput(value);
              }}
            />
          </div>

          <EmployeeTable
            employees={employees}
            shifts={shifts}
            loading={loading}
            savingId={savingId}
            canUpdate={canUpdate}
            onShiftChange={canUpdate ? handleShiftChange : undefined}
            onEdit={openEditModal}
            onSave={canUpdate ? handleSaveRow : undefined}
            onDelete={canDelete ? (emp) => setDeleteConfirm({ isOpen: true, employee: emp }) : undefined}
          />

          <PaginationControls
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            itemsPerPage={pagination.limit}
            onPageChange={setCurrentPage}
            loading={loading}
          />
        </GlassCard>
      </HrPageShell>

      {/* Professional Toast Notification */}
      <Toast
        type={toast.type}
        message={toast.text}
        onClose={() => setToast({ type: '', text: '' })}
      />

      {/* Professional Modal for Add/Edit Employee */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          editingEmployee
            ? canUpdate
              ? 'Edit Employee'
              : 'View Employee'
            : 'Add New Employee'
        }
        size="lg"
      >
        <EmployeeForm
          employee={editingEmployee}
          shifts={shifts}
          departments={departments}
          onSubmit={handleFormSubmit}
          onCancel={closeModal}
          loading={isSaving}
          readOnly={editingEmployee ? !canUpdate : false}
          showBankDetails={canViewBankDetails}
        />
      </Modal>

      {/* Deactivate confirmation */}
      <Modal
        isOpen={canDelete && deleteConfirm.isOpen}
        onClose={() => {
          setDeleteConfirm({ isOpen: false, employee: null });
          setDeleteReason('Resigned');
          setLastWorkingDay('');
        }}
        title="Deactivate Employee"
        size="sm"
      >
        <p
          style={{
            margin: '0 0 16px',
            fontSize: 14,
            color: colors.text?.secondary || '#94a3b8',
            lineHeight: 1.6,
          }}
        >
          Remove{' '}
          <strong style={{ color: colors.text?.primary || '#f1f5f9' }}>
            {deleteConfirm.employee?.empCode} ({deleteConfirm.employee?.name || 'No name'})
          </strong>{' '}
          from active lists? Attendance and payroll history will be kept. They can be restored from{' '}
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>Former Employees</span>.
        </p>
        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          <label
            style={{
              display: 'grid',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: colors.text?.primary || '#e2e8f0',
            }}
          >
            Reason
            <select
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${colors.border?.default || '#374151'}`,
                backgroundColor: colors.background?.input || '#ffffff',
                color: colors.text?.primary || '#0f172a',
                fontSize: 13,
                outline: 'none',
              }}
            >
              {['Resigned', 'Terminated', 'Contract ended', 'Duplicate record', 'Other'].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              display: 'grid',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: colors.text?.primary || '#e2e8f0',
            }}
          >
            Last working day (optional)
            <input
              type="date"
              value={lastWorkingDay}
              onChange={(e) => setLastWorkingDay(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${colors.border?.default || '#374151'}`,
                backgroundColor: colors.background?.input || '#ffffff',
                color: colors.text?.primary || '#0f172a',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </label>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            paddingTop: 4,
            borderTop: `1px solid ${colors.border?.default || '#374151'}`,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setDeleteConfirm({ isOpen: false, employee: null });
              setDeleteReason('Resigned');
              setLastWorkingDay('');
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${colors.border?.default || '#cbd5e1'}`,
              background: colors.background?.card || '#fff',
              color: colors.text?.primary || '#374151',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!deleteConfirm.employee) return;

              try {
                const empCode = deleteConfirm.employee.empCode;
                const params = new URLSearchParams({ empCode });
                if (deleteReason) params.set('deleteReason', deleteReason);
                if (lastWorkingDay) params.set('lastWorkingDay', lastWorkingDay);

                const res = await fetch(`/api/employee?${params.toString()}`, {
                  method: 'DELETE',
                });

                if (!res.ok) {
                  const text = await res.text();
                  throw new Error(text || `Failed to deactivate employee (${res.status})`);
                }

                setEmployees((prev) => prev.filter((e) => e.empCode !== empCode));
                showToast('success', `Employee ${empCode} deactivated`);
                setDeleteConfirm({ isOpen: false, employee: null });
                setDeleteReason('Resigned');
                setLastWorkingDay('');
                loadEmployees();
              } catch (err) {
                console.error(err);
                showToast('error', err.message || 'Failed to deactivate employee');
              }
            }}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)',
            }}
          >
            Deactivate
          </button>
        </div>
      </Modal>
    </React.Fragment>
  );
}
