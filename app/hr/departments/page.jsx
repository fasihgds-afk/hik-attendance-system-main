'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { usePermissions } from '@/hooks/usePermissions';

const tableHeaderBg = (colors, isDark) => (isDark ? '#1e293b' : (colors.background?.table?.header ?? 'rgba(59, 130, 246, 0.08)'));
const tableBorder = (colors, isDark) => (isDark ? 'rgba(55, 65, 81, 0.8)' : (colors.border?.table ?? colors.border?.default ?? '#e5e7eb'));
const tableCellColor = (colors, isDark) => (isDark ? '#cbd5e1' : (colors.text?.table?.cell ?? colors.text?.primary ?? '#0f172a'));
const tableHeaderColor = (colors, isDark) => (isDark ? '#f1f5f9' : (colors.text?.table?.header ?? colors.text?.primary ?? '#0f172a'));
const rowBg = (colors, index, isDark) => (isDark ? (index % 2 === 0 ? '#0f172a' : '#1e293b') : (index % 2 === 0 ? (colors.background?.table?.row ?? colors.background?.card ?? '#fff') : (colors.background?.table?.rowEven ?? colors.background?.default ?? '#f8fafc')));
const rowHover = (colors, isDark) => (isDark ? '#334155' : (colors.background?.table?.rowHover ?? colors.background?.hover ?? '#f1f5f9'));

function isAlternateSaturdayPolicy(p) {
  return p !== 'all_off' && p !== 'all_working';
}

function policyLabel(p) {
  if (p === 'all_off') return 'All Saturdays Off';
  if (p === 'all_working') return 'All Saturdays Working';
  return 'Alternate (1st/3rd vs 2nd/4th)';
}

function policyToastLabel(p) {
  if (p === 'all_off') return 'All Saturdays Off';
  if (p === 'all_working') return 'All Saturdays Working';
  return 'Alternate Saturdays';
}

