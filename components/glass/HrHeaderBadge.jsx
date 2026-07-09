'use client';

/**
 * Meta badge shown under the header subtitle (user info, date, status, etc.)
 */
export default function HrHeaderBadge({ children, className = '' }) {
  return (
    <div className={`hr-header-badge ${className}`.trim()}>
      <svg
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="hr-header-badge__icon"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
      <span className="hr-header-badge__text">{children}</span>
    </div>
  );
}
