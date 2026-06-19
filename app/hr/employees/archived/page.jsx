'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import EmployeeFilters from '../../../../components/employees/EmployeeFilters';
import EmployeeAvatar from '../../../../components/employees/EmployeeAvatar';
import PaginationControls from '../../../../components/common/PaginationControls';
import Toast from '../../../../components/common/Toast';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog';
import Modal from '../../../../components/ui/Modal';
import { useTheme } from '@/lib/theme/ThemeContext';

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

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid #E5E7EB',
  fontWeight: 600,
  fontSize: 13,
  color: '#0f172a',
  backgroundColor: '#e5f1ff',
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: 14,
  color: '#1f2937',
  backgroundColor: '#ffffff',
};

export default function FormerEmployeesPage() {
  const router = useRouter();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
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
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 2600);
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

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `,
        }}
      />
      <div
        style={{
          minHeight: '100vh',
          padding: '24px 28px 32px',
          background: 'radial-gradient(circle at top, #0b2344 0, #0a1b32 35%, #061523 100%)',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ width: '100%', maxWidth: '100%', margin: 0 }}>
          {/* Header — same as Employee Manager */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
              padding: '14px 20px',
              borderRadius: 12,
              background: 'linear-gradient(90deg, #0a2c54, #0f5ba5, #13a8e5)',
              color: '#f9fafb',
              boxShadow: '0 12px 28px rgba(15,23,42,0.55)',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '999px',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(15,23,42,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src="/gds.png"
                  alt="Global Digital Solutions logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.4 }}>
                  Global Digital Solutions
                </div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  Former Employees Archive
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => loadEmployees()}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: 'none',
                  backgroundColor: 'rgba(15,23,42,0.28)',
                  color: '#e5f2ff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: loading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '999px',
                        border: '2px solid rgba(191,219,254,0.6)',
                        borderTopColor: '#ffffff',
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
              <button
                type="button"
                onClick={() => router.push('/hr/employees/manage')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.35)',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  color: '#f9fafb',
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
                  padding: '8px 20px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #22c55e)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                }}
              >
                HR Hub
              </button>
            </div>
          </div>

          {/* Main card — same as Employee Manager */}
          <div
            style={{
              borderRadius: 16,
              backgroundColor: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              padding: '24px 28px 28px',
              border: '1px solid #e5e7eb',
            }}
          >
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
                    color: '#111827',
                    marginBottom: 6,
                    letterSpacing: '-0.025em',
                  }}
                >
                  Archived Records ({pagination.total})
                </h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                  Deactivated staff — hidden from manager, daily sheet, and current monthly payroll.
                  Attendance history is kept; past months still show records when reopening old sheets.
                </p>
              </div>
              <EmployeeFilters
                searchQuery={searchQuery}
                onSearchChange={(value) => {
                  setSearchQuery(value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', marginTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Employee</th>
                    <th style={thStyle}>Department</th>
                    <th style={thStyle}>Last Working Day</th>
                    <th style={thStyle}>Deactivated</th>
                    <th style={thStyle}>Reason</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', padding: 32, color: '#6b7280' }}>
                        Loading…
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', padding: 32, color: '#6b7280' }}>
                        No former employees yet.
                      </td>
                    </tr>
                  ) : (
                    employees.map((emp, index) => (
                      <tr
                        key={emp.empCode}
                        style={{
                          backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f9ff';
                          e.currentTarget.style.boxShadow = 'inset 4px 0 0 0 #3b82f6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <EmployeeAvatar employee={emp} size={40} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
                                {emp.name || 'No Name'}
                              </div>
                              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
                                {emp.empCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          {emp.department ? (
                            <span
                              style={{
                                padding: '6px 12px',
                                borderRadius: 16,
                                backgroundColor: '#eff6ff',
                                color: '#1d4ed8',
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {emp.department}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={tdStyle}>{emp.lastWorkingDay || '—'}</td>
                        <td style={tdStyle}>
                          <div>{formatDate(emp.deletedAt)}</div>
                          {emp.deletedBy ? (
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                              by {emp.deletedBy}
                            </div>
                          ) : null}
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 8,
                              backgroundColor: '#fef2f2',
                              color: '#b91c1c',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {emp.deleteReason || 'Terminated'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => setViewEmployee(emp)}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                color: '#ffffff',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)',
                              }}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              disabled={restoringId === emp.empCode}
                              onClick={() => setRestoreConfirm({ isOpen: true, employee: emp })}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: 'linear-gradient(135deg, #10b981, #22c55e)',
                                color: '#ffffff',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: restoringId === emp.empCode ? 'default' : 'pointer',
                                opacity: restoringId === emp.empCode ? 0.7 : 1,
                                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
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

            <PaginationControls
              currentPage={currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              itemsPerPage={pagination.limit}
              onPageChange={setCurrentPage}
              loading={loading}
            />
          </div>
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
                <span style={{ color: colors.text?.secondary || '#64748b', fontWeight: 600 }}>{label}</span>
                <span style={{ color: colors.text?.primary || '#0f172a' }}>{value ?? '—'}</span>
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
    </>
  );
}
