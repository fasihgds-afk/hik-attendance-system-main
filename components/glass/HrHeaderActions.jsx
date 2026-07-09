'use client';

/**
 * Toolbar action group for HrGlobalHeader — use as the `actions` prop on HrPageShell.
 */
export default function HrHeaderActions({ children, className = '' }) {
  return (
    <div className={`hr-header-actions ${className}`.trim()}>
      {children}
    </div>
  );
}
