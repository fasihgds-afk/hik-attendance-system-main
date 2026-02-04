'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';
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

export default function HrComplaintsPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const { data: session, status } = useSession();

  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewId, setViewId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [respondForm, setRespondForm] = useState({ status: '', hrResponse: '', internalNote: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' || (session && session.user?.role !== 'HR')) {
      router.replace('/login?role=hr');
      return;
    }
  }, [session, status, router]);

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3000);
  }

  async function loadComplaints(silent = false) {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPeriod && filterPeriod !== 'all') params.set('period', filterPeriod);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const res = await fetch(`/api/hr/complaints?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setComplaints(data.data?.complaints || []);
      } else {
        showToast('error', data.error || 'Failed to load complaints');
      }
    } catch (err) {
      if (!silent) showToast('error', 'Failed to load complaints');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (session?.user?.role === 'HR') loadComplaints();
  }, [session?.user?.role, filterStatus, filterPeriod, searchQuery]);

  useEffect(() => {
    if (session?.user?.role !== 'HR') return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadComplaints(true);
    }, 45000);
    return () => clearInterval(interval);
  }, [session?.user?.role, filterStatus, filterPeriod, searchQuery]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && session?.user?.role === 'HR') loadComplaints(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [session?.user?.role, filterStatus, filterPeriod, searchQuery]);

  useEffect(() => {
    const id = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('id');
    if (id) setViewId(id);
  }, []);

  async function loadDetail(id) {
    if (!id) return;
    try {
      const res = await fetch(`/api/hr/complaints/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        const c = data.data?.complaint || null;
        setDetail(c);
        setRespondForm({
          status: c?.status || '',
          hrResponse: c?.hrResponse || '',
          internalNote: c?.internalNote || '',
        });
      } else setDetail(null);
    } catch (_) {
      setDetail(null);
    }
  }

  useEffect(() => {
    if (viewId) loadDetail(viewId);
    else setDetail(null);
  }, [viewId]);

  async function handleSaveResponse(e) {
    e.preventDefault();
    if (!viewId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/hr/complaints/${viewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: respondForm.status || undefined,
          hrResponse: respondForm.hrResponse,
          internalNote: respondForm.internalNote,
          hrRespondedBy: session?.user?.name || session?.user?.email || 'HR',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('success', 'Response saved');
        setDetail(data.data?.complaint || detail);
        loadComplaints();
        setViewId(null);
        setDetail(null);
      } else {
        showToast('error', data.error || 'Failed to save response');
      }
    } catch (err) {
      showToast('error', 'Failed to save response');
    } finally {
      setSaving(false);
    }
  }

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=hr' });
      router.push('/login?role=hr');
    } catch (_) {
      router.push('/login?role=hr');
    }
  };

  const bgPage = colors.background?.page ?? colors.background?.default ?? colors.background?.secondary;
  const bgCard = colors.background?.card ?? colors.background?.tertiary;
  const border = colors.border?.default;
  const textPrimary = colors.text?.primary;
  const textSecondary = colors.text?.secondary;
  const primary = typeof colors.primary === 'object' ? colors.primary?.[500] : colors.primary;
  const successColor = colors.success ?? (typeof colors.secondary === 'object' ? colors.secondary?.[600] : colors.secondary) ?? '#22c55e';

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bgPage }}>
        <span style={{ color: textSecondary, fontSize: 14 }}>Loading...</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px', maxWidth: '100%', margin: 0, background: bgPage, color: textPrimary }}>
      {/* Header – professional bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
          padding: '20px 24px',
          borderRadius: 16,
          background: colors.gradient?.primary ?? (typeof colors.primary === 'object' ? `linear-gradient(135deg, ${colors.primary?.[500]} 0%, ${colors.primary?.[700]} 100%)` : `linear-gradient(135deg, ${primary} 0%, ${primary} 100%)`),
          border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)'}`,
          boxShadow: theme === 'dark' ? '0 4px 24px rgba(0,0,0,0.3)' : '0 4px 24px rgba(37, 99, 235, 0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📋</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Complaint Management</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', fontWeight: 400 }}>View and respond to employee complaints</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => router.push('/hr/dashboard')}
            style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; }}
          >
            Dashboard
          </button>
          <button type="button" onClick={handleLogout} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}>
            Logout
          </button>
        </div>
      </header>

      {/* Filters – card style */}
      <div style={{ marginBottom: 24, padding: '16px 20px', borderRadius: 16, border: `1px solid ${border}`, background: bgCard, boxShadow: theme === 'dark' ? '0 4px 24px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '10px 16px', borderRadius: 12, border: `1px solid ${border}`, background: colors.background?.input ?? (theme === 'dark' ? '#0f172a' : '#f8fafc'), color: textPrimary, fontSize: 14, fontWeight: 500, minWidth: 160 }}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            style={{ padding: '10px 16px', borderRadius: 12, border: `1px solid ${border}`, background: colors.background?.input ?? (theme === 'dark' ? '#0f172a' : '#f8fafc'), color: textPrimary, fontSize: 14, fontWeight: 500, minWidth: 180 }}
          >
            <option value="all">All time</option>
            <option value="week">Last 7 days (Weekly)</option>
            <option value="month">Last 30 days (Monthly)</option>
          </select>
          <input
            type="text"
            placeholder="Search by employee, designation, subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '10px 16px', borderRadius: 12, border: `1px solid ${border}`, background: colors.background?.input ?? (theme === 'dark' ? '#0f172a' : '#f8fafc'), color: textPrimary, fontSize: 14, minWidth: 300, flex: 1, maxWidth: 400 }}
          />
        </div>
      </div>

      {/* Table – card */}
      <div style={{ borderRadius: 16, border: `1px solid ${border}`, overflow: 'hidden', background: bgCard, boxShadow: theme === 'dark' ? '0 4px 24px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.06)' }}>
        {loading && !complaints.length ? (
          <div style={{ padding: 48, textAlign: 'center', color: textSecondary, fontSize: 14 }}>Loading complaints...</div>
        ) : complaints.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📭</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: textPrimary, marginBottom: 6 }}>No complaints found</p>
            <p style={{ fontSize: 14, color: textSecondary }}>Complaints from employees will appear here. Use filters to narrow results.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.background?.table?.header ?? primary }}>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Employee</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Designation</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c, i) => (
                <tr
                  key={c._id}
                  style={{
                    background: i % 2 === 0 ? (colors.background?.table?.row ?? bgCard) : (colors.background?.table?.rowEven ?? (theme === 'dark' ? '#1e293b' : '#f8fafc')),
                    borderBottom: i < complaints.length - 1 ? `1px solid ${border}` : 'none',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = theme === 'dark' ? 'rgba(51, 65, 85, 0.4)' : '#f1f5f9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? (colors.background?.table?.row ?? bgCard) : (colors.background?.table?.rowEven ?? (theme === 'dark' ? '#1e293b' : '#f8fafc')); }}
                >
                  <td style={{ padding: '14px 20px', fontSize: 14, color: colors.text?.cell ?? textPrimary, fontWeight: 500 }}>{c.employeeName || '-'} ({c.empCode})</td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: colors.text?.cell ?? textSecondary }}>{c.designation || '-'}</td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: colors.text?.cell ?? textSecondary }}>{c.department || '-'}</td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: colors.text?.cell ?? textPrimary, fontWeight: 500 }}>{c.subject}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: c.status === 'resolved' || c.status === 'closed' ? `${successColor}26` : c.status === 'in_progress' ? `${colors.warning ?? colors.accent?.yellow ?? '#fbbf24'}26` : `${primary}26`, color: c.status === 'resolved' || c.status === 'closed' ? successColor : c.status === 'in_progress' ? (colors.warning ?? colors.accent?.yellow ?? '#fbbf24') : primary }}>{STATUS_LABELS[c.status] || c.status}</span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: colors.text?.cell ?? textSecondary }}>{formatDate(c.createdAt)}</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => { setViewId(c._id); setDetail(null); loadDetail(c._id); }}
                      style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${primary}`, background: 'transparent', color: primary, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${primary}15`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      View / Respond
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View / Respond modal – professional hierarchy */}
      {viewId && (
        <div style={{ position: 'fixed', inset: 0, background: theme === 'dark' ? 'rgba(2, 6, 23, 0.85)' : 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setViewId(null); setDetail(null); }}>
          <div style={{ background: bgCard, borderRadius: 20, padding: 28, minWidth: 480, maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${border}`, boxShadow: theme === 'dark' ? '0 25px 50px -12px rgba(0,0,0,0.5)' : '0 25px 50px -12px rgba(0,0,0,0.12)' }} onClick={(e) => e.stopPropagation()}>
            {detail ? (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: textPrimary, paddingBottom: 16, borderBottom: `2px solid ${border}`, letterSpacing: '-0.02em' }}>Complaint – View & Respond</h2>

                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Employee</p>
                  <p style={{ fontSize: 15, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>{detail.employeeName} ({detail.empCode})</p>
                  <p style={{ fontSize: 13, color: textSecondary }}>{detail.designation || '—'} · {detail.department || '—'} · {formatDate(detail.createdAt)}</p>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Complaint</p>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, color: textPrimary, lineHeight: 1.4 }}>{detail.subject}</p>
                  <p style={{ fontSize: 14, color: textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{detail.description}</p>
                </div>

                <form onSubmit={handleSaveResponse}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
                    <select
                      value={respondForm.status}
                      onChange={(e) => setRespondForm({ ...respondForm, status: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: `1px solid ${border}`, background: colors.background?.input ?? (theme === 'dark' ? '#0f172a' : '#f8fafc'), color: textPrimary, fontSize: 14 }}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 20, padding: 20, borderRadius: 16, background: `${successColor}18`, border: `1px solid ${successColor}50` }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: successColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Remarks (visible to employee)</label>
                    <p style={{ fontSize: 12, color: textSecondary, marginBottom: 12, lineHeight: 1.4 }}>This reply will be shown to the employee on their Complaints page.</p>
                    <textarea
                      value={respondForm.hrResponse}
                      onChange={(e) => setRespondForm({ ...respondForm, hrResponse: e.target.value })}
                      placeholder="Your reply to the employee..."
                      rows={4}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: `1px solid ${border}`, background: colors.background?.input ?? (theme === 'dark' ? '#1e293b' : '#fff'), color: textPrimary, fontSize: 14, resize: 'vertical', outline: 'none' }}
                    />
                  </div>
                  <div style={{ marginBottom: 24, padding: 20, borderRadius: 16, background: theme === 'dark' ? 'rgba(100, 116, 139, 0.1)' : 'rgba(100, 116, 139, 0.06)', border: '1px solid rgba(100, 116, 139, 0.25)' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Internal note (HR only)</label>
                    <p style={{ fontSize: 12, color: textSecondary, marginBottom: 12, lineHeight: 1.4 }}>Not visible to the employee.</p>
                    <textarea
                      value={respondForm.internalNote}
                      onChange={(e) => setRespondForm({ ...respondForm, internalNote: e.target.value })}
                      placeholder="Internal notes..."
                      rows={2}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: `1px solid ${border}`, background: colors.background?.input ?? (theme === 'dark' ? '#1e293b' : '#fff'), color: textPrimary, fontSize: 14, resize: 'vertical', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => { setViewId(null); setDetail(null); }} style={{ padding: '12px 24px', borderRadius: 12, border: `1px solid ${border}`, background: 'transparent', color: textPrimary, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#f1f5f9'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>Close</button>
                    <button type="submit" disabled={saving} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: primary, color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: `0 2px 12px ${primary}40`, transition: 'opacity 0.2s' }}>{saving ? 'Saving...' : 'Save response'}</button>
                  </div>
                </form>

                {detail.hrResponse && (
                  <div style={{ marginTop: 24, padding: 20, borderRadius: 16, background: `${successColor}18`, border: `1px solid ${successColor}50`, borderLeft: `4px solid ${successColor}` }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: successColor, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current remarks (visible to employee)</p>
                    <p style={{ fontSize: 14, color: textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{detail.hrResponse}</p>
                    {detail.hrRespondedAt && <p style={{ fontSize: 12, color: textSecondary, marginTop: 10 }}>Responded on {formatDate(detail.hrRespondedAt)}</p>}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: textSecondary, fontSize: 14 }}>Loading...</div>
            )}
          </div>
        </div>
      )}

      {toast.text && (
        <div style={{ position: 'fixed', right: 24, bottom: 24, padding: '14px 20px', borderRadius: 14, background: toast.type === 'error' ? `${colors.error ?? '#ef4444'}20` : `${successColor}20`, border: `1px solid ${toast.type === 'error' ? (colors.error ?? '#ef4444') : successColor}60`, color: toast.type === 'error' ? (colors.error ?? '#dc2626') : successColor, fontSize: 14, fontWeight: 500, zIndex: 50, boxShadow: colors.card?.shadow ?? '0 4px 20px rgba(0,0,0,0.12)' }}>
          {toast.text}
        </div>
      )}
      {showWarning && <AutoLogoutWarning timeRemaining={timeRemaining} onStayLoggedIn={handleStayLoggedIn} onLogout={autoLogout} />}
    </div>
  );
}
