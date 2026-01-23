// app/hr/leaves/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';

export default function HrLeavesPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();

  // Auto logout
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=hr' });
      router.push('/login?role=hr');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login?role=hr');
    }
  };

  const [year, setYear] = useState(new Date().getFullYear());
  const [paidLeaves, setPaidLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMarkLeaveModal, setShowMarkLeaveModal] = useState(false);
  const [markLeaveData, setMarkLeaveData] = useState({
    empCode: '',
    date: '',
    leaveType: 'casual',
    reason: '',
  });
  const [toast, setToast] = useState({ type: '', text: '' });

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 3000);
  }

  async function loadLeaves() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hr/leaves?year=${year}`);
      if (res.ok) {
        const response = await res.json();
        if (response.success) {
          setPaidLeaves(response.data?.paidLeaves || []);
        } else {
          showToast('error', response.error || 'Failed to load leaves');
        }
      } else {
        showToast('error', 'Failed to load leaves');
      }
    } catch (err) {
      console.error('Failed to load leaves:', err);
      showToast('error', 'Failed to load leaves');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaves();
  }, [year]);

  async function handleMarkLeave() {
    if (!markLeaveData.empCode || !markLeaveData.date || !markLeaveData.leaveType) {
      showToast('error', 'Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/hr/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...markLeaveData,
          markedBy: 'HR',
        }),
      });

      const response = await res.json();
      if (res.ok && response.success) {
        showToast('success', 'Leave marked successfully');
        setShowMarkLeaveModal(false);
        setMarkLeaveData({ empCode: '', date: '', leaveType: 'casual', reason: '' });
        loadLeaves();
      } else {
        showToast('error', response.error || response.message || 'Failed to mark leave');
      }
    } catch (err) {
      console.error('Failed to mark leave:', err);
      showToast('error', 'Failed to mark leave');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveLeave(empCode, date) {
    if (!confirm(`Remove leave for employee ${empCode} on ${date}?`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/hr/leaves?empCode=${empCode}&date=${date}`, {
        method: 'DELETE',
      });

      const response = await res.json();
      if (res.ok && response.success) {
        showToast('success', 'Leave removed successfully');
        loadLeaves();
      } else {
        showToast('error', response.error || response.message || 'Failed to remove leave');
      }
    } catch (err) {
      console.error('Failed to remove leave:', err);
      showToast('error', 'Failed to remove leave');
    } finally {
      setLoading(false);
    }
  }

  // Filter leaves based on search query
  const filteredLeaves = paidLeaves.filter((leave) => {
    const query = searchQuery.toLowerCase();
    return (
      leave.empCode?.toLowerCase().includes(query) ||
      leave.employeeName?.toLowerCase().includes(query) ||
      leave.department?.toLowerCase().includes(query)
    );
  });

  // Table styles
  const thStyle = {
    padding: '12px 14px',
    textAlign: 'left',
    borderBottom: `1px solid ${colors.border.table}`,
    fontWeight: 600,
    fontSize: 13,
    color: colors.text.table.header,
    backgroundColor: colors.background.table.header,
  };

  const tdStyle = {
    padding: '10px 14px',
    borderBottom: `1px solid ${colors.border.table}`,
    fontSize: 13,
    color: colors.text.table.cell,
    backgroundColor: colors.background.table.row,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '20px 24px',
        background: colors.background.page,
        color: colors.text.primary,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          padding: '16px 20px',
          borderRadius: 16,
          background: colors.gradient.primary,
          border: `1px solid ${colors.border.default}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', margin: 0 }}>
            Paid Leave Management
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeToggle />
          <button
            onClick={() => router.push('/hr/dashboard')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.1)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Dashboard
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.1)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: colors.text.secondary }}>Year:</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${colors.border.default}`,
              background: colors.background.input,
              color: colors.text.primary,
              fontSize: 13,
            }}
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search by employee code, name, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${colors.border.default}`,
              background: colors.background.input,
              color: colors.text.primary,
              fontSize: 13,
              minWidth: 300,
            }}
          />
        </div>
        <button
          onClick={() => setShowMarkLeaveModal(true)}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: colors.primary,
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Mark Leave
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${colors.border.table}`,
          overflow: 'hidden',
          background: colors.background.card,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Emp Code</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Department</th>
              <th style={thStyle}>Casual</th>
              <th style={thStyle}>Annual</th>
              <th style={thStyle}>Total Taken</th>
              <th style={thStyle}>Remaining</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '40px' }}>
                  Loading...
                </td>
              </tr>
            ) : filteredLeaves.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '40px' }}>
                  No leave records found
                </td>
              </tr>
            ) : (
              filteredLeaves.map((leave, idx) => {
                const remaining = leave.totalLeavesRemaining || 0;
                const remainingColor = remaining > 10 ? colors.success : remaining > 5 ? '#fbbf24' : colors.error;
                
                return (
                  <tr
                    key={`${leave.empCode}-${leave.year}`}
                    style={{
                      backgroundColor: idx % 2 === 0 ? colors.background.table.row : colors.background.table.rowEven,
                    }}
                  >
                    <td style={tdStyle}>{leave.empCode}</td>
                    <td style={tdStyle}>{leave.employeeName || '-'}</td>
                    <td style={tdStyle}>{leave.department || '-'}</td>
                    <td style={tdStyle}>
                      {leave.casualLeavesTaken || 0} / {leave.casualLeavesAllocated || 12}
                    </td>
                    <td style={tdStyle}>
                      {leave.annualLeavesTaken || 0} / {leave.annualLeavesAllocated || 12}
                    </td>
                    <td style={tdStyle}>{leave.totalLeavesTaken || 0}</td>
                    <td style={{ ...tdStyle, color: remainingColor, fontWeight: 600 }}>
                      {remaining}
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => {
                          setMarkLeaveData({
                            empCode: leave.empCode,
                            date: '',
                            leaveType: 'casual',
                            reason: '',
                          });
                          setShowMarkLeaveModal(true);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: `1px solid ${colors.primary}`,
                          background: 'transparent',
                          color: colors.primary,
                          fontSize: 12,
                          cursor: 'pointer',
                          marginRight: 8,
                        }}
                      >
                        Mark Leave
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mark Leave Modal */}
      {showMarkLeaveModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowMarkLeaveModal(false)}
        >
          <div
            style={{
              background: colors.background.card,
              borderRadius: 16,
              padding: '24px',
              minWidth: 400,
              maxWidth: 500,
              border: `1px solid ${colors.border.default}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: colors.text.primary }}>
              Mark Paid Leave
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: colors.text.secondary }}>
                  Employee Code *
                </label>
                <input
                  type="text"
                  value={markLeaveData.empCode}
                  onChange={(e) => setMarkLeaveData({ ...markLeaveData, empCode: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: colors.text.secondary }}>
                  Date (YYYY-MM-DD) *
                </label>
                <input
                  type="date"
                  value={markLeaveData.date}
                  onChange={(e) => setMarkLeaveData({ ...markLeaveData, date: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: colors.text.secondary }}>
                  Leave Type *
                </label>
                <select
                  value={markLeaveData.leaveType}
                  onChange={(e) => setMarkLeaveData({ ...markLeaveData, leaveType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 13,
                  }}
                >
                  <option value="casual">Casual Leave</option>
                  <option value="annual">Annual Leave</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: colors.text.secondary }}>
                  Reason (Optional)
                </label>
                <textarea
                  value={markLeaveData.reason}
                  onChange={(e) => setMarkLeaveData({ ...markLeaveData, reason: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 13,
                    resize: 'vertical',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  onClick={() => setShowMarkLeaveModal(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    background: 'transparent',
                    color: colors.text.primary,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkLeave}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: colors.primary,
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? 'Marking...' : 'Mark Leave'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.text && (
        <div
          style={{
            position: 'fixed',
            right: 18,
            bottom: 20,
            padding: '12px 16px',
            borderRadius: 12,
            background: toast.type === 'error' ? 'rgba(248,113,113,0.12)' : 'rgba(16,185,129,0.14)',
            border: `1px solid ${toast.type === 'error' ? 'rgba(220,38,38,0.6)' : 'rgba(16,185,129,0.7)'}`,
            color: toast.type === 'error' ? '#b91c1c' : '#065f46',
            fontSize: 13,
            zIndex: 50,
          }}
        >
          {toast.text}
        </div>
      )}

      {/* Auto Logout Warning */}
      {showWarning && (
        <AutoLogoutWarning
          timeRemaining={timeRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={autoLogout}
        />
      )}
    </div>
  );
}
