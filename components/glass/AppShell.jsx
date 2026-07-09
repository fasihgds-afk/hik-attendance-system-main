'use client';

import { useTheme } from '@/lib/theme/ThemeContext';
import { getPageBackgroundStyles } from '@/lib/theme/styles';

/**
 * AppShell — static GDS gradient background via getPageBackgroundStyles().
 */
export default function AppShell({
  children,
  className = '',
  contentClassName = '',
  style,
}) {
  const { colors } = useTheme();
  const bgStyle = getPageBackgroundStyles(colors);

  return (
    <div className={`app-shell ${className}`.trim()} style={style}>
      <div
        className="app-shell__bg"
        aria-hidden="true"
        style={bgStyle}
      />
      <div className={`app-shell__content ${contentClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}
