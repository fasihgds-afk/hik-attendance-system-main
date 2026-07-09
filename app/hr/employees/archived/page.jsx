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
import { usePermissions } from '@/hooks/usePermissions';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { spinnerRingStyle } from '@/lib/theme/styles';

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

const tableHeaderBg = (colors, isDark) => (isDark ? '#1e293b' : (colors.background?.table?.header ?? 'rgba(59, 130, 246, 0.08)'));
const tableBorder = (colors, isDark) => (isDark ? 'rgba(55, 65, 81, 0.8)' : (colors.border?.table ?? colors.border?.default ?? '#e5e7eb'));
const tableCellColor = (colors, isDark) => (isDark ? '#cbd5e1' : (colors.text?.table?.cell ?? colors.text?.primary ?? '#0f172a'));
const tableHeaderColor = (colors, isDark) => (isDark ? '#f1f5f9' : (colors.text?.table?.header ?? colors.text?.primary ?? '#0f172a'));
const rowBg = (colors, index, isDark) => (isDark ? (index % 2 === 0 ? '#0f172a' : '#1e293b') : (index % 2 === 0 ? (colors.background?.table?.row ?? colors.background?.card ?? '#fff') : (colors.background?.table?.rowEven ?? colors.background?.default ?? '#f8fafc')));
const rowHover = (colors, isDark) => (isDark ? '#334155' : (colors.background?.table?.rowHover ?? colors.background?.hover ?? '#f0f9ff'));

export default function FormerEmployeesPage() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const { canUpdate } = usePermissions('archivedEmployees');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [toast, setToast] = useState({ type: '', text: '' });
  const [restoringId, setRestoringId] = useState(null);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState({ isOpen: false, employee: null });

  const isDark = theme === 'dark';
  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

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

  const headerActions = (
    <HrHeaderActions>
      <button
        type="button"
        onClick={() => loadEmployees()}
        disabled={loading}
        className="archived-button"
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
      <button
        type="button"
        onClick={() => router.push('/hr/employees/manage')}
        className="archived-button"
        style={glossPill('slate')}
      >
        Active Employees
      </button>
      <button
        type="button"
        onClick={() => router.push('/hr/employees')}
        className="archived-button"
        style={glossPill('neutral')}
      >
        HR Hub
      </button>
    </HrHeaderActions>
  );

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @media (max-width: 480px) {
              .archived-button {
                width: 100% !important;
                justify-content: center !important;
              }
            }
          `,
        }}
      />
      <HrPageShell
        subtitle="Former Employees Archive · Deactivated staff hidden from active lists"
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
                Archived Records ({pagination.total})
              </h2>
              <p style={{ fontSize: 13, color: isDark ? '#94a3b8' : (colors.text?.secondary ?? '#6b7280'), margin: 0 }}>
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

          <div
            className="archived-table-wrapper hr-table-scroll table-responsive"
            style={{
              overflowX: 'auto',
              borderRadius: 12,
              border: `1px solid ${tableBorder(colors, isDark)}`,
              marginTop: 16,
            }}
          >
            <table className="archived-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr style={{ backgroundColor: tableHeaderBg(colors, isDark), borderBottom: `2px solid ${tableBorder(colors, isDark)}` }}>
                  {['Employee', 'Department', 'Last Working Day', 'Deactivated', 'Reason'].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: '10px 12px',
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: 13,
                        color: tableHeaderColor(colors, isDark),
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, fontSize: 13, color: tableHeaderColor(colors, isDark) }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: isDark ? '#94a3b8' : (colors.text?.muted ?? '#6b7280'), fontSize: 14 }}>
                      Loading…
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: isDark ? '#94a3b8' : (colors.text?.muted ?? '#6b7280'), fontSize: 14 }}>
                      No former employees yet.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp, index) => (
                    <tr
                      key={emp.empCode}
                      style={{
                        borderBottom: `1px solid ${tableBorder(colors, isDark)}`,
                        backgroundColor: rowBg(colors, index, isDark),
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = rowHover(colors, isDark);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = rowBg(colors, index, isDark);
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 14, color: tableCellColor(colors, isDark) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <EmployeeAvatar employee={emp} size={40} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: isDark ? '#f1f5f9' : (colors.text?.primary ?? '#111827') }}>
                              {emp.name || 'No Name'}
                            </div>
                            <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : (colors.text?.muted ?? '#6b7280'), fontWeight: 500 }}>
                              {emp.empCode}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: tableCellColor(colors, isDark) }}>
                        {emp.department ? (
                          <span
                            style={{
                              padding: '6px 12px',
                              borderRadius: 16,
                              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#eff6ff',
                              color: isDark ? '#93c5fd' : '#1d4ed8',
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
                      <td style={{ padding: '12px 16px', fontSize: 14, color: tableCellColor(colors, isDark) }}>{emp.lastWorkingDay || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: tableCellColor(colors, isDark) }}>
                        <div>{formatDate(emp.deletedAt)}</div>
                        {emp.deletedBy ? (
                          <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : (colors.text?.muted ?? '#6b7280'), marginTop: 2 }}>
                            by {emp.deletedBy}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: tableCellColor(colors, isDark) }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2',
                            color: isDark ? '#fca5a5' : '#b91c1c',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {emp.deleteReason || 'Terminated'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setViewEmployee(emp)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 8,
                              border: 'none',
                              background: `linear-gradient(135deg, ${colors.primary?.[500] ?? '#3b82f6'}, ${colors.primary?.[600] ?? '#2563eb'})`,
                              color: '#ffffff',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                              boxShadow: `0 2px 4px ${colors.primary?.[500] ?? '#3b82f6'}33`,
                            }}
                          >
                            View
                          </button>
                          {canUpdate && (
                            <button
                              type="button"
                              disabled={restoringId === emp.empCode}
                              onClick={() => setRestoreConfirm({ isOpen: true, employee: emp })}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: `linear-gradient(135deg, ${colors.success ?? '#10b981'}, #22c55e)`,
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
                          )}
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
        </GlassCard>
      </HrPageShell>

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
        isOpen={canUpdate && restoreConfirm.isOpen}
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
