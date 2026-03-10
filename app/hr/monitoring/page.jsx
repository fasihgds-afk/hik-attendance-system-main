'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { getBusinessDate } from '@/lib/date/businessDate';

function getDefaultDate() {
  return getBusinessDate('+05:00');
}

const BREAK_CATEGORIES = ['Official', 'General', 'Namaz'];

export default function MonitoringPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 });
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => getDefaultDate());
  const [expandedEmpCode, setExpandedEmpCode] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Break CRUD modals
  const [editBreak, setEditBreak] = useState(null); // { row, break: b }
  const [addBreakRow, setAddBreakRow] = useState(null); // row for which we're adding
  const [breakCategory, setBreakCategory] = useState('General');
  const [breakReason, setBreakReason] = useState('');
  const [breakDuration, setBreakDuration] = useState('');
  const [breakStartTime, setBreakStartTime] = useState('');
  const [breakEndTime, setBreakEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/hr/monitoring/live?date=${date}`, { cache: 'no-store' });
      const json = await res.json();
      setRows(Array.isArray(json?.data?.rows) ? json.data.rows : []);
      setSummary(json?.success ? (json.data?.summary || { total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 }) : { total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 });
      setLastUpdated(new Date());
    } catch {
      setRows([]);
      setSummary({ total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(`/api/hr/monitoring/live?date=${date}`, { cache: 'no-store' });
        const json = await res.json();
        if (mounted) {
          setRows(Array.isArray(json?.data?.rows) ? json.data.rows : []);
          setSummary(json?.success ? (json.data?.summary || { total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 }) : { total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 });
          setLastUpdated(new Date());
        }
      } catch {
        if (mounted) {
          setRows([]);
          setSummary({ total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [date]);

  const departments = useMemo(() => {
    const depts = new Set(rows.map((r) => r.department).filter(Boolean));
    return [...depts].sort();
  }, [rows]);

  const sortedRows = useMemo(() => {
    let list = [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (statusFilter) {
      if (statusFilter === 'SUSPICIOUS') {
        list = list.filter((r) => r.suspiciousLive);
      } else if (statusFilter === 'ACTIVE') {
        list = list.filter((r) => r.status === 'ACTIVE' && !r.suspiciousLive);
      } else if (statusFilter === 'IDLE') {
        list = list.filter((r) => r.status === 'IDLE' || r.status === 'BREAK');
      } else if (statusFilter === 'OFFLINE') {
        list = list.filter((r) => r.status === 'OFFLINE');
      }
    }
    if (departmentFilter) {
      list = list.filter((r) => r.department === departmentFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          String(r.name || '').toLowerCase().includes(q) ||
          String(r.empCode || '').toLowerCase().includes(q) ||
          String(r.department || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, statusFilter, departmentFilter, searchQuery]);

  const openEditBreak = (row, b, e) => {
    e?.stopPropagation?.();
    setEditBreak({ row, break: b });
    setBreakCategory(b.displayCategory || b.category || 'General');
    setBreakReason(b.reason || '');
    setBreakDuration(String(b.displayDurationMin ?? b.durationMin ?? 0));
    setSaveError('');
    setSaveSuccess(false);
  };

  const openAddBreak = (row, e) => {
    e?.stopPropagation?.();
    setAddBreakRow(row);
    setBreakCategory('General');
    setBreakReason('');
    setBreakStartTime('');
    setBreakEndTime('');
    setSaveError('');
    setSaveSuccess(false);
  };

  const closeBreakModals = () => {
    setEditBreak(null);
    setAddBreakRow(null);
    setBreakCategory('General');
    setBreakReason('');
    setBreakDuration('');
    setBreakStartTime('');
    setBreakEndTime('');
    setSaveError('');
    setSaveSuccess(false);
  };

  const handleSaveEditBreak = async () => {
    if (!editBreak) return;
    const { row, break: b } = editBreak;
    const d = Number(breakDuration);
    if (isNaN(d) || d < 0) {
      setSaveError('Invalid duration');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/hr/break-log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          breakId: b._id,
          empCode: row.empCode,
          category: breakCategory,
          reason: breakReason.trim(),
          durationMin: d,
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        setSaveError(json?.message || json?.error || 'Failed to save');
        return;
      }
      setSaveSuccess(true);
      refresh();
      setTimeout(closeBreakModals, 800);
    } catch (err) {
      setSaveError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBreak = async () => {
    if (!addBreakRow) return;
    if (!breakReason.trim()) {
      setSaveError('Reason is required');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/hr/break-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empCode: addBreakRow.empCode,
          date,
          category: breakCategory,
          reason: breakReason.trim(),
          breakStartTime: breakStartTime || undefined,
          breakEndTime: breakEndTime || undefined,
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        setSaveError(json?.message || json?.error || 'Failed to add');
        return;
      }
      setSaveSuccess(true);
      refresh();
      setTimeout(closeBreakModals, 800);
    } catch (err) {
      setSaveError(err?.message || 'Failed to add');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBreak = async (row, b, e) => {
    e?.stopPropagation?.();
    if (!confirm(`Delete this break record for ${row.name}?`)) return;
    try {
      const res = await fetch(`/api/hr/break-log?breakId=${b._id}&empCode=${row.empCode}`, { method: 'DELETE' });
      const json = await res.json();
      if (json?.success) refresh();
      else alert(json?.message || 'Failed to delete');
    } catch {
      alert('Failed to delete');
    }
  };

  return (
    <div className="min-h-screen bg-[#020818] p-6 text-white">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Live Monitoring</h1>
          <div className="mt-1 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Live — refreshes every 5s
            </span>
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded bg-[#1e2b44] px-2 py-1 text-xs text-gray-300 hover:bg-[#2b3347] disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : 'Refresh now'}
            </button>
          </div>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded bg-[#0b1f3a] px-3 py-1 text-sm text-white outline-none border border-[#1f2a44]"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, emp code, or department..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none border border-[#1f2a44] w-72"
        />
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white outline-none border border-[#1f2a44]"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {(searchQuery || departmentFilter) && (
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setDepartmentFilter(''); }}
            className="rounded bg-[#1e2b44] px-2 py-1 text-xs text-gray-300 hover:bg-[#2b3347]"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter(null)}
          className={`cursor-pointer rounded-lg p-4 text-center transition-all hover:ring-2 hover:ring-[#3b82f6]/50 ${statusFilter === null ? 'ring-2 ring-[#3b82f6] bg-[#1e3a5f]' : 'bg-[#1e2b44]'}`}
        >
          <div className="text-4xl font-bold text-[#3b82f6]">{summary.total}</div>
          <div className="mt-1 text-xs text-gray-300">Total</div>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? null : 'ACTIVE')}
          className={`cursor-pointer rounded-lg p-4 text-center transition-all hover:ring-2 hover:ring-[#22c55e]/50 ${statusFilter === 'ACTIVE' ? 'ring-2 ring-[#22c55e] bg-[#0a3320]' : 'bg-[#072b32]'}`}
        >
          <div className="text-4xl font-bold text-[#22c55e]">{summary.active}</div>
          <div className="mt-1 text-xs text-gray-300">Active</div>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'IDLE' ? null : 'IDLE')}
          className={`cursor-pointer rounded-lg p-4 text-center transition-all hover:ring-2 hover:ring-[#eab308]/50 ${statusFilter === 'IDLE' ? 'ring-2 ring-[#eab308] bg-[#332a0a]' : 'bg-[#2b3347]'}`}
        >
          <div className="text-4xl font-bold text-[#eab308]">{summary.idle}</div>
          <div className="mt-1 text-xs text-gray-300">Idle</div>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'OFFLINE' ? null : 'OFFLINE')}
          className={`cursor-pointer rounded-lg p-4 text-center transition-all hover:ring-2 hover:ring-[#ef4444]/50 ${statusFilter === 'OFFLINE' ? 'ring-2 ring-[#ef4444] bg-[#331a1a]' : 'bg-[#2b3347]'}`}
        >
          <div className="text-4xl font-bold text-[#ef4444]">{summary.offline}</div>
          <div className="mt-1 text-xs text-gray-300">Offline</div>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'SUSPICIOUS' ? null : 'SUSPICIOUS')}
          className={`cursor-pointer rounded-lg p-4 text-center transition-all hover:ring-2 hover:ring-[#f97316]/50 ${statusFilter === 'SUSPICIOUS' ? 'ring-2 ring-[#f97316] bg-[#332210]' : 'bg-[#2b3347]'}`}
        >
          <div className="text-4xl font-bold text-[#f97316]">{summary.suspicious}</div>
          <div className="mt-1 text-xs text-gray-300">Suspicious</div>
        </button>
      </div>

      <div className="mt-5 flex gap-6 rounded-lg border border-[#22314d] bg-[#0b1a2f] px-4 py-3">
        <span className="text-sm"><span className="font-bold text-blue-300">Official</span> <span className="text-gray-500">— unlimited</span></span>
        <span className="text-sm"><span className="font-bold text-amber-300">General</span> <span className="text-gray-500">— 1h allowed</span></span>
        <span className="text-sm"><span className="font-bold text-purple-300">Namaz</span> <span className="text-gray-500">— 25m allowed</span></span>
      </div>

      {statusFilter && (
        <p className="mt-3 text-sm text-gray-400">
          Showing {sortedRows.length} {statusFilter.toLowerCase()} employee{sortedRows.length !== 1 ? 's' : ''}
          <button type="button" onClick={() => setStatusFilter(null)} className="ml-2 text-blue-400 hover:underline">Show all</button>
        </p>
      )}
      <div className="mt-4 overflow-auto rounded-lg border border-[#1f2a44] bg-[#0b1324]">
        {loading ? (
          <div className="p-4 text-sm text-gray-300">Loading...</div>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-[#1d2b45] text-left text-gray-200">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Dept</th>
                <th className="px-3 py-2">Shift</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Check In</th>
                <th className="px-3 py-2">Shift Hrs</th>
                <th className="px-3 py-2">Worked</th>
                <th className="px-3 py-2">Breaks</th>
                <th className="px-3 py-2">Allowed</th>
                <th className="px-3 py-2">Deducted</th>
                <th className="px-3 py-2">Suspicious</th>
                <th className="px-3 py-2">Productive</th>
                <th className="px-3 py-2">%</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <Fragment key={`${r.empCode}-fragment`}>
                  <tr
                    key={`${r.empCode}-main`}
                    className="border-t border-[#1f2a44] text-gray-100 cursor-pointer hover:bg-[#0d1b31]"
                    onClick={() => setExpandedEmpCode(expandedEmpCode === r.empCode ? '' : r.empCode)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-[10px] text-gray-400">{r.empCode}</div>
                    </td>
                    <td className="px-3 py-2">{r.department}</td>
                    <td className="px-3 py-2">{r.shift}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        r.suspiciousLive
                          ? 'bg-orange-900/60 text-orange-300'
                          : r.status === 'ACTIVE'
                            ? 'bg-green-900/60 text-green-300'
                            : r.status === 'IDLE' || r.status === 'BREAK'
                              ? 'bg-yellow-900/60 text-yellow-300'
                              : 'bg-red-900/60 text-red-300'
                      }`}>
                        {r.suspiciousLive ? 'SUSPICIOUS' : r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-green-300 font-semibold">{r.score}</td>
                    <td className="px-3 py-2">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '-'}</td>
                    <td className="px-3 py-2">{r.shiftHrs}h</td>
                    <td className="px-3 py-2">{r.workedHrs}h</td>
                    <td className="px-3 py-2 text-yellow-300">{r.breaksHrs}h</td>
                    <td className="px-3 py-2 text-green-300">{typeof r.allowedBreakHrs === 'string' ? r.allowedBreakHrs : `${r.allowedBreakHrs}h`}</td>
                    <td className="px-3 py-2 text-red-300">{r.deductedBreakHrs}h</td>
                    <td className="px-3 py-2 text-orange-300">{r.suspiciousHrs ?? 0}h</td>
                    <td className="px-3 py-2 text-green-400 font-semibold">{r.productiveHrs}h</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 rounded bg-[#1f2a44]">
                          <div className="h-1.5 rounded bg-green-500" style={{ width: `${Math.max(0, Math.min(100, r.productivityPct))}%` }} />
                        </div>
                        <span>{r.productivityPct}%</span>
                      </div>
                    </td>
                  </tr>
                  {expandedEmpCode === r.empCode ? (
                    <tr key={`${r.empCode}-details`} className="border-t border-[#1f2a44] bg-[#0a1324]">
                      <td colSpan={14} className="px-3 py-3">
                        <div className="grid gap-4 md:grid-cols-3">
                            {[
                            { key: 'Official', label: 'Official', allowedMin: null, bg: 'bg-blue-500/15 border-blue-500/40', text: 'text-blue-300', desc: 'Company-related, unlimited' },
                            { key: 'General', label: 'General', allowedMin: 60, bg: 'bg-amber-500/15 border-amber-500/40', text: 'text-amber-300', desc: '1 hour allowed' },
                            { key: 'Namaz', label: 'Namaz', allowedMin: 25, bg: 'bg-purple-500/15 border-purple-500/40', text: 'text-purple-300', desc: '25 minutes allowed' }
                          ].map(({ key, label, allowedMin, bg, text, desc }) => {
                            const totalMin = r.breakDown?.[key]?.totalMin || 0;
                            const totalDisplay = totalMin >= 60 ? `${(totalMin / 60).toFixed(1)}h` : `${totalMin}m`;
                            const exceeded = allowedMin !== null && totalMin > allowedMin;
                            const exceededBy = exceeded ? totalMin - allowedMin : 0;
                            return (
                              <div key={key} className={`rounded-lg border p-3 ${bg} ${exceeded ? 'ring-2 ring-red-500/50 border-red-500/40' : ''}`}>
                                <div className={`text-sm font-bold ${text}`}>{label}</div>
                                <div className="mt-0.5 text-[10px] text-gray-400">{desc}</div>
                                <div className="mt-2 flex items-baseline gap-1">
                                  <span className="text-lg font-bold text-white">{totalDisplay}</span>
                                  <span className="text-xs text-gray-400">taken</span>
                                </div>
                                <div className="mt-1 text-xs">
                                  {allowedMin === null ? (
                                    <span className="text-blue-300/90 font-medium">Unlimited</span>
                                  ) : exceeded ? (
                                    <span className="inline-flex items-center gap-1 rounded bg-red-500/25 px-1.5 py-0.5 text-red-300 font-semibold">
                                      +{exceededBy}m over
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">
                                      Allowed: <span className="font-semibold text-white">{allowedMin}m</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-4">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-bold text-gray-200">Break History</span>
                            <button
                              type="button"
                              onClick={(ev) => openAddBreak(r, ev)}
                              className="rounded bg-[#1e3a5f] px-2 py-1 text-[10px] font-medium text-blue-300 hover:bg-[#2b4a7f]"
                            >
                              + Add Break
                            </button>
                          </div>
                          {Array.isArray(r.breakHistory) && r.breakHistory.filter((b) => {
                            const reason = String(b.reason || '').toLowerCase();
                            const duration = Number((b.displayDurationMin ?? b.durationMin) || 0);
                            return !(reason === 'pending' || reason.includes('waiting for employee')) || duration > 0;
                          }).length > 0 ? (
                            <div className="space-y-2">
                              {r.breakHistory
                                .filter((b) => {
                                  const reason = String(b.reason || '').toLowerCase();
                                  const duration = Number((b.displayDurationMin ?? b.durationMin) || 0);
                                  return !(reason === 'pending' || reason.includes('waiting for employee')) || duration > 0;
                                })
                                .map((b, idx) => {
                                  const cat = String(b.displayCategory || b.category || '').trim();
                                  const isOfficial = cat.toLowerCase() === 'official';
                                  const isGeneral = cat.toLowerCase() === 'general';
                                  const isNamaz = cat.toLowerCase() === 'namaz';
                                  const duration = Number((b.displayDurationMin ?? b.durationMin) || 0);
                                  const exceeded = Number(b.exceededDurationMin || 0) > 0;
                                  const isPending = String(b.reason || '').toLowerCase() === 'pending' || String(b.reason || '').includes('Waiting for employee');
                                  const catBg = isOfficial ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : isGeneral ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : isNamaz ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-gray-500/20 text-gray-300 border-gray-500/40';
                                  return (
                                    <div
                                      key={b._id || `${r.empCode}-bh-${idx}`}
                                      className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${exceeded ? 'border-red-500/50 bg-red-950/20 ring-1 ring-red-500/30' : isPending ? 'border-gray-600/50 bg-gray-800/30 opacity-75' : 'border-[#25314b] bg-[#0f1a2f]/80'}`}
                                    >
                                      <span className={`shrink-0 rounded-lg px-3 py-1 text-xs font-bold border ${catBg}`}>
                                        {cat || 'Other'}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <span className="text-base font-medium text-gray-100">{b.reason || '—'}</span>
                                        <div className="mt-1 text-sm text-gray-400">
                                          {new Date(b.breakStartAt).toLocaleTimeString()} → {b.breakEndAt ? new Date(b.breakEndAt).toLocaleTimeString() : '…'}
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        {exceeded && (
                                          <span className="rounded-md bg-red-500/25 px-2 py-0.5 text-xs font-bold text-red-300">
                                            +{b.exceededDurationMin}m over
                                          </span>
                                        )}
                                        <span className={`rounded-full px-3 py-1 text-sm font-bold ${exceeded ? 'bg-red-500/25 text-red-300' : duration > 0 ? 'bg-green-500/25 text-green-300' : 'bg-gray-600/40 text-gray-400'}`}>
                                          {duration}m
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(ev) => openEditBreak(r, b, ev)}
                                          className="rounded bg-[#1e2b44] px-2 py-0.5 text-[10px] text-gray-300 hover:bg-[#2b3347]"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(ev) => handleDeleteBreak(r, b, ev)}
                                          className="rounded bg-red-900/40 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-900/60"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-[#25314b] bg-[#0a1324]/50 px-4 py-6 text-center text-sm text-gray-400">
                              <p className="mb-3">No break history for this date.</p>
                              <button
                                type="button"
                                onClick={(ev) => openAddBreak(r, ev)}
                                className="rounded bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-[#2b4a7f]"
                              >
                                + Add Break
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {sortedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-400" colSpan={14}>
                    No rows to display.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Break Modal */}
      {editBreak && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeBreakModals}
        >
          <div
            className="rounded-xl border border-[#1f2a44] bg-[#0b1324] p-6 shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-1">Edit Break</h3>
            <p className="text-sm text-gray-400 mb-4">
              {editBreak.row.name} ({editBreak.row.empCode}) — {date}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                <select
                  value={breakCategory}
                  onChange={(e) => setBreakCategory(e.target.value)}
                  className="w-full rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white border border-[#1f2a44] outline-none"
                >
                  {BREAK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Reason</label>
                <input
                  type="text"
                  value={breakReason}
                  onChange={(e) => setBreakReason(e.target.value)}
                  placeholder="Break reason..."
                  className="w-full rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white placeholder-gray-500 border border-[#1f2a44] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  min="0"
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(e.target.value)}
                  className="w-full rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white border border-[#1f2a44] outline-none"
                />
              </div>
            </div>
            {saveError && <p className="mt-3 text-sm text-red-400">{saveError}</p>}
            {saveSuccess && <p className="mt-3 text-sm text-green-400">Saved!</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeBreakModals} className="rounded bg-[#1e2b44] px-4 py-2 text-sm text-gray-300 hover:bg-[#2b3347]">Cancel</button>
              <button type="button" onClick={handleSaveEditBreak} disabled={saving} className="rounded bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-blue-300 hover:bg-[#2b4a7f] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Break Modal */}
      {addBreakRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeBreakModals}
        >
          <div
            className="rounded-xl border border-[#1f2a44] bg-[#0b1324] p-6 shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-1">Add Break</h3>
            <p className="text-sm text-gray-400 mb-4">
              {addBreakRow.name} ({addBreakRow.empCode}) — {date}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                <select
                  value={breakCategory}
                  onChange={(e) => setBreakCategory(e.target.value)}
                  className="w-full rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white border border-[#1f2a44] outline-none"
                >
                  {BREAK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Reason *</label>
                <input
                  type="text"
                  value={breakReason}
                  onChange={(e) => setBreakReason(e.target.value)}
                  placeholder="Break reason..."
                  className="w-full rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white placeholder-gray-500 border border-[#1f2a44] outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Start (optional)</label>
                  <input
                    type="time"
                    value={breakStartTime}
                    onChange={(e) => setBreakStartTime(e.target.value)}
                    className="w-full rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white border border-[#1f2a44] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">End (optional)</label>
                  <input
                    type="time"
                    value={breakEndTime}
                    onChange={(e) => setBreakEndTime(e.target.value)}
                    className="w-full rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white border border-[#1f2a44] outline-none"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-500">Leave times empty to use shift start + 15 min</p>
            </div>
            {saveError && <p className="mt-3 text-sm text-red-400">{saveError}</p>}
            {saveSuccess && <p className="mt-3 text-sm text-green-400">Added!</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeBreakModals} className="rounded bg-[#1e2b44] px-4 py-2 text-sm text-gray-300 hover:bg-[#2b3347]">Cancel</button>
              <button type="button" onClick={handleAddBreak} disabled={saving} className="rounded bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-blue-300 hover:bg-[#2b4a7f] disabled:opacity-50">{saving ? 'Adding...' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
