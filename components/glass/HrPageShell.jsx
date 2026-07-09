'use client';

import { useTheme } from '@/lib/theme/ThemeContext';
import AppShell from './AppShell';
import PageHeader from './PageHeader';

/**
 * HrPageShell — standard HR portal page wrapper (AppShell + PageHeader + content area).
 */
export default function HrPageShell({
  children,
  title = 'Global Digital Solutions',
  subtitle,
  meta,
  actions,
  showThemeToggle = true,
  className = '',
  contentStyle,
  headerClassName = '',
  headerCompact = false,
}) {
  const { colors } = useTheme();

  return (
    <AppShell>
      <div
        className={`hr-page-container container-responsive ${className}`.trim()}
        style={{
          padding: '24px 28px 32px',
          color: colors.glass?.text || colors.text.primary,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          ...contentStyle,
        }}
      >
        <PageHeader
          title={title}
          subtitle={subtitle}
          meta={meta}
          actions={actions}
          showThemeToggle={showThemeToggle}
          className={headerClassName}
          compact={headerCompact}
        />
        {children}
      </div>
    </AppShell>
  );
}
