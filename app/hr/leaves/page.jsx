// app/hr/leaves/page.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrentQuarter } from '@/lib/leave/quarterUtils';

const LOW_BALANCE_THRESHOLD = 2;

/** Active quarter key for balance filters (q1–q4). Past years use Q4; future years use Q1. */
function getActiveQuarterKey(selectedYear) {
  const { year: nowYear, quarter } = getCurrentQuarter();
  if (selectedYear < nowYear) return 'q4';
  if (selectedYear > nowYear) return 'q1';
  return `q${quarter}`;
}

function getYearTotals(leave, leavesPerQuarter) {
  const entitlement = leavesPerQuarter * 4;
  const taken =
    (leave.q1?.taken || 0) +
    (leave.q2?.taken || 0) +
    (leave.q3?.taken || 0) +
    (leave.q4?.taken || 0);
  const remaining = Math.max(0, entitlement - taken);
  return { entitlement, taken, remaining };
}

function getQuarterRemaining(leave, quarterKey, leavesPerQuarter) {
  const quarterData = leave[quarterKey];
  if (!quarterData) return leavesPerQuarter;
  const allocated = quarterData.allocated ?? leavesPerQuarter;
  const taken = quarterData.taken || 0;
  return Math.max(0, quarterData.remaining ?? allocated - taken);
}

function matchesBalanceFilter(leave, filter, leavesPerQuarter, activeQuarterKey) {
  const { taken } = getYearTotals(leave, leavesPerQuarter);
  const quarterRemaining = getQuarterRemaining(leave, activeQuarterKey, leavesPerQuarter);

  if (filter === 'low') return quarterRemaining > 0 && quarterRemaining <= LOW_BALANCE_THRESHOLD;
  if (filter === 'exhausted') return quarterRemaining === 0;
  if (filter === 'none_taken') return taken === 0;
  return true;
}

