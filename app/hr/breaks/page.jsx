'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/api/client';
import PaginationControls from '@/components/common/PaginationControls';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { BreakFormModal } from '@/components/hr/BreakCrudModals';

const EMPTY_SUMMARY = {
  onBreakNow: 0,
  overLimitEmployees: 0,
  overGeneralEmployees: 0,
  overNamazEmployees: 0,
  sessionCount: 0,
  totalMinutes: 0,
  byType: { Official: 0, General: 0, Namaz: 0, Other: 0 },
  generalLimitMinutes: 60,
  namazLimitMinutes: 40,
  officialUnlimited: true,
};

const TABS = [
  { id: 'live', label: 'Live now' },
  { id: 'over', label: 'Over limit' },
  { id: 'employees', label: 'By employee' },
];

function formatPkt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatMinutes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (v < 1) return v.toFixed(2);
  if (v < 10) return v.toFixed(1);
  return String(Math.round(v * 10) / 10);
}

function todayLocalYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

function GeneralBar({ used, limit = 60, over, colors, unlimited = false }) {
  const value = Number(used) || 0;
  const pct = unlimited
    ? Math.min(100, Math.round((value / Math.max(value, 60)) * 100)) // soft visual only
    : Math.min(100, Math.round((value / limit) * 100));
  const fill = over ? '#ef4444' : unlimited
    ? (colors.primary?.[400] || '#38bdf8')
    : (colors.primary?.[500] || '#0ea5e9');
  return (
    <div style={{ width: '100%', maxWidth: 130 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 6,
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 4,
          color: over ? '#ef4444' : colors.text.primary,
          whiteSpace: 'nowrap',
        }}
      >
        <span>
          {unlimited ? (
            <>{formatMinutes(value)}m</>
          ) : (
            <>
              {formatMinutes(value)}/{limit}
              {over ? ' ✕' : ''}
            </>
          )}
        </span>
        <span style={{ color: colors.text.secondary, fontWeight: 600 }}>
          {unlimited ? '∞' : `${pct}%`}
        </span>
      </div>
      <div
        style={{
          height: 7,
          borderRadius: 999,
          background: 'rgba(148,163,184,0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${unlimited ? (value > 0 ? Math.max(8, pct) : 0) : pct}%`,
            height: '100%',
            borderRadius: 999,
            background: fill,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
    </div>
  );
}

function Chip({ children, tone = 'neutral', colors }) {
  const map = {
    neutral: { bg: 'rgba(100,116,139,0.16)', color: colors.text.secondary },
    live: { bg: 'rgba(14,165,233,0.18)', color: colors.primary?.[500] || '#0ea5e9' },
    danger: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
    ok: { bg: 'rgba(34,197,94,0.15)', color: colors.success || '#16a34a' },
    warm: { bg: 'rgba(245,158,11,0.18)', color: '#d97706' },
  };
  const t = map[tone] || map.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: t.bg,
        color: t.color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export default function HrBreakMonitoringPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const { session, status, canView, canCreate, canUpdate, canDelete } = usePermissions('breakMonitoring');
  const isDark = theme === 'dark';

  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

  const [tab, setTab] = useState('employees');
  const [preset, setPreset] = useState('week');
  const [from, setFrom] = useState(todayLocalYmd());
  const [to, setTo] = useState(todayLocalYmd());
  const [deptFilter, setDeptFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [breakTypes, setBreakTypes] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [range, setRange] = useState({ from: '', to: '', timezone: '+05:00' });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });

  const [drawer, setDrawer] = useState(null);
  const [drawerSessions, setDrawerSessions] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [formInitial, setFormInitial] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    const role = String(session?.user?.role || '').toUpperCase();
    if (status === 'unauthenticated' || (session && !['HR', 'ADMIN'].includes(role))) {
      router.replace('/login?role=hr');
    }
  }, [session, status, router]);

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3000);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildParams = useCallback(
    (overrides = {}) => {
      const params = new URLSearchParams();
      params.set('page', String(overrides.page ?? currentPage));
      params.set('limit', String(overrides.limit ?? 50));
      if (preset === 'custom') {
        params.set('from', from);
        params.set('to', to);
      } else {
        params.set('preset', preset);
      }
      if (searchQuery) params.set('search', searchQuery);

      const mode = overrides.tab || tab;
      if (mode === 'over') {
        params.set('view', 'summary');
        params.set('overLimit', 'any');
      } else {
        // live + employees: employee summary only; open a row for session timeline
        params.set('view', 'summary');
      }
      return params;
    },
    [currentPage, preset, from, to, searchQuery, tab]
  );

  const loadBreaks = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setSummaryRows([]);
      }
      try {
        const params = buildParams();
        const data = await api.get(`/api/hr/breaks?${params.toString()}`, {
          requestKey: 'hr-breaks-main',
        });
        if (data.aborted) return;

        if (data.success) {
          setSummary({ ...EMPTY_SUMMARY, ...(data.data?.summary || {}) });
          setBreakTypes(data.data?.breakTypes || []);
          setRange(data.data?.range || { from, to, timezone: '+05:00' });
          setPagination(
            data.meta?.pagination || { page: currentPage, limit: 50, total: 0, totalPages: 1 }
          );
          setSummaryRows(data.data?.rows || []);
        } else if (!silent) {
          showToast('error', data.error || 'Failed to load breaks');
        }
      } catch (_) {
        if (!silent) showToast('error', 'Failed to load breaks');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [buildParams, currentPage, from, to]
  );

  const isHrPortal = ['HR', 'ADMIN'].includes(String(session?.user?.role || '').toUpperCase());

  useEffect(() => {
    if (isHrPortal && canView) loadBreaks();
  }, [isHrPortal, canView, loadBreaks]);

  useEffect(() => {
    if (!isHrPortal || !canView) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadBreaks(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [isHrPortal, canView, loadBreaks]);

  async function openEmployeeDrawer(row) {
    setDrawer(row);
    setDrawerLoading(true);
    setDrawerSessions([]);
    try {
      const params = new URLSearchParams();
      params.set('view', 'sessions');
      params.set('from', row.shiftDate);
      params.set('to', row.shiftDate);
      params.set('search', row.empCode);
      params.set('limit', '100');
      params.set('page', '1');
      const data = await api.get(`/api/hr/breaks?${params.toString()}`, {
        requestKey: `hr-breaks-drawer-${row.empCode}`,
      });
      if (data.aborted) return;
      if (data.success) {
        const list = (data.data?.sessions || []).filter(
          (s) => s.empCode === row.empCode && s.shiftDate === row.shiftDate
        );
        list.sort((a, b) => String(a.breakStartTime).localeCompare(String(b.breakStartTime)));
        setDrawerSessions(list);
      }
    } catch (_) {
      showToast('error', 'Failed to load employee timeline');
    } finally {
      setDrawerLoading(false);
    }
  }

  function openCreateBreak(prefill = null) {
    setFormMode('create');
    setFormInitial(prefill);
    setFormOpen(true);
  }

  function openEditBreak(session) {
    setFormMode('edit');
    setFormInitial(session);
    setFormOpen(true);
  }

  async function confirmDeleteBreak() {
    if (!confirmDelete?.id) return;
    setDeleting(true);
    try {
      const data = await api.delete(`/api/hr/breaks/${confirmDelete.id}`);
      if (data.success) {
        showToast('success', 'Break deleted');
        setConfirmDelete(null);
        loadBreaks(true);
        if (drawer) openEmployeeDrawer(drawer);
      } else {
        showToast('error', data.error || 'Delete failed');
      }
    } catch (_) {
      showToast('error', 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  function afterCrudSaved() {
    loadBreaks(true);
    if (drawer) openEmployeeDrawer(drawer);
  }

  const departments = useMemo(() => {
    const set = new Set(summaryRows.map((r) => r.department).filter(Boolean));
    return [...set].sort();
  }, [summaryRows]);

  const displayRows = useMemo(() => {
    let rows = summaryRows;
    if (deptFilter) rows = rows.filter((r) => r.department === deptFilter);
    // Live tab: API used status=open so openCount should be > 0; keep rows that still have open
    if (tab === 'live') rows = rows.filter((r) => (r.openCount || 0) > 0);
    return rows;
  }, [summaryRows, deptFilter, tab]);

  const groupedByDept = useMemo(() => {
    const map = new Map();
    for (const r of displayRows) {
      const key = r.department || 'No department';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayRows]);

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const inputStyle = useMemo(
    () => ({
      width: '100%',
      minHeight: 38,
      padding: '8px 12px',
      borderRadius: 10,
      border: `1px solid ${colors.glass.border}`,
      background: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.85)',
      color: colors.text.primary,
      fontSize: 13,
      outline: 'none',
    }),
    [colors, isDark]
  );

  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: colors.text.secondary,
    marginBottom: 6,
  };

  const headerActions = (
    <HrHeaderActions>
      <button
        type="button"
        onClick={() => router.push('/hr/employees')}
        style={{ ...glossPill('neutral'), border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
      >
        HR Hub
      </button>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/login?role=hr' })}
        style={{ ...glossPill('rose'), border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
      >
        Logout
      </button>
    </HrHeaderActions>
  );

  function switchTab(next) {
    setTab(next);
    setCurrentPage(1);
    setDeptFilter('');
  }

  function renderEmployeeRow(r) {
    const overG = r.overGeneralLimit;
    const overN = r.overNamazLimit;
    const over = overG || overN;
    const td = {
      padding: '10px 12px',
      verticalAlign: 'middle',
      borderBottom: `1px solid ${colors.glass.border}`,
    };
    return (
      <tr
        key={`${r.empCode}-${r.shiftDate}`}
        onClick={() => openEmployeeDrawer(r)}
        style={{
          background: over ? 'rgba(239,68,68,0.07)' : 'transparent',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = over ? 'rgba(239,68,68,0.12)' : 'rgba(14,165,233,0.06)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = over ? 'rgba(239,68,68,0.07)' : 'transparent';
        }}
      >
        <td style={{ ...td, fontWeight: 700, width: '8%' }}>{r.empCode}</td>
        <td style={{ ...td, width: '16%' }}>
          <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{r.employeeName || '—'}</div>
          <div style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2, lineHeight: 1.2 }}>
            {r.department || '—'}
          </div>
        </td>
        <td style={{ ...td, width: '13%', whiteSpace: 'nowrap' }}>
          <div style={{ lineHeight: 1.3 }}>{r.shiftDate}</div>
          <div style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2, lineHeight: 1.2 }}>
            {r.shiftName || r.shiftCode || '—'}
          </div>
        </td>
        <td style={{ ...td, width: '13%' }}>
          <GeneralBar used={r.generalMinutes} limit={r.generalLimitMinutes || 60} over={overG} colors={colors} />
        </td>
        <td style={{ ...td, width: '13%' }}>
          <GeneralBar used={r.namazMinutes} limit={r.namazLimitMinutes || 40} over={overN} colors={colors} />
        </td>
        <td style={{ ...td, width: '13%' }}>
          <GeneralBar used={r.officialMinutes} unlimited colors={colors} />
        </td>
        <td style={{ ...td, width: '24%' }}>
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, alignItems: 'center' }}>
            {r.openCount > 0 && <Chip colors={colors} tone="live">On break</Chip>}
            {overG && <Chip colors={colors} tone="danger">Over General</Chip>}
            {overN && <Chip colors={colors} tone="danger">Over Namaz</Chip>}
            {!over && !(r.openCount > 0) && <Chip colors={colors} tone="ok">OK</Chip>}
            <span style={{ fontSize: 12, color: colors.text.secondary, whiteSpace: 'nowrap' }}>
              {r.sessionCount} {r.sessionCount === 1 ? 'session' : 'sessions'}
            </span>
          </div>
        </td>
      </tr>
    );
  }

  if (status === 'loading') {
    return (
      <HrPageShell title="Break Monitoring" subtitle="Loading…" actions={headerActions}>
        <div style={{ padding: 40, textAlign: 'center', color: colors.text.secondary }}>Loading…</div>
      </HrPageShell>
    );
  }

  if (!canView) {
    return (
      <HrPageShell title="Break Monitoring" subtitle="Access denied" actions={headerActions}>
        <GlassCard>
          <p style={{ margin: 0, color: colors.text.secondary }}>
            You do not have permission to view employee break monitoring.
          </p>
        </GlassCard>
      </HrPageShell>
    );
  }

  const limitMin = summary.generalLimitMinutes || 60;
  const namazLimit = summary.namazLimitMinutes || 40;

  return (
    <HrPageShell
      title="Employee Break Monitoring"
      subtitle={`General ${limitMin} min · Namaz ${namazLimit} min · Official unlimited · per shift-start day (${range.timezone || '+05:00'})`}
      actions={headerActions}
    >
      {showWarning && (
        <AutoLogoutWarning
          timeRemaining={timeRemaining || 0}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={autoLogout}
        />
      )}

      {toast.text && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: toast.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
            color: toast.type === 'error' ? '#ef4444' : colors.success || '#16a34a',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {toast.text}
        </div>
      )}

      {/* KPI strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        {[
          {
            key: 'live',
            label: 'On break now',
            value: summary.onBreakNow,
            hint: 'Open sessions',
            tone: colors.primary[500],
            tab: 'live',
          },
          {
            key: 'overGeneral',
            label: 'Over General (60)',
            value: summary.overGeneralEmployees ?? summary.overLimitEmployees,
            hint: 'General > 60 min / shift day',
            tone: '#ef4444',
            tab: 'over',
          },
          {
            key: 'overNamaz',
            label: 'Over Namaz (40)',
            value: summary.overNamazEmployees || 0,
            hint: 'Namaz > 40 min / shift day',
            tone: '#f97316',
            tab: 'over',
          },
        ].map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => switchTab(k.tab)}
            style={{
              textAlign: 'left',
              borderRadius: 14,
              padding: '14px 16px',
              border: `1px solid ${tab === k.tab && (k.tab === 'live' || k.tab === 'over') ? k.tone : colors.glass.border}`,
              background: colors.glass.panelBg,
              cursor: 'pointer',
              boxShadow: colors.glass.shadow,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: colors.text.secondary,
              }}
            >
              {k.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.tone, marginTop: 4, lineHeight: 1.1 }}>
              {k.value}
            </div>
            <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>{k.hint}</div>
          </button>
        ))}
      </div>

      <GlassCard>
        {/* Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: `1px solid ${active ? colors.primary[500] : colors.glass.border}`,
                  background: active
                    ? `linear-gradient(135deg, ${colors.primary[700]}, ${colors.primary[500]})`
                    : 'transparent',
                  color: active ? '#fff' : colors.text.primary,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t.label}
                {t.id === 'live' && summary.onBreakNow > 0 ? ` (${summary.onBreakNow})` : ''}
                {t.id === 'over' && (summary.overLimitEmployees || 0) > 0
                  ? ` (${summary.overLimitEmployees})`
                  : ''}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 14,
            alignItems: 'end',
          }}
        >
          <div>
            <div style={labelStyle}>Period</div>
            <select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                setCurrentPage(1);
              }}
              style={inputStyle}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
              <option value="custom">Custom dates</option>
            </select>
          </div>

          {preset === 'custom' && (
            <>
              <div>
                <div style={labelStyle}>From</div>
                <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setCurrentPage(1); }} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>To</div>
                <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setCurrentPage(1); }} style={inputStyle} />
              </div>
            </>
          )}

          <div>
            <div style={labelStyle}>Department</div>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={inputStyle}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Search</div>
            <input
              type="search"
              placeholder="Emp code or name"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setPreset('week');
              setFrom(todayLocalYmd());
              setTo(todayLocalYmd());
              setDeptFilter('');
              setSearchInput('');
              setSearchQuery('');
              setTab('employees');
              setCurrentPage(1);
            }}
            style={{ ...glossPill('neutral'), border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => loadBreaks()}
            style={{ ...glossPill('neutral'), border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            Refresh
          </button>
          <span style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 'auto' }}>
            Shift days {range.from || '—'} → {range.to || '—'}
            {preset === 'today' ? ' (Today)' : ''}
            {preset === 'yesterday' ? ' (Yesterday)' : ''}
            {preset === 'week' ? ' (Last 7 days)' : ''}
            {preset === 'month' ? ' (This month)' : ''}
            {' · click employee for details'}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: colors.text.secondary }}>Loading…</div>
        ) : displayRows.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: colors.text.secondary, fontSize: 14 }}>
            {tab === 'live' && 'Nobody is on break right now for this period.'}
            {tab === 'over' && 'No employees over General (60) or Namaz (40) for this period.'}
            {tab === 'employees' && (
              <>
                No employees with breaks for this period
                {range.from ? ` (${range.from}${range.to && range.to !== range.from ? ` → ${range.to}` : ''})` : ''}.
                {preset === 'today' && (
                  <> Night-shift breaks after midnight still count on the <strong>shift start day</strong> (often Yesterday) — try Yesterday or Last 7 days.</>
                )}
                {preset !== 'today' && <> Try another period.</>}
              </>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '24%' }} />
              </colgroup>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.glass.border}` }}>
                  {[
                    'Emp',
                    'Name',
                    'Shift day',
                    'General / 60',
                    'Namaz / 40',
                    'Official ∞',
                    'Status',
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 12px',
                        color: colors.text.secondary,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedByDept.map(([dept, rows]) => (
                  <Fragment key={dept}>
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          padding: '14px 12px 8px',
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colors.text.secondary,
                          borderBottom: `1px solid ${colors.glass.border}`,
                          background: isDark ? 'rgba(15,23,42,0.35)' : 'rgba(248,250,252,0.8)',
                        }}
                      >
                        {dept} · {rows.length}
                      </td>
                    </tr>
                    {rows.map(renderEmployeeRow)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <PaginationControls
            currentPage={pagination.page || currentPage}
            totalPages={pagination.totalPages || 1}
            totalItems={pagination.total || 0}
            itemsPerPage={pagination.limit || 50}
            onPageChange={setCurrentPage}
            loading={loading}
          />
        </div>
      </GlassCard>

      {/* Employee timeline drawer */}
      {drawer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: isDark ? 'rgba(2,6,23,0.75)' : 'rgba(15,23,42,0.45)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setDrawer(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 100%)',
              height: '100%',
              background: colors.background?.card || colors.glass.panelBg,
              borderLeft: `1px solid ${colors.glass.border}`,
              boxShadow: '-12px 0 40px rgba(0,0,0,0.2)',
              padding: 20,
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.secondary }}>
                  Break timeline
                </div>
                <h3 style={{ margin: '4px 0 0', fontSize: 20, color: colors.text.primary }}>
                  {drawer.employeeName || drawer.empCode}
                </h3>
                <div style={{ fontSize: 13, color: colors.text.secondary, marginTop: 4 }}>
                  {drawer.empCode} · {drawer.shiftDate} · {drawer.shiftName || drawer.shiftCode || 'Shift'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() =>
                      openCreateBreak({
                        empCode: drawer.empCode,
                        shiftId: drawer.shiftId || '',
                      })
                    }
                    style={{
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: 12,
                      background: colors.primary[500],
                      color: '#fff',
                    }}
                  >
                    + Add
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrawer(null)}
                  style={{
                    border: `1px solid ${colors.glass.border}`,
                    background: 'transparent',
                    borderRadius: 8,
                    width: 36,
                    height: 36,
                    cursor: 'pointer',
                    color: colors.text.primary,
                    fontSize: 18,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.text.secondary, marginBottom: 4 }}>
                  General (limit 60)
                </div>
                <GeneralBar
                  used={
                    drawer.generalMinutes ??
                    drawerSessions
                      .filter((s) => String(s.breakTypeName).toLowerCase() === 'general')
                      .reduce((a, s) => a + Number(s.totalMinutes || 0), 0)
                  }
                  limit={drawer.generalLimitMinutes || 60}
                  over={drawer.overGeneralLimit}
                  colors={colors}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.text.secondary, marginBottom: 4 }}>
                  Namaz (limit 40)
                </div>
                <GeneralBar
                  used={
                    drawer.namazMinutes ??
                    drawerSessions
                      .filter((s) => String(s.breakTypeName).toLowerCase() === 'namaz')
                      .reduce((a, s) => a + Number(s.totalMinutes || 0), 0)
                  }
                  limit={drawer.namazLimitMinutes || 40}
                  over={drawer.overNamazLimit}
                  colors={colors}
                />
              </div>
              <Chip colors={colors} tone="neutral">
                Official{' '}
                {formatMinutes(
                  drawer.officialMinutes ??
                    drawerSessions
                      .filter((s) => String(s.breakTypeName).toLowerCase() === 'official')
                      .reduce((a, s) => a + Number(s.totalMinutes || 0), 0)
                )}
                m · unlimited
              </Chip>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {drawer.overGeneralLimit && <Chip colors={colors} tone="danger">Over General limit</Chip>}
                {drawer.overNamazLimit && <Chip colors={colors} tone="danger">Over Namaz limit</Chip>}
                {(drawer.openCount > 0 || drawerSessions.some((s) => s.isOpen)) && (
                  <Chip colors={colors} tone="live">On break now</Chip>
                )}
              </div>
            </div>

            {drawerLoading ? (
              <div style={{ color: colors.text.secondary, padding: 20 }}>Loading timeline…</div>
            ) : drawerSessions.length === 0 ? (
              <div style={{ color: colors.text.secondary, padding: 12 }}>No sessions found for this shift day.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {drawerSessions.map((s) => {
                  const type = String(s.breakTypeName || '').toLowerCase();
                  const tone = type === 'general' ? 'warm' : type === 'namaz' ? 'ok' : 'live';
                  return (
                    <div
                      key={s.id}
                      style={{
                        border: `1px solid ${colors.glass.border}`,
                        borderRadius: 12,
                        padding: '12px 14px',
                        background: isDark ? 'rgba(15,23,42,0.45)' : 'rgba(248,250,252,0.9)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <Chip colors={colors} tone={tone}>
                          {s.breakTypeName}
                        </Chip>
                        <span style={{ fontWeight: 800, color: colors.text.primary }}>
                          {formatMinutes(s.totalMinutes)} min
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: colors.text.secondary }}>
                        {formatPkt(s.breakStartTime)} → {s.isOpen ? 'Ongoing' : formatPkt(s.breakEndTime)}
                      </div>
                      {s.comment ? (
                        <div style={{ fontSize: 13, marginTop: 8, color: colors.text.primary }}>
                          “{s.comment}”
                        </div>
                      ) : null}
                      {(canUpdate || canDelete) && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={() => openEditBreak(s)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: colors.primary[500] }}
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(s)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#ef4444' }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <BreakFormModal
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        breakTypes={breakTypes}
        colors={colors}
        isDark={isDark}
        inputStyle={inputStyle}
        onClose={() => setFormOpen(false)}
        onSaved={afterCrudSaved}
        showToast={showToast}
      />

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete break?"
        message={
          confirmDelete
            ? `Delete ${confirmDelete.breakTypeName || 'break'} for ${confirmDelete.empCode} (${formatPkt(confirmDelete.breakStartTime)})? This cannot be undone.`
            : ''
        }
        confirmText={deleting ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        loading={deleting}
        onConfirm={confirmDeleteBreak}
        onClose={() => !deleting && setConfirmDelete(null)}
      />
    </HrPageShell>
  );
}
