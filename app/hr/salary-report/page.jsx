'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import ExcelJS from 'exceljs';
import { useTheme } from '@/lib/theme/ThemeContext';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatCurrency(value) {
  if (value == null || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return ym;
  return `${MONTH_NAMES[idx]} ${y}`;
}

function getMonthsInYear(year) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const maxMonth = year === currentYear ? currentMonth : 12;
  const months = [];
  for (let m = 1; m <= maxMonth; m += 1) {
    months.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

async function fetchAllEmployees() {
  const all = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const res = await fetch(`/api/hr/employees?limit=50&page=${page}`, { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Failed to load employees (${res.status})`);
    }
    const response = await res.json();
    const list = response.data?.employees || response.employees || [];
    all.push(...list);
    hasNext = response.meta?.hasNext ?? false;
    page += 1;
  }

  return all;
}

async function fetchMonthSalaries(month) {
  const res = await fetch(`/api/hr/monthly-attendance?month=${month}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to load ${month}`);
  }
  const response = await res.json();
  let data = {};
  if (response.success !== undefined) {
    if (!response.success) {
      throw new Error(response.error || response.message || `Failed to load ${month}`);
    }
    data = response.data || {};
  } else {
    data = response;
  }
  return data.employees || [];
}

export default function HrSalaryReportPage() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  const printRef = useRef(null);

  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000,
    warningTime: 5 * 60 * 1000,
    enabled: true,
  });

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login?role=hr' });
      router.push('/login?role=hr');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login?role=hr');
    }
  };

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [monthMode, setMonthMode] = useState('all');
  const [singleMonthNum, setSingleMonthNum] = useState(() => {
    const m = new Date().getMonth() + 1;
    return String(Math.max(1, m - 1)).padStart(2, '0');
  });
  const [employeeMode, setEmployeeMode] = useState('all');
  const [selectedEmpCode, setSelectedEmpCode] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportMonths, setReportMonths] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [toast, setToast] = useState({ type: '', text: '' });

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 3000);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      try {
        setLoadingEmployees(true);
        const list = await fetchAllEmployees();
        if (!cancelled) {
          setEmployeeOptions(list);
          if (list.length > 0 && !selectedEmpCode) {
            setSelectedEmpCode(String(list[0].empCode));
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          showToast('error', err.message || 'Failed to load employees');
        }
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    }
    loadEmployees();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableMonths = useMemo(() => getMonthsInYear(year), [year]);

  const thStyle = {
    padding: '10px 12px',
    textAlign: 'left',
    borderBottom: `1px solid ${colors.border.table}`,
    fontWeight: 600,
    fontSize: 12,
    color: theme === 'dark' ? '#ffffff' : colors.text.table.header,
    backgroundColor: theme === 'dark' ? colors.primary[800] : colors.primary[500],
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 2,
  };

  const tdStyle = {
    padding: '8px 12px',
    borderBottom: `1px solid ${colors.border.table}`,
    fontSize: 12,
    color: colors.text.table.cell,
    backgroundColor: colors.background.table.row,
    whiteSpace: 'nowrap',
  };

  async function loadReport() {
    const months =
      monthMode === 'all'
        ? availableMonths
        : [`${year}-${singleMonthNum}`];

    if (months.length === 0) {
      showToast('error', 'No months available for the selected year');
      return;
    }

    if (employeeMode === 'single' && !selectedEmpCode) {
      showToast('error', 'Please select an employee');
      return;
    }

    try {
      setLoadingReport(true);
      setReportRows([]);
      setReportMonths([]);

      const monthResults = await Promise.all(
        months.map(async (m) => {
          const employees = await fetchMonthSalaries(m);
          return { month: m, employees };
        })
      );

      const salaryMap = new Map();
      const metaMap = new Map();

      monthResults.forEach(({ month, employees }) => {
        employees.forEach((emp) => {
          const code = String(emp.empCode);
          if (!salaryMap.has(code)) salaryMap.set(code, {});
          salaryMap.get(code)[month] = emp.netSalary ?? 0;
          if (!metaMap.has(code)) {
            metaMap.set(code, {
              empCode: emp.empCode,
              name: emp.name || '',
              department: emp.department || '',
            });
          }
        });
      });

      let codes = Array.from(salaryMap.keys());
      if (employeeMode === 'single') {
        codes = codes.filter((c) => c === String(selectedEmpCode));
        if (codes.length === 0 && selectedEmpCode) {
          const opt = employeeOptions.find((e) => String(e.empCode) === String(selectedEmpCode));
          codes = [String(selectedEmpCode)];
          metaMap.set(String(selectedEmpCode), {
            empCode: selectedEmpCode,
            name: opt?.name || '',
            department: opt?.department || '',
          });
          salaryMap.set(String(selectedEmpCode), {});
        }
      } else {
        employeeOptions.forEach((emp) => {
          const code = String(emp.empCode);
          if (!metaMap.has(code)) {
            metaMap.set(code, {
              empCode: emp.empCode,
              name: emp.name || '',
              department: emp.department || '',
            });
          }
          if (!salaryMap.has(code)) salaryMap.set(code, {});
        });
        codes = employeeOptions.map((e) => String(e.empCode));
      }

      codes.sort((a, b) => {
        const na = metaMap.get(a)?.name || a;
        const nb = metaMap.get(b)?.name || b;
        return na.localeCompare(nb);
      });

      const rows = codes.map((code) => {
        const meta = metaMap.get(code) || { empCode: code, name: '', department: '' };
        const monthSalaries = salaryMap.get(code) || {};
        let total = 0;
        months.forEach((m) => {
          const val = Number(monthSalaries[m]);
          if (Number.isFinite(val)) total += val;
        });
        return {
          empCode: meta.empCode,
          name: meta.name,
          department: meta.department,
          monthSalaries,
          total,
        };
      });

      setReportMonths(months);
      setReportRows(rows);
      showToast('success', `Loaded net salary for ${rows.length} employee(s)`);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load salary report');
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleExportExcel() {
    if (reportRows.length === 0) {
      showToast('error', 'Load a report first');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Global Digital Solutions';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet(`Net Salary ${year}`);

      const columns = [
        { header: 'Emp Code', key: 'empCode', width: 12 },
        { header: 'Employee Name', key: 'name', width: 28 },
        { header: 'Department', key: 'department', width: 18 },
        ...reportMonths.map((m) => ({
          header: `${monthLabel(m)} (Net)`,
          key: m,
          width: 14,
        })),
        { header: 'Total', key: 'total', width: 14 },
      ];
      sheet.columns = columns;

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      reportRows.forEach((row, idx) => {
        const rowData = {
          empCode: row.empCode,
          name: row.name,
          department: row.department,
          total: row.total,
        };
        reportMonths.forEach((m) => {
          rowData[m] = row.monthSalaries[m] ?? '';
        });
        const excelRow = sheet.addRow(rowData);
        if (idx % 2 === 1) {
          excelRow.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF3F4F6' },
            };
          });
        }
        reportMonths.forEach((m) => {
          const cell = excelRow.getCell(m);
          if (cell.value !== '' && cell.value != null) {
            cell.numFmt = '#,##0';
            cell.alignment = { horizontal: 'right' };
          }
        });
        excelRow.getCell('total').numFmt = '#,##0';
        excelRow.getCell('total').alignment = { horizontal: 'right' };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const suffix =
        monthMode === 'all'
          ? `${year}-all-months`
          : `${year}-${singleMonthNum}`;
      link.download = `net-salary-report-${suffix}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', 'Excel downloaded');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to export Excel');
    }
  }

  async function handleExportPdf() {
    if (reportRows.length === 0) {
      showToast('error', 'Load a report first');
      return;
    }
    const el = printRef.current;
    if (!el) {
      showToast('error', 'Report content not found');
      return;
    }

    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
      const suffix =
        monthMode === 'all'
          ? `${year}-all-months`
          : `${year}-${singleMonthNum}`;
      const filename = `net-salary-report-${suffix}.pdf`;

      await html2pdf()
        .set({
          margin: [0.4, 0.4, 0.4, 0.4],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'cm', format: 'a4', orientation: reportMonths.length > 4 ? 'landscape' : 'portrait' },
        })
        .from(el)
        .save();
      showToast('success', 'PDF downloaded');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to export PDF');
    }
  }

  const hasReport = reportRows.length > 0;

  return (
    <>
      {showWarning && (
        <AutoLogoutWarning
          timeRemaining={timeRemaining ?? 0}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={autoLogout}
        />
      )}

      <div
        style={{
          minHeight: '100vh',
          padding: '20px 24px',
          background: colors.background.page,
          color: colors.text.primary,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
            padding: '16px 20px',
            borderRadius: 16,
            background: colors.gradient.primary,
            border: `1px solid ${colors.border.default}`,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Salary Report
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '4px 0 0' }}>
              Net salary paid to employees (after deductions)
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => router.push('/hr/employees')}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.1)',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              HR Home
            </button>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.1)',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 14,
            background: colors.background.card,
            border: `1px solid ${colors.border.default}`,
            marginBottom: 20,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'flex-end',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>
              Year
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${colors.border.default}`,
                background: colors.background.input,
                color: colors.text.primary,
                fontSize: 13,
                minWidth: 100,
              }}
            >
              {[year - 2, year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>
              Month
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={monthMode}
                onChange={(e) => setMonthMode(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.default}`,
                  background: colors.background.input,
                  color: colors.text.primary,
                  fontSize: 13,
                }}
              >
                <option value="all">All months</option>
                <option value="single">One month</option>
              </select>
              {monthMode === 'single' && (
                <select
                  value={singleMonthNum}
                  onChange={(e) => setSingleMonthNum(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 13,
                  }}
                >
                  {availableMonths.map((ym) => {
                    const m = ym.split('-')[1];
                    return (
                      <option key={ym} value={m}>
                        {monthLabel(ym)}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: colors.text.secondary, marginBottom: 6 }}>
              Employee
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={employeeMode}
                onChange={(e) => setEmployeeMode(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.default}`,
                  background: colors.background.input,
                  color: colors.text.primary,
                  fontSize: 13,
                }}
              >
                <option value="all">All employees</option>
                <option value="single">One employee</option>
              </select>
              {employeeMode === 'single' && (
                <select
                  value={selectedEmpCode}
                  onChange={(e) => setSelectedEmpCode(e.target.value)}
                  disabled={loadingEmployees}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 13,
                    minWidth: 220,
                  }}
                >
                  {employeeOptions.map((emp) => (
                    <option key={emp.empCode} value={emp.empCode}>
                      {emp.empCode} — {emp.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={loadReport}
            disabled={loadingReport}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: loadingReport ? 'not-allowed' : 'pointer',
              opacity: loadingReport ? 0.7 : 1,
            }}
          >
            {loadingReport ? 'Loading…' : 'View Report'}
          </button>

          {hasReport && (
            <>
              <button
                type="button"
                onClick={handleExportExcel}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.default}`,
                  background: colors.background.tertiary,
                  color: colors.text.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Download Excel
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: `1px solid ${colors.border.default}`,
                  background: colors.background.tertiary,
                  color: colors.text.primary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Download PDF
              </button>
            </>
          )}
        </div>

        {/* Report table */}
        <div
          style={{
            borderRadius: 14,
            border: `1px solid ${colors.border.default}`,
            background: colors.background.card,
            overflow: 'hidden',
          }}
        >
          {!hasReport && !loadingReport && (
            <div style={{ padding: 40, textAlign: 'center', color: colors.text.secondary, fontSize: 14 }}>
              Select filters and click <strong>View Report</strong> to see net salary.
            </div>
          )}

          {loadingReport && (
            <div style={{ padding: 40, textAlign: 'center', color: colors.text.secondary, fontSize: 14 }}>
              Loading salary data…
            </div>
          )}

          {hasReport && (
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
              <div
                ref={printRef}
                style={{ background: '#ffffff', padding: reportMonths.length > 1 ? 16 : 8, color: '#111827' }}
              >
                <div style={{ marginBottom: 12, display: reportMonths.length > 1 ? 'block' : 'none' }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Net Salary Report — {year}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Amount paid to employees after deductions
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 3 }}>Emp Code</th>
                    <th style={{ ...thStyle, position: 'sticky', left: 72, zIndex: 3, minWidth: 160 }}>Employee Name</th>
                    {reportMonths.length > 1 && (
                      <th style={thStyle}>Department</th>
                    )}
                    {reportMonths.map((m) => (
                      <th key={m} style={{ ...thStyle, textAlign: 'right' }}>
                        {monthLabel(m)}
                        <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.9 }}>Net Salary</div>
                      </th>
                    ))}
                    {reportMonths.length > 1 && (
                      <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row, idx) => (
                    <tr key={row.empCode}>
                      <td
                        style={{
                          ...tdStyle,
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                          backgroundColor: idx % 2 === 0 ? colors.background.table.row : colors.background.tertiary,
                          fontWeight: 600,
                        }}
                      >
                        {row.empCode}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          position: 'sticky',
                          left: 72,
                          zIndex: 1,
                          backgroundColor: idx % 2 === 0 ? colors.background.table.row : colors.background.tertiary,
                          fontWeight: 600,
                        }}
                      >
                        {row.name}
                      </td>
                      {reportMonths.length > 1 && (
                        <td style={tdStyle}>{row.department || '-'}</td>
                      )}
                      {reportMonths.map((m) => (
                        <td key={m} style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {row.monthSalaries[m] != null ? formatCurrency(row.monthSalaries[m]) : '-'}
                        </td>
                      ))}
                      {reportMonths.length > 1 && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(row.total)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        {toast.text && (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              padding: '12px 18px',
              borderRadius: 10,
              background: toast.type === 'error' ? '#dc2626' : '#16a34a',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              zIndex: 9999,
            }}
          >
            {toast.text}
          </div>
        )}
      </div>
    </>
  );
}
