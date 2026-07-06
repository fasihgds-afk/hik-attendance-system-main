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

function buildGrossByMonth(months, currentGross, salaryHistory, apiGrossByMonth) {
  const sorted = [...(salaryHistory || [])].sort((a, b) =>
    String(a.effectiveMonth).localeCompare(String(b.effectiveMonth))
  );
  const result = {};

  months.forEach((month) => {
    let gross = Number(currentGross) || 0;
    const applicable = sorted.filter((h) => String(h.effectiveMonth) <= month);
    const upcoming = sorted.find((h) => String(h.effectiveMonth) > month);

    if (applicable.length > 0) {
      gross = Number(applicable[applicable.length - 1].amount);
    } else if (upcoming) {
      gross = Number(upcoming.previousAmount) || gross;
    }

    const fromApi = Number(apiGrossByMonth[month]);
    if (Number.isFinite(fromApi) && fromApi > 0) {
      gross = fromApi;
    }

    result[month] = gross;
  });

  return result;
}

function buildRaiseInfo(months, grossByMonth, salaryHistory = []) {
  const raisedMonths = [];
  const raiseDetails = {};
  const monthSet = new Set(months);

  (salaryHistory || []).forEach((entry) => {
    if (
      entry?.effectiveMonth &&
      monthSet.has(entry.effectiveMonth) &&
      Number(entry.amount) > Number(entry.previousAmount || 0)
    ) {
      raisedMonths.push(entry.effectiveMonth);
      raiseDetails[entry.effectiveMonth] = {
        from: Number(entry.previousAmount || 0),
        to: Number(entry.amount),
      };
    }
  });

  for (let i = 1; i < months.length; i += 1) {
    const prev = months[i - 1];
    const cur = months[i];
    const prevG = Number(grossByMonth[prev]);
    const curG = Number(grossByMonth[cur]);
    if (prevG > 0 && curG > prevG && !raiseDetails[cur]) {
      raisedMonths.push(cur);
      raiseDetails[cur] = { from: prevG, to: curG };
    }
  }

  return {
    hasSalaryRaise: raisedMonths.length > 0,
    raisedMonths: [...new Set(raisedMonths)],
    raiseDetails,
  };
}

function SalaryRaiseBadge({ children, variant = 'raise', title }) {
  const variants = {
    raise: {
      background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
      color: '#92400e',
      border: '1px solid #f59e0b',
      boxShadow: '0 1px 4px rgba(245, 158, 11, 0.35)',
    },
    raised: {
      background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
      color: '#166534',
      border: '1px solid #22c55e',
      boxShadow: '0 1px 4px rgba(34, 197, 94, 0.35)',
    },
    month: {
      background: 'linear-gradient(135deg, #ffedd5, #fed7aa)',
      color: '#9a3412',
      border: '1px solid #f97316',
      boxShadow: '0 1px 4px rgba(249, 115, 22, 0.35)',
    },
    stable: {
      background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)',
      color: '#475569',
      border: '1px solid #94a3b8',
      boxShadow: '0 1px 3px rgba(148, 163, 184, 0.3)',
    },
    gross: {
      background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
      color: '#1e40af',
      border: '1px solid #3b82f6',
      boxShadow: '0 1px 4px rgba(59, 130, 246, 0.35)',
    },
  };
  const v = variants[variant] || variants.raise;

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        borderRadius: 999,
        padding: '2px 7px',
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        ...v,
      }}
    >
      {children}
    </span>
  );
}

