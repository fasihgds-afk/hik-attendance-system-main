'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Toast from '../../../../components/common/Toast';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog';
import Modal from '../../../../components/ui/Modal';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

export default function FormerEmployeesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [toast, setToast] = useState({ type: '', text: '' });
  const [restoringId, setRestoringId] = useState(null);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState({ isOpen: false, employee: null });

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3000);
  }

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '50',
      });
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/hr/employees/archived?${params.toString()}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || body.message || 'Failed to load former employees');
      }

      const data = body.data ?? body;
      setEmployees(data.items || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 });
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load former employees');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  async function handleRestore(emp) {
    setRestoringId(emp.empCode);
    try {
      const res = await fetch('/api/hr/employees/archived', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empCode: emp.empCode }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || body.message || 'Failed to restore employee');
      }
      showToast('success', `${emp.name || emp.empCode} restored to active employees`);
      setRestoreConfirm({ isOpen: false, employee: null });
      await loadEmployees();
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to restore employee');
    } finally {
      setRestoringId(null);
    }
  }

  const thStyle = {
    padding: '10px 12px',
    textAlign: 'left',
    borderBottom: '1px solid #E5E7EB',
    fontWeight: 600,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#fef2f2',
  };

  const tdStyle = {
    padding: '9px 12px',
    borderBottom: '1px solid #E5E7EB',
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px 28px 32px',
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.12)',
        }}
      >
        <div
          style={{
            padding: '20px 28px',
            background: 'linear-gradient(90deg, #7f1d1d 0%, #b91c1c 35%, #ef4444 100%)',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Former Employees</div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
              Deactivated staff — hidden from manager, daily sheet, and current monthly payroll
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push('/hr/employees/manage')}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.35)',
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Active Employees
            </button>
            <button
              type="button"
              onClick={() => router.push('/hr/employees')}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: 'none',
                background: 'rgba(15,23,42,0.28)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              HR Hub
            </button>
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '24px 28px 28px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
                Archived records ({pagination.total})
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
                Attendance and payroll history is kept. Past months still show records when reopening old sheets.
              </p>
            </div>
            <input
              type="search"
              placeholder="Search by name, email, or emp code…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                minWidth: 260,
                fontSize: 13,
              }}
            />
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Emp Code</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Department</th>
                  <th style={thStyle}>Last Working Day</th>
                  <th style={thStyle}>Deactivated</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: 32, color: '#6b7280' }}>
                      Loading…
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: 32, color: '#6b7280' }}>
                      No former employees yet.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.empCode}>
                      <td style={tdStyle}>{emp.empCode}</td>
                      <td style={tdStyle}>{emp.name || '—'}</td>
                      <td style={tdStyle}>{emp.department || '—'}</td>
                      <td style={tdStyle}>{emp.lastWorkingDay || '—'}</td>
                      <td style={tdStyle}>
                        {formatDate(emp.deletedAt)}
                        {emp.deletedBy ? (
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>by {emp.deletedBy}</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{emp.deleteReason || '—'}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setViewEmployee(emp)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            disabled={restoringId === emp.empCode}
                            onClick={() => setRestoreConfirm({ isOpen: true, employee: emp })}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#059669',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: restoringId === emp.empCode ? 'default' : 'pointer',
                              opacity: restoringId === emp.empCode ? 0.7 : 1,
                            }}
                          >
                            {restoringId === emp.empCode ? 'Restoring…' : 'Restore'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  cursor: currentPage <= 1 ? 'default' : 'pointer',
                  opacity: currentPage <= 1 ? 0.5 : 1,
                }}
              >
                Previous
              </button>
              <span style={{ alignSelf: 'center', fontSize: 13, color: '#64748b' }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= pagination.totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  cursor: currentPage >= pagination.totalPages ? 'default' : 'pointer',
                  opacity: currentPage >= pagination.totalPages ? 0.5 : 1,
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={!!viewEmployee}
        onClose={() => setViewEmployee(null)}
        title={viewEmployee ? `Employee ${viewEmployee.empCode}` : 'Employee details'}
        size="md"
      >
        {viewEmployee && (
          <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
            {[
              ['Name', viewEmployee.name],
              ['Email', viewEmployee.email],
              ['Department', viewEmployee.department],
              ['Designation', viewEmployee.designation],
              ['Shift', viewEmployee.shift],
              ['Monthly salary', viewEmployee.monthlySalary],
              ['Phone', viewEmployee.phoneNumber],
              ['Last working day', viewEmployee.lastWorkingDay || '—'],
              ['Deactivated', formatDate(viewEmployee.deletedAt)],
              ['Deactivated by', viewEmployee.deletedBy || '—'],
              ['Reason', viewEmployee.deleteReason || '—'],
              ['Status', viewEmployee.status || 'terminated'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>{label}</span>
                <span style={{ color: '#0f172a' }}>{value ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={restoreConfirm.isOpen}
        onClose={() => setRestoreConfirm({ isOpen: false, employee: null })}
        onConfirm={() => restoreConfirm.employee && handleRestore(restoreConfirm.employee)}
        title="Restore Employee"
        message={`Restore ${restoreConfirm.employee?.empCode} (${restoreConfirm.employee?.name || 'No name'}) to active employees? They will appear in the manager again. Portal login stays disabled until HR re-enables it.`}
        confirmText="Restore"
        cancelText="Cancel"
        variant="info"
      />

      <Toast type={toast.type} message={toast.text} onClose={() => setToast({ type: '', text: '' })} />
    </div>
  );
}
