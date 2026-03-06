'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

function getLocalDateInputValue() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function EmployeeProductivityPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const empCode = session?.user?.empCode;

  const [date, setDate] = useState(() => getLocalDateInputValue());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session?.user?.role !== 'EMPLOYEE') {
      router.replace('/login?role=employee');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    if (!empCode) return;

    let mounted = true;
    setLoading(true);
    setError('');

    async function load() {
      try {
        const res = await fetch(
          `/api/monitor/productivity?empCode=${encodeURIComponent(empCode)}&date=${date}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!mounted) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error || json.message || 'Failed to load');
        }
        setData(json.data);
      } catch (e) {
        if (mounted) {
          setError(e.message || 'Failed to load');
          setData(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [empCode, date]);

  if (status === 'loading' || !empCode) {
    return (
      <div className="min-h-screen bg-[#020818] flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020818] p-6 text-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">My Productivity</h1>
          <p className="mt-1 text-sm text-gray-400">
            Breaks, productive hours, and daily summary
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded bg-[#0b1f3a] px-3 py-2 text-sm text-white outline-none border border-[#1f2a44] focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => router.push('/employee/dashboard')}
            className="rounded bg-[#1e2b44] px-4 py-2 text-sm text-gray-300 hover:bg-[#2b3347] border border-[#1f2a44]"
          >
            ← Dashboard
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/50 bg-red-950/20 p-4 text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-8 flex justify-center text-gray-400">Loading productivity data...</div>
      )}

      {!loading && data && (
        <div className="mt-6 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#0b1f3a] border border-[#1f2a44] p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Productive Hours</div>
              <div className="mt-1 text-xl font-bold text-green-400">
                {data.netProductiveHrs ?? data.productiveHrs ?? 0}h
              </div>
            </div>
            <div className="rounded-xl bg-[#0b1f3a] border border-[#1f2a44] p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Productivity %</div>
              <div className="mt-1 text-xl font-bold text-blue-400">
                {data.productivityPct ?? 0}%
              </div>
            </div>
            <div className="rounded-xl bg-[#0b1f3a] border border-[#1f2a44] p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Total Breaks</div>
              <div className="mt-1 text-xl font-bold text-amber-400">
                {data.totalBreakHrs ?? 0}h
              </div>
            </div>
            <div className="rounded-xl bg-[#0b1f3a] border border-[#1f2a44] p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Worked Hours</div>
              <div className="mt-1 text-xl font-bold text-white">
                {data.totalWorkedHrs ?? 0}h
              </div>
            </div>
          </div>

          {/* Break breakdown */}
          <div className="rounded-xl bg-[#0b1f3a] border border-[#1f2a44] p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Break Breakdown</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {data.breakDown?.map((b) => (
                <div
                  key={b.category}
                  className="rounded-lg bg-[#0f172a] border border-[#1e293b] p-3"
                >
                  <div className="text-sm font-medium text-gray-300">{b.category}</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {formatDuration(b.totalMin)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {b.count} break{b.count !== 1 ? 's' : ''}
                    {b.exceededMin > 0 && (
                      <span className="text-amber-400 ml-1">({formatDuration(b.exceededMin)} exceeded)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-400">
              <span>Allowed: {typeof data.allowedBreakHrs === 'string' ? data.allowedBreakHrs : `${data.allowedBreakHrs}h`}</span>
              <span>Deducted: {data.deductedBreakHrs}h</span>
              {data.suspiciousHrs > 0 && (
                <span className="text-amber-400">Suspicious: {data.suspiciousHrs}h</span>
              )}
            </div>
          </div>

          {/* Break history */}
          <div className="rounded-xl bg-[#0b1f3a] border border-[#1f2a44] p-4 sm:p-5 overflow-x-auto">
            <h2 className="text-lg font-semibold text-white mb-4">Break History</h2>
            {!data.history?.length ? (
              <p className="text-gray-500">No breaks recorded for this date.</p>
            ) : (
              <table className="w-full min-w-[500px] text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-[#1f2a44]">
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Reason</th>
                    <th className="pb-2 pr-4">Start</th>
                    <th className="pb-2 pr-4">End</th>
                    <th className="pb-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((b) => (
                    <tr key={b._id} className="border-b border-[#1e293b]/50">
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            b.category === 'Official'
                              ? 'bg-blue-500/20 text-blue-400'
                              : b.category === 'General'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {b.category}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-300">{b.reason || '-'}</td>
                      <td className="py-3 pr-4 text-gray-400">{formatTime(b.breakStartAt)}</td>
                      <td className="py-3 pr-4 text-gray-400">{formatTime(b.breakEndAt)}</td>
                      <td className="py-3 text-white">{formatDuration(b.durationMin || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