const RAISE_ROW_BG = 'rgba(34, 197, 94, 0.14)';
const RAISE_CELL_BG = 'rgba(34, 197, 94, 0.28)';
const RAISE_EXCEL_FILL = 'FFBBF7D0';

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
      const grossMap = new Map();
      const metaMap = new Map();

      monthResults.forEach(({ month, employees }) => {
        employees.forEach((emp) => {
          const code = String(emp.empCode);
          if (!salaryMap.has(code)) salaryMap.set(code, {});
          if (!grossMap.has(code)) grossMap.set(code, {});
          salaryMap.get(code)[month] = emp.netSalary ?? 0;
          grossMap.get(code)[month] =
            emp.recordedMonthlySalary ?? emp.monthlySalary ?? 0;
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
        const empOpt = employeeOptions.find((e) => String(e.empCode) === code);
        const monthSalaries = salaryMap.get(code) || {};
        const monthGrossSalaries = grossMap.get(code) || {};
        const grossSalary = empOpt?.monthlySalary ?? null;
        const grossByMonth = buildGrossByMonth(
          months,
          grossSalary,
          empOpt?.salaryHistory,
          monthGrossSalaries
        );
        const { hasSalaryRaise, raisedMonths, raiseDetails } = buildRaiseInfo(
          months,
          grossByMonth,
          empOpt?.salaryHistory
        );
        let total = 0;
        months.forEach((m) => {
          const val = Number(monthSalaries[m]);
          if (Number.isFinite(val)) total += val;
        });
        return {
          empCode: meta.empCode,
          name: meta.name,
          department: meta.department,
          grossSalary,
          monthSalaries,
          monthGrossSalaries,
          hasSalaryRaise,
          raisedMonths,
          raiseDetails,
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
        { header: 'Gross Salary / Month', key: 'grossSalary', width: 18 },
        { header: 'Salary Raised?', key: 'salaryRaised', width: 14 },
        ...reportMonths.map((m) => ({
          header: `${monthLabel(m)} (Net)`,
          key: m,
          width: 14,
        })),
        { header: 'Total Net', key: 'total', width: 14 },
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
          grossSalary: row.grossSalary ?? '',
          salaryRaised: row.hasSalaryRaise ? 'Yes' : 'No',
          total: row.total,
        };
        reportMonths.forEach((m) => {
          const isRaise = Array.isArray(row.raisedMonths) && row.raisedMonths.includes(m);
          const detail = row.raiseDetails?.[m];
          let val = row.monthSalaries[m] ?? '';
          if (isRaise && detail) {
            val = `${val} [↑ ${detail.from} → ${detail.to}]`;
          } else if (isRaise) {
            val = `${val} [RAISE]`;
          }
          rowData[m] = val;
        });
        const excelRow = sheet.addRow(rowData);
        const rowFill = row.hasSalaryRaise ? RAISE_EXCEL_FILL : idx % 2 === 1 ? 'FFF3F4F6' : null;
        if (rowFill) {
          excelRow.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: rowFill },
            };
          });
        }
        reportMonths.forEach((m) => {
          const cell = excelRow.getCell(m);
          if (cell.value !== '' && cell.value != null) {
            cell.numFmt = '#,##0';
            cell.alignment = { horizontal: 'right' };
          }
          if (row.raisedMonths?.includes?.(m)) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF86EFAC' },
            };
            cell.font = { bold: true };
          }
        });
        excelRow.getCell('grossSalary').numFmt = '#,##0';
        excelRow.getCell('grossSalary').alignment = { horizontal: 'right' };
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
              Net salary paid (after deductions) · gross salary column · raise highlights
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
            <div
              style={{
                padding: '10px 16px',
                fontSize: 12,
                color: colors.text.secondary,
                borderBottom: `1px solid ${colors.border.default}`,
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: RAISE_ROW_BG,
                    border: '1px solid #22c55e',
                    verticalAlign: 'middle',
                    marginRight: 6,
                  }}
                />
                Raise is shown only when gross salary changed in Employee Manager (with effective month)
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: RAISE_CELL_BG,
                    border: '1px solid #f97316',
                    verticalAlign: 'middle',
                    marginRight: 6,
                  }}
                />
                Orange badge = month gross went up (e.g. 48,000 → 52,000)
              </span>
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
                    <th style={{ ...thStyle, textAlign: 'right' }}>
                      Gross Salary
                      <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.9 }}>/ Month</div>
                    </th>
                    {reportMonths.length > 1 && (
                      <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
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
                  {reportRows.map((row, idx) => {
                    const rowBg = row.hasSalaryRaise
                      ? RAISE_ROW_BG
                      : idx % 2 === 0
                        ? colors.background.table.row
                        : colors.background.tertiary;
                    return (
                    <tr key={row.empCode}>
                      <td
                        style={{
                          ...tdStyle,
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                          backgroundColor: rowBg,
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
                          backgroundColor: rowBg,
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {row.name}
                          {row.hasSalaryRaise && (
                            <SalaryRaiseBadge variant="raised" title="Salary raised in this period">
                              ↑ Salary Raised
                            </SalaryRaiseBadge>
                          )}
                        </span>
                      </td>
                      {reportMonths.length > 1 && (
                        <td style={{ ...tdStyle, backgroundColor: rowBg }}>{row.department || '-'}</td>
                      )}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          backgroundColor: rowBg,
                        }}
                      >
                        {row.grossSalary != null ? formatCurrency(row.grossSalary) : '-'}
                      </td>
                      {reportMonths.length > 1 && (
                        <td style={{ ...tdStyle, textAlign: 'center', backgroundColor: rowBg }}>
                          {row.hasSalaryRaise ? (
                            <SalaryRaiseBadge variant="raised">↑ Raised</SalaryRaiseBadge>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                          )}
                        </td>
                      )}
                      {reportMonths.map((m) => {
                        const isRaiseMonth = Array.isArray(row.raisedMonths) && row.raisedMonths.includes(m);
                        const detail = row.raiseDetails?.[m];
                        return (
                        <td
                          key={m}
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            backgroundColor: isRaiseMonth ? RAISE_CELL_BG : rowBg,
                            fontWeight: isRaiseMonth ? 700 : 400,
                            color: isRaiseMonth ? '#15803d' : tdStyle.color,
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <span>
                              {row.monthSalaries[m] != null ? formatCurrency(row.monthSalaries[m]) : '-'}
                            </span>
                            {isRaiseMonth && detail && (
                              <SalaryRaiseBadge
                                variant="month"
                                title={`Gross salary raised from ${formatCurrency(detail.from)} to ${formatCurrency(detail.to)}`}
                              >
                                ↑ {formatCurrency(detail.from)} → {formatCurrency(detail.to)}
                              </SalaryRaiseBadge>
                            )}
                          </div>
                        </td>
                        );
                      })}
                      {reportMonths.length > 1 && (
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', backgroundColor: rowBg }}>
                          {formatCurrency(row.total)}
                        </td>
                      )}
                    </tr>
                    );
                  })}
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
