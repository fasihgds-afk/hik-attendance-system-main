'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import {
  HrPageShell,
  HrHeaderActions,
  GlassCard,
  getGlossPillStyles,
} from '@/components/glass';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getStatusTone(status, primary, successColor, warningColor) {
  if (status === 'resolved') return { color: successColor, bg: `${successColor}22` };
  if (status === 'closed') return { color: '#64748b', bg: 'rgba(100,116,139,0.2)' };
  if (status === 'in_progress') return { color: warningColor, bg: `${warningColor}22` };
  return { color: primary, bg: `${primary}22` };
}

export default function EmployeeComplaintsPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const empCode = session?.user?.empCode;

  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState({ type: '', text: '' });
  const [form, setForm] = useState({ subject: '', description: '' });

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' || (session && session.user?.role !== 'EMPLOYEE')) {
      router.replace('/login?role=employee');
    }
  }, [session, status, router]);

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3000);
  }

  async function loadComplaints() {
    if (!empCode) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/employee/complaints?empCode=${encodeURIComponent(empCode)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setComplaints(data.data?.complaints || []);
      } else {
        showToast('error', data.error || 'Failed to load complaints');
      }
    } catch (_) {
      showToast('error', 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (empCode) loadComplaints();
  }, [empCode]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setViewId(id);
  }, [searchParams]);

  async function loadDetail(id) {
    if (!id || !empCode) return;
    try {
      const res = await fetch(
        `/api/employee/complaints/${id}?empCode=${encodeURIComponent(empCode)}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (res.ok && data.success) setDetail(data.data?.complaint || null);
      else setDetail(null);
    } catch (_) {
      setDetail(null);
    }
  }

  useEffect(() => {
    if (viewId) loadDetail(viewId);
    else setDetail(null);
  }, [viewId, empCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) {
      showToast('error', 'Subject and description are required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/employee/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode,
          subject: form.subject.trim(),
          description: form.description.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', 'Complaint submitted successfully');
        setShowForm(false);
        setForm({ subject: '', description: '' });
        loadComplaints();
      } else {
        showToast('error', data.error || 'Failed to submit complaint');
      }
    } catch (_) {
      showToast('error', 'Failed to submit complaint');
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=employee' });
      router.push('/login?role=employee');
    } catch (_) {
      router.push('/login?role=employee');
    }
  };

  const border = colors.border?.default;
  const textPrimary = colors.text?.primary;
  const textSecondary = colors.text?.secondary;
  const textTertiary = colors.text?.tertiary ?? textSecondary;
  const primary = typeof colors.primary === 'object' ? colors.primary?.[500] : colors.primary;
  const successColor =
    colors.success ??
    (typeof colors.secondary === 'object' ? colors.secondary?.[600] : colors.secondary) ??
    '#22c55e';
  const warningColor =
    colors.warning ??
    (typeof colors.accent === 'object' ? colors.accent?.yellow : undefined) ??
    '#fbbf24';
  const inputBg = colors.background?.input ?? (theme === 'dark' ? '#0f172a' : '#f8fafc');
  const bgCard = colors.background?.card ?? colors.background?.tertiary;

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const summary = useMemo(() => {
    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0, total: complaints.length };
    for (const c of complaints) {
      if (Object.prototype.hasOwnProperty.call(counts, c.status)) counts[c.status] += 1;
    }
    return counts;
  }, [complaints]);

  const filteredComplaints = useMemo(() => {
    if (!filterStatus) return complaints;
    return complaints.filter((c) => c.status === filterStatus);
  }, [complaints, filterStatus]);

  function setStatusFilter(next) {
    setFilterStatus((prev) => (prev === next ? '' : next));
  }

  const summaryCards = [
    { id: '', label: 'Total', value: summary.total, tone: textPrimary, borderColor: border },
    { id: 'open', label: 'Open', value: summary.open, tone: primary, borderColor: `${primary}55` },
    {
      id: 'in_progress',
      label: 'In Progress',
      value: summary.in_progress,
      tone: warningColor,
      borderColor: `${warningColor}55`,
    },
    {
      id: 'resolved',
      label: 'Resolved',
      value: summary.resolved,
      tone: successColor,
      borderColor: `${successColor}55`,
    },
    {
      id: 'closed',
      label: 'Closed',
      value: summary.closed,
      tone: '#64748b',
      borderColor: 'rgba(100,116,139,0.4)',
    },
  ];

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/employee/dashboard')} style={glossPill('neutral')}>
        Dashboard
      </button>
      <button type="button" onClick={() => setShowForm(true)} style={glossPill('slate')}>
        + New Complaint
      </button>
      <button type="button" onClick={handleLogout} style={glossPill('rose')}>
        Logout
      </button>
    </HrHeaderActions>
  );

  if (status === 'loading' || !empCode) {
    return (
      <HrPageShell subtitle="My Complaints" actions={headerActions}>
        <GlassCard style={{ marginTop: 18 }} padding={20}>
          <div style={{ padding: 40, textAlign: 'center', color: textSecondary, fontSize: 14 }}>
            Loading...
          </div>
        </GlassCard>
      </HrPageShell>
    );
  }

  return (
    <HrPageShell subtitle="Submit and track your complaints" actions={headerActions}>
      <GlassCard style={{ marginTop: 18 }} padding={20}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {summaryCards.map((card) => {
            const active = filterStatus === card.id;
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => setStatusFilter(card.id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: `1px solid ${active ? card.tone : card.borderColor}`,
                  background: `${card.tone}14`,
                  cursor: 'pointer',
                  boxShadow: active ? `0 0 0 2px ${card.tone}33` : 'none',
                }}
              >
                <div style={{ fontSize: 12, color: textSecondary, marginBottom: 4, fontWeight: 600 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: card.tone, lineHeight: 1.1 }}>
                  {card.value}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { id: '', label: 'All', count: summary.total },
            { id: 'open', label: 'Open', count: summary.open },
            { id: 'in_progress', label: 'In Progress', count: summary.in_progress },
            { id: 'resolved', label: 'Resolved', count: summary.resolved },
            { id: 'closed', label: 'Closed', count: summary.closed },
          ].map((item) => {
            const active = filterStatus === item.id;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setStatusFilter(item.id)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 999,
                  border: `1px solid ${active ? primary : border}`,
                  background: active
                    ? theme === 'dark'
                      ? 'rgba(59,130,246,0.2)'
                      : 'rgba(59,130,246,0.12)'
                    : inputBg,
                  color: active ? primary : textSecondary,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {item.label} ({item.count})
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <p style={{ fontSize: 13, color: textSecondary, margin: 0 }}>
            {filteredComplaints.length} complaint{filteredComplaints.length === 1 ? '' : 's'}
            {filterStatus ? ` · ${STATUS_LABELS[filterStatus]}` : ''}
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: primary,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Submit New Complaint
          </button>
        </div>

        <div
          style={{
            borderRadius: 14,
            border: `1px solid ${border}`,
            overflow: 'auto',
            maxHeight: '60vh',
            background: theme === 'dark' ? 'rgba(15,23,42,0.35)' : 'rgba(248,250,252,0.8)',
          }}
        >
          {loading && !complaints.length ? (
            <div style={{ padding: 48, textAlign: 'center', color: textSecondary, fontSize: 14 }}>
              Loading complaints...
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: textPrimary, marginBottom: 6 }}>
                {filterStatus ? 'No complaints with this status' : 'No complaints yet'}
              </p>
              <p style={{ fontSize: 14, color: textSecondary, marginBottom: filterStatus ? 0 : 20 }}>
                {filterStatus
                  ? 'Try another filter or clear the selection.'
                  : 'Submit a complaint and HR will review and respond.'}
              </p>
              {!filterStatus && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 10,
                    border: 'none',
                    background: primary,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Submit your first complaint
                </button>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: colors.background?.table?.header ?? primary }}>
                  {['Subject', 'Status', 'Date', 'Action'].map((label, idx) => (
                    <th
                      key={label}
                      style={{
                        padding: '14px 16px',
                        textAlign: idx === 3 ? 'right' : 'left',
                        fontSize: 12,
                        fontWeight: 700,
                        color: colors.text?.table?.header ?? '#fff',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        background: colors.background?.table?.header ?? primary,
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredComplaints.map((c, i) => {
                  const tone = getStatusTone(c.status, primary, successColor, warningColor);
                  const rowBg =
                    i % 2 === 0
                      ? colors.background?.table?.row ?? bgCard
                      : colors.background?.table?.rowEven ?? (theme === 'dark' ? '#1e293b' : '#f8fafc');
                  return (
                    <tr
                      key={c._id}
                      style={{
                        background: rowBg,
                        borderBottom:
                          i < filteredComplaints.length - 1 ? `1px solid ${border}` : 'none',
                      }}
                    >
                      <td
                        style={{
                          padding: '16px',
                          fontSize: 14,
                          color: textPrimary,
                          fontWeight: 500,
                        }}
                      >
                        {c.subject}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '5px 11px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: tone.bg,
                            color: tone.color,
                            border: `1px solid ${tone.color}44`,
                          }}
                        >
                          {STATUS_LABELS[c.status] || c.status}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '16px',
                          fontSize: 13,
                          color: textSecondary,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatDate(c.createdAt)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setViewId(c._id);
                            setDetail(null);
                            loadDetail(c._id);
                          }}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 10,
                            border: `1px solid ${primary}`,
                            background: theme === 'dark' ? `${primary}18` : `${primary}10`,
                            color: primary,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>

      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: theme === 'dark' ? 'rgba(2, 6, 23, 0.85)' : 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{
              background: bgCard,
              borderRadius: 20,
              padding: '32px 36px',
              width: 'min(920px, 94vw)',
              minHeight: 'min(640px, 85vh)',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: `1px solid ${border}`,
              boxShadow:
                theme === 'dark'
                  ? '0 25px 50px -12px rgba(0,0,0,0.5)'
                  : '0 25px 50px -12px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: 24,
                fontWeight: 700,
                margin: '0 0 8px',
                color: textPrimary,
              }}
            >
              Submit a Complaint
            </h2>
            <p style={{ fontSize: 15, color: textSecondary, marginBottom: 28 }}>
              Enter a subject and description. HR will review and respond.
            </p>
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 0 }}
            >
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 10,
                    color: textSecondary,
                  }}
                >
                  Subject
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Brief title for your complaint"
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `1px solid ${border}`,
                    background: inputBg,
                    color: textPrimary,
                    fontSize: 15,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: 28, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 10,
                    color: textSecondary,
                  }}
                >
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe your complaint in detail."
                  rows={12}
                  style={{
                    width: '100%',
                    flex: 1,
                    minHeight: 280,
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `1px solid ${border}`,
                    background: inputBg,
                    color: textPrimary,
                    fontSize: 15,
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                    lineHeight: 1.55,
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    padding: '14px 28px',
                    borderRadius: 12,
                    border: `1px solid ${border}`,
                    background: 'transparent',
                    color: textPrimary,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '14px 32px',
                    borderRadius: 12,
                    border: 'none',
                    background: primary,
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: theme === 'dark' ? 'rgba(2, 6, 23, 0.85)' : 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            setViewId(null);
            setDetail(null);
          }}
        >
          <div
            style={{
              background: bgCard,
              borderRadius: 20,
              padding: '32px 36px',
              width: 'min(840px, 94vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: `1px solid ${border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {detail ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 20,
                    paddingBottom: 14,
                    borderBottom: `1px solid ${border}`,
                  }}
                >
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: textPrimary }}>
                    Complaint Details
                  </h2>
                  {(() => {
                    const tone = getStatusTone(detail.status, primary, successColor, warningColor);
                    return (
                      <span
                        style={{
                          padding: '5px 12px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background: tone.bg,
                          color: tone.color,
                          border: `1px solid ${tone.color}44`,
                          height: 'fit-content',
                        }}
                      >
                        {STATUS_LABELS[detail.status]}
                      </span>
                    );
                  })()}
                </div>
                <p style={{ fontSize: 12, color: textTertiary, marginBottom: 8 }}>
                  Submitted · {formatDate(detail.createdAt)}
                </p>
                <p style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: textPrimary }}>
                  {detail.subject}
                </p>
                <p
                  style={{
                    fontSize: 14,
                    color: textPrimary,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.65,
                    marginBottom: 24,
                  }}
                >
                  {detail.description}
                </p>
                {detail.hrResponse ? (
                  <div
                    style={{
                      padding: 18,
                      borderRadius: 14,
                      background: `${successColor}18`,
                      border: `1px solid ${successColor}50`,
                      borderLeft: `4px solid ${successColor}`,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: successColor,
                        marginBottom: 8,
                        textTransform: 'uppercase',
                      }}
                    >
                      Response from HR
                    </p>
                    <p
                      style={{
                        fontSize: 14,
                        color: textPrimary,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.65,
                        margin: 0,
                      }}
                    >
                      {detail.hrResponse}
                    </p>
                    {detail.hrRespondedAt && (
                      <p style={{ fontSize: 12, color: textSecondary, marginTop: 10, marginBottom: 0 }}>
                        Responded on {formatDate(detail.hrRespondedAt)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 18,
                      borderRadius: 14,
                      border: `1px dashed ${border}`,
                      background: inputBg,
                    }}
                  >
                    <p style={{ fontSize: 14, color: textSecondary, margin: 0 }}>
                      No response from HR yet.
                    </p>
                  </div>
                )}
                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setViewId(null);
                      setDetail(null);
                    }}
                    style={{
                      padding: '12px 24px',
                      borderRadius: 12,
                      border: `1px solid ${border}`,
                      background: 'transparent',
                      color: textPrimary,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: textSecondary }}>Loading...</div>
            )}
          </div>
        </div>
      )}

      {toast.text && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            padding: '14px 20px',
            borderRadius: 14,
            background:
              toast.type === 'error' ? `${colors.error ?? '#ef4444'}20` : `${successColor}20`,
            border: `1px solid ${
              toast.type === 'error' ? colors.error ?? '#ef4444' : successColor
            }60`,
            color: toast.type === 'error' ? colors.error ?? '#dc2626' : successColor,
            fontSize: 14,
            fontWeight: 500,
            zIndex: 50,
          }}
        >
          {toast.text}
        </div>
      )}

      {showWarning && (
        <AutoLogoutWarning
          timeRemaining={timeRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={autoLogout}
        />
      )}
    </HrPageShell>
  );
}
