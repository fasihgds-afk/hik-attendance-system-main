'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';

const DEFAULT_SETTINGS = {
  timezoneOffset: '+05:00',
  businessDayCutoff: '08:55',
  weeklyOffDays: [0],
  nightCheckoutCutoff: '08:00',
  nightShiftOffAnchor: 'start',
  workingDaysMode: 'legacy',
  fixedDaysPerMonth: 26,
  currency: 'PKR',
};

const DAY_OPTIONS = [
  { num: 0, short: 'Sun', label: 'Sunday' },
  { num: 1, short: 'Mon', label: 'Monday' },
  { num: 2, short: 'Tue', label: 'Tuesday' },
  { num: 3, short: 'Wed', label: 'Wednesday' },
  { num: 4, short: 'Thu', label: 'Thursday' },
  { num: 5, short: 'Fri', label: 'Friday' },
  { num: 6, short: 'Sat', label: 'Saturday' },
];

function daysInCalendarMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function resolveWorkingDays(mode, fixedDays, calendarDays) {
  if (mode === 'fixed') return fixedDays || 26;
  if (mode === 'legacy') return calendarDays - 6;
  return calendarDays - 6; // preview only for actual mode (employee-specific)
}

export default function HrCompanySettingsPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3000);
  }

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await fetch('/api/hr/company-settings', { cache: 'no-store' });
      if (res.ok) {
        const response = await res.json();
        const s = response.data?.settings ?? response.settings ?? DEFAULT_SETTINGS;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...s,
          fixedDaysPerMonth: s.fixedDaysPerMonth ?? DEFAULT_SETTINGS.fixedDaysPerMonth,
        });
      } else {
        showToast('error', 'Failed to load company settings');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load company settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    loadSettings();
  }, []);

  function toggleOffDay(dayNum) {
    if (dayNum === 6) return; // Saturday handled on Departments page
    setSettings((prev) => {
      const has = prev.weeklyOffDays.includes(dayNum);
      const next = has
        ? prev.weeklyOffDays.filter((d) => d !== dayNum)
        : [...prev.weeklyOffDays, dayNum].sort((a, b) => a - b);
      return { ...prev, weeklyOffDays: next };
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/hr/company-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezoneOffset: settings.timezoneOffset,
          businessDayCutoff: settings.businessDayCutoff,
          weeklyOffDays: settings.weeklyOffDays,
          nightCheckoutCutoff: settings.nightCheckoutCutoff,
          nightShiftOffAnchor: settings.nightShiftOffAnchor,
          workingDaysMode: settings.workingDaysMode,
          fixedDaysPerMonth: Number(settings.fixedDaysPerMonth) || 26,
          currency: settings.currency,
        }),
      });
      const response = await res.json();
      if (res.ok && response.success) {
        showToast('success', 'Company settings saved successfully');
        const s = response.data?.settings ?? settings;
        setSettings({ ...DEFAULT_SETTINGS, ...s });
      } else {
        showToast('error', response.error || response.message || 'Failed to update settings');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update settings');
    } finally {
      setSaving(false);
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
  const sectionBg = theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : (colors.background?.secondary ?? '#f8fafc');
  const mutedText = theme === 'dark' ? '#94a3b8' : colors.text?.secondary;
  const inputBorder = theme === 'dark' ? 'rgba(55, 65, 81, 0.8)' : colors.border?.default;
  const inputBg = theme === 'dark' ? '#0f172a' : (colors.background?.input ?? colors.background?.card);

  const previewMonth = new Date();
  const previewYear = previewMonth.getFullYear();
  const previewMonthIndex = previewMonth.getMonth();
  const previewCalendarDays = daysInCalendarMonth(previewYear, previewMonthIndex);
  const previewWorkingDays = resolveWorkingDays(
    settings.workingDaysMode,
    Number(settings.fixedDaysPerMonth) || 26,
    previewCalendarDays,
  );
  const previewMonthName = previewMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const fieldStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${inputBorder}`,
    background: inputBg,
    color: colors.text?.primary,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
    color: colors.text?.primary,
  };

  const hintStyle = {
    display: 'block',
    marginTop: 8,
    fontSize: 12,
    color: mutedText,
    lineHeight: 1.5,
  };

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
            .cs-header { flex-direction: column !important; align-items: flex-start !important; }
            .cs-header-actions { flex-wrap: wrap !important; width: 100%; }
            .cs-grid-2 { grid-template-columns: 1fr !important; }
            .cs-day-row { gap: 8px !important; }
          }
        `,
        }}
      />

      <div className="container-responsive" style={{ margin: '0 auto', width: '100%', maxWidth: '100%' }}>
        {/* Header — same portal style as Departments */}
        <div
          className="cs-header"
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
            position: 'relative',
            overflow: 'hidden',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: theme === 'dark'
                ? 'radial-gradient(circle at 80% 50%, rgba(19, 168, 229, 0.15) 0%, transparent 50%)'
                : 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
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
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
                border: `2px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : colors.border?.default}`,
              }}
            >
              <img
                src="/gds.png"
                alt="Global Digital Solutions logo"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0.5, marginBottom: 4 }}>
                Global Digital Solutions
              </div>
              <div style={{ fontSize: 13, opacity: 0.95, fontWeight: 500 }}>
                Company Settings · Timezone, off-days &amp; salary rules
              </div>
            </div>
          </div>

          <div className="cs-header-actions" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            <ThemeToggle compact />
            <button type="button" onClick={() => router.push('/hr/employees')} style={navBtn}>
              HR Home
            </button>
            <button type="button" onClick={() => router.push('/hr/departments')} style={navBtn}>
              Departments
            </button>
            <button type="button" onClick={() => router.push('/hr/violation-rules')} style={navBtn}>
              Violation Rules
            </button>
            <button type="button" onClick={handleLogout} style={navBtn}>
              Logout
            </button>
          </div>
        </div>

        {/* Main card */}
        <div
          style={{
            width: '100%',
            marginTop: 24,
            borderRadius: 16,
            background: cardBg,
            boxShadow: cardShadow,
            padding: '20px 24px 24px',
            border: `1px solid ${colors.border?.default}`,
            boxSizing: 'border-box',
          }}
        >
          {toast.text && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                marginBottom: 16,
                backgroundColor: toast.type === 'success'
                  ? (theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : `${colors.success}20`)
                  : (theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : `${colors.error}20`),
                color: toast.type === 'success' ? colors.success : colors.error,
                fontSize: 14,
                border: `1px solid ${toast.type === 'success' ? colors.success : colors.error}40`,
              }}
            >
              {toast.text}
            </div>
          )}

          <p style={{ marginBottom: 24, fontSize: 14, color: mutedText, lineHeight: 1.6 }}>
            Global rules for attendance dates, off-days, and <strong style={{ color: colors.text?.primary }}>per-day salary</strong>.
            Deduction amounts (violations, absences, leaves) are on{' '}
            <button
              type="button"
              onClick={() => router.push('/hr/violation-rules')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: theme === 'dark' ? '#38bdf8' : colors.primary,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Violation Rules
            </button>.
            For <strong style={{ color: colors.text?.primary }}>Saturday off rules</strong> and shift timing, use{' '}
            <button
              type="button"
              onClick={() => router.push('/hr/departments')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: theme === 'dark' ? '#38bdf8' : colors.primary,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Departments
            </button>.
          </p>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: mutedText }}>Loading settings...</div>
          ) : (
            <form onSubmit={handleSave}>
              {/* Section: Timezone */}
              <div
                style={{
                  marginBottom: 20,
                  padding: '18px 20px',
                  borderRadius: 12,
                  background: sectionBg,
                  border: `1px solid ${colors.border?.default}`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: colors.text?.primary }}>
                  Timezone &amp; business day
                </div>
                <div style={{ fontSize: 12, color: mutedText, marginBottom: 16 }}>
                  When does &quot;today&quot; start for attendance?
                </div>
                <div className="cs-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label htmlFor="timezoneOffset" style={labelStyle}>Timezone offset</label>
                    <input
                      id="timezoneOffset"
                      type="text"
                      value={settings.timezoneOffset}
                      placeholder="+05:00"
                      onChange={(e) => setSettings({ ...settings, timezoneOffset: e.target.value })}
                      style={fieldStyle}
                    />
                    <span style={hintStyle}>Example: +05:00 for Pakistan</span>
                  </div>
                  <div>
                    <label htmlFor="businessDayCutoff" style={labelStyle}>Business-day cutoff</label>
                    <input
                      id="businessDayCutoff"
                      type="time"
                      value={settings.businessDayCutoff}
                      onChange={(e) => setSettings({ ...settings, businessDayCutoff: e.target.value })}
                      style={fieldStyle}
                    />
                    <span style={hintStyle}>Before this time, &quot;today&quot; is still yesterday</span>
                  </div>
                </div>
              </div>

              {/* Section: Weekly off */}
              <div
                style={{
                  marginBottom: 20,
                  padding: '18px 20px',
                  borderRadius: 12,
                  background: sectionBg,
                  border: `1px solid ${colors.border?.default}`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: colors.text?.primary }}>
                  Weekly off days
                </div>
                <div style={{ fontSize: 12, color: mutedText, marginBottom: 14 }}>
                  Tap a day to toggle off/on. Saturday is managed separately on the Departments page.
                </div>
                <div className="cs-day-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {DAY_OPTIONS.map(({ num, short, label }) => {
                    const isSat = num === 6;
                    const isOff = !isSat && settings.weeklyOffDays.includes(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        disabled={isSat}
                        title={isSat ? 'Configure Saturday on Departments page' : label}
                        onClick={() => toggleOffDay(num)}
                        style={{
                          minWidth: 52,
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: isOff
                            ? `2px solid ${theme === 'dark' ? '#38bdf8' : colors.primary}`
                            : `1px solid ${inputBorder}`,
                          background: isSat
                            ? (theme === 'dark' ? 'rgba(51, 65, 85, 0.5)' : '#e2e8f0')
                            : isOff
                              ? (theme === 'dark' ? 'rgba(56, 189, 248, 0.2)' : `${colors.primary}15`)
                              : inputBg,
                          color: isSat ? mutedText : isOff ? (theme === 'dark' ? '#38bdf8' : colors.primary) : colors.text?.primary,
                          fontWeight: isOff ? 700 : 500,
                          fontSize: 13,
                          cursor: isSat ? 'not-allowed' : 'pointer',
                          opacity: isSat ? 0.7 : 1,
                        }}
                      >
                        {short}
                        {isSat && ' *'}
                      </button>
                    );
                  })}
                </div>
                <span style={hintStyle}>* Saturday off/alternate rules and unified shift time → Departments page</span>
              </div>

              {/* Section: Night shift */}
              <div
                style={{
                  marginBottom: 20,
                  padding: '18px 20px',
                  borderRadius: 12,
                  background: sectionBg,
                  border: `1px solid ${colors.border?.default}`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: colors.text?.primary }}>
                  Night shift rules
                </div>
                <div style={{ fontSize: 12, color: mutedText, marginBottom: 16 }}>
                  For shifts that cross midnight (e.g. 9pm–6am)
                </div>
                <div className="cs-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label htmlFor="nightCheckoutCutoff" style={labelStyle}>Night checkout cutoff</label>
                    <input
                      id="nightCheckoutCutoff"
                      type="time"
                      value={settings.nightCheckoutCutoff}
                      onChange={(e) => setSettings({ ...settings, nightCheckoutCutoff: e.target.value })}
                      style={fieldStyle}
                    />
                    <span style={hintStyle}>Morning checkout before this belongs to previous night</span>
                  </div>
                  <div>
                    <label htmlFor="nightShiftOffAnchor" style={labelStyle}>Off-day applies to</label>
                    <select
                      id="nightShiftOffAnchor"
                      value={settings.nightShiftOffAnchor}
                      onChange={(e) => setSettings({ ...settings, nightShiftOffAnchor: e.target.value })}
                      style={{ ...fieldStyle, cursor: 'pointer' }}
                    >
                      <option value="start">Shift start day (night you start)</option>
                      <option value="end">Shift end day (night you finish)</option>
                    </select>
                    <span style={hintStyle}>Which calendar day counts as off for night workers</span>
                  </div>
                </div>
              </div>

              {/* Section: Salary */}
              <div
                style={{
                  marginBottom: 24,
                  padding: '18px 20px',
                  borderRadius: 12,
                  background: sectionBg,
                  border: `1px solid ${colors.border?.default}`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: colors.text?.primary }}>
                  Per-day salary (working days divisor)
                </div>
                <div style={{ fontSize: 12, color: mutedText, marginBottom: 16, lineHeight: 1.55 }}>
                  Monthly payroll uses: <strong style={{ color: colors.text?.primary }}>Per-day salary = Gross salary ÷ working days</strong>.
                  Total deduction = Per-day salary × deduction days (from Violation Rules).
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    marginBottom: 16,
                    background: theme === 'dark' ? 'rgba(59, 130, 246, 0.12)' : '#e0f2fe',
                    border: `1px solid ${theme === 'dark' ? 'rgba(56, 189, 248, 0.35)' : colors.primary}40`,
                    fontSize: 12,
                    color: mutedText,
                    lineHeight: 1.6,
                  }}
                >
                  <strong style={{ color: colors.text?.primary }}>Example ({previewMonthName}):</strong>{' '}
                  {previewCalendarDays} calendar days →{' '}
                  <strong style={{ color: theme === 'dark' ? '#38bdf8' : colors.primary }}>
                    {previewWorkingDays} working days
                  </strong>
                  {settings.workingDaysMode === 'legacy' && ' (days in month − 6)'}.
                  {' '}Salary PKR 30,000 → per-day PKR {(30000 / Math.max(1, previewWorkingDays)).toFixed(0)}.
                </div>

                <div className="cs-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label htmlFor="workingDaysMode" style={labelStyle}>Working days per month</label>
                    <select
                      id="workingDaysMode"
                      value={settings.workingDaysMode}
                      onChange={(e) => setSettings({ ...settings, workingDaysMode: e.target.value })}
                      style={{ ...fieldStyle, cursor: 'pointer' }}
                    >
                      <option value="legacy">Legacy — days in month minus 6 (current)</option>
                      <option value="actual">Per employee — count their real off days</option>
                      <option value="fixed">Fixed — same number every month</option>
                    </select>
                    {settings.workingDaysMode === 'legacy' && (
                      <span style={hintStyle}>
                        31-day → 25, 30-day → 24, 29-day → 23, 28-day → 22 working days
                      </span>
                    )}
                    {settings.workingDaysMode === 'actual' && (
                      <span style={hintStyle}>
                        Each employee&apos;s divisor = calendar days minus their Sundays + department Saturday rules (all working, alternate, or all off)
                      </span>
                    )}
                  </div>
                  <div>
                    <label htmlFor="currency" style={labelStyle}>Currency</label>
                    <input
                      id="currency"
                      type="text"
                      value={settings.currency}
                      placeholder="PKR"
                      onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                      style={fieldStyle}
                    />
                    <span style={hintStyle}>Shown on payslips and reports</span>
                  </div>
                </div>
                {settings.workingDaysMode === 'fixed' && (
                  <div style={{ marginTop: 16, maxWidth: 200 }}>
                    <label htmlFor="fixedDaysPerMonth" style={labelStyle}>Fixed working days</label>
                    <input
                      id="fixedDaysPerMonth"
                      type="number"
                      min={1}
                      max={31}
                      value={settings.fixedDaysPerMonth}
                      onChange={(e) => setSettings({ ...settings, fixedDaysPerMonth: e.target.value })}
                      style={fieldStyle}
                    />
                  </div>
                )}
                <span style={{ ...hintStyle, marginTop: 12 }}>
                  Keep <strong>Legacy</strong> unless HR wants to change how per-day salary is calculated company-wide.
                </span>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '12px 28px',
                    borderRadius: 12,
                    border: 'none',
                    background: theme === 'dark'
                      ? 'linear-gradient(135deg, #0ea5e9, #0284c7)'
                      : colors.primary,
                    color: '#ffffff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                    boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
                  }}
                >
                  {saving ? 'Saving...' : 'Save settings'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/hr/employees')}
                  style={{
                    padding: '12px 28px',
                    borderRadius: 12,
                    border: `1px solid ${colors.border?.default}`,
                    background: 'transparent',
                    color: colors.text?.primary,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

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
