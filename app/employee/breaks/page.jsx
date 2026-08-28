'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import {
  HrPageShell,
  HrHeaderActions,
  GlassCard,
  getGlossPillStyles,
} from '@/components/glass';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';
import {
  BreakUsageBar,
  formatBreakMinutes,
} from '@/components/employee/EmployeeDailyBreaksCard';

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

function currentMonthValue() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }).slice(0, 7);
}

export default function EmployeeBreaksPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const { data: session, status } = useSession();
  const empCode = session?.user?.empCode;
  const isDark = theme === 'dark';

  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

  const [month, setMonth] = useState(currentMonthValue);
  const [days, setDays] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' || (session && session.user?.role !== 'EMPLOYEE')) {
      router.replace('/login?role=employee');
    }
  }, [session, status, router]);

  const loadHistory = useCallback(async () => {
    if (!empCode || !month) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const [y, m] = month.split('-');
      const params = new URLSearchParams({
        view: 'history',
        year: y,
        month: m,
      });
      const res = await fetch(`/api/employee/breaks?${params}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to load breaks');
        setDays([]);
        setSessions([]);
        return;
      }
      setDays(data.data?.days || []);
      setSessions(data.data?.sessions || []);
      setSelectedDay(null);
    } catch (_) {
      setErrorMsg('Failed to load breaks');
    } finally {
      setLoading(false);
    }
  }, [empCode, month]);

  useEffect(() => {
    if (status === 'authenticated' && empCode) loadHistory();
  }, [status, empCode, loadHistory]);

  const daySessions = useMemo(() => {
    if (!selectedDay) return [];
    return sessions
      .filter((s) => s.shiftDate === selectedDay)
      .sort((a, b) => String(a.breakStartTime).localeCompare(String(b.breakStartTime)));
  }, [sessions, selectedDay]);

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const inputStyle = {
    minHeight: 36,
    padding: '6px 10px',
    borderRadius: 10,
    border: `1px solid ${colors.glass?.border || colors.border?.default}`,
    background: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.9)',
    color: colors.text.primary,
    fontSize: 13,
  };

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/employee/dashboard')} style={glossPill('neutral')}>
        Dashboard
      </button>
      <button
        type="button"
        onClick={() => {
          autoLogout();
          signOut({ callbackUrl: '/login?role=employee' });
        }}
        style={glossPill('rose')}
      >
        Logout
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell subtitle="My breaks — monthly history" actions={headerActions}>
      {showWarning && (
        <AutoLogoutWarning
          timeRemaining={timeRemaining || 0}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={() => signOut({ callbackUrl: '/login?role=employee' })}
        />
      )}

      <GlassCard style={{ marginTop: 18 }} padding={20}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            marginBottom: 16,
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                color: colors.text.tertiary,
              }}
            >
              Break history
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: colors.text.primary }}>
              {session?.user?.name || empCode || 'Employee'} · General 60 · Namaz 40 · Official ∞
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: colors.text.secondary, fontWeight: 600 }}>Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={inputStyle}
            />
            <button type="button" onClick={loadHistory} style={{ ...glossPill('neutral'), border: 'none', cursor: 'pointer', fontWeight: 700 }}>
              Refresh
            </button>
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.12)',
              color: '#ef4444',
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: colors.text.secondary }}>Loading…</div>
        ) : days.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: colors.text.secondary }}>
            No breaks recorded this month.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.glass?.border || colors.border?.default}` }}>
                  {['Shift day', 'General / 60', 'Namaz / 40', 'Official ∞', 'Sessions', 'Status'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 12px',
                        color: colors.text.secondary,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const over = d.overGeneralLimit || d.overNamazLimit;
                  const active = selectedDay === d.shiftDate;
                  return (
                    <tr
                      key={d.shiftDate}
                      onClick={() => setSelectedDay(active ? null : d.shiftDate)}
                      style={{
                        cursor: 'pointer',
                        background: active
                          ? 'rgba(14,165,233,0.1)'
                          : over
                            ? 'rgba(239,68,68,0.07)'
                            : 'transparent',
                        borderBottom: `1px solid ${colors.glass?.border || colors.border?.default}`,
                      }}
                    >
                      <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700 }}>{d.shiftDate}</div>
                        <div style={{ fontSize: 11, color: colors.text.secondary }}>
                          {d.shiftName || d.shiftCode || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                        <BreakUsageBar
                          used={d.generalMinutes}
                          limit={d.generalLimitMinutes || 60}
                          over={d.overGeneralLimit}
                          colors={colors}
                        />
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                        <BreakUsageBar
                          used={d.namazMinutes}
                          limit={d.namazLimitMinutes || 40}
                          over={d.overNamazLimit}
                          colors={colors}
                        />
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                        <BreakUsageBar used={d.officialMinutes} unlimited colors={colors} />
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'middle' }}>{d.sessionCount}</td>
                      <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                        {d.openCount > 0 ? (
                          <span style={{ color: colors.primary?.[500], fontWeight: 700 }}>On break</span>
                        ) : over ? (
                          <span style={{ color: '#ef4444', fontWeight: 700 }}>Over limit</span>
                        ) : (
                          <span style={{ color: colors.success || '#16a34a', fontWeight: 700 }}>OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedDay && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: colors.text.primary, marginBottom: 10 }}>
              Sessions on {selectedDay}
            </div>
            {daySessions.length === 0 ? (
              <div style={{ color: colors.text.secondary, fontSize: 13 }}>No sessions.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {daySessions.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: `1px solid ${colors.glass?.border || colors.border?.default}`,
                      background: isDark ? 'rgba(15,23,42,0.4)' : 'rgba(248,250,252,0.9)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ color: colors.text.primary }}>{s.breakTypeName}</strong>
                      <span style={{ fontWeight: 800 }}>{formatBreakMinutes(s.totalMinutes)} min</span>
                    </div>
                    <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>
                      {formatPkt(s.breakStartTime)} → {s.isOpen ? 'Ongoing' : formatPkt(s.breakEndTime)}
                      {' · '}
                      {s.status}
                    </div>
                    {s.comment ? (
                      <div style={{ fontSize: 13, marginTop: 6, color: colors.text.primary }}>“{s.comment}”</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </HrPageShell>
  );
}
