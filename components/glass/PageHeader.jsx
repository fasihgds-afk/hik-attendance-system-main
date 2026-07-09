'use client';

import ThemeToggle from '@/components/ui/ThemeToggle';
import { useTheme } from '@/lib/theme/ThemeContext';
import { getGlassHeaderStyles } from '@/lib/theme/styles';

/**
 * HrGlobalHeader — unified GDS glass header for every HR page.
 * Responsive: single row on large desktop, stacked toolbar tray on laptop/tablet, full-width on mobile.
 */
export default function PageHeader({
  title = 'Global Digital Solutions',
  subtitle,
  meta,
  logoSrc = '/gds.png',
  logoAlt = 'Global Digital Solutions logo',
  actions,
  showThemeToggle = true,
  className = '',
  compact = false,
}) {
  const { colors } = useTheme();
  const headerStyles = getGlassHeaderStyles(colors, {
    padding: compact ? '14px 18px' : '18px 22px',
    borderRadius: 20,
    marginBottom: 18,
  });

  return (
    <header
      className={`hr-global-header glass-page-header daily-header ${className}`.trim()}
      style={headerStyles.header}
    >
      <div
        className="hr-global-header__accent"
        aria-hidden="true"
        style={{ background: colors.gradient.primary }}
      />
      <div aria-hidden="true" style={headerStyles.overlay} />
      <div aria-hidden="true" style={headerStyles.gloss.sheen} />
      <div aria-hidden="true" style={headerStyles.gloss.rim} />

      <div className="hr-global-header__row">
        <div className="hr-global-header__brand" style={headerStyles.brand}>
          <div className="daily-header-logo hr-global-header__logo" style={headerStyles.logo}>
            <img src={logoSrc} alt={logoAlt} style={headerStyles.logoImage} />
          </div>

          <div className="hr-global-header__text" style={{ minWidth: 0 }}>
            <div className="daily-header-title hr-global-header__title" style={headerStyles.title}>
              {title}
            </div>
            {subtitle ? (
              <div className="daily-header-subtitle hr-global-header__subtitle" style={headerStyles.subtitle}>
                {subtitle}
              </div>
            ) : null}
            {meta ? <div className="hr-global-header__meta">{meta}</div> : null}
          </div>
        </div>

        {(actions || showThemeToggle) && (
          <div className="hr-global-header__toolbar daily-header-toolbar" style={headerStyles.toolbar}>
            {actions}
            {showThemeToggle ? (
              <div className="hr-header-theme">
                <ThemeToggle compact />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </header>
  );
}

/** Alias — same component, clearer name for imports */
export { PageHeader as HrGlobalHeader };
