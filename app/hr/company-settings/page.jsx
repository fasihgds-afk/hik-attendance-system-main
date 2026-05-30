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

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function HrCompanySettingsPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

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
        setSettings({ ...DEFAULT_SETTINGS, ...s });
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
    loadSettings();
  }, []);

  function toggleOffDay(dayNum) {
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
        showToast('success', 'Company settings updated');
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
    } catch (e) {
      router.push('/login?role=hr');
    }
  };

  const inputStyle = {
    width: '100%',
    maxWidth: 160,
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${colors.border?.default}`,
    background: colors.background?.input ?? colors.background?.card,
    color: colors.text?.primary,
    fontSize: 14,
  };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: colors.text?.primary };
  const hintStyle = { display: 'block', marginTop: 6, fontSize: 12, color: colors.text?.secondary };

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '20px 24px',
        background: colors.background?.page ?? colors.background?.default,
        color: colors.text?.primary,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          padding: '16px 20px',
          borderRadius: 16,
          background: colors.gradient?.primary ?? colors.primary,
          border: `1px solid ${colors.border?.default}`,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', margin: 0 }}>Company Settings</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeToggle />
          <button
            onClick={() => router.push('/hr/dashboard')}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Dashboard
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div
        style={{
          maxWidth: 620,
          margin: '0 auto',
          borderRadius: 12,
          border: `1px solid ${colors.border?.table ?? colors.border?.default}`,
          background: colors.background?.card ?? colors.background?.default,
          padding: 24,
        }}
      >
        <p style={{ fontSize: 13, color: colors.text?.secondary, marginBottom: 20 }}>
          Global company settings used by attendance calculations. Defaults match the system&apos;s current
          behavior — change a value only when you intend to alter how attendance is computed.
        </p>
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: colors.text?.secondary }}>Loading...</div>
        ) : (
          <form onSubmit={handleSave}>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Timezone offset</label>
              <input
                type="text"
                value={settings.timezoneOffset}
                placeholder="+05:00"
                onChange={(e) => setSettings({ ...settings, timezoneOffset: e.target.value })}
                style={inputStyle}
              />
              <span style={hintStyle}>Company timezone like &quot;+05:00&quot;. Used for all date/time attendance math.</span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Weekly off days</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {DAY_LABELS.map((label, dayNum) => (
                  <label key={dayNum} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: colors.text?.primary }}>
                    <input
                      type="checkbox"
                      checked={settings.weeklyOffDays.includes(dayNum)}
                      onChange={() => toggleOffDay(dayNum)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <span style={hintStyle}>Days that are always off. Saturday is additionally controlled by per-department policy.</span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Business-day cutoff</label>
              <input
                type="text"
                value={settings.businessDayCutoff}
                placeholder="08:55"
                onChange={(e) => setSettings({ ...settings, businessDayCutoff: e.target.value })}
                style={inputStyle}
              />
              <span style={hintStyle}>HH:MM. Before this time, &quot;today&quot; still counts as the previous business day.</span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Night checkout cutoff</label>
              <input
                type="text"
                value={settings.nightCheckoutCutoff}
                placeholder="08:00"
                onChange={(e) => setSettings({ ...settings, nightCheckoutCutoff: e.target.value })}
                style={inputStyle}
              />
              <span style={hintStyle}>HH:MM. Next-morning checkouts before this time belong to the previous night&apos;s shift.</span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Night-shift off-day anchor</label>
              <select
                value={settings.nightShiftOffAnchor}
                onChange={(e) => setSettings({ ...settings, nightShiftOffAnchor: e.target.value })}
                style={{ ...inputStyle, maxWidth: 280, cursor: 'pointer' }}
              >
                <option value="start">By shift START day (night you start is off)</option>
                <option value="end">By shift END day (night you finish is off)</option>
              </select>
              <span style={hintStyle}>For shifts crossing midnight, which calendar day the weekly off applies to.</span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Working-days-per-month mode</label>
              <select
                value={settings.workingDaysMode}
                onChange={(e) => setSettings({ ...settings, workingDaysMode: e.target.value })}
                style={{ ...inputStyle, maxWidth: 280, cursor: 'pointer' }}
              >
                <option value="legacy">Legacy (days in month − 6)</option>
                <option value="actual">Actual off-day count</option>
                <option value="fixed">Fixed days per month</option>
              </select>
              {settings.workingDaysMode === 'fixed' && (
                <div style={{ marginTop: 10 }}>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={settings.fixedDaysPerMonth}
                    onChange={(e) => setSettings({ ...settings, fixedDaysPerMonth: e.target.value })}
                    style={{ ...inputStyle, maxWidth: 100 }}
                  />
                  <span style={{ marginLeft: 10, fontSize: 12, color: colors.text?.secondary }}>Fixed working days (1–31).</span>
                </div>
              )}
              <span style={hintStyle}>How per-day salary divides the monthly salary. &quot;Legacy&quot; preserves current behavior.</span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Currency</label>
              <input
                type="text"
                value={settings.currency}
                placeholder="PKR"
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                style={{ ...inputStyle, maxWidth: 100 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none', background: colors.primary,
                  color: '#ffffff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save settings'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/hr/dashboard')}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: `1px solid ${colors.border?.default}`,
                  background: 'transparent', color: colors.text?.primary, fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {toast.text && (
        <div
          style={{
            position: 'fixed', right: 18, bottom: 20, padding: '12px 16px', borderRadius: 12,
            background: toast.type === 'error' ? 'rgba(248,113,113,0.12)' : 'rgba(16,185,129,0.14)',
            border: `1px solid ${toast.type === 'error' ? 'rgba(220,38,38,0.6)' : 'rgba(16,185,129,0.7)'}`,
            color: toast.type === 'error' ? '#b91c1c' : '#065f46', fontSize: 13, zIndex: 50,
          }}
        >
          {toast.text}
        </div>
      )}

      {showWarning && (
        <AutoLogoutWarning timeRemaining={timeRemaining} onStayLoggedIn={handleStayLoggedIn} onLogout={autoLogout} />
      )}
    </div>
  );
}
