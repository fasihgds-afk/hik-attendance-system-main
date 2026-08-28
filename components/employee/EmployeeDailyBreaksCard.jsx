'use client';

/**
 * Compact daily break usage for employee dashboard.
 * variant="inline" → single row inside Your Profile (empty strip under clock).
 * variant="card" → full strip (unused on dashboard; kept for reuse).
 */

export function formatBreakMinutes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (v < 1) return v.toFixed(2);
  if (v < 10) return v.toFixed(1);
  return String(Math.round(v * 10) / 10);
}

export function BreakUsageBar({
  used,
  limit = 60,
  over,
  colors,
  unlimited = false,
  compact = false,
}) {
  const value = Number(used) || 0;
  const pct = unlimited
    ? Math.min(100, Math.round((value / Math.max(value, 60)) * 100))
    : Math.min(100, Math.round((value / limit) * 100));
  const fill = over
    ? '#ef4444'
    : unlimited
      ? colors.primary?.[400] || '#38bdf8'
      : colors.primary?.[500] || '#0ea5e9';

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 6,
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          marginBottom: compact ? 5 : 4,
          color: over ? '#ef4444' : colors.text.primary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          {unlimited ? (
            <>{formatBreakMinutes(value)}m</>
          ) : (
            <>
              {formatBreakMinutes(value)} / {limit}
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
          height: compact ? 6 : 7,
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
          }}
        />
      </div>
    </div>
  );
}

/** Taller panel inside Your Profile — proper General / Namaz / Official bars */
function InlineBreaksRow({ daily, loading, colors, theme, onViewAll }) {
  const overG = !!daily?.overGeneralLimit;
  const overN = !!daily?.overNamazLimit;
  const open = (daily?.openCount || 0) > 0;
  const status = open ? 'On break' : overG || overN ? 'Over limit' : 'OK';
  const statusColor = open
    ? colors.primary?.[500] || '#0ea5e9'
    : overG || overN
      ? '#ef4444'
      : colors.success || '#16a34a';

  const labelStyle = {
    fontSize: 10,
    fontWeight: 700,
    color: colors.text.tertiary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  };

  return (
    <div
      className="employee-breaks-inline"
      style={{
        marginTop: 8,
        padding: '10px 11px 11px',
        borderRadius: 8,
        background:
          theme === 'dark' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.06)',
        border: `1px solid ${theme === 'dark' ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.22)'}`,
        borderLeft: `3px solid ${overG || overN ? '#ef4444' : colors.warning || '#f59e0b'}`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.35,
              textTransform: 'uppercase',
              color: colors.text.primary,
            }}
          >
            Breaks
          </span>
          {!loading && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                background:
                  open
                    ? 'rgba(14,165,233,0.18)'
                    : overG || overN
                      ? 'rgba(239,68,68,0.15)'
                      : 'rgba(34,197,94,0.15)',
                color: statusColor,
              }}
            >
              {status}
            </span>
          )}
          {!loading && daily?.shiftDate && (
            <span style={{ fontSize: 10, color: colors.text.secondary, fontWeight: 600 }}>
              {daily.shiftDate}
              {daily.shiftName || daily.shiftCode
                ? ` · ${daily.shiftName || daily.shiftCode}`
                : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onViewAll}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${colors.border?.default || 'rgba(148,163,184,0.35)'}`,
            background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
            color: colors.text.primary,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            flex: 'none',
          }}
        >
          Monthly →
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: colors.text.secondary }}>Loading breaks…</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <div style={labelStyle}>General / 60</div>
            <BreakUsageBar
              used={daily?.generalMinutes || 0}
              limit={daily?.generalLimitMinutes || 60}
              over={overG}
              colors={colors}
              compact
            />
          </div>
          <div>
            <div style={labelStyle}>Namaz / 40</div>
            <BreakUsageBar
              used={daily?.namazMinutes || 0}
              limit={daily?.namazLimitMinutes || 40}
              over={overN}
              colors={colors}
              compact
            />
          </div>
          <div>
            <div style={labelStyle}>Official ∞</div>
            <BreakUsageBar
              used={daily?.officialMinutes || 0}
              unlimited
              colors={colors}
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmployeeDailyBreaksCard({
  daily,
  loading,
  colors,
  theme,
  nestedGlassCard,
  withLeftAccent,
  GlossOverlay,
  onViewAll,
  variant = 'card',
}) {
  if (variant === 'inline') {
    return (
      <InlineBreaksRow
        daily={daily}
        loading={loading}
        colors={colors}
        theme={theme}
        onViewAll={onViewAll}
      />
    );
  }

  const overG = !!daily?.overGeneralLimit;
  const overN = !!daily?.overNamazLimit;
  const open = (daily?.openCount || 0) > 0;

  return (
    <div
      className="employee-breaks-card"
      style={{
        ...withLeftAccent(nestedGlassCard, colors.warning || '#f59e0b', 4),
        padding: '14px 16px',
        marginBottom: 20,
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <GlossOverlay />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
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
              My breaks
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: colors.text.primary, marginTop: 2 }}>
              Today&apos;s shift day
              {daily?.shiftDate ? (
                <span style={{ fontWeight: 600, color: colors.text.secondary, fontSize: 13 }}>
                  {' '}
                  · {daily.shiftDate}
                  {daily.shiftName || daily.shiftCode ? ` · ${daily.shiftName || daily.shiftCode}` : ''}
                </span>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {open && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(14,165,233,0.18)',
                  color: colors.primary?.[500] || '#0ea5e9',
                }}
              >
                On break
              </span>
            )}
            {!open && !overG && !overN && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(34,197,94,0.15)',
                  color: colors.success || '#16a34a',
                }}
              >
                OK
              </span>
            )}
            {(overG || overN) && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444',
                }}
              >
                Over limit
              </span>
            )}
            <button
              type="button"
              onClick={onViewAll}
              style={{
                padding: '6px 12px',
                borderRadius: 9,
                border: `1px solid ${colors.border?.default || colors.glass?.border}`,
                background:
                  theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                color: colors.text.primary,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              View monthly →
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: colors.text.secondary }}>Loading breaks…</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 14,
            }}
            className="employee-breaks-bars"
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: colors.text.tertiary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                General / 60
              </div>
              <BreakUsageBar
                used={daily?.generalMinutes || 0}
                limit={daily?.generalLimitMinutes || 60}
                over={overG}
                colors={colors}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: colors.text.tertiary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Namaz / 40
              </div>
              <BreakUsageBar
                used={daily?.namazMinutes || 0}
                limit={daily?.namazLimitMinutes || 40}
                over={overN}
                colors={colors}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: colors.text.tertiary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Official ∞
              </div>
              <BreakUsageBar used={daily?.officialMinutes || 0} unlimited colors={colors} />
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 11, color: colors.text.secondary }}>
          {(daily?.sessionCount || 0) === 0
            ? 'No breaks recorded for this shift day yet.'
            : `${daily.sessionCount} session${daily.sessionCount === 1 ? '' : 's'} today · limits use shift-start day (+05:00)`}
        </div>
      </div>
    </div>
  );
}
