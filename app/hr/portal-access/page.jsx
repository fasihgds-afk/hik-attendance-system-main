'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'blocked', label: 'Blocked' },
];

export default function HrPortalAccessPage() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [stats, setStats] = useState({ totalEmployees: 0, portalActive: 0, portalBlocked: 0 });
  const [toast, setToast] = useState({ type: '', text: '' });

  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
    onLogout: () => {
      signOut({ redirect: false, callbackUrl: '/login?role=hr' }).then(() => {
        router.push('/login?role=hr');
      });
    },
  });

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
        status: statusFilter,
      });
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/hr/portal-access?${params.toString()}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || body.message || 'Failed to load employees');
      }

      const data = body.data ?? body;
      setEmployees(data.items || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 });
      setStats(data.stats || { totalEmployees: 0, portalActive: 0, portalBlocked: 0 });
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load portal access list');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, statusFilter]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (mounted) loadEmployees();
  }, [mounted, loadEmployees]);

  async function togglePortalAccess(emp, nextEnabled) {
    setTogglingId(emp.empCode);
    try {
      const res = await fetch('/api/hr/portal-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empCode: emp.empCode, portalEnabled: nextEnabled }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || body.message || 'Failed to update access');
      }

      const updated = body.data?.employee ?? body.employee;
      setEmployees((prev) =>
        prev.map((e) => (e.empCode === emp.empCode ? { ...e, ...updated } : e))
      );
      showToast(
        'success',
        nextEnabled
          ? `${emp.name || emp.empCode} can use the employee portal`
          : `${emp.name || emp.empCode} is blocked from the employee portal`
      );
      await loadEmployees();
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to update portal access');
    } finally {
      setTogglingId(null);
    }
  }

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=hr' });
      router.push('/login?role=hr');
    } catch {
      router.push('/login?role=hr');
    }
  };

  const pageBg = theme === 'dark' ? '#0a0a23' : (colors.gradient?.overlay ?? colors.background?.default);
  const headerGradient = theme === 'dark'
    ? 'linear-gradient(90deg, #0a2c54 0%, #0f5ba5 35%, #13a8e5 100%)'
    : (colors.gradient?.header ?? colors.background?.card);
  const cardBg = theme === 'dark' ? '#1e293b' : (colors.background?.card ?? '#ffffff');
  const cardShadow = theme === 'dark' ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.08)';
  const mutedText = theme === 'dark' ? '#94a3b8' : colors.text?.secondary;
  const inputBorder = theme === 'dark' ? 'rgba(55, 65, 81, 0.8)' : colors.border?.default;
  const inputBg = theme === 'dark' ? '#0f172a' : (colors.background?.input ?? colors.background?.card);
  const rowHover = theme === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(248, 250, 252, 0.9)';

  const navBtn = {
    padding: '10px 18px',
    borderRadius: 12,
    border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : colors.border?.default}`,
    backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : colors.background?.card,
    color: theme === 'dark' ? '#ffffff' : colors.text?.primary,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backdropFilter: 'blur(10px)',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  };

  const statCard = (accent) => ({
    borderRadius: 14,
    padding: '16px 18px',
    background: cardBg,
    border: `1px solid ${accent}33`,
    boxShadow: cardShadow,
  });

  if (!mounted) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0a0a23',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: 14,
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px 28px 32px',
        background: pageBg,
        color: colors.text?.primary,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media (max-width: 768px) {
            .pa-header { flex-direction: column !important; align-items: flex-start !important; }
            .pa-header-actions { flex-wrap: wrap !important; width: 100%; }
            .pa-stats { grid-template-columns: 1fr !important; }
            .pa-table-wrap { overflow-x: auto; }
          }
        `,
        }}
      />

      {showWarning && (
        <AutoLogoutWarning
          timeRemaining={timeRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={autoLogout}
        />
      )}

      {toast.text && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            padding: '12px 18px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            background: toast.type === 'success' ? '#059669' : '#dc2626',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}
        >
          {toast.text}
        </div>
      )}

      <div className="container-responsive" style={{ margin: '0 auto', width: '100%', maxWidth: '100%' }}>
        <div
          className="pa-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 28px',
            borderRadius: 20,
            background: headerGradient,
            color: theme === 'dark' ? '#ffffff' : colors.text?.primary,
            boxShadow: theme === 'dark'
              ? '0 20px 50px rgba(19, 168, 229, 0.25), 0 8px 16px rgba(0, 0, 0, 0.3)'
              : '0 20px 50px rgba(59, 130, 246, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1)',
            border: `1px solid ${colors.border?.default}`,
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: `2px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : colors.border?.default}`,
              }}
            >
              <img
                src="/gds.png"
                alt="Global Digital Solutions logo"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0.5, marginBottom: 4 }}>
                Employee Portal Access
              </div>
              <div style={{ fontSize: 13, opacity: 0.95, fontWeight: 500 }}>
                Allow or block employees from signing in to the employee portal
              </div>
            </div>
          </div>

          <div className="pa-header-actions" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <ThemeToggle compact />
            <button type="button" style={navBtn} onClick={() => router.push('/hr/employees')}>
              ← HR Home
            </button>
            <button type="button" style={navBtn} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>

        <div
          className="pa-stats"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <div style={statCard('#3b82f6')}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: mutedText, fontWeight: 600 }}>
              Total employees
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{stats.totalEmployees}</div>
          </div>
          <div style={statCard('#22c55e')}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: mutedText, fontWeight: 600 }}>
              Portal active
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: '#22c55e' }}>{stats.portalActive}</div>
          </div>
          <div style={statCard('#ef4444')}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: mutedText, fontWeight: 600 }}>
              Portal blocked
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: '#ef4444' }}>{stats.portalBlocked}</div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 20,
            padding: '20px 24px 24px',
            background: cardBg,
            border: `1px solid ${colors.border?.default}`,
            boxShadow: cardShadow,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Access control</h2>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: mutedText }}>
                Blocked employees cannot log in or use employee portal APIs until you activate them again.
              </p>
            </div>
            <input
              type="search"
              placeholder="Search by code, name, or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                minWidth: 220,
                flex: '1 1 240px',
                maxWidth: 360,
                padding: '10px 14px',
                borderRadius: 10,
                border: `1px solid ${inputBorder}`,
                background: inputBg,
                color: colors.text?.primary,
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(f.id);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    border: active
                      ? `2px solid ${colors.primary?.[500] ?? '#3b82f6'}`
                      : `1px solid ${inputBorder}`,
                    background: active
                      ? (theme === 'dark' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.12)')
                      : 'transparent',
                    color: colors.text?.primary,
                    fontWeight: active ? 700 : 500,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="pa-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${inputBorder}`, textAlign: 'left' }}>
                  <th style={{ padding: '12px 10px', fontWeight: 700 }}>Code</th>
                  <th style={{ padding: '12px 10px', fontWeight: 700 }}>Name</th>
                  <th style={{ padding: '12px 10px', fontWeight: 700 }}>Department</th>
                  <th style={{ padding: '12px 10px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '12px 10px', fontWeight: 700, textAlign: 'right' }}>Portal access</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: mutedText }}>
                      Loading employees...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: mutedText }}>
                      No employees match your filters.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => {
                    const enabled = emp.portalEnabled !== false;
                    const busy = togglingId === emp.empCode;
                    return (
                      <tr
                        key={emp.empCode}
                        style={{ borderBottom: `1px solid ${inputBorder}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = rowHover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '12px 10px', fontWeight: 600 }}>{emp.empCode}</td>
                        <td style={{ padding: '12px 10px' }}>{emp.name || '—'}</td>
                        <td style={{ padding: '12px 10px', color: mutedText }}>{emp.department || '—'}</td>
                        <td style={{ padding: '12px 10px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              background: enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: enabled ? '#16a34a' : '#dc2626',
                            }}
                          >
                            {enabled ? 'Active' : 'Blocked'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => togglePortalAccess(emp, !enabled)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 10,
                              border: 'none',
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: busy ? 'wait' : 'pointer',
                              opacity: busy ? 0.7 : 1,
                              background: enabled
                                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                                : 'linear-gradient(135deg, #22c55e, #16a34a)',
                              color: '#fff',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            }}
                          >
                            {busy ? 'Saving...' : enabled ? 'Block portal' : 'Activate portal'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 20,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 13, color: mutedText }}>
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} employees
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{ ...navBtn, opacity: currentPage <= 1 ? 0.5 : 1 }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pagination.totalPages || loading}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  style={{ ...navBtn, opacity: currentPage >= pagination.totalPages ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
