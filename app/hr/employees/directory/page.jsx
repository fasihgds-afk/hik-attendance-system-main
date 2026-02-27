'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';
import PaginationControls from '@/components/common/PaginationControls';

export default function EmployeeDirectoryPage() {
  const router = useRouter();
  const { colors } = useTheme();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [collapsedDepartments, setCollapsedDepartments] = useState({});
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  async function loadEmployees() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '50');
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/employee?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Failed to load directory (${res.status})`);
      }

      const response = await res.json();
      const items = response?.data?.items || response?.items || [];
      const meta = response?.meta?.pagination || response?.pagination || {};

      setRows(Array.isArray(items) ? items : []);
      setPagination({
        page: meta.page || page,
        limit: meta.limit || 50,
        total: meta.total || 0,
        totalPages: meta.totalPages || 1,
      });
    } catch (error) {
      console.error('Directory load error:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const departmentCount = useMemo(
    () => new Set(rows.map((employee) => employee.department || 'Unassigned')).size,
    [rows]
  );

  const rowsByDepartment = useMemo(() => {
    const grouped = rows.reduce((acc, employee) => {
      const departmentName = employee.department || 'Unassigned';
      if (!acc[departmentName]) acc[departmentName] = [];
      acc[departmentName].push(employee);
      return acc;
    }, {});

    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b))
      .map((departmentName) => ({
        departmentName,
        employees: grouped[departmentName].slice().sort((a, b) => {
          return String(a.empCode || '').localeCompare(String(b.empCode || ''));
        }),
      }));
  }, [rows]);

  useEffect(() => {
    setCollapsedDepartments((prev) => {
      const next = {};
      rowsByDepartment.forEach((group) => {
        next[group.departmentName] = prev[group.departmentName] ?? false;
      });
      return next;
    });
  }, [rowsByDepartment]);

  const filteredDepartmentGroups = useMemo(() => {
    if (selectedDepartment === 'ALL') return rowsByDepartment;
    return rowsByDepartment.filter((group) => group.departmentName === selectedDepartment);
  }, [rowsByDepartment, selectedDepartment]);

  function toggleDepartment(departmentName) {
    setCollapsedDepartments((prev) => ({
      ...prev,
      [departmentName]: !prev[departmentName],
    }));
  }

  function setAllDepartmentsCollapsed(isCollapsed) {
    const next = {};
    rowsByDepartment.forEach((group) => {
      next[group.departmentName] = isCollapsed;
    });
    setCollapsedDepartments(next);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px 28px 32px',
        background: colors.gradient.overlay,
        color: colors.text.primary,
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ width: '100%', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            padding: '14px 18px',
            borderRadius: 14,
            background: colors.gradient.header,
            border: `1px solid ${colors.border.default}`,
            boxShadow: '0 12px 28px rgba(15,23,42,0.3)',
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
              Employee Directory
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
              Read-only HR view with searchable employee details
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => router.push('/hr/employees')}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.25)',
                backgroundColor: 'rgba(255,255,255,0.14)',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Back to HR Page
            </button>
            <ThemeToggle />
          </div>
        </div>

        <div
          style={{
            borderRadius: 14,
            background: colors.background.card,
            border: `1px solid ${colors.border.default}`,
            padding: 16,
            boxShadow: colors.card.shadow,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ padding: 10, borderRadius: 10, background: colors.background.secondary }}>
              <div style={{ fontSize: 11, color: colors.text.muted }}>Employees on This Page</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{rows.length}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: colors.background.secondary }}>
              <div style={{ fontSize: 11, color: colors.text.muted }}>Total Employees</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{pagination.total}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 10, background: colors.background.secondary }}>
              <div style={{ fontSize: 11, color: colors.text.muted }}>Departments in View</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{departmentCount}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Search by code, name, email..."
              style={{
                minWidth: 260,
                flex: '1 1 280px',
                padding: '9px 12px',
                borderRadius: 10,
                border: `1px solid ${colors.border.input}`,
                backgroundColor: colors.background.input,
                color: colors.text.primary,
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setSelectedDepartment('ALL')}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: `1px solid ${selectedDepartment === 'ALL' ? colors.primary[500] : colors.border.default}`,
                backgroundColor:
                  selectedDepartment === 'ALL' ? colors.background.secondary : colors.background.card,
                color: colors.text.primary,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All Departments
            </button>
            {rowsByDepartment.map((group) => (
              <button
                key={`chip-${group.departmentName}`}
                type="button"
                onClick={() => setSelectedDepartment(group.departmentName)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: `1px solid ${
                    selectedDepartment === group.departmentName
                      ? colors.primary[500]
                      : colors.border.default
                  }`,
                  backgroundColor:
                    selectedDepartment === group.departmentName
                      ? colors.background.secondary
                      : colors.background.card,
                  color: colors.text.primary,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {group.departmentName} ({group.employees.length})
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setAllDepartmentsCollapsed(false)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: `1px solid ${colors.border.default}`,
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={() => setAllDepartmentsCollapsed(true)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: `1px solid ${colors.border.default}`,
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Collapse All
            </button>
          </div>

          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 1080,
                borderCollapse: 'collapse',
                borderRadius: 10,
                overflow: 'hidden',
                border: `1px solid ${colors.border.table}`,
              }}
            >
              <thead>
                <tr>
                  {[
                    'Emp Code',
                    'Name',
                    'Department',
                    'Designation',
                    'Shift',
                    'Salary',
                    'Saturday Group',
                    'Email',
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: colors.text.table.header,
                        backgroundColor: colors.background.table.header,
                        borderBottom: `1px solid ${colors.border.table}`,
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: 18,
                        textAlign: 'center',
                        fontSize: 13,
                        color: colors.text.muted,
                        backgroundColor: colors.background.table.row,
                      }}
                    >
                      Loading directory...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: 18,
                        textAlign: 'center',
                        fontSize: 13,
                        color: colors.text.muted,
                        backgroundColor: colors.background.table.row,
                      }}
                    >
                      No employees found for this search.
                    </td>
                  </tr>
                ) : (
                  filteredDepartmentGroups.flatMap((group) => [
                    <tr key={`group-${group.departmentName}`}>
                      <td
                        colSpan={8}
                        style={{
                          padding: '10px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          color: colors.text.primary,
                          backgroundColor: colors.background.table.header,
                          borderTop: `1px solid ${colors.border.table}`,
                          borderBottom: `1px solid ${colors.border.table}`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDepartment(group.departmentName)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: colors.text.primary,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {collapsedDepartments[group.departmentName] ? '▶' : '▼'} {group.departmentName} (
                          {group.employees.length})
                        </button>
                      </td>
                    </tr>,
                    ...(collapsedDepartments[group.departmentName]
                      ? []
                      : group.employees.map((employee, index) => (
                          <tr
                            key={employee._id || `${group.departmentName}-${employee.empCode}-${index}`}
                            style={{
                              backgroundColor:
                                index % 2 === 0
                                  ? colors.background.table.row
                                  : colors.background.table.rowEven,
                            }}
                          >
                            <td style={{ padding: '9px 12px', fontSize: 13 }}>{employee.empCode || '-'}</td>
                            <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 600 }}>
                              {employee.name || '-'}
                            </td>
                            <td style={{ padding: '9px 12px', fontSize: 13 }}>{employee.department || '-'}</td>
                            <td style={{ padding: '9px 12px', fontSize: 13 }}>{employee.designation || '-'}</td>
                            <td style={{ padding: '9px 12px', fontSize: 13 }}>{employee.shift || '-'}</td>
                            <td style={{ padding: '9px 12px', fontSize: 13 }}>
                              {employee.monthlySalary != null ? Number(employee.monthlySalary).toLocaleString() : '-'}
                            </td>
                            <td style={{ padding: '9px 12px', fontSize: 13 }}>{employee.saturdayGroup || '-'}</td>
                            <td style={{ padding: '9px 12px', fontSize: 13 }}>{employee.email || '-'}</td>
                          </tr>
                        ))),
                  ])
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            currentPage={page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            itemsPerPage={pagination.limit}
            onPageChange={setPage}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
