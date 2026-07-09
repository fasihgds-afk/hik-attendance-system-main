'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';
import { usePermissions } from '@/hooks/usePermissions';

export default function ViolationRulesPage() {
  const router = useRouter();
  const { session, canUpdate } = usePermissions('violationRules');
  const { colors, theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });

  // Form state
  const [formData, setFormData] = useState({
    violationConfig: {
      freeViolations: 2,
      milestoneInterval: 3,
      perMinuteRate: 0.007,
      maxPerMinuteFine: 1.0,
    },
    absentConfig: {
      bothMissingDays: 1.0,
      partialPunchDays: 1.0,
      leaveWithoutInformDays: 1.5,
    },
    leaveConfig: {
      unpaidLeaveDays: 1.0,
      sickLeaveDays: 1.0,
      halfDayDays: 0.5,
      paidLeaveDays: 0.0,
    },
    description: '',
  });

  // Auto logout after 30 minutes of inactivity (with 5 minute warning)
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000, // 30 minutes
    warningTime: 5 * 60 * 1000, // 5 minutes warning
    enabled: true,
    onLogout: () => {
      signOut({ redirect: false, callbackUrl: '/login?role=hr' }).then(() => {
        router.push('/login?role=hr');
      });
    },
  });

  // Manual logout handler
  const handleLogout = async () => {
    try {
      await signOut({ 
        redirect: false,
        callbackUrl: '/login?role=hr'
      });
      router.push('/login?role=hr');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login?role=hr');
    }
  };

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 3000);
  }

  // Load existing rules
  async function loadRules() {
    try {
      setLoading(true);
      const res = await fetch('/api/hr/violation-rules');
      if (!res.ok) throw new Error('Failed to load violation rules');
      const data = await res.json();
      
      if (data.rules) {
        setFormData({
          violationConfig: data.rules.violationConfig || formData.violationConfig,
          absentConfig: data.rules.absentConfig || formData.absentConfig,
          leaveConfig: data.rules.leaveConfig || formData.leaveConfig,
          description: data.rules.description || '',
        });
      }
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load violation rules');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRules();
  }, []);

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      
      const res = await fetch('/api/hr/violation-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          updatedBy: session?.user?.email || 'HR',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save violation rules');
      }

      showToast('success', 'Violation rules updated successfully');
    } catch (err) {
      console.error('Save error:', err);
      showToast('error', err.message || 'Failed to save violation rules');
    } finally {
      setSaving(false);
    }
  }

  // Helper to update nested form data
  function updateNestedField(section, field, value) {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  }

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/hr/employees')} className="rules-button" style={glossPill('neutral')}>
        HR Home
      </button>
      <button type="button" onClick={() => router.push('/hr/company-settings')} className="rules-button" style={glossPill('slate')}>
        Company Settings
      </button>
      <button type="button" onClick={handleLogout} className="rules-button" style={glossPill('rose')}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Logout
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell
      subtitle="Violation & Leave Deduction Rules"
      actions={headerActions}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media (max-width: 768px) {
            .rules-header {
              flex-direction: column !important;
              align-items: flex-start !important;
            }
            .rules-form-section {
              padding: 16px !important;
            }
            .rules-form-grid {
              grid-template-columns: 1fr !important;
            }
          }
          
          /* Laptop & Desktop Responsive Styles */
          @media (min-width: 1024px) and (max-width: 1366px) {
            .rules-header {
              padding: 16px 22px !important;
            }
            .rules-form-section {
              padding: 18px 22px !important;
            }
            .rules-form-grid {
              gap: 12px !important;
            }
          }
          
          @media (min-width: 1367px) and (max-width: 1440px) {
            .rules-form-section {
              padding: 20px 24px !important;
            }
          }
          
          @media (min-width: 1441px) {
            .rules-form-section {
              padding: 24px 28px !important;
            }
          }
        `,
        }}
      />

      {/* Auto Logout Warning */}
      {showWarning && (
        <AutoLogoutWarning
          isOpen={showWarning}
          timeRemaining={timeRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogoutNow={autoLogout}
        />
      )}

      {/* Main Form Card */}
      <GlassCard style={{ marginTop: 18 }} padding={24}>
        {toast.text && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
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

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.text.muted }}>
            Loading violation rules...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {!canUpdate && (
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                View only — you cannot change this module.
              </p>
            )}
            <fieldset
              disabled={!canUpdate}
              style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}
            >
            {/* Violation Configuration Section */}
            <div
              className="rules-form-section"
              style={{
                marginBottom: 24,
                padding: '20px 24px',
                borderRadius: 12,
                backgroundColor: colors.background.secondary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 16,
                  color: colors.text.primary,
                  borderBottom: `2px solid ${colors.primary[500]}`,
                  paddingBottom: 8,
                }}
              >
                Violation Deduction Rules
              </h3>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 8 }}>
                Configure how late and early violations are calculated and deducted from salary.
              </p>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#e0f2fe',
                  border: `1px solid ${colors.primary[300]}`,
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 12, color: colors.text.secondary, margin: 0, lineHeight: 1.6 }}>
                  <strong style={{ color: colors.primary[600] }}>Late & Early counted separately:</strong> Late violations and early violations are tracked independently. 
                  Each type has its own count. Example: 2 late + 2 early → 3rd late = 1 day deduction, 3rd early = 1 day deduction → <strong>Total 2 days</strong>.
                  The rules below apply to both types.
                </p>
              </div>
              <div
                className="rules-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Free Violations
                  </label>
                  <input
                    type="number"
                    value={formData.violationConfig.freeViolations}
                    onChange={(e) => updateNestedField('violationConfig', 'freeViolations', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    First N violations are free per type (late and early each get their own free count)
                  </p>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Milestone Interval
                  </label>
                  <input
                    type="number"
                    value={formData.violationConfig.milestoneInterval}
                    onChange={(e) => updateNestedField('violationConfig', 'milestoneInterval', Number(e.target.value))}
                    min="1"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    Every Nth violation = 1 full day deduction (applied separately for late and early)
                  </p>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Per-Minute Rate
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.violationConfig.perMinuteRate}
                    onChange={(e) => updateNestedField('violationConfig', 'perMinuteRate', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    Days deducted per minute of violation
                  </p>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Max Per-Minute Fine
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.violationConfig.maxPerMinuteFine}
                    onChange={(e) => updateNestedField('violationConfig', 'maxPerMinuteFine', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                  <p style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 4 }}>
                    Maximum days deducted per violation
                  </p>
                </div>
              </div>
            </div>

            {/* Absent/Missing Punch Configuration */}
            <div
              className="rules-form-section"
              style={{
                marginBottom: 24,
                padding: '20px 24px',
                borderRadius: 12,
                backgroundColor: colors.background.secondary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 16,
                  color: colors.text.primary,
                  borderBottom: `2px solid ${colors.primary[500]}`,
                  paddingBottom: 8,
                }}
              >
                Absent & Missing Punch Deduction Rules
              </h3>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 16 }}>
                Configure deductions for absent days and missing punches.
              </p>
              <div
                className="rules-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Both Punches Missing (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.absentConfig.bothMissingDays}
                    onChange={(e) => updateNestedField('absentConfig', 'bothMissingDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Partial Punch Missing (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.absentConfig.partialPunchDays}
                    onChange={(e) => updateNestedField('absentConfig', 'partialPunchDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Leave Without Inform (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.absentConfig.leaveWithoutInformDays}
                    onChange={(e) => updateNestedField('absentConfig', 'leaveWithoutInformDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Leave Configuration */}
            <div
              className="rules-form-section"
              style={{
                marginBottom: 24,
                padding: '20px 24px',
                borderRadius: 12,
                backgroundColor: colors.background.secondary,
                border: `1px solid ${colors.border.default}`,
              }}
            >
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 16,
                  color: colors.text.primary,
                  borderBottom: `2px solid ${colors.primary[500]}`,
                  paddingBottom: 8,
                }}
              >
                Leave Deduction Rules
              </h3>
              <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 16 }}>
                Configure deductions for different types of leaves.
              </p>
              <div
                className="rules-form-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Unpaid Leave (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.leaveConfig.unpaidLeaveDays}
                    onChange={(e) => updateNestedField('leaveConfig', 'unpaidLeaveDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Sick Leave (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.leaveConfig.sickLeaveDays}
                    onChange={(e) => updateNestedField('leaveConfig', 'sickLeaveDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Half Day (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.leaveConfig.halfDayDays}
                    onChange={(e) => updateNestedField('leaveConfig', 'halfDayDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text.secondary,
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Paid Leave (Days)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.leaveConfig.paidLeaveDays}
                    onChange={(e) => updateNestedField('leaveConfig', 'paidLeaveDays', Number(e.target.value))}
                    min="0"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      fontSize: 14,
                      width: '100%',
                      outline: 'none',
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Per-day salary lives on Company Settings */}
            <div
              className="rules-form-section"
              style={{
                marginBottom: 24,
                padding: '16px 20px',
                borderRadius: 12,
                backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.12)' : '#e0f2fe',
                border: `1px solid ${colors.primary[300]}`,
              }}
            >
              <p style={{ fontSize: 13, color: colors.text.secondary, margin: 0, lineHeight: 1.65 }}>
                <strong style={{ color: colors.text.primary }}>Per-day salary divisor</strong> (how monthly salary is split into working days)
                is configured on{' '}
                <button
                  type="button"
                  onClick={() => router.push('/hr/company-settings')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: theme === 'dark' ? '#38bdf8' : colors.primary[600],
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Company Settings
                </button>
                . This page only controls <strong style={{ color: colors.text.primary }}>how many days to deduct</strong> for
                violations, absences, and leaves.
              </p>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: colors.text.secondary,
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.input}`,
                  fontSize: 14,
                  width: '100%',
                  minHeight: 80,
                  resize: 'vertical',
                  outline: 'none',
                  backgroundColor: colors.background.input,
                  color: colors.text.primary,
                  fontFamily: 'inherit',
                }}
                placeholder="Optional description for this rule set"
              />
            </div>

            {/* Submit Button */}
            {canUpdate && (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'flex-end',
                  marginTop: 24,
                }}
              >
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '12px 24px',
                    background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 12,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    opacity: saving ? 0.6 : 1,
                    boxShadow: `0 8px 20px ${colors.primary[500]}40`,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 10px 24px ${colors.primary[500]}50`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = `0 8px 20px ${colors.primary[500]}40`;
                    }
                  }}
                >
                  {saving ? 'Saving...' : 'Save Violation Rules'}
                </button>
              </div>
            )}
            </fieldset>
          </form>
        )}
      </GlassCard>
    </HrPageShell>
  );
}

