'use client';

import { useTheme } from '@/lib/theme/ThemeContext';

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme();
  const dim = compact ? 34 : 48;
  const rad = compact ? 8 : 12;
  const icon = compact ? 16 : 20;
  const shadowBase = compact ? '0 2px 8px rgba(0, 0, 0, 0.2)' : '0 4px 12px rgba(0, 0, 0, 0.15)';
  const shadowHover = compact ? '0 4px 14px rgba(0, 0, 0, 0.28)' : '0 6px 16px rgba(0, 0, 0, 0.2)';

  // Compact toggle lives on the GDS dark header — always high-contrast (both themes)
  const headerToggle = compact;
  const isDark = theme === 'dark';

  const surfaceStyle = headerToggle
    ? {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderTopColor: isDark ? 'rgba(251, 191, 36, 0.55)' : 'rgba(255, 255, 255, 0.55)',
        borderRightColor: isDark ? 'rgba(251, 191, 36, 0.4)' : 'rgba(255, 255, 255, 0.4)',
        borderBottomColor: isDark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(255, 255, 255, 0.35)',
        borderLeftColor: isDark ? 'rgba(251, 191, 36, 0.4)' : 'rgba(255, 255, 255, 0.4)',
        background: isDark
          ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.32), rgba(251, 191, 36, 0.14))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.12))',
        color: isDark ? '#fbbf24' : '#ffffff',
      }
    : {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderTopColor: isDark ? 'rgba(251, 191, 36, 0.4)' : 'rgba(14, 165, 233, 0.4)',
        borderRightColor: isDark ? 'rgba(251, 191, 36, 0.3)' : 'rgba(14, 165, 233, 0.3)',
        borderBottomColor: isDark ? 'rgba(251, 191, 36, 0.25)' : 'rgba(14, 165, 233, 0.25)',
        borderLeftColor: isDark ? 'rgba(251, 191, 36, 0.3)' : 'rgba(14, 165, 233, 0.3)',
        background: isDark
          ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.1))'
          : 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(14, 165, 233, 0.1))',
        color: isDark ? '#fbbf24' : '#0ea5e9',
      };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={compact ? 'hr-theme-toggle hr-theme-toggle--compact' : 'hr-theme-toggle'}
      style={{
        width: dim,
        height: dim,
        borderRadius: rad,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s',
        boxShadow: shadowBase,
        flexShrink: 0,
        ...surfaceStyle,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
        e.currentTarget.style.boxShadow = shadowHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = shadowBase;
      }}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <svg width={icon} height={icon} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg width={icon} height={icon} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
