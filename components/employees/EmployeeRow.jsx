'use client';

/**
 * Employee Row Component
 *
 * Single employee table row with inline editing
 */

import { useTheme } from '@/lib/theme/ThemeContext';
import { getTableStyles } from '@/lib/theme/styles';
import EmployeeAvatar from './EmployeeAvatar';
import EmployeeQuickInfo from './EmployeeQuickInfo';

function applyRowBackground(rowEl, backgroundColor) {
  rowEl.style.backgroundColor = backgroundColor;
  rowEl.querySelectorAll('td').forEach((td) => {
    td.style.backgroundColor = backgroundColor;
  });
}

export default function EmployeeRow({
  employee,
  index,
  shifts,
  savingId,
  canUpdate = true,
  onShiftChange,
  onEdit,
  onSave,
  onDelete,
}) {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const tableStyles = getTableStyles(colors);

  const rowBase =
    index % 2 === 0 ? colors.background.table.row : colors.background.table.rowEven;
  const rowHover = colors.background.table.rowHover;

  const tdStyle = {
    ...tableStyles.td,
    backgroundColor: rowBase,
  };

  const selectStyle = {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${colors.border.input}`,
    backgroundColor: colors.background.input,
    color: colors.text.primary,
    fontSize: 13,
    outline: 'none',
    minWidth: 140,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontWeight: 500,
  };

  const handleShiftChange = (newShift) => {
    if (!canUpdate || !onShiftChange) return;
    onShiftChange(index, newShift);
  };

  return (
    <tr
      className="hr-employee-row"
      onDoubleClick={() => onEdit?.(employee)}
      style={{
        cursor: 'pointer',
        backgroundColor: rowBase,
        transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        applyRowBackground(e.currentTarget, rowHover);
        e.currentTarget.style.boxShadow = isDark
          ? 'inset 4px 0 0 0 rgba(14, 165, 233, 0.75)'
          : 'inset 4px 0 0 0 #3b82f6';
      }}
      onMouseLeave={(e) => {
        applyRowBackground(e.currentTarget, rowBase);
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <td style={tdStyle}>
        <EmployeeQuickInfo employee={employee}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <EmployeeAvatar employee={employee} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: colors.text.primary,
                  marginBottom: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {employee.name || 'No Name'}
              </div>
              <div style={{ fontSize: 12, color: colors.text.secondary, fontWeight: 500 }}>
                {employee.empCode}
              </div>
            </div>
          </div>
        </EmployeeQuickInfo>
      </td>

      <td style={tdStyle}>
        {employee.department ? (
          <span
            style={{
              padding: '6px 12px',
              borderRadius: 16,
              backgroundColor: isDark ? 'rgba(14, 165, 233, 0.2)' : '#eff6ff',
              color: isDark ? '#bae6fd' : '#1e40af',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-block',
            }}
          >
            {employee.department}
          </span>
        ) : (
          <span style={{ color: colors.text.muted, fontSize: 14 }}>-</span>
        )}
        {employee.designation && (
          <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>
            {employee.designation}
          </div>
        )}
      </td>

      <td style={tdStyle}>
        {(() => {
          const normalizedShift = employee.shift ? String(employee.shift).trim().toUpperCase() : '';
          const matchingShift = shifts.find(
            (s) =>
              s.code.toUpperCase() === normalizedShift ||
              s.code === normalizedShift ||
              s.code === employee.shift
          );
          const selectedShiftCode = matchingShift ? matchingShift.code : employee.shift || '';

          return (
            <select
              style={{
                ...selectStyle,
                minWidth: 180,
                opacity: canUpdate ? 1 : 0.7,
                cursor: canUpdate ? 'pointer' : 'default',
              }}
              value={selectedShiftCode}
              disabled={!canUpdate}
              onChange={(e) => handleShiftChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => {
                if (!canUpdate) return;
                e.currentTarget.style.borderColor = colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}33`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = colors.border.input;
                e.currentTarget.style.boxShadow = 'none';
                if (!canUpdate || !onSave) return;
                const newShift = e.target.value;
                const currentShift = selectedShiftCode;
                if (newShift !== currentShift) {
                  const updatedEmployee = { ...employee, shift: newShift };
                  setTimeout(() => {
                    onSave(updatedEmployee);
                  }, 100);
                }
              }}
            >
              <option value="">Select Shift</option>
              {shifts.length > 0 ? (
                shifts.map((shift) => (
                  <option key={shift._id} value={shift.code}>
                    {shift.code} – {shift.name} ({shift.startTime}–{shift.endTime})
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  No shifts available
                </option>
              )}
            </select>
          );
        })()}
        {employee.shift && (
          <div style={{ fontSize: 11, color: colors.success, marginTop: 4, fontWeight: 600 }}>
            Active
          </div>
        )}
      </td>

      <td style={tdStyle}>
        {employee.monthlySalary != null ? (
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: colors.success,
                marginBottom: 2,
              }}
            >
              ₨{employee.monthlySalary.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: colors.text.secondary }}>per month</div>
          </div>
        ) : (
          <span style={{ color: colors.text.muted, fontSize: 14 }}>-</span>
        )}
      </td>

      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(employee);
            }}
            title="View full details and edit"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[700]})`,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: `0 2px 4px ${colors.primary[500]}33`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 4px 8px ${colors.primary[500]}44`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 2px 4px ${colors.primary[500]}33`;
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View
          </button>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(employee);
              }}
              title="Deactivate employee"
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: colors.error,
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#b91c1c';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.error;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
