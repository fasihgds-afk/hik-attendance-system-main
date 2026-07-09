'use client';

/**
 * Employee Filters Component
 *
 * Search and filter controls for employee list
 */

import { useTheme } from '@/lib/theme/ThemeContext';
import { getInputStyles } from '@/lib/theme/styles';

export default function EmployeeFilters({ searchQuery, onSearchChange }) {
  const { colors } = useTheme();
  const inputStyles = getInputStyles(colors);

  const fieldStyle = {
    ...inputStyles.base,
    paddingLeft: '38px',
    minWidth: 280,
    boxShadow: 'none',
  };

  return (
    <div className="hr-controls-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: colors.text.secondary, marginBottom: 4 }}>
          Search Employees
        </label>
        <div style={{ position: 'relative' }}>
          <svg
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 18,
              height: 18,
              color: colors.text.muted,
              pointerEvents: 'none',
            }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            style={fieldStyle}
            placeholder="Search by name, code, or email..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={(e) => {
              Object.assign(e.currentTarget.style, inputStyles.focus);
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = colors.border.input;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>
    </div>
  );
}
