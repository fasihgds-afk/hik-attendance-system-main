// next-app/app/hr/dashboard/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import ExcelJS from 'exceljs';
import { useTheme } from '@/lib/theme/ThemeContext';
import { getTableStyles, getGlossPillStyles, spinnerRingStyle } from '@/lib/theme/styles';
import {
  HrPageShell,
  HrHeaderActions,
  HrHeaderBadge,
  GlassCard,
  GlassTable,
  GlassInput,
  GlassButton,
} from '@/components/glass';
import { useAutoLogout } from '@/hooks/useAutoLogout';
import AutoLogoutWarning from '@/components/ui/AutoLogoutWarning';
import { usePermissions } from '@/hooks/usePermissions';

// Styles will be generated dynamically based on theme

// Time-only formatter for Check In / Check Out
function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function HrDashboardPage() {
  // ALL HOOKS MUST BE CALLED FIRST, IN THE SAME ORDER
  const { colors, theme } = useTheme(); // Theme colors
  const router = useRouter();
  const { canCreate, canExport, ready } = usePermissions('dailyAttendance');
  
  // Auto logout after 30 minutes of inactivity (with 5 minute warning)
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000, // 30 minutes
    warningTime: 5 * 60 * 1000, // 5 minutes warning
    enabled: true,
  });
  
  // Manual logout handler
  const handleLogout = async () => {
    try {
      await signOut({ 
        redirect: false,
        callbackUrl: '/login?role=hr'
      });
      router.push('/login?role=hr');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login?role=hr');
    }
  };
  
  const [businessDate, setBusinessDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // YYYY-MM-DD
  });
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(''); // Filter by shift


  const [toast, setToast] = useState({ type: '', text: '' });

  const tableStyles = getTableStyles(colors);
  const thStyle = tableStyles.th;
  const tdStyle = tableStyles.td;

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 2600);
  }

  async function loadShifts() {
    try {
      const res = await fetch('/api/hr/shifts?activeOnly=true');
      if (res.ok) {
        const response = await res.json();
        
        // Handle standardized API response format
        let shifts = [];
        if (response.success !== undefined) {
          if (!response.success) {
            console.error('Failed to load shifts:', response.error || response.message);
            return;
          }
          shifts = response.data?.shifts || [];
        } else {
          // Legacy format (backward compatibility)
          shifts = response.shifts || [];
        }
        
        setShifts(shifts);
      }
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  }

  useEffect(() => {
    loadShifts();
  }, []);

  // Auto-run Load and Save every 20 minutes (only when user can create/sync)
  useEffect(() => {
    if (!ready || !canCreate) return;

    // Run immediately on mount
    handleLoadAndSave();

    // Set up interval to run every 20 minutes (1200000 milliseconds)
    const interval = setInterval(() => {
      handleLoadAndSave();
    }, 20 * 60 * 1000); // 20 minutes in milliseconds

    // Cleanup interval on unmount
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessDate, ready, canCreate]); // Re-run when business date or permission changes


  async function handleLoadAndSave() {
    setLoading(true);
    setStatus('');
    setRows([]);

    try {
      const res = await fetch(
        `/api/hr/daily-attendance?date=${businessDate}`,
        { method: 'POST' }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }

      const response = await res.json();
      
      // Handle standardized API response format
      // New format: { success, message, data: { items, savedCount, date }, error }
      // Old format (backward compatibility): { items, savedCount, date }
      let items = [];
      let savedCount = 0;
      let date = businessDate;
      
      if (response.success !== undefined) {
        // New standardized format
        if (!response.success) {
          throw new Error(response.error || response.message || 'Failed to load and save');
        }
        items = response.data?.items || [];
        savedCount = response.data?.savedCount ?? items.length;
        date = response.data?.date || businessDate;
      } else {
        // Legacy format (backward compatibility)
        items = response.items || [];
        savedCount = response.savedCount ?? items.length;
        date = response.date || businessDate;
      }
      
      setRows(items);
      const msg = `Saved ${savedCount} record(s) for ${date}`;
      setStatus(msg);
      showToast('success', msg);
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  // ---------- summary counts by shift (only Present) ----------
  const totals = rows.reduce(
    (acc, r) => {
      const isPresent =
        (r.attendanceStatus && r.attendanceStatus === 'Present') ||
        (r.totalPunches && r.totalPunches > 0);

      if (isPresent && r.shift) {
        acc[r.shift] = (acc[r.shift] || 0) + 1;
      }
      return acc;
    },
    {}
  );

  // Extra lightweight stats (UI only)
  const presentCount = rows.reduce((count, r) => {
    const isPresent =
      (r.attendanceStatus && r.attendanceStatus === 'Present') ||
      (r.totalPunches && r.totalPunches > 0);
    return isPresent ? count + 1 : count;
  }, 0);

  const totalRecords = rows.length;
  const absentCount = totalRecords - presentCount;
  const departmentCount = new Set(
    rows.map((r) => r.department || 'Unassigned')
  ).size;

  // ---------- SEARCH FILTER (table only, stats still use full rows) ----------
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredRows = rows.filter((r) => {
    // Shift filter
    if (selectedShift && r.shift !== selectedShift) {
      return false;
    }
    
    // Search filter
    if (normalizedSearch) {
      const text = [
        r.empCode,
        r.employeeName,
        r.name,
        r.department,
        r.designation,
        r.shift,
        r.attendanceStatus,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(normalizedSearch);
    }
    
    return true;
  });

  // ---------- Department ordering & manager / TL on top ----------

  const DEPARTMENT_ORDER = [
    'Youtube',
    'IT',
    'Marketing & SEO',
    'Development',
    'Lead Qualification',
    'RND',
    'Sales',
    'Writing',
    'Quality Assurance',
  ];

  const deptPriority = DEPARTMENT_ORDER.reduce((acc, name, idx) => {
    acc[name] = idx;
    return acc;
  }, {});

  // group filtered rows by department
  const groupedByDept = filteredRows.reduce((acc, row) => {
    const dept = row.department || 'Unassigned';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(row);
    return acc;
  }, {});

  const rowsWithHeaders = [];

  const sortedDeptNames = Object.keys(groupedByDept).sort((a, b) => {
    const pa = deptPriority[a] ?? 999;
    const pb = deptPriority[b] ?? 999;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  const getDesignationRank = (designation = '') => {
    const d = designation.toLowerCase();
    if (d.includes('manager')) return 0;
    if (d.includes('team lead')) return 1;
    return 2;
  };

  sortedDeptNames.forEach((dept) => {
    rowsWithHeaders.push({
      _type: 'deptHeader',
      department: dept,
    });

    const employees = groupedByDept[dept].slice().sort((a, b) => {
      const ra = getDesignationRank(a.designation || '');
      const rb = getDesignationRank(b.designation || '');
      if (ra !== rb) return ra - rb;
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    rowsWithHeaders.push(...employees);
  });

  // ---------- EXPORT TO EXCEL (current filtered view) ----------
    // ---------- EXPORT TO EXCEL (current filtered view) ----------
  async function handleExportExcel() {
    const dataRows = rowsWithHeaders.filter((r) => !r._type);
    if (!dataRows.length) {
      showToast('error', 'No data to export for this date / filter.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();

      // Workbook properties (nice touch)
      workbook.creator = 'Global Digital Solutions';
      workbook.lastModifiedBy = 'Global Digital Solutions';
      workbook.created = new Date();
      workbook.modified = new Date();

      const sheet = workbook.addWorksheet('Attendance', {
        views: [{ state: 'frozen', ySplit: 4 }],
      });

      // --------- Column setup (keys are for row.add) ----------
      sheet.columns = [
        { header: 'Emp Code',    key: 'empCode',       width: 12 },
        { header: 'Name',        key: 'name',          width: 24 },
        { header: 'Department',  key: 'department',    width: 20 },
        { header: 'Designation', key: 'designation',   width: 20 },
        { header: 'Shift',       key: 'shift',         width: 10 },
        { header: 'Status',      key: 'status',        width: 12 },
        { header: 'Check In',    key: 'checkIn',       width: 16 },
        { header: 'Check Out',   key: 'checkOut',      width: 16 },
      ];

      // --------- Title Row (A1:H1 merged) ----------
      sheet.mergeCells('A1:H1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = `Global Digital Solutions — Attendance Report (${businessDate})`;
      titleCell.font = {
        name: 'Calibri',
        size: 16,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      titleCell.fill = {
        type: 'gradient',
        gradient: 'angle',
        degree: 45,
        stops: [
          { position: 0, color: { argb: 'FF142657' } }, // dark blue
          { position: 1, color: { argb: 'FF58D34D' } }, // green
        ],
      };
      sheet.getRow(1).height = 26;

      // --------- Subtitle Row (A2:H2 merged) ----------
      sheet.mergeCells('A2:H2');
      const subtitleCell = sheet.getCell('A2');
      subtitleCell.value = `Business Date: ${businessDate}  •  Generated: ${new Date().toLocaleString()}`;
      subtitleCell.font = {
        name: 'Calibri',
        size: 11,
        italic: true,
        color: { argb: 'FFE5E7EB' },
      };
      subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      subtitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' },
      };
      sheet.getRow(2).height = 18;

      // empty spacer row
      sheet.getRow(3).height = 6;

      // --------- Header Row (row 4) ----------
      const headerRow = sheet.getRow(4);
      headerRow.values = [
        'Emp Code',
        'Name',
        'Department',
        'Designation',
        'Shift',
        'Status',
        'Check In',
        'Check Out',
      ];

      headerRow.eachCell((cell) => {
        cell.font = {
          name: 'Calibri',
          size: 11,
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0C225C' }, // deep blue
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FF0F172A' } },
          bottom: { style: 'thin', color: { argb: 'FF0F172A' } },
          right: { style: 'thin', color: { argb: 'FF0F172A' } },
        };
      });
      headerRow.height = 20;

      // --------- Data Rows (row 5 onwards) ----------
      let excelRowIndex = 5;
      dataRows.forEach((r, i) => {
        const statusText =
          (r.attendanceStatus && r.attendanceStatus) ||
          (r.totalPunches && r.totalPunches > 0 ? 'Present' : 'Absent');

        const row = sheet.addRow({
          empCode: r.empCode || '',
          name: r.employeeName || r.name || '',
          department: r.department || '',
          designation: r.designation || '',
          shift: r.shift || '',
          status: statusText,
          checkIn: formatDateTime(r.checkIn),
          checkOut: formatDateTime(r.checkOut),
        });

        // Zebra stripe background
        const isEven = i % 2 === 0;
        row.eachCell((cell) => {
          cell.font = {
            name: 'Calibri',
            size: 11,
            color: { argb: 'FF0F172A' },
          };
          cell.alignment = {
            vertical: 'middle',
            horizontal:
              cell.col === 8 ? 'center' : 'left', // check-out centered
            wrapText: true,
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
              argb: isEven ? 'FFF9FAFB' : 'FFE5E7FF', // light stripes
            },
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        });

        // Status cell green / red pill
        const statusCell = row.getCell(6);
        if (statusText === 'Present') {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDCFCE7' },
          };
          statusCell.font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: 'FF166534' },
          };
        } else {
          statusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' },
          };
          statusCell.font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: 'FF991B1B' },
          };
        }

        row.height = 18;
        excelRowIndex++;
      });

      // --------- Thin border around full used range ----------
      const lastRow = sheet.lastRow.number;
      const lastCol = sheet.columnCount;
      for (let r = 4; r <= lastRow; r++) {
        for (let c = 1; c <= lastCol; c++) {
          const cell = sheet.getCell(r, c);
          cell.border = {
            top: cell.border.top || { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: cell.border.left || { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: cell.border.bottom || { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: cell.border.right || { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        }
      }

      // --------- Generate file in browser ----------
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const fileName = `GDS_Attendance_${businessDate}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showToast('success', `Excel exported: ${fileName}`);
    } catch (err) {
      console.error('Excel export error:', err);
      showToast('error', 'Failed to generate Excel file.');
    }
  }


  // ----------------------------------------------------------------

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const headerMeta = (
    <HrHeaderBadge>
      Date: {businessDate}
    </HrHeaderBadge>
  );

  const headerActions = (
    <HrHeaderActions>
      <button type="button" onClick={() => router.push('/hr/violation-rules')} style={glossPill('warm')}>
        Violation Rules
      </button>
      <button type="button" onClick={() => router.push('/hr/company-settings')} style={glossPill('slate')}>
        Company Settings
      </button>
      <button type="button" onClick={() => router.push('/hr/leaves')} style={glossPill('neutral')}>
        Leave Management
      </button>
      <button type="button" onClick={() => router.push('/hr/complaints')} style={glossPill('rose')}>
        Complaints
      </button>
      {canCreate && (
        <button
          type="button"
          onClick={handleLoadAndSave}
          disabled={loading}
          style={{
            ...glossPill('neutral'),
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading && (
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '999px',
                ...spinnerRingStyle('rgba(14, 165, 233, 0.3)', colors.primary[500]),
                animation: 'spin 0.7s linear infinite',
              }}
            />
          )}
          {loading ? 'Loading & Saving…' : 'Load & Save'}
        </button>
      )}
      <button type="button" onClick={handleLogout} style={glossPill('neutral')}>
        Logout
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell
      subtitle="HR Daily Attendance (Day & Night Shifts)"
      meta={headerMeta}
      actions={headerActions}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes toastIn {
            from { opacity: 0; transform: translateY(10px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .hr-att-table tbody tr.data-row:hover td {
            background-color: var(--theme-row-hover, rgba(14, 165, 233, 0.1)) !important;
          }

          /* Header/toolbar responsive rules: see globals.css Phase 6 */
          
          /* Mobile Responsive Styles */
          @media (max-width: 768px) {
            .daily-page-container {
              padding: 16px !important;
            }
            .daily-header {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 16px !important;
              padding: 16px !important;
            }
            .daily-header-toolbar {
              background: transparent !important;
              border: none !important;
              padding: 0 !important;
            }
            .daily-header-toolbar > div button {
              width: 100% !important;
              min-width: 0 !important;
              flex: none !important;
            }
            .daily-header-logo {
              width: 60px !important;
              height: 60px !important;
            }
            .daily-header-title {
              font-size: 18px !important;
            }
            .daily-controls {
              flex-direction: column !important;
              align-items: stretch !important;
            }
            .daily-controls > div {
              width: 100% !important;
            }
            .daily-controls input[type="date"] {
              width: 100% !important;
              min-width: auto !important;
            }
            .daily-table-wrapper {
              overflow-x: auto !important;
              -webkit-overflow-scrolling: touch !important;
              margin-left: -16px !important;
              margin-right: -16px !important;
              padding-left: 16px !important;
              padding-right: 16px !important;
            }
            .daily-table {
              min-width: 800px !important;
              font-size: 12px !important;
            }
            .daily-table th,
            .daily-table td {
              padding: 6px 8px !important;
            }
            .daily-main-card {
              padding: 12px !important;
            }
            .daily-legend {
              font-size: 11px !important;
              padding: 8px 10px !important;
            }
            .daily-stats-strip {
              flex-direction: column !important;
              gap: 6px !important;
            }
            .daily-stats-strip > div {
              width: 100% !important;
            }
            .daily-search-export {
              flex-direction: column !important;
              gap: 10px !important;
            }
            .daily-search-export > div {
              width: 100% !important;
              min-width: auto !important;
            }
            .daily-search-export input {
              width: 100% !important;
              min-width: auto !important;
            }
            .daily-search-export button {
              width: 100% !important;
            }
          }
          @media (max-width: 480px) {
            .daily-page-container {
              padding: 12px !important;
            }
            .daily-header-title {
              font-size: 16px !important;
            }
            .daily-table {
              min-width: 700px !important;
              font-size: 11px !important;
            }
            .daily-table th,
            .daily-table td {
              padding: 4px 6px !important;
            }
          }
          
          /* Laptop & Desktop Responsive Styles */
          @media (min-width: 1024px) and (max-width: 1366px) {
            .container-responsive {
              max-width: 100% !important;
              width: 100% !important;
            }
            .daily-page-container {
              padding: 20px 16px !important;
            }
            .daily-header {
              padding: 14px 18px !important;
            }
            .daily-header-logo {
              width: 75px !important;
              height: 75px !important;
            }
            .daily-header-title {
              font-size: 20px !important;
            }
            .daily-header-toolbar > div {
              flex-wrap: wrap !important;
              gap: 8px !important;
            }
            .daily-header button {
              padding: 8px 16px !important;
              font-size: 12px !important;
            }
            .daily-table {
              min-width: 850px !important;
              font-size: 12px !important;
            }
            .daily-table th,
            .daily-table td {
              padding: 8px 10px !important;
            }
            .daily-controls input[type="date"],
            .daily-controls select {
              min-width: 150px !important;
              font-size: 12px !important;
            }
            .daily-search-export input {
              min-width: 200px !important;
              font-size: 12px !important;
            }
            .daily-search-export button {
              padding: 7px 12px !important;
              font-size: 11px !important;
            }
            .daily-legend {
              font-size: 12px !important;
              padding: 8px 10px !important;
            }
            .daily-stats-strip {
              gap: 6px !important;
              font-size: 10px !important;
            }
            .daily-stats-strip > div {
              padding: 5px 8px !important;
            }
            .daily-main-card {
              padding: 20px 24px !important;
            }
          }
          
          @media (min-width: 1367px) and (max-width: 1440px) {
            .container-responsive {
              max-width: 100% !important;
              width: 100% !important;
            }
            .daily-page-container {
              padding: 22px 18px !important;
            }
            .daily-table {
              min-width: 900px !important;
              font-size: 12.5px !important;
            }
            .daily-table th,
            .daily-table td {
              padding: 9px 11px !important;
            }
            .daily-main-card {
              padding: 22px 26px !important;
            }
          }
          
          @media (min-width: 1441px) and (max-width: 1920px) {
            .container-responsive {
              max-width: 100% !important;
              width: 100% !important;
            }
            .daily-page-container {
              padding: 24px 28px !important;
            }
            .daily-table {
              font-size: 13px !important;
              width: 100% !important;
            }
            .daily-table-wrapper {
              width: 100% !important;
            }
            .daily-main-card {
              padding: 24px 28px !important;
            }
          }
          
          @media (min-width: 1921px) {
            .container-responsive {
              max-width: 100% !important;
              width: 100% !important;
            }
            .daily-page-container {
              padding: 28px 32px !important;
            }
            .daily-header-title {
              font-size: 24px !important;
            }
            .daily-header-logo {
              width: 100px !important;
              height: 100px !important;
            }
            .daily-table {
              font-size: 14px !important;
              width: 100% !important;
            }
            .daily-table-wrapper {
              width: 100% !important;
            }
            .daily-table th,
            .daily-table td {
              padding: 10px 14px !important;
            }
            .daily-main-card {
              padding: 24px 28px !important;
            }
          }
          
          /* Ensure table uses full width on all desktop sizes */
          @media (min-width: 1024px) {
            .daily-table-wrapper {
              width: 100% !important;
              overflow-x: auto !important;
            }
            .daily-table {
              width: 100% !important;
            }
          }
        `,
        }}
      />

      {showWarning && (
          <AutoLogoutWarning
            timeRemaining={timeRemaining}
            onStayLoggedIn={handleStayLoggedIn}
            onLogout={autoLogout}
          />
        )}

        {/* MAIN CARD */}
        <GlassCard className="daily-main-card" padding="24px 28px 28px">
          {/* Legend + date + summary + stats */}
          <div style={{ marginBottom: 14 }}>
            {/* Shift legend */}
            <div
              className="daily-legend"
              style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 10,
                backgroundColor: colors.background.legend,
                border: `2px solid ${colors.primary[500]}`,
                fontSize: 13,
                color: colors.text.primary,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <strong style={{ color: colors.text.primary }}>Shift Legend:</strong>
              <span>
                {shifts.length > 0 ? (
                  shifts.map((shift, idx) => (
                    <span key={shift._id}>
                      {idx > 0 && ', '}
                      <strong>{shift.code}</strong> = {shift.name} ({shift.startTime}–{shift.endTime})
                    </span>
                  ))
                ) : (
                  <span>No shifts configured. Please create shifts first.</span>
                )}
              </span>
            </div>

            <div
              className="daily-controls"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 16,
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'block',
                      marginBottom: 4,
                      color: colors.text.primary,
                    }}
                  >
                    Business Date
                  </label>
                  <GlassInput
                    type="date"
                    value={businessDate}
                    onChange={(e) => setBusinessDate(e.target.value)}
                    style={{ minWidth: 170, fontSize: 13, width: 'auto' }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'block',
                      marginBottom: 4,
                      color: colors.text.primary,
                    }}
                  >
                    Filter by Shift
                  </label>
                  <GlassInput
                    asSelect
                    value={selectedShift}
                    onChange={(e) => setSelectedShift(e.target.value)}
                    style={{ minWidth: 200, fontSize: 13, width: 'auto' }}
                  >
                    <option value="">All Shifts</option>
                    {shifts.length > 0 ? (
                      shifts.map((shift) => (
                        <option key={shift._id} value={shift.code}>
                          {shift.code} – {shift.name} ({shift.startTime}–{shift.endTime})
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No shifts available</option>
                    )}
                  </GlassInput>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    fontSize: 12,
                    color: colors.text.secondary,
                  }}
                >
                  <span>
                    {shifts.length > 0 ? (
                      shifts.map((shift, idx) => (
                        <span key={shift._id}>
                          {idx > 0 && ' | '}
                          {shift.code}: <strong>{totals[shift.code] ?? 0}</strong>
                        </span>
                      ))
                    ) : (
                      <span>No shifts configured</span>
                    )}
                  </span>
                  {status && (
                    <span style={{ color: colors.success }}>{status}</span>
                  )}
                </div>
              </div>

              {/* Quick stats strip */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: colors.background.card,
                    border: `1px solid ${colors.border.default}`,
                  }}
                >
                  <span style={{ color: colors.text.secondary, marginRight: 4 }}>
                    Records:
                  </span>
                  <strong style={{ color: colors.text.primary }}>{totalRecords}</strong>
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.15)' : '#dcfce7',
                    border: `1px solid ${colors.success}`,
                  }}
                >
                  <span style={{ color: colors.success, marginRight: 4 }}>
                    Present:
                  </span>
                  <strong style={{ color: colors.success }}>{presentCount}</strong>
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                    border: `1px solid ${colors.error}`,
                  }}
                >
                  <span style={{ color: colors.error, marginRight: 4 }}>
                    Absent:
                  </span>
                  <strong style={{ color: colors.error }}>{absentCount}</strong>
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    backgroundColor: '#e0f2fe',
                    border: '1px solid #0ea5e9',
                  }}
                >
                  <span style={{ color: '#0369a1', marginRight: 4 }}>
                    Departments:
                  </span>
                  <strong>{departmentCount}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background:
                'linear-gradient(90deg, transparent, #cbd5f5, transparent)',
              margin: '4px 0 10px',
            }}
          />

          {/* Table + search + export */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: colors.glass.text,
                    marginBottom: 2,
                  }}
                >
                  Attendance Snapshot
                </h2>
                <p
                  style={{
                    fontSize: 11,
                    color: colors.text.secondary,
                  }}
                >
                  Built from device events and stored in{' '}
                  <span style={{ color: '#0f766e' }}>ShiftAttendance</span>{' '}
                  for the selected business date.
                </p>
              </div>

              {/* search + export */}
              <div
                className="daily-search-export"
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {/* search bar */}
                <div
                  style={{
                    position: 'relative',
                    minWidth: 220,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 13,
                      color: colors.text.tertiary,
                    }}
                  >
                    🔍
                  </span>
                  <GlassInput
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search employee, dept, shift, status..."
                    style={{
                      paddingLeft: 30,
                      borderRadius: 999,
                      fontSize: 12,
                      minWidth: 220,
                      width: 'auto',
                    }}
                  />
                </div>

                {/* export button */}
                {canExport && (
                  <GlassButton type="button" onClick={handleExportExcel} style={{ borderRadius: 999, fontSize: 12, padding: '8px 14px' }}>
                    ⬇ Export Excel
                  </GlassButton>
                )}
              </div>
            </div>

            <GlassTable className="daily-table-wrapper hr-table-scroll table-responsive">
                <GlassTable.Head>
                  <tr>
                    <GlassTable.Th>Emp Code</GlassTable.Th>
                    <GlassTable.Th>Name</GlassTable.Th>
                    <GlassTable.Th>Department</GlassTable.Th>
                    <GlassTable.Th>Designation</GlassTable.Th>
                    <GlassTable.Th>Shift</GlassTable.Th>
                    <GlassTable.Th>Status</GlassTable.Th>
                    <GlassTable.Th>Check In</GlassTable.Th>
                    <GlassTable.Th>Check Out</GlassTable.Th>
                  </tr>
                </GlassTable.Head>
                <GlassTable.Body>
                  {rowsWithHeaders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          ...tdStyle,
                          textAlign: 'center',
                          color: colors.text.tertiary,
                          backgroundColor: '#f9fafb',
                          padding: '14px 12px',
                        }}
                      >
                        {loading
                          ? 'Loading attendance…'
                          : 'No records for this date / filter yet.'}
                      </td>
                    </tr>
                  ) : (
                    rowsWithHeaders.map((row, idx) => {
                      if (row._type === 'deptHeader') {
                        return (
                          <tr key={`dept-${row.department}-${idx}`}>
                            <td
                              colSpan={9}
                              style={{
                                ...tdStyle,
                                backgroundColor: theme === 'dark' ? colors.background.secondary : colors.background.table.header,
                                color: colors.text.primary,
                                borderTop: '2px solid #58D34D',
                                borderRight: '2px solid #58D34D',
                                borderBottom: '2px solid #58D34D',
                                borderLeft: '2px solid #58D34D',
                                fontWeight: 700,
                                textAlign: 'center',
                              }}
                            >
                              {row.department}
                            </td>
                          </tr>
                        );
                      }

                      const isManager =
                        row.designation &&
                        row.designation.toLowerCase().includes('manager');
                      const isTeamLead =
                        row.designation &&
                        row.designation.toLowerCase().includes('team lead');

                      const designationContent = (
                        <span
                          style={{
                            fontWeight: isManager || isTeamLead ? 700 : 400,
                          }}
                        >
                          {row.designation || '-'}
                        </span>
                      );

                      const statusText =
                        (row.attendanceStatus && row.attendanceStatus) ||
                        (row.totalPunches && row.totalPunches > 0
                          ? 'Present'
                          : 'Absent');

                      const statusColor =
                        statusText === 'Present' ? '#16a34a' : '#b91c1c';

                      return (
                        <tr
                          key={`${row.empCode}-${row.shift}-${idx}`}
                          className="data-row"
                          style={{
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = colors.background.table.rowHover;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven;
                          }}
                        >
                          <td style={tdStyle}>{row.empCode}</td>
                          <td style={tdStyle}>
                            {row.employeeName || row.name || '-'}
                          </td>
                          <td style={tdStyle}>{row.department || '-'}</td>
                          <td style={tdStyle}>{designationContent}</td>
                          <td style={tdStyle}>{row.shift || '-'}</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#ffffff',
                                backgroundColor: statusColor,
                              }}
                            >
                              {statusText}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            {formatDateTime(row.checkIn)}
                          </td>
                          <td style={tdStyle}>
                            {formatDateTime(row.checkOut)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </GlassTable.Body>
            </GlassTable>
          </div>
        </GlassCard>

      {/* Toast popup */}
      {toast.text && (
        <div
          style={{
            position: 'fixed',
            right: 18,
            bottom: 20,
            padding: '10px 14px',
            borderRadius: 12,
            backgroundColor:
              toast.type === 'error'
                ? 'rgba(248,113,113,0.12)'
                : 'rgba(16,185,129,0.14)',
            border:
              toast.type === 'error'
                ? '1px solid rgba(220,38,38,0.6)'
                : '1px solid rgba(16,185,129,0.7)',
            color: toast.type === 'error' ? '#b91c1c' : '#065f46',
            fontSize: 13,
            boxShadow: '0 12px 24px rgba(15,23,42,0.6)',
            backdropFilter: 'blur(10px)',
            animation: 'toastIn 0.2s ease-out',
            maxWidth: 340,
            zIndex: 50,
          }}
        >
          {toast.text}
        </div>
      )}
    </HrPageShell>
  );
}

