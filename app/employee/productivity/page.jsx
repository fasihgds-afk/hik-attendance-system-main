'use client';

import { useState } from 'react';

export default function EmployeeProductivityPage() {
  const [empCode, setEmpCode] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    setData(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/monitor/productivity?empCode=${encodeURIComponent(empCode)}&date=${date}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || json.message || 'Request failed');
      setData(json.data);
    } catch (e) {
      setError(e.message || 'Failed to load');
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] p-6 text-white">
      <div className="rounded-xl border border-[#1f2a44] bg-[#0f172a] p-5 shadow-lg">
        <h1 className="text-2xl font-semibold text-[#60a5fa]">GDS Employee Productivity</h1>
        <p className="mt-2 text-sm text-gray-300">Track your daily productivity, breaks, and suspicious activity impact.</p>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={empCode}
          onChange={(e) => setEmpCode(e.target.value)}
          placeholder="Enter empCode"
          className="rounded border border-[#1d4ed8] bg-[#0b2545] px-3 py-2 text-blue-100 placeholder:text-blue-200/70"
        />
        <button
          onClick={load}
          className="rounded border border-[#14532d] bg-[#10b981] px-4 py-2 font-medium text-white hover:bg-[#059669]"
        >
          Load
        </button>
      </div>
      {error ? <p className="mt-4 rounded border border-red-700 bg-red-950/30 p-3 text-red-300">{error}</p> : null}
      {data ? (
        <pre className="mt-4 overflow-auto rounded-lg border border-[#1f2a44] bg-[#0f172a] p-3 text-sm text-gray-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
