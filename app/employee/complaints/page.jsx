'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const [showForm, setShowForm] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState({ type: '', text: '' });
  const [form, setForm] = useState({ subject: '', description: '' });

  useEffect(() => {
    if (session?.user?.role !== 'EMPLOYEE') {
      router.replace('/login?role=employee');
      return;
    }
  }, [session, router]);

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3000);
  }

  async function loadComplaints() {
    if (!empCode) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/employee/complaints?empCode=${encodeURIComponent(empCode)}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setComplaints(data.data?.complaints || []);
      } else {
        showToast('error', data.error || 'Failed to load complaints');
      }
    } catch (err) {
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
      const res = await fetch(`/api/employee/complaints/${id}?empCode=${encodeURIComponent(empCode)}`, { cache: 'no-store' });
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
        body: JSON.stringify({ empCode, subject: form.subject.trim(), description: form.description.trim() }),
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
    } catch (err) {
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

  if (status === 'loading' || !empCode) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.background?.page }}>
        <span style={{ color: colors.text?.secondary }}>Loading...</span>
      </div>
    );
  }

  const bgPage = colors.background?.page ?? colors.background?.default ?? colors.background?.secondary;
  const bgCard = colors.background?.card ?? colors.background?.tertiary;
  const border = colors.border?.default;
  const textPrimary = colors.text?.primary;
  const textSecondary = colors.text?.secondary;
  const primary = typeof colors.primary === 'object' ? colors.primary?.[500] : colors.primary;
  const successColor = colors.success ?? (typeof colors.secondary === 'object' ? colors.secondary?.[600] : colors.secondary) ?? '#22c55e';
  const warningColor = colors.warning ?? (typeof colors.accent === 'object' ? colors.accent?.yellow : undefined) ?? '#fbbf24';

  return (
    <div style={{ minHeight: '100vh', padding: '24px', maxWidth: 1200, margin: '0 auto', background: bgPage, color: textPrimary }}>
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
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>My Complaints</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', fontWeight: 400 }}>Submit and track your complaints</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => router.push('/employee/dashboard')}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; }}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={handleLogout}
            style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Actions + content card */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <p style={{ fontSize: 14, color: textSecondary, margin: 0 }}>View your submitted complaints and HR responses below.</p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            padding: '12px 24px',
            borderRadius: 12,
            border: 'none',
            background: primary,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: `0 2px 12px ${primary}40`,
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${primary}50`; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 12px ${primary}40`; }}
        >
          + Submit New Complaint
        </button>
      </div>

      {/* List – card with table */}
      <div
        style={{
          borderRadius: 16,
          border: `1px solid ${border}`,
          overflow: 'hidden',
          background: bgCard,
          boxShadow: theme === 'dark' ? '0 4px 24px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        {loading && !complaints.length ? (
          <div style={{ padding: 48, textAlign: 'center', color: textSecondary, fontSize: 14 }}>Loading complaints...</div>
        ) : complaints.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📝</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: textPrimary, marginBottom: 6 }}>No complaints yet</p>
            <p style={{ fontSize: 14, color: textSecondary, marginBottom: 20 }}>Submit a complaint using the button above. HR will review and respond.</p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: primary, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Submit your first complaint
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.background?.table?.header ?? primary }}>
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
                  <td style={{ padding: '14px 20px', fontSize: 14, color: colors.text?.cell ?? textPrimary, fontWeight: 500 }}>{c.subject}</td>
                  <td style={{ padding: '14px 20px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background: c.status === 'resolved' || c.status === 'closed' ? `${successColor}26` : c.status === 'in_progress' ? `${warningColor}26` : `${primary}26`,
                        color: c.status === 'resolved' || c.status === 'closed' ? successColor : c.status === 'in_progress' ? warningColor : primary,
                      }}
                    >
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: colors.text?.cell ?? textSecondary }}>{formatDate(c.createdAt)}</td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => { setViewId(c._id); setDetail(null); loadDetail(c._id); }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 10,
                        border: `1px solid ${primary}`,
                        background: 'transparent',
                        color: primary,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${primary}15`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Submit form modal – professional */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: theme === 'dark' ? 'rgba(2, 6, 23, 0.85)' : 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div
            style={{
              background: bgCard,
              borderRadius: 20,
              padding: 32,
              minWidth: 440,
              maxWidth: 540,
              border: `1px solid ${border}`,
              boxShadow: theme === 'dark' ? '0 25px 50px -12px rgba(0,0,0,0.5)' : '0 25px 50px -12px rgba(0,0,0,0.12)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: `2px solid ${border}` }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: textPrimary, letterSpacing: '-0.02em' }}>Submit a Complaint</h2>
              <p style={{ fontSize: 14, color: textSecondary, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>Enter a subject and description. HR will review and respond.</p>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: textSecondary }}>Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Brief title for your complaint"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: `1px solid ${border}`,
                    background: colors.background?.input ?? (theme === 'dark' ? '#1e293b' : '#f8fafc'),
                    color: textPrimary,
                    fontSize: 14,
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = primary; e.target.style.boxShadow = `0 0 0 3px ${primary}25`; }}
                  onBlur={(e) => { e.target.style.borderColor = border; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: textSecondary }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe your complaint in detail. Be clear and specific."
                  rows={5}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: `1px solid ${border}`,
                    background: colors.background?.input ?? (theme === 'dark' ? '#1e293b' : '#f8fafc'),
                    color: textPrimary,
                    fontSize: 14,
                    resize: 'vertical',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = primary; e.target.style.boxShadow = `0 0 0 3px ${primary}25`; }}
                  onBlur={(e) => { e.target.style.borderColor = border; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '12px 22px', borderRadius: 12, border: `1px solid ${border}`, background: 'transparent', color: textPrimary, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#f1f5f9'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: primary, color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: `0 2px 12px ${primary}40`, transition: 'opacity 0.2s' }}>{loading ? 'Submitting...' : 'Submit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail modal – professional hierarchy */}
      {viewId && (
        <div style={{ position: 'fixed', inset: 0, background: theme === 'dark' ? 'rgba(2, 6, 23, 0.85)' : 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setViewId(null); setDetail(null); }}>
          <div style={{ background: bgCard, borderRadius: 20, padding: 28, minWidth: 440, maxWidth: 580, maxHeight: '88vh', overflowY: 'auto', border: `1px solid ${border}`, boxShadow: theme === 'dark' ? '0 25px 50px -12px rgba(0,0,0,0.5)' : '0 25px 50px -12px rgba(0,0,0,0.12)' }} onClick={(e) => e.stopPropagation()}>
            {detail ? (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: textPrimary, paddingBottom: 16, borderBottom: `2px solid ${border}`, letterSpacing: '-0.02em' }}>Complaint Details</h2>

                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Complaint · {formatDate(detail.createdAt)}</p>
                  <p style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: textPrimary, lineHeight: 1.4 }}>{detail.subject}</p>
                  <p style={{ fontSize: 14, color: textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{detail.description}</p>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</p>
                  <span style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: detail.status === 'resolved' || detail.status === 'closed' ? `${successColor}26` : `${primary}26`, color: detail.status === 'resolved' || detail.status === 'closed' ? successColor : primary }}>{STATUS_LABELS[detail.status]}</span>
                </div>

                {detail.hrResponse ? (
                  <div style={{ marginTop: 28, padding: 20, borderRadius: 16, background: `${successColor}18`, border: `1px solid ${successColor}50`, borderLeft: `4px solid ${successColor}` }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: successColor, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Response from HR</p>
                    <p style={{ fontSize: 14, color: textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.65, marginBottom: 8 }}>{detail.hrResponse}</p>
                    {detail.hrRespondedAt && <p style={{ fontSize: 12, color: textSecondary }}>Responded on {formatDate(detail.hrRespondedAt)}</p>}
                  </div>
                ) : (
                  <div style={{ marginTop: 28, padding: 20, borderRadius: 16, background: colors.background?.input ?? colors.background?.tertiary, border: `1px dashed ${border}` }}>
                    <p style={{ fontSize: 14, color: textSecondary, margin: 0 }}>No response from HR yet. You will see remarks here once HR replies.</p>
                  </div>
                )}

                <div style={{ marginTop: 28, textAlign: 'right' }}>
                  <button type="button" onClick={() => { setViewId(null); setDetail(null); }} style={{ padding: '12px 24px', borderRadius: 12, border: `1px solid ${border}`, background: 'transparent', color: textPrimary, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#f1f5f9'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>Close</button>
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: textSecondary }}>Loading...</div>
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
