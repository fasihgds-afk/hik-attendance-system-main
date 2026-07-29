'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';
import { usePermissions } from '@/hooks/usePermissions';

const DEFAULT_POLICY = { leavesPerQuarter: 6, allowCarryForward: false, carryForwardMax: 0 };

export default function HrLeavePolicyPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const { canUpdate } = usePermissions('leavePolicy');
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev)), 3000);
  }

  async function loadPolicy() {
    setLoading(true);
    try {
      const res = await fetch('/api/hr/leave-policy', { cache: 'no-store' });
      if (res.ok) {
        const response = await res.json();
        const p = response.data?.policy ?? response.policy ?? DEFAULT_POLICY;
        setPolicy({
          leavesPerQuarter: p.leavesPerQuarter ?? DEFAULT_POLICY.leavesPerQuarter,
          allowCarryForward: p.allowCarryForward ?? DEFAULT_POLICY.allowCarryForward,
          carryForwardMax: p.carryForwardMax ?? DEFAULT_POLICY.carryForwardMax,
        });
      } else {
        showToast('error', 'Failed to load leave policy');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load leave policy');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicy();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    const leavesPerQuarter = Math.max(1, Math.min(31, parseInt(String(policy.leavesPerQuarter), 10) || 6));
    const carryForwardMax = Math.max(0, Math.min(10, parseInt(String(policy.carryForwardMax), 10) || 0));
    setSaving(true);
    try {
      const res = await fetch('/api/hr/leave-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leavesPerQuarter,
          allowCarryForward: policy.allowCarryForward,
          carryForwardMax: policy.allowCarryForward ? carryForwardMax : 0,
        }),
      });
      const response = await res.json();
      if (res.ok && response.success) {
        showToast('success', 'Leave policy updated successfully');
        const p = response.data?.policy ?? response.policy ?? policy;
        setPolicy({
          leavesPerQuarter: p.leavesPerQuarter ?? leavesPerQuarter,
          allowCarryForward: p.allowCarryForward ?? policy.allowCarryForward,
          carryForwardMax: p.carryForwardMax ?? carryForwardMax,
        });
      } else {
        showToast('error', response.error || response.message || 'Failed to update policy');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update policy');
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

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/hr/leaves')} className="leave-policy-button" style={glossPill('slate')}>
        Leaves
      </button>
      <button type="button" onClick={() => router.push('/hr/dashboard')} className="leave-policy-button" style={glossPill('neutral')}>
        Dashboard
      </button>
      <button type="button" onClick={handleLogout} className="leave-policy-button" style={glossPill('rose')}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Logout
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell
      subtitle="Leave Policy"
      actions={headerActions}
    >
      <GlassCard style={{ marginTop: 18, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }} padding={24}>
        <p style={{ fontSize: 13, color: colors.text?.secondary, marginBottom: 20 }}>
          Configure paid leave rules. Changes apply to new leave marking and to how balances are shown. Existing quarter records keep their allocated value; new quarters use the current policy.
        </p>
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: colors.text?.secondary }}>
            Loading...
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: colors.text?.primary }}>
                Paid leaves per quarter
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={policy.leavesPerQuarter}
                disabled={!canUpdate}
                onChange={(e) => setPolicy({ ...policy, leavesPerQuarter: e.target.value })}
                style={{
                  width: '100%',
                  maxWidth: 120,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border?.default}`,
                  background: colors.background?.input ?? colors.background?.card,
                  color: colors.text?.primary,
                  fontSize: 14,
                  opacity: canUpdate ? 1 : 0.7,
                }}
              />
              <span style={{ marginLeft: 10, fontSize: 12, color: colors.text?.secondary }}>
                (1–31). Each quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec) gets this many paid leaves. Unused leaves do not carry forward unless enabled below.
              </span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canUpdate ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={policy.allowCarryForward}
                  disabled={!canUpdate}
                  onChange={(e) => setPolicy({ ...policy, allowCarryForward: e.target.checked })}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.text?.primary }}>
                  Allow carry-forward of unused leaves to next quarter
                </span>
              </label>
              <span style={{ display: 'block', fontSize: 12, color: colors.text?.secondary, marginTop: 6, marginLeft: 28 }}>
                If enabled, up to &quot;Max carry-forward&quot; unused leaves can be added to the next quarter. (Carry-forward logic can be extended later.)
              </span>
            </div>

            {policy.allowCarryForward && (
              <div style={{ marginBottom: 20, marginLeft: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: colors.text?.primary }}>
                  Max carry-forward (leaves)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={policy.carryForwardMax}
                  disabled={!canUpdate}
                  onChange={(e) => setPolicy({ ...policy, carryForwardMax: e.target.value })}
                  style={{
                    width: '100%',
                    maxWidth: 80,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border?.default}`,
                    background: colors.background?.input ?? colors.background?.card,
                    color: colors.text?.primary,
                    fontSize: 14,
                    opacity: canUpdate ? 1 : 0.7,
                  }}
                />
              </div>
            )}

            {!canUpdate && (
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>
                View only — you cannot change this module.
              </p>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              {canUpdate && (
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: colors.primary,
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save policy'}
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push('/hr/leaves')}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border?.default}`,
                  background: 'transparent',
                  color: colors.text?.primary,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {canUpdate ? 'Cancel' : 'Back'}
              </button>
            </div>
          </form>
        )}
      </GlassCard>

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
