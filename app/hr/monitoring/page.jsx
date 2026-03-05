'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';

function getLocalDateInputValue() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

export default function MonitoringPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 });
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => getLocalDateInputValue());
  const [expandedEmpCode, setExpandedEmpCode] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(`/api/hr/monitoring/live?date=${date}`, { cache: 'no-store' });
        const json = await res.json();
        if (mounted) {
          setRows(Array.isArray(json?.data?.rows) ? json.data.rows : []);
          setSummary(json?.success ? (json.data?.summary || { total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 }) : { total: 0, active: 0, idle: 0, offline: 0, suspicious: 0 });
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
    const timer = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [date]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#020818] p-6 text-white">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Live Monitoring</h1>
          <p className="mt-1 text-xs text-gray-400">Live - all active shifts (day + night) - Auto-refreshes every 30s</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded bg-[#0b1f3a] px-3 py-1 text-sm text-white outline-none border border-[#1f2a44]"
        />
      </div>

      <div className="mt-6 grid grid-cols-5 gap-3">
        <div className="rounded-lg bg-[#1e2b44] p-4 text-center">
          <div className="text-4xl font-bold text-[#3b82f6]">{summary.total}</div>
          <div className="mt-1 text-xs text-gray-300">Total</div>
        </div>
        <div className="rounded-lg bg-[#072b32] p-4 text-center">
          <div className="text-4xl font-bold text-[#22c55e]">{summary.active}</div>
          <div className="mt-1 text-xs text-gray-300">Active</div>
        </div>
        <div className="rounded-lg bg-[#2b3347] p-4 text-center">
          <div className="text-4xl font-bold text-[#eab308]">{summary.idle}</div>
          <div className="mt-1 text-xs text-gray-300">Idle</div>
        </div>
        <div className="rounded-lg bg-[#2b3347] p-4 text-center">
          <div className="text-4xl font-bold text-[#ef4444]">{summary.offline}</div>
          <div className="mt-1 text-xs text-gray-300">Offline</div>
        </div>
        <div className="rounded-lg bg-[#2b3347] p-4 text-center">
          <div className="text-4xl font-bold text-[#f97316]">{summary.suspicious}</div>
          <div className="mt-1 text-xs text-gray-300">Suspicious</div>
        </div>
      </div>

      <div className="mt-5 rounded-md border border-[#22314d] bg-[#0b1a2f] px-3 py-2 text-xs text-gray-300">
        <span className="mr-4">• <strong className="text-blue-300">Official</strong></span>
        <span className="mr-4">• <strong className="text-yellow-300">General</strong></span>
        <span>• <strong className="text-purple-300">Namaz</strong></span>
      </div>

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
                        r.status === 'ACTIVE'
                          ? 'bg-green-900/60 text-green-300'
                          : r.status === 'IDLE'
                            ? 'bg-yellow-900/60 text-yellow-300'
                            : r.status === 'SUSPICIOUS'
                              ? 'bg-orange-900/60 text-orange-300'
                              : 'bg-red-900/60 text-red-300'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-green-300 font-semibold">{r.score}</td>
                    <td className="px-3 py-2">{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '-'}</td>
                    <td className="px-3 py-2">{r.shiftHrs}h</td>
                    <td className="px-3 py-2">{r.workedHrs}h</td>
                    <td className="px-3 py-2 text-yellow-300">{r.breaksHrs}h</td>
                    <td className="px-3 py-2 text-green-300">{r.allowedBreakHrs}h</td>
                    <td className="px-3 py-2 text-red-300">{r.deductedBreakHrs}h</td>
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
                      <td colSpan={13} className="px-3 py-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          {['Official', 'General', 'Namaz'].map((cat) => (
                            <div key={cat} className="rounded border border-[#25314b] bg-[#0f1a2f] p-2">
                              <div className="font-semibold">{cat}</div>
                              <div className="text-[11px] text-gray-300">
                                Total: {((r.breakDown?.[cat]?.totalMin || 0) / 60).toFixed(1)}h | Allowed: {((r.breakDown?.[cat]?.allowedMin || 0) / 60).toFixed(1)}h
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 text-[11px] text-gray-300">
                          {Array.isArray(r.breakHistory) && r.breakHistory.length > 0 ? (
                            r.breakHistory.map((b, idx) => (
                              <div key={`${r.empCode}-bh-${idx}`} className="py-1 border-b border-[#1b2740] last:border-0">
                                • {b.category}: {b.reason || '-'} ({new Date(b.breakStartAt).toLocaleTimeString()} - {new Date(b.breakEndAt).toLocaleTimeString()}) | {Number(b.durationMin || 0)}m
                              </div>
                            ))
                          ) : (
                            <div>No break history for this date.</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {sortedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-gray-400" colSpan={13}>
                    No rows to display.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
