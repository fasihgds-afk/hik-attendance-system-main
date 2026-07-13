'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import PaginationControls from '@/components/common/PaginationControls';
import { api } from '@/lib/api/client';
import { getCachedLookup, LOOKUP_KEYS } from '@/lib/api/lookupCache';

export default function EmployeeDirectoryPage() {
  const router = useRouter();
  const { colors, theme } = useTheme();
  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);
  const isDark = theme === 'dark';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [collapsedDepartments, setCollapsedDepartments] = useState({});
  const [departments, setDepartments] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const skipSearchPageReset = useRef(true);

  const loadDepartments = useCallback(async () => {
    try {
      const list = await getCachedLookup(LOOKUP_KEYS.departments, async () => {
        const response = await api.get('/api/hr/departments', {
          requestKey: 'hr-departments',
        });
        if (!response.success) return [];
        return response.data?.departments ?? [];
      });
      setDepartments(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('Failed to load departments:', error);
      setDepartments([]);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: '50',
      });
      if (searchQuery) params.set('search', searchQuery);
      if (selectedDepartment && selectedDepartment !== 'ALL') {
        params.set('department', selectedDepartment);
      }

      const response = await api.get(`/api/hr/employees?${params.toString()}`, {
        requestKey: 'hr-directory-list',
      });

      if (response.aborted) return;

      if (!response.success) {
        throw new Error(response.error || 'Failed to load employees');
      }

      const items = response.data?.employees || [];
      const meta = response.meta || {};
      setRows(items);
      setPagination({
        page: meta.page || currentPage,
        limit: meta.limit || 50,
        total: meta.total || items.length,
        totalPages: meta.totalPages || 1,
      });
    } catch (error) {
      console.error('Directory load error:', error);
      setRows([]);
      setPagination({ page: 1, limit: 50, total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, selectedDepartment]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      if (skipSearchPageReset.current) {
        skipSearchPageReset.current = false;
      } else {
        setCurrentPage(1);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

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
          const designationA = String(a.designation || '').toLowerCase();
          const designationB = String(b.designation || '').toLowerCase();
          const rankA = designationA.includes('manager') ? 0 : designationA.includes('team lead') ? 1 : 2;
          const rankB = designationB.includes('manager') ? 0 : designationB.includes('team lead') ? 1 : 2;
          if (rankA !== rankB) return rankA - rankB;
          return String(a.empCode || '').localeCompare(String(b.empCode || ''));
        }),
      }));
  }, [rows]);

  const departmentCount = useMemo(
    () => new Set(rows.map((employee) => employee.department || 'Unassigned')).size,
    [rows]
  );

  const departmentChips = useMemo(() => {
    const names = departments
      .map((d) => (typeof d === 'string' ? d : d?.name))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return names.length > 0
      ? names
      : rowsByDepartment.map((g) => g.departmentName);
  }, [departments, rowsByDepartment]);

  useEffect(() => {
    setCollapsedDepartments((prev) => {
      const next = {};
      rowsByDepartment.forEach((group) => {
        next[group.departmentName] = prev[group.departmentName] ?? false;
      });
      return next;
    });
  }, [rowsByDepartment]);

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

  const chipStyle = (active) => ({
    ...glossPill('neutral'),
    padding: '6px 10px',
    borderRadius: 999,
    border: `1px solid ${active ? (colors.primary?.[500] ?? '#3b82f6') : (colors.glass?.border ?? colors.border?.default)}`,
    backgroundColor: active
      ? (isDark ? 'rgba(59, 130, 246, 0.2)' : colors.background?.secondary)
      : 'transparent',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
  });

  const headerActions = (
    <HrHeaderActions>
      <button
        type="button"
        onClick={() => loadEmployees()}
        disabled={loading}
        className="directory-button"
        style={{
          ...glossPill('neutral'),
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Refreshing…' : '⟳ Refresh'}
      </button>
      <button
        type="button"
        onClick={() => router.push('/hr/employees')}
        className="directory-button"
        style={glossPill('neutral')}
      >
        Back to HR Hub
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell
      subtitle="Employee Directory · Read-only HR view with searchable employee details"
      actions={headerActions}
    >
      <GlassCard style={{ marginTop: 18 }} padding={20}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ padding: 10, borderRadius: 10, background: colors.background?.secondary }}>
            <div style={{ fontSize: 11, color: colors.text?.muted }}>Employees on This Page</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.text?.primary }}>{rows.length}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: colors.background?.secondary }}>
            <div style={{ fontSize: 11, color: colors.text?.muted }}>Total Employees</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.text?.primary }}>{pagination.total}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 10, background: colors.background?.secondary }}>
            <div style={{ fontSize: 11, color: colors.text?.muted }}>Departments in View</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.text?.primary }}>{departmentCount}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
            }}
            placeholder="Search by code, name, email..."
            style={{
              minWidth: 260,
              flex: '1 1 280px',
              padding: '9px 12px',
              borderRadius: 10,
              border: `1px solid ${colors.border?.input ?? colors.border?.default}`,
              backgroundColor: colors.background?.input ?? colors.background?.card,
              color: colors.text?.primary,
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              setSelectedDepartment('ALL');
              setCurrentPage(1);
            }}
            style={chipStyle(selectedDepartment === 'ALL')}
          >
            All Departments
          </button>
          {departmentChips.map((name) => (
            <button
              key={`chip-${name}`}
              type="button"
              onClick={() => {
                setSelectedDepartment(name);
                setCurrentPage(1);
              }}
              style={chipStyle(selectedDepartment === name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setAllDepartmentsCollapsed(false)}
            style={glossPill('slate')}
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={() => setAllDepartmentsCollapsed(true)}
            style={glossPill('slate')}
          >
            Collapse All
          </button>
        </div>

        <div className="directory-table-wrapper hr-table-scroll table-responsive" style={{ width: '100%' }}>
          <table
            style={{
              width: '100%',
              minWidth: 1080,
              borderCollapse: 'collapse',
              borderRadius: 10,
              overflow: 'hidden',
              border: `1px solid ${colors.border?.table ?? colors.border?.default}`,
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
                      color: colors.text?.table?.header ?? colors.text?.primary,
                      backgroundColor: colors.background?.table?.header ?? colors.background?.secondary,
                      borderBottom: `1px solid ${colors.border?.table ?? colors.border?.default}`,
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
                      color: colors.text?.muted,
                      backgroundColor: colors.background?.table?.row,
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
                      color: colors.text?.muted,
                      backgroundColor: colors.background?.table?.row,
                    }}
                  >
                    No employees found for this search.
                  </td>
                </tr>
              ) : (
                rowsByDepartment.flatMap((group) => [
                  <tr key={`group-${group.departmentName}`}>
                    <td
                      colSpan={8}
                      style={{
                        padding: '10px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: colors.text?.primary,
                        backgroundColor: colors.background?.table?.header,
                        borderTop: `1px solid ${colors.border?.table ?? colors.border?.default}`,
                        borderBottom: `1px solid ${colors.border?.table ?? colors.border?.default}`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleDepartment(group.departmentName)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: colors.text?.primary,
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
                    : group.employees.map((employee, index) => {
                        const rowBase =
                          index % 2 === 0
                            ? colors.background?.table?.row
                            : colors.background?.table?.rowEven;
                        const rowHover = colors.background?.table?.rowHover;
                        const cellStyle = {
                          padding: '9px 12px',
                          fontSize: 13,
                          color: colors.text?.primary,
                          backgroundColor: rowBase,
                        };

                        return (
                        <tr
                          key={employee._id || `${group.departmentName}-${employee.empCode}-${index}`}
                          className="hr-employee-row"
                          style={{
                            backgroundColor: rowBase,
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = rowHover;
                            e.currentTarget.querySelectorAll('td').forEach((td) => {
                              td.style.backgroundColor = rowHover;
                            });
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = rowBase;
                            e.currentTarget.querySelectorAll('td').forEach((td) => {
                              td.style.backgroundColor = rowBase;
                            });
                          }}
                        >
                          <td style={cellStyle}>{employee.empCode || '-'}</td>
                          <td style={{ ...cellStyle, fontWeight: 600 }}>{employee.name || '-'}</td>
                          <td style={cellStyle}>{employee.department || '-'}</td>
                          <td style={cellStyle}>{employee.designation || '-'}</td>
                          <td style={cellStyle}>{employee.shift || '-'}</td>
                          <td style={cellStyle}>
                            {employee.monthlySalary != null ? Number(employee.monthlySalary).toLocaleString() : '-'}
                          </td>
                          <td style={cellStyle}>{employee.saturdayGroup || '-'}</td>
                          <td style={cellStyle}>{employee.email || '-'}</td>
                        </tr>
                        );
                      })),
                ])
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={pagination.page || currentPage}
          totalPages={pagination.totalPages || 1}
          totalItems={pagination.total || 0}
          itemsPerPage={pagination.limit || 50}
          onPageChange={setCurrentPage}
          loading={loading}
        />
      </GlassCard>
    </HrPageShell>
  );
}