export default function HrLeavesPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const { canCreate, canDelete } = usePermissions('leaves');

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
  const [leavesPerQuarter, setLeavesPerQuarter] = useState(6);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all'); // all | low | exhausted | none_taken
  const activeQuarterKey = getActiveQuarterKey(year);
  const activeQuarterLabel = activeQuarterKey.toUpperCase();
  const [showMarkLeaveModal, setShowMarkLeaveModal] = useState(false);
  const [markLeaveData, setMarkLeaveData] = useState({
    empCode: '',
    date: '',
    reason: '',
  });
  const [toast, setToast] = useState({ type: '', text: '' });
  const [viewDatesFor, setViewDatesFor] = useState(null); // { empCode, employeeName, quarter, quarterLabel, dates }

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 3000);
  }

  async function loadLeaves() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hr/leaves?year=${year}`, { cache: 'no-store' });
      if (res.ok) {
        const response = await res.json();
        if (response.success) {
          setPaidLeaves(response.data?.paidLeaves || []);
          if (response.data?.leavesPerQuarter != null) {
            setLeavesPerQuarter(response.data.leavesPerQuarter);
          }
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

  // Refetch when user returns to this tab (e.g. after changing leave on monthly sheet) so both pages stay in sync
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadLeaves();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [year]);

  async function handleMarkLeave() {
    if (!markLeaveData.empCode || !markLeaveData.date) {
      showToast('error', 'Employee code and date are required');
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
        setMarkLeaveData({ empCode: '', date: '', reason: '' });
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

  async function handleRemoveLeave(empCode, date, onSuccess) {
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
        onSuccess?.();
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

  const searchFilteredLeaves = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return paidLeaves;
    return paidLeaves.filter(
      (leave) =>
        leave.empCode?.toLowerCase().includes(query) ||
        leave.employeeName?.toLowerCase().includes(query) ||
        leave.department?.toLowerCase().includes(query)
    );
  }, [paidLeaves, searchQuery]);

  const filteredLeaves = useMemo(
    () =>
      searchFilteredLeaves.filter((leave) =>
        matchesBalanceFilter(leave, balanceFilter, leavesPerQuarter, activeQuarterKey)
      ),
    [searchFilteredLeaves, balanceFilter, leavesPerQuarter, activeQuarterKey]
  );

  const filterCounts = useMemo(() => {
    let low = 0;
    let exhausted = 0;
    let noneTaken = 0;
    for (const leave of searchFilteredLeaves) {
      if (matchesBalanceFilter(leave, 'low', leavesPerQuarter, activeQuarterKey)) low += 1;
      if (matchesBalanceFilter(leave, 'exhausted', leavesPerQuarter, activeQuarterKey)) exhausted += 1;
      if (matchesBalanceFilter(leave, 'none_taken', leavesPerQuarter, activeQuarterKey)) noneTaken += 1;
    }
    return {
      all: searchFilteredLeaves.length,
      low,
      exhausted,
      none_taken: noneTaken,
    };
  }, [searchFilteredLeaves, leavesPerQuarter, activeQuarterKey]);

  // KPIs from search-filtered list only (not balance filter), so counts stay stable
  const dashboardSummary = useMemo(() => {
    return searchFilteredLeaves.reduce(
      (acc, leave) => {
        const { entitlement, taken, remaining } = getYearTotals(leave, leavesPerQuarter);
        const quarterRemaining = getQuarterRemaining(leave, activeQuarterKey, leavesPerQuarter);

        acc.allocated += entitlement;
        acc.taken += taken;
        acc.remaining += remaining;
        if (quarterRemaining === 0) acc.exhausted += 1;
        if (quarterRemaining > 0 && quarterRemaining <= LOW_BALANCE_THRESHOLD) acc.lowBalance += 1;
        return acc;
      },
      {
        allocated: 0,
        taken: 0,
        remaining: 0,
        exhausted: 0,
        lowBalance: 0,
      }
    );
  }, [searchFilteredLeaves, leavesPerQuarter, activeQuarterKey]);

  function getQuarterCellStyle(remaining, allocated) {
    if (allocated <= 0) return { tone: '#64748b', bg: 'rgba(100,116,139,0.12)' };
    if (remaining <= 0) return { tone: '#dc2626', bg: 'rgba(220,38,38,0.12)' };
    if (remaining <= LOW_BALANCE_THRESHOLD) return { tone: '#d97706', bg: 'rgba(217,119,6,0.12)' };
    return { tone: '#16a34a', bg: 'rgba(22,163,74,0.12)' };
  }

  function emptyFilterMessage() {
    if (balanceFilter === 'low') {
      return `No employees with low balance (≤${LOW_BALANCE_THRESHOLD} days left) in ${activeQuarterLabel}`;
    }
    if (balanceFilter === 'exhausted') {
      return `No employees with zero balance in ${activeQuarterLabel}`;
    }
    if (balanceFilter === 'none_taken') {
      return 'No employees with zero leave taken this year';
    }
    if (searchQuery.trim()) {
      return 'No employees match your search';
    }
    return 'No leave records found';
  }

  function toggleBalanceFilter(id) {
    setBalanceFilter((prev) => (prev === id && id !== 'all' ? 'all' : id));
  }

  function QuarterUsageCell({ leave, quarter, quarterLabel }) {
    const quarterData = leave[quarter] || {
      taken: 0,
      allocated: leavesPerQuarter,
      remaining: leavesPerQuarter,
      dates: [],
    };

    const taken = quarterData.taken || 0;
    const allocated = quarterData.allocated || leavesPerQuarter;
    const remaining = Math.max(0, quarterData.remaining ?? allocated - taken);
    const progress = allocated > 0 ? Math.min(100, Math.round((taken / allocated) * 100)) : 0;
    const styleToken = getQuarterCellStyle(remaining, allocated);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: colors.text.primary, fontWeight: 600 }}>
            {taken} / {allocated}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: styleToken.tone,
              background: styleToken.bg,
              border: `1px solid ${styleToken.tone}55`,
              borderRadius: 999,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            {remaining} left
          </span>
        </div>

        <div
          style={{
            width: '100%',
            height: 7,
            borderRadius: 999,
            overflow: 'hidden',
            background: colors.background.input,
            border: `1px solid ${colors.border.default}`,
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: styleToken.tone,
              transition: 'width 200ms ease',
            }}
          />
        </div>

        {(quarterData.dates?.length || 0) > 0 ? (
          <button
            type="button"
            onClick={() =>
              setViewDatesFor({
                empCode: leave.empCode,
                employeeName: leave.employeeName,
                quarter: Number(quarter.replace('q', '')),
                quarterLabel,
                dates: quarterData.dates || [],
              })
            }
            style={{
              width: 'fit-content',
              fontSize: 11,
              color: colors.primary,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            View dates
          </button>
        ) : (
          <span style={{ fontSize: 11, color: colors.text.tertiary }}>No dates</span>
        )}
      </div>
    );
  }

  // Table styles
  const thStyle = {
    padding: '14px 16px',
    textAlign: 'left',
    borderBottom: `1px solid ${colors.border.table}`,
    fontWeight: 600,
    fontSize: 13,
    color: colors.text.table.header,
    backgroundColor: colors.background.table.header,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  };

  const tdStyle = {
    padding: '14px 16px',
    borderBottom: `1px solid ${colors.border.table}`,
    fontSize: 13,
    color: colors.text.table.cell,
    backgroundColor: colors.background.table.row,
    verticalAlign: 'top',
  };

  const filterPillItems = [
    { id: 'all', label: 'All', count: filterCounts.all },
    { id: 'low', label: 'Low Balance', count: filterCounts.low },
    { id: 'exhausted', label: 'Exhausted', count: filterCounts.exhausted },
    { id: 'none_taken', label: 'No Leave Taken', count: filterCounts.none_taken },
  ];

  const summaryCardBase = {
    padding: '16px 18px',
    borderRadius: 12,
    border: `1px solid ${colors.border.default}`,
    background: colors.background.card,
    minWidth: 0,
  };

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/hr/leave-policy')} className="leaves-button" style={glossPill('slate')}>
        Leave Policy
      </button>
      <button type="button" onClick={() => router.push('/hr/dashboard')} className="leaves-button" style={glossPill('neutral')}>
        Dashboard
      </button>
      <button type="button" onClick={handleLogout} className="leaves-button" style={glossPill('rose')}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Logout
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell
      subtitle="Paid Leave Management"
      actions={headerActions}
    >
      <GlassCard style={{ marginTop: 18 }} padding={20}>
      {/* Toolbar: year + search + action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <label style={{ fontSize: 13, color: colors.text.secondary, whiteSpace: 'nowrap' }}>Year:</label>
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
              flex: 1,
              minWidth: 200,
              maxWidth: 420,
            }}
          />
        </div>
        {canCreate && (
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
              whiteSpace: 'nowrap',
            }}
          >
            + Mark Leave
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        {filterPillItems.map((item) => {
          const active = balanceFilter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleBalanceFilter(item.id)}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                border: `1px solid ${active ? colors.primary : colors.border.default}`,
                background: active
                  ? theme === 'dark'
                    ? 'rgba(59,130,246,0.2)'
                    : 'rgba(59,130,246,0.12)'
                  : colors.background.input,
                color: active ? colors.primary : colors.text.secondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label} ({item.count})
            </button>
          );
        })}
      </div>

      {/* Leave Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={summaryCardBase}>
          <div style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>Employees in List</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: colors.text.primary, lineHeight: 1.15 }}>
            {filteredLeaves.length}
          </div>
          <div style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
            of {searchFilteredLeaves.length} matching search
          </div>
        </div>
        <div
          style={{
            ...summaryCardBase,
            background: theme === 'dark' ? 'rgba(220,38,38,0.08)' : 'rgba(220,38,38,0.06)',
            borderColor: 'rgba(220,38,38,0.35)',
          }}
        >
          <div style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>Total Leave Days Used</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#dc2626', lineHeight: 1.15 }}>
            {dashboardSummary.taken}
          </div>
        </div>
        <div
          style={{
            ...summaryCardBase,
            background: theme === 'dark' ? 'rgba(22,163,74,0.08)' : 'rgba(22,163,74,0.06)',
            borderColor: 'rgba(22,163,74,0.35)',
          }}
        >
          <div style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>Total Leave Days Left</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#16a34a', lineHeight: 1.15 }}>
            {dashboardSummary.remaining}
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleBalanceFilter('low')}
          style={{
            ...summaryCardBase,
            textAlign: 'left',
            cursor: 'pointer',
            background: theme === 'dark' ? 'rgba(217,119,6,0.1)' : 'rgba(217,119,6,0.08)',
            borderColor: balanceFilter === 'low' ? '#d97706' : 'rgba(217,119,6,0.4)',
            boxShadow: balanceFilter === 'low' ? `0 0 0 2px rgba(217,119,6,0.25)` : 'none',
          }}
        >
          <div style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>
            Low Balance ({activeQuarterLabel})
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#d97706', lineHeight: 1.15 }}>
            {dashboardSummary.lowBalance}
          </div>
          <div style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
            ≤{LOW_BALANCE_THRESHOLD} days left · click to filter
          </div>
        </button>
        <button
          type="button"
          onClick={() => toggleBalanceFilter('exhausted')}
          style={{
            ...summaryCardBase,
            textAlign: 'left',
            cursor: 'pointer',
            background: theme === 'dark' ? 'rgba(220,38,38,0.1)' : 'rgba(220,38,38,0.06)',
            borderColor: balanceFilter === 'exhausted' ? '#dc2626' : 'rgba(220,38,38,0.35)',
            boxShadow: balanceFilter === 'exhausted' ? `0 0 0 2px rgba(220,38,38,0.25)` : 'none',
          }}
        >
          <div style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>
            Zero Balance ({activeQuarterLabel})
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#dc2626', lineHeight: 1.15 }}>
            {dashboardSummary.exhausted}
          </div>
          <div style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
            No days left · click to filter
          </div>
        </button>
      </div>
      <div
        style={{
          marginBottom: 14,
          fontSize: 12,
          color: colors.text.secondary,
        }}
      >
        Year totals · Low / Zero based on {activeQuarterLabel} for {year}.
      </div>

      {/* Color legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 10,
          fontSize: 12,
          color: colors.text.secondary,
        }}
      >
        <span style={{ fontWeight: 600 }}>Quarter status:</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#16a34a' }} />
          OK
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#d97706' }} />
          Low (≤{LOW_BALANCE_THRESHOLD} left)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#dc2626' }} />
          Exhausted
        </span>
      </div>

      {/* Table */}
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${colors.border.table}`,
          overflow: 'auto',
          maxHeight: '70vh',
          background: colors.background.card,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Emp Code</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Department</th>
              {['q1', 'q2', 'q3', 'q4'].map((qKey) => {
                const labels = {
                  q1: 'Q1 (Jan–Mar)',
                  q2: 'Q2 (Apr–Jun)',
                  q3: 'Q3 (Jul–Sep)',
                  q4: 'Q4 (Oct–Dec)',
                };
                const isActive = activeQuarterKey === qKey;
                const showNowBadge = isActive && year === getCurrentQuarter().year;
                return (
                  <th
                    key={qKey}
                    style={{
                      ...thStyle,
                      ...(isActive ? { boxShadow: `inset 0 -2px 0 ${colors.primary}` } : {}),
                    }}
                  >
                    {labels[qKey]}
                    {showNowBadge ? (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: colors.primary }}>
                        NOW
                      </span>
                    ) : null}
                  </th>
                );
              })}
              {canCreate && <th style={thStyle}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canCreate ? 8 : 7} style={{ ...tdStyle, textAlign: 'center', padding: '40px' }}>
                  Loading...
                </td>
              </tr>
            ) : filteredLeaves.length === 0 ? (
              <tr>
                <td colSpan={canCreate ? 8 : 7} style={{ ...tdStyle, textAlign: 'center', padding: '40px' }}>
                  {emptyFilterMessage()}
                </td>
              </tr>
            ) : (
              filteredLeaves.map((leave, idx) => (
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
                    <QuarterUsageCell leave={leave} quarter="q1" quarterLabel="Q1 (Jan–Mar)" />
                  </td>
                  <td style={tdStyle}>
                    <QuarterUsageCell leave={leave} quarter="q2" quarterLabel="Q2 (Apr–Jun)" />
                  </td>
                  <td style={tdStyle}>
                    <QuarterUsageCell leave={leave} quarter="q3" quarterLabel="Q3 (Jul–Sep)" />
                  </td>
                  <td style={tdStyle}>
                    <QuarterUsageCell leave={leave} quarter="q4" quarterLabel="Q4 (Oct–Dec)" />
                  </td>
                  {canCreate && (
                    <td style={tdStyle}>
                      <button
                        onClick={() => {
                          setMarkLeaveData({ empCode: leave.empCode, date: '', reason: '' });
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
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </GlassCard>

      {/* View leave dates modal (to see which dates are counted and remove wrong one) */}
      {viewDatesFor && (
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
          onClick={() => setViewDatesFor(null)}
        >
          <div
            style={{
              background: colors.background.card,
              borderRadius: 16,
              padding: 24,
              minWidth: 360,
              maxWidth: 480,
              border: `1px solid ${colors.border.default}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: colors.text.primary }}>
              Leave dates – {viewDatesFor.employeeName} ({viewDatesFor.empCode})
            </h3>
            <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
              {viewDatesFor.quarterLabel} – {viewDatesFor.dates.length} day(s).
              {canDelete ? ' Remove the date that was marked by mistake.' : ''}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 240, overflowY: 'auto' }}>
              {viewDatesFor.dates.map((date) => (
                <li
                  key={date}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: `1px solid ${colors.border.default}`,
                  }}
                >
                  <span style={{ fontSize: 13, color: colors.text.primary }}>{date}</span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLeave(viewDatesFor.empCode, date, () => setViewDatesFor(null))}
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        color: '#b91c1c',
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.4)',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setViewDatesFor(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.default}`,
                  background: 'transparent',
                  color: colors.text.primary,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Leave Modal */}
      {canCreate && showMarkLeaveModal && (
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
              Mark Paid Leave (policy: paid leaves per quarter set in Leave Policy)
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
                  Date *
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
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={markLeaveData.reason || ''}
                  onChange={(e) => setMarkLeaveData({ ...markLeaveData, reason: e.target.value })}
                  placeholder="Optional"
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
    </HrPageShell>
  );
}
