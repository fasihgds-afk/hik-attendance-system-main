'use client';

/**
 * Employee Table Component
 *
 * Complete employee data table with filtering, sorting, and actions
 */

import { useTheme } from '@/lib/theme/ThemeContext';
import { getTableStyles } from '@/lib/theme/styles';
import EmployeeRow from './EmployeeRow';

export default function EmployeeTable({
  employees,
  shifts,
  loading,
  savingId,
  canUpdate = true,
  onShiftChange,
  onEdit,
  onSave,
  onDelete,
}) {
  const { colors } = useTheme();
  const tableStyles = getTableStyles(colors);

  const emptyCell = {
    ...tableStyles.td,
    textAlign: 'center',
    color: colors.text.muted,
    padding: '40px 12px',
    fontSize: 14,
  };

  return (
    <div
      className="hr-employee-table hr-table-scroll table-responsive"
      style={tableStyles.wrapper}
    >
      <table style={tableStyles.table}>
        <thead>
          <tr>
            <th style={{ ...tableStyles.th, width: 280 }}>Employee</th>
            <th style={tableStyles.th}>Department</th>
            <th style={tableStyles.th}>Shift</th>
            <th style={tableStyles.th}>Salary</th>
            <th style={{ ...tableStyles.th, width: 160, textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && employees.length === 0 ? (
            <tr>
              <td colSpan={5} style={emptyCell}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      border: `3px solid ${colors.border.default}`,
                      borderTopColor: colors.primary[500],
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  Loading employees…
                </div>
              </td>
            </tr>
          ) : employees.length === 0 ? (
            <tr>
              <td colSpan={5} style={emptyCell}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <svg
                    style={{ width: 48, height: 48, color: colors.text.muted }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <div style={{ fontWeight: 600, color: colors.text.secondary }}>No employees found</div>
                  <div style={{ fontSize: 13 }}>Try adjusting your search or filters</div>
                </div>
              </td>
            </tr>
          ) : (
            employees.map((employee, index) => (
              <EmployeeRow
                key={employee._id || employee.empCode}
                employee={employee}
                index={index}
                shifts={shifts}
                savingId={savingId}
                canUpdate={canUpdate}
                onShiftChange={onShiftChange}
                onEdit={onEdit}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