export default function DepartmentPoliciesPage() {
  const router = useRouter();
  const { canCreate, canUpdate } = usePermissions('departments');
  const { colors, theme } = useTheme();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    saturdayPolicy: 'alternate',
    fifthSaturdayPolicy: 'working_all',
  });
  const [saving, setSaving] = useState(false);

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3000);
  }

  async function loadDepartments() {
    try {
      setLoading(true);
      const res = await fetch('/api/hr/departments', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load departments');
      const response = await res.json();
      const list = response.data?.departments ?? response.departments ?? [];
      setDepartments(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=hr' });
      router.push('/login?role=hr');
    } catch (e) {
      router.push('/login?role=hr');
    }
  };

  function openAddModal() {
    setFormData({
      name: '',
      saturdayPolicy: 'alternate',
      fifthSaturdayPolicy: 'working_all',
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (!saving) setModalOpen(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    const name = (formData.name || '').trim();
    if (!name) {
      showToast('error', 'Department name is required');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch('/api/hr/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          saturdayPolicy: formData.saturdayPolicy || 'alternate',
          fifthSaturdayPolicy: formData.fifthSaturdayPolicy || 'working_all',
        }),
      });
      const response = await res.json();
      if (!res.ok) throw new Error(response.error || response.message || 'Failed to create department');
      showToast('success', `Department "${name}" created`);
      setModalOpen(false);
      await loadDepartments();
    } catch (err) {
      showToast('error', err.message || 'Failed to create department');
    } finally {
      setSaving(false);
    }
  }

  async function handlePolicyChange(dept, newPolicy) {
    try {
      const res = await fetch('/api/hr/departments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dept.name,
          saturdayPolicy: newPolicy,
          fifthSaturdayPolicy: dept.fifthSaturdayPolicy || 'working_all',
        }),
      });
      const response = await res.json();
      if (!res.ok) throw new Error(response.error || response.message || 'Failed to update');
      showToast('success', `"${dept.name}" updated to ${policyToastLabel(newPolicy)}`);
      await loadDepartments();
    } catch (err) {
      showToast('error', err.message || 'Failed to update');
    }
  }

  async function handleFifthPolicyChange(dept, newFifthPolicy) {
    try {
      const res = await fetch('/api/hr/departments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dept.name,
          saturdayPolicy: dept.saturdayPolicy || 'alternate',
          fifthSaturdayPolicy: newFifthPolicy,
        }),
      });
      const response = await res.json();
      if (!res.ok) throw new Error(response.error || response.message || 'Failed to update');
      showToast('success', `"${dept.name}" 5th Saturday policy updated`);
      await loadDepartments();
    } catch (err) {
      showToast('error', err.message || 'Failed to update');
    }
  }

  async function handleSaturdayShiftChange(dept, patch) {
    try {
      const res = await fetch('/api/hr/departments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dept.name,
          saturdayPolicy: dept.saturdayPolicy || 'alternate',
          fifthSaturdayPolicy: dept.fifthSaturdayPolicy || 'working_all',
          saturdayShiftMode: dept.saturdayShiftMode || 'own_time',
          saturdayUnifiedStart: dept.saturdayUnifiedStart || '21:00',
          saturdayUnifiedEnd: dept.saturdayUnifiedEnd || '06:00',
          saturdayUnifiedCrossesMidnight: dept.saturdayUnifiedCrossesMidnight ?? true,
          ...patch,
        }),
      });
      const response = await res.json();
      if (!res.ok) throw new Error(response.error || response.message || 'Failed to update');
      showToast('success', `"${dept.name}" Saturday shift updated`);
      await loadDepartments();
    } catch (err) {
      showToast('error', err.message || 'Failed to update');
    }
  }

  const fifthPolicyLabel = (p) => {
    if (p === 'off_all') return 'Off for all';
    if (p === 'group_alternate') return 'By group (A off odd, B off even)';
    return 'Working for all';
  };

  // Glass shell page — theme tokens for surfaces
  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/hr/company-settings')} className="dept-button" style={glossPill('slate')}>
        Company Settings
      </button>
      <button type="button" onClick={() => router.push('/hr/employees')} className="dept-button" style={glossPill('neutral')}>
        Back to HR
      </button>
      {canCreate && (
        <button type="button" onClick={openAddModal} className="dept-button" style={glossPill('neutral')}>
          <span style={{ fontSize: 18 }}>+</span>
          Add Department
        </button>
      )}
      <button type="button" onClick={handleLogout} className="dept-button" style={glossPill('rose')}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Logout
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell
      subtitle="Department Policies · Saturday off rules (All off or Alternate by group)"
      actions={headerActions}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media (max-width: 768px) {
            .dept-header {
              flex-direction: column !important;
              align-items: flex-start !important;
            }
            .dept-header > div:first-child {
              margin-bottom: 12px;
            }
            .dept-table-wrapper {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            .dept-table {
              min-width: 860px;
            }
            .dept-modal {
              padding: 16px !important;
              max-width: 95% !important;
            }
            .dept-form-grid {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 480px) {
            .dept-header-logo {
              width: 60px !important;
              height: 60px !important;
            }
            .dept-header-title {
              font-size: 18px !important;
            }
            .dept-header-subtitle {
              font-size: 11px !important;
            }
            .dept-button {
              width: 100% !important;
              justify-content: center !important;
            }
          }
          @media (min-width: 1024px) and (max-width: 1366px) {
            .dept-header {
              padding: 16px 22px !important;
            }
            .dept-header-logo {
              width: 75px !important;
              height: 75px !important;
            }
            .dept-header-title {
              font-size: 20px !important;
            }
            .dept-header > div:last-child {
              flex-wrap: wrap !important;
              gap: 8px !important;
            }
            .dept-button {
              padding: 8px 16px !important;
              font-size: 12px !important;
            }
            .dept-table {
              font-size: 12px !important;
            }
            .dept-table th,
            .dept-table td {
              padding: 8px 10px !important;
            }
          }
          @media (min-width: 1367px) and (max-width: 1440px) {
            .dept-header {
              padding: 18px 24px !important;
            }
            .dept-table {
              font-size: 12.5px !important;
            }
          }
          @media (min-width: 1441px) and (max-width: 1920px) {
            .dept-header {
              padding: 20px 28px !important;
            }
            .dept-table {
              font-size: 13px !important;
            }
          }
          @media (min-width: 1921px) {
            .dept-header {
              padding: 24px 32px !important;
            }
            .dept-header-title {
              font-size: 24px !important;
            }
            .dept-header-logo {
              width: 100px !important;
              height: 100px !important;
            }
            .dept-table {
              font-size: 14px !important;
            }
            .dept-table th,
            .dept-table td {
              padding: 10px 14px !important;
            }
          }
        `,
        }}
      />

        <GlassCard style={{ marginTop: 18 }} padding={20}>
        {toast.text && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              backgroundColor: toast.type === 'success'
                ? (theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : `${colors.success}20`)
                : (theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : `${colors.error}20`),
              color: toast.type === 'success' ? colors.success : colors.error,
              fontSize: 14,
              border: `1px solid ${toast.type === 'success' ? colors.success : colors.error}40`,
            }}
          >
            {toast.text}
          </div>
        )}

        <p style={{
          marginBottom: 20,
          fontSize: 14,
          color: theme === 'dark' ? '#cbd5e1' : colors.text?.secondary,
          lineHeight: 1.6,
        }}>
          Assign a <strong style={{ color: theme === 'dark' ? '#f1f5f9' : 'inherit' }}>Saturday policy</strong> per department. Employees get their department from the employee form; use the same name here. <strong style={{ color: theme === 'dark' ? '#f1f5f9' : 'inherit' }}>All Saturdays Working</strong> = every Saturday counts as a working day. <strong style={{ color: theme === 'dark' ? '#f1f5f9' : 'inherit' }}>All Saturdays Off</strong> = every Saturday is off. <strong style={{ color: theme === 'dark' ? '#f1f5f9' : 'inherit' }}>Alternate</strong> = Group A off on 1st/3rd, Group B off on 2nd/4th. With <strong style={{ color: theme === 'dark' ? '#f1f5f9' : 'inherit' }}>Company Settings → Per employee working days</strong>, salary divisor follows each employee&apos;s real off days.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: theme === 'dark' ? '#94a3b8' : (colors.text?.muted ?? colors.text?.secondary) }}>
            Loading departments…
          </div>
        ) : departments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: theme === 'dark' ? '#94a3b8' : (colors.text?.muted ?? colors.text?.secondary), fontSize: 14 }}>
            No departments yet. Add one to set Saturday policy; then assign employees to that department name in Manage Employees.
          </div>
        ) : (
          <div
            className="dept-table-wrapper hr-table-scroll table-responsive"
            style={{
              borderRadius: 12,
              border: `1px solid ${tableBorder(colors, theme === 'dark')}`,
              overflow: 'hidden',
              overflowX: 'auto',
              backgroundColor: colors.background?.card,
            }}
          >
            <table
              className="dept-table"
              style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}
            >
              <thead>
                <tr style={{ backgroundColor: tableHeaderBg(colors, theme === 'dark'), borderBottom: `2px solid ${tableBorder(colors, theme === 'dark')}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: tableHeaderColor(colors, theme === 'dark') }}>
                    Department
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: tableHeaderColor(colors, theme === 'dark') }}>
                    Saturday Policy
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: tableHeaderColor(colors, theme === 'dark') }}>
                    5th Saturday
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: tableHeaderColor(colors, theme === 'dark') }}>
                    Saturday Shift
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: tableHeaderColor(colors, theme === 'dark') }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d, index) => (
                  <tr
                    key={d.name || d._id}
                    style={{
                      borderBottom: `1px solid ${tableBorder(colors, theme === 'dark')}`,
                      backgroundColor: rowBg(colors, index, theme === 'dark'),
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = rowHover(colors, theme === 'dark');
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = rowBg(colors, index, theme === 'dark');
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: tableCellColor(colors, theme === 'dark') }}>
                      {d.name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: tableCellColor(colors, theme === 'dark') }}>
                      {policyLabel(d.saturdayPolicy)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, color: tableCellColor(colors, theme === 'dark') }}>
                      {d.saturdayPolicy === 'all_off' ? (
                        <span style={{ opacity: 0.7 }}>N/A (all Saturdays off)</span>
                      ) : d.saturdayPolicy === 'all_working' ? (
                        <span style={{ opacity: 0.7 }}>N/A (all Saturdays working)</span>
                      ) : (
                        fifthPolicyLabel(d.fifthSaturdayPolicy)
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {d.saturdayPolicy === 'all_off' ? (
                        <span style={{ opacity: 0.7, fontSize: 13, color: tableCellColor(colors, theme === 'dark') }}>N/A (no Saturday work)</span>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <select
                            value={d.saturdayShiftMode || 'own_time'}
                            disabled={!canUpdate}
                            onChange={(e) => handleSaturdayShiftChange(d, { saturdayShiftMode: e.target.value })}
                            style={{
                              padding: '8px 12px', borderRadius: 8,
                              border: `1px solid ${theme === 'dark' ? 'rgba(55, 65, 81, 0.8)' : colors.border?.default}`,
                              background: theme === 'dark' ? '#1e293b' : (colors.background?.input ?? colors.background?.card),
                              color: theme === 'dark' ? '#f1f5f9' : colors.text?.primary,
                              fontSize: 13, cursor: canUpdate ? 'pointer' : 'default', outline: 'none',
                              opacity: canUpdate ? 1 : 0.7,
                            }}
                          >
                            <option value="own_time">Each shift&apos;s own time</option>
                            <option value="unified_time">One unified time</option>
                          </select>
                          {d.saturdayShiftMode === 'unified_time' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: tableCellColor(colors, theme === 'dark') }}>
                              <input
                                type="time"
                                disabled={!canUpdate}
                                defaultValue={d.saturdayUnifiedStart || '21:00'}
                                onBlur={(e) => { if (canUpdate && e.target.value && e.target.value !== d.saturdayUnifiedStart) handleSaturdayShiftChange(d, { saturdayUnifiedStart: e.target.value }); }}
                                style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${theme === 'dark' ? 'rgba(55, 65, 81, 0.8)' : colors.border?.default}`, background: theme === 'dark' ? '#1e293b' : (colors.background?.input ?? colors.background?.card), color: theme === 'dark' ? '#f1f5f9' : colors.text?.primary, fontSize: 12, opacity: canUpdate ? 1 : 0.7 }}
                              />
                              <span>to</span>
                              <input
                                type="time"
                                disabled={!canUpdate}
                                defaultValue={d.saturdayUnifiedEnd || '06:00'}
                                onBlur={(e) => { if (canUpdate && e.target.value && e.target.value !== d.saturdayUnifiedEnd) handleSaturdayShiftChange(d, { saturdayUnifiedEnd: e.target.value }); }}
                                style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${theme === 'dark' ? 'rgba(55, 65, 81, 0.8)' : colors.border?.default}`, background: theme === 'dark' ? '#1e293b' : (colors.background?.input ?? colors.background?.card), color: theme === 'dark' ? '#f1f5f9' : colors.text?.primary, fontSize: 12, opacity: canUpdate ? 1 : 0.7 }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'grid', gap: 8 }}>
                        <select
                          value={d.saturdayPolicy || 'alternate'}
                          disabled={!canUpdate}
                          onChange={(e) => handlePolicyChange(d, e.target.value)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: `1px solid ${theme === 'dark' ? 'rgba(55, 65, 81, 0.8)' : colors.border?.default}`,
                            background: theme === 'dark' ? '#1e293b' : (colors.background?.input ?? colors.background?.card),
                            color: theme === 'dark' ? '#f1f5f9' : colors.text?.primary,
                            fontSize: 13,
                            cursor: canUpdate ? 'pointer' : 'default',
                            outline: 'none',
                            opacity: canUpdate ? 1 : 0.7,
                          }}
                        >
                          <option value="all_working">All Saturdays Working</option>
                          <option value="alternate">Alternate (1st/3rd vs 2nd/4th)</option>
                          <option value="all_off">All Saturdays Off</option>
                        </select>
                        <select
                          value={d.fifthSaturdayPolicy || 'working_all'}
                          onChange={(e) => handleFifthPolicyChange(d, e.target.value)}
                          disabled={!canUpdate || !isAlternateSaturdayPolicy(d.saturdayPolicy)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: `1px solid ${theme === 'dark' ? 'rgba(55, 65, 81, 0.8)' : colors.border?.default}`,
                            background: theme === 'dark' ? '#1e293b' : (colors.background?.input ?? colors.background?.card),
                            color: theme === 'dark' ? '#f1f5f9' : colors.text?.primary,
                            fontSize: 13,
                            cursor: canUpdate && isAlternateSaturdayPolicy(d.saturdayPolicy) ? 'pointer' : 'not-allowed',
                            outline: 'none',
                            opacity: canUpdate && isAlternateSaturdayPolicy(d.saturdayPolicy) ? 1 : 0.6,
                          }}
                        >
                          <option value="working_all">5th Saturday: Working for all</option>
                          <option value="off_all">5th Saturday: Off for all</option>
                          <option value="group_alternate">5th Saturday: By group</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </GlassCard>

      {/* Modal - same structure as Shifts */}
      {canCreate && modalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
          onClick={closeModal}
        >
          <div
            className="dept-modal"
            style={{
              backgroundColor: colors.background?.card,
              borderRadius: 16,
              padding: '24px',
              maxWidth: 500,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              border: `1px solid ${colors.border?.default}`,
              boxShadow: theme === 'dark' ? '0 20px 60px rgba(0,0,0,0.6)' : '0 20px 60px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 20,
                color: colors.text?.primary,
              }}
            >
              Add Department
            </h2>
            <form onSubmit={handleAdd}>
              <div
                className="dept-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ gridColumn: '1 / -1' }}>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text?.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Department name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. IT, HR, Development"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border?.input ?? colors.border?.default}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background?.input ?? colors.background?.default,
                      color: colors.text?.primary,
                    }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text?.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Saturday policy
                  </label>
                  <select
                    value={formData.saturdayPolicy}
                    onChange={(e) => setFormData((p) => ({ ...p, saturdayPolicy: e.target.value }))}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border?.input ?? colors.border?.default}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background?.input ?? colors.background?.default,
                      color: colors.text?.primary,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all_working">All Saturdays Working (6-day week)</option>
                    <option value="alternate">Alternate (1st/3rd vs 2nd/4th by employee group)</option>
                    <option value="all_off">All Saturdays Off</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text?.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    5th Saturday policy
                  </label>
                  <select
                    value={formData.fifthSaturdayPolicy}
                    onChange={(e) => setFormData((p) => ({ ...p, fifthSaturdayPolicy: e.target.value }))}
                    disabled={!isAlternateSaturdayPolicy(formData.saturdayPolicy)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border?.input ?? colors.border?.default}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background?.input ?? colors.background?.default,
                      color: colors.text?.primary,
                      cursor: isAlternateSaturdayPolicy(formData.saturdayPolicy) ? 'pointer' : 'not-allowed',
                      opacity: isAlternateSaturdayPolicy(formData.saturdayPolicy) ? 1 : 0.6,
                    }}
                  >
                    <option value="working_all">Working for all</option>
                    <option value="off_all">Off for all</option>
                    <option value="group_alternate">By group (A off odd, B off even)</option>
                  </select>
                  {formData.saturdayPolicy === 'all_off' && (
                    <div style={{ marginTop: 6, fontSize: 12, color: colors.text?.muted ?? colors.text?.secondary }}>
                      Not used when Saturday policy is set to All Saturdays Off.
                    </div>
                  )}
                  {formData.saturdayPolicy === 'all_working' && (
                    <div style={{ marginTop: 6, fontSize: 12, color: colors.text?.muted ?? colors.text?.secondary }}>
                      Not used when Saturday policy is set to All Saturdays Working.
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border?.default}`,
                    background: 'transparent',
                    color: colors.text?.primary,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: `linear-gradient(135deg, ${colors.primary?.[500] ?? '#3b82f6'}, ${colors.primary?.[600] ?? '#2563eb'})`,
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: `0 4px 12px ${colors.primary?.[500] ?? '#3b82f6'}40`,
                  }}
                >
                  {saving ? 'Saving…' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HrPageShell>
  );
}
