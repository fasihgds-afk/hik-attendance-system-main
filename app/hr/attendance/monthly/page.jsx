'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { HrPageShell, HrHeaderActions, GlassCard, getGlossPillStyles } from '@/components/glass';
import { spinnerRingStyle } from '@/lib/theme/styles';
import { calculateAwayDeductionDays, calculateAwayDeductionAmount } from '@/lib/calculations/awayDeduction';
import { usePermissions, useModulePermission } from '@/hooks/usePermissions';
import { api } from '@/lib/api/client';
import { getCachedLookup, LOOKUP_KEYS } from '@/lib/api/lookupCache';

// Styles will be generated dynamically based on theme

function formatTimeShort(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function toTimeInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Short labels for statuses in cell top line
function statusShortCode(status) {
  if (!status) return '-';
  const s = String(status).trim();

  switch (s) {
    case 'Present':
      return 'P';
    case 'Holiday':
      return 'H';
    case 'Eid Holiday':
      return 'Eid';
    case 'Absent':
      return 'A';
    case 'Sick Leave':
      return 'SL';
    case 'Paid Leave':
      return 'PL';
    case 'Un Paid Leave':
      return 'UPL';
    case 'Leave Without Inform':
      return 'LWI';
    case 'Work From Home':
      return 'WFH';
    case 'Half Day':
      return 'Half';
    case 'Marriage Leave':
      return 'ML';
    case 'Death Leave':
      return 'DL';
    case 'Maternity Leave':
      return 'MatL';
    case 'Paternity Leave':
      return 'PatL';
    case 'Hajj Leave':
      return 'Hajj';
    case 'Umrah Leave':
      return 'Umrah';
    default:
      return s;
  }
}

// Format salary deduction days, e.g. 1, 2, 1.007, 2.014
function formatSalaryDays(value) {
  if (value == null) return '0';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(3); // e.g. 1.007, 1.014, 2.007
}

function formatCurrency(value) {
  if (value == null) return '0';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function previewAwayDeduction(monthlySalary, paidWorkHours, hoursAway, workingDays = 26) {
  const gross = Number(monthlySalary) || 0;
  const paidH = Number(paidWorkHours) || 8;
  const hours = Number(hoursAway) || 0;
  if (!gross || !hours) {
    return { perDay: 0, hourly: 0, days: 0, amount: 0 };
  }
  const perDay = gross / workingDays;
  return {
    perDay,
    hourly: perDay / paidH,
    days: calculateAwayDeductionDays(hours, paidH),
    amount: calculateAwayDeductionAmount(perDay, hours, paidH),
  };
}

// --- Cell color rules (includes EXCUSED + missing punches + WFH) ------
function getCellStyle(day, colors, baseCell, theme) {
  const isLeaveType =
    day.status === 'Paid Leave' ||
    day.status === 'Un Paid Leave' ||
    day.status === 'Sick Leave' ||
    day.status === 'Marriage Leave' ||
    day.status === 'Death Leave' ||
    day.status === 'Maternity Leave' ||
    day.status === 'Paternity Leave' ||
    day.status === 'Hajj Leave' ||
    day.status === 'Umrah Leave';

  // Work From Home special color (using logo blue)
  if (day.status === 'Work From Home') {
    return {
      ...baseCell,
      backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe',
      color: theme === 'dark' ? colors.primary[300] : colors.primary[800],
      fontWeight: 600,
    };
  }

  // HR-recorded away from workstation during shift
  if ((Number(day.awayHours) || 0) > 0) {
    return {
      ...baseCell,
      backgroundColor: theme === 'dark' ? 'rgba(168, 85, 247, 0.22)' : '#f3e8ff',
      color: theme === 'dark' ? '#c4b5fd' : '#6b21a8',
      fontWeight: 600,
      boxShadow: theme === 'dark'
        ? 'inset 0 0 0 1px rgba(168, 85, 247, 0.5)'
        : 'inset 0 0 0 1px #c4b5fd',
    };
  }

  // No punches at all
  if (!day.checkIn && !day.checkOut) {
    // Holiday (weekend / official off) or Eid Holiday
    if (day.status === 'Holiday' || day.status === 'Eid Holiday') {
      return {
        ...baseCell,
        backgroundColor: colors.background.tertiary,
        color: colors.text.tertiary,
      };
    }

    // Any leave (paid / unpaid / sick)
    if (isLeaveType) {
      // Unpaid Leave gets a distinct professional color (purple/lavender)
      if (day.status === 'Un Paid Leave') {
        return {
          ...baseCell,
          backgroundColor: theme === 'dark' ? 'rgba(168, 85, 247, 0.2)' : '#f3e8ff',
          color: theme === 'dark' ? colors.accent.purple : '#6b21a8',
          fontWeight: 600,
        };
      }
      // Paid Leave and Sick Leave use yellow/amber
      return {
        ...baseCell,
        backgroundColor: theme === 'dark' ? 'rgba(251, 191, 36, 0.2)' : '#fef9c3',
        color: theme === 'dark' ? colors.warning : '#92400e',
      };
    }

    // Absent on working day = red + "No Punch"
    if (day.status === 'Absent') {
      return {
        ...baseCell,
        backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
        color: theme === 'dark' ? colors.error : '#991b1b',
        fontWeight: 600,
      };
    }

    // Leave Without Inform – same as absent (red)
    if (day.status === 'Leave Without Inform') {
      return {
        ...baseCell,
        backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
        color: theme === 'dark' ? colors.error : '#991b1b',
        fontWeight: 600,
      };
    }

    // Fallback grey
    return {
      ...baseCell,
      backgroundColor: colors.background.tertiary,
      color: colors.text.tertiary,
    };
  }

  // Partial punches (only check-in OR only check-out)
  const isPartialPunch = (day.checkIn && !day.checkOut) || (!day.checkIn && day.checkOut);
  if (isPartialPunch) {
    // Check if early departure is excused (missing punch is treated as early)
    const earlyExcused = day.earlyExcused !== undefined ? day.earlyExcused : (day.excused && day.earlyLeave);
    if (earlyExcused) {
      // EXCUSED missing punch: green
      return {
        ...baseCell,
        backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7',
        color: theme === 'dark' ? colors.success : '#166534',
        fontWeight: 600,
        boxShadow: `0 0 0 1px ${colors.success} inset`,
      };
    }
    // Not excused: red for missing punch
    return {
      ...baseCell,
      backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
      color: theme === 'dark' ? colors.error : '#991b1b',
      fontWeight: 600,
    };
  }

  // Normal punches present: handle late/early + excused separately
  const lateExcused = day.lateExcused !== undefined ? day.lateExcused : (day.excused && day.late);
  const earlyExcused = day.earlyExcused !== undefined ? day.earlyExcused : (day.excused && day.earlyLeave);
  
  const hasLateViolation = day.late && !lateExcused;
  const hasEarlyViolation = day.earlyLeave && !earlyExcused;
  const hasAnyViolation = hasLateViolation || hasEarlyViolation;
  const allExcused = (day.late && lateExcused) || (day.earlyLeave && earlyExcused);

  // If all violations are excused, show green
  if ((day.late || day.earlyLeave) && !hasAnyViolation) {
    return {
      ...baseCell,
      backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7',
      color: theme === 'dark' ? colors.success : '#166534',
      fontWeight: 600,
      boxShadow: `0 0 0 1px ${colors.success} inset`,
    };
  }

  // Different colors for different violation types
  // Priority: If both violations exist, show the more severe one (red)
  // If only one violation exists (or one is excused), show that violation's color
  if (hasLateViolation && hasEarlyViolation) {
    // Both late and early violations (not excused) = red
    return {
      ...baseCell,
      backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
      color: theme === 'dark' ? colors.error : '#991b1b',
      fontWeight: 600,
    };
  } else if (hasLateViolation) {
    // Only late violation (not excused) = professional amber/yellow
    // This includes: late not excused, early either not present or excused
    return {
      ...baseCell,
      backgroundColor: theme === 'dark' ? 'rgba(251, 191, 36, 0.2)' : '#fef3c7',
      color: theme === 'dark' ? colors.warning : '#b45309',
      fontWeight: 600,
    };
  } else if (hasEarlyViolation) {
    // Only early violation (not excused) = professional orange
    // This includes: early not excused, late either not present or excused
    return {
      ...baseCell,
      backgroundColor: theme === 'dark' ? 'rgba(249, 115, 22, 0.2)' : '#fed7aa',
      color: theme === 'dark' ? colors.accent.orange : '#c2410c',
      fontWeight: 600,
    };
  }

  // Normal on-time green (no violations)
  return {
    ...baseCell,
    backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7',
    color: theme === 'dark' ? colors.success : '#14532d',
    fontWeight: 600,
  };
}

// ---- upcoming-day logic (uses browser time, 08:55 boundary) -------------
const COMPANY_DAY_START_HOUR = 8;  // 08:55
const COMPANY_DAY_START_MIN = 55;

// Get YYYY-MM-DD in *local* time
function getLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isUpcomingDayClient(dateStr, apiMonth) {
  if (!dateStr || !apiMonth) return false;

  const now = new Date();

  // LOCAL date string, not UTC
  const todayStr = getLocalDateString(now);      // e.g. 2025-12-03
  const currentMonthStr = todayStr.slice(0, 7);  // e.g. 2025-12

  // future month => everything in that month is upcoming
  if (apiMonth > currentMonthStr) return true;
  // past month => nothing upcoming
  if (apiMonth < currentMonthStr) return false;

  // same month
  if (dateStr > todayStr) return true;  // future day
  if (dateStr < todayStr) return false; // past day

  // same day: only upcoming before 08:55 LOCAL time
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const cutoffMinutes = COMPANY_DAY_START_HOUR * 60 + COMPANY_DAY_START_MIN;
  return minutesNow < cutoffMinutes;
}

export default function MonthlyHrPage() {
  // ALL HOOKS MUST BE CALLED FIRST, IN THE SAME ORDER
  const { colors, theme } = useTheme(); // Theme colors
  const { canUpdate, canExport } = usePermissions('monthlyAttendance');
  const canExportBankDetails = useModulePermission('bankDetails', 'export');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 7); // YYYY-MM
  });

  const [data, setData] = useState({
    month: '',
    daysInMonth: 0,
    employees: [],
  });

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState(''); // Filter by shift

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null); // { emp, day }

  const [editStatus, setEditStatus] = useState('Present');
  const [editLeaveType, setEditLeaveType] = useState('paid'); // quarter-based: only paid leave (no casual/annual)
  const [editReason, setEditReason] = useState('');
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editLateExcused, setEditLateExcused] = useState(false);
  const [editEarlyExcused, setEditEarlyExcused] = useState(false);
  const [editAwayHours, setEditAwayHours] = useState('');
  const [editAwayNote, setEditAwayNote] = useState('');
  const [editAwayReportedBy, setEditAwayReportedBy] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // ---- Bulk holiday (e.g. Eid) – mark selected days for ALL employees -------
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('Eid Holiday');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkDays, setBulkDays] = useState([]); // array of day numbers (1..daysInMonth)
  const [bulkSaving, setBulkSaving] = useState(false);

  // track horizontal scroll to add shadow on frozen cols
  const [scrollLeft, setScrollLeft] = useState(0);

  // ---- Export configuration (which columns to include) -----------------
  const baseExportColumns = [
    { key: 'empCode', label: 'Emp Code' },
    { key: 'name', label: 'Name' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'shift', label: 'Shift' },
    { key: 'monthlySalary', label: 'Gross Salary' },
    { key: 'netSalary', label: 'Net Salary (After Deduction)' },
    { key: 'salaryDeductAmount', label: 'Salary Deduct (Amount)' },
    { key: 'lateCount', label: 'Late Violations' },
    { key: 'earlyCount', label: 'Early Violations' },
    { key: 'salaryDeductDays', label: 'Salary Deduct (Days)' },
  ];

  const [exportColumns, setExportColumns] = useState(
    () => baseExportColumns.map((c) => ({ ...c, enabled: true }))
  );
  const [exportIncludeDays, setExportIncludeDays] = useState(true);
  const [exportIncludeBankDetails, setExportIncludeBankDetails] = useState(false);
  const [showExportSettings, setShowExportSettings] = useState(false);

  useEffect(() => {
    if (!canExportBankDetails && exportIncludeBankDetails) {
      setExportIncludeBankDetails(false);
    }
  }, [canExportBankDetails, exportIncludeBankDetails]);

  // Generate theme-aware table styles AFTER all hooks
  const headerCell = {
    padding: '8px 10px',
    borderBottom: `1px solid ${colors.border.table}`,
    fontSize: 11.5,
    fontWeight: 600,
    color: theme === 'dark' ? '#ffffff' : colors.text.table.header,
    backgroundColor: theme === 'dark' ? colors.primary[800] : colors.primary[500],
    background: theme === 'dark' 
      ? `linear-gradient(135deg, ${colors.primary[800]}, ${colors.primary[600]})`
      : `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 5,
  };

  const baseCell = {
    padding: '6px 8px',
    borderBottom: `1px solid ${colors.border.table}`,
    fontSize: 11.5,
    color: colors.text.table.cell,
    textAlign: 'center',
    backgroundColor: colors.background.table.row,
  };

  function toggleExportColumn(key) {
    setExportColumns((cols) =>
      cols.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c))
    );
  }

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 2600);
  }

  async function loadShifts() {
    try {
      const shiftsList = await getCachedLookup(LOOKUP_KEYS.shiftsActive, async () => {
        const response = await api.get('/api/hr/shifts?activeOnly=true', {
          requestKey: 'hr-shifts-active',
          abortDuplicate: false,
        });
        if (response.aborted) {
          throw Object.assign(new Error('aborted'), { aborted: true });
        }
        if (!response.success) {
          throw new Error(response.error || response.message || 'Failed to load shifts');
        }
        return response.data?.shifts || [];
      });
      setShifts(Array.isArray(shiftsList) ? shiftsList : []);
    } catch (err) {
      if (err?.aborted) return;
      console.error('Failed to load shifts:', err);
    }
  }

  useEffect(() => {
    loadShifts();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadMonth(forceRefresh = false) {
    try {
      setLoading(true);
      const params = new URLSearchParams({ month });
      if (searchTerm) params.set('search', searchTerm);
      if (forceRefresh) params.set('_t', String(Date.now()));

      const response = await api.get(`/api/hr/monthly-attendance?${params.toString()}`, {
        requestKey: 'monthly-attendance',
      });

      if (response.aborted) return;

      if (!response.success) {
        throw new Error(response.error || response.message || 'Failed to load monthly attendance');
      }

      setData(response.data || {});
    } catch (err) {
      console.error(err);
      showToast('error', err.message || 'Failed to load monthly attendance');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, searchTerm]);

  // Refetch when user returns to this tab (e.g. after changing leave on HR Leaves page) so both pages stay in sync
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadMonth(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, searchTerm]);

  function openCellModal(emp, day) {
    setSelected({ emp, day });

    setEditStatus(
      day.status || (day.checkIn || day.checkOut ? 'Present' : 'Absent')
    );
    setEditReason(day.reason || '');
    setEditCheckIn(toTimeInputValue(day.checkIn));
    setEditCheckOut(toTimeInputValue(day.checkOut));
    // Support both new separate fields and legacy excused field
    // Read excused flags - prioritize new fields, fallback to legacy
    const lateExcusedValue = day.lateExcused !== undefined 
      ? !!day.lateExcused 
      : (!!day.excused && !!day.late);
    const earlyExcusedValue = day.earlyExcused !== undefined 
      ? !!day.earlyExcused 
      : (!!day.excused && !!day.earlyLeave);
    
    setEditLateExcused(lateExcusedValue);
    setEditEarlyExcused(earlyExcusedValue);
    setEditAwayHours(day.awayHours != null && day.awayHours > 0 ? String(day.awayHours) : '');
    setEditAwayNote(day.awayNote || '');
    setEditAwayReportedBy(day.awayReportedBy || '');

    console.log('Opening modal - excused flags:', {
      date: day.date,
      lateExcused: lateExcusedValue,
      earlyExcused: earlyExcusedValue,
      dayLateExcused: day.lateExcused,
      dayEarlyExcused: day.earlyExcused,
      dayExcused: day.excused,
      dayLate: day.late,
      dayEarlyLeave: day.earlyLeave,
    });

    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSelected(null);
  }

  async function handleSaveDay() {
    if (!selected) return;

    try {
      const body = {
        empCode: selected.emp.empCode,
        date: selected.day.date,
        status: editStatus,
        reason: editReason,
        checkInTime: editCheckIn || null,
        checkOutTime: editCheckOut || null,
        lateExcused: editLateExcused,
        earlyExcused: editEarlyExcused,
        violationExcused: editLateExcused || editEarlyExcused, // Legacy: for backward compatibility
        awayHours: editAwayHours === '' ? 0 : Number(editAwayHours),
        awayNote: editAwayNote,
        awayReportedBy: editAwayReportedBy,
        // Quarter-based: only 'paid' leave (no casual/annual)
        ...(editStatus === 'Paid Leave' && { leaveType: 'paid' }),
      };

      // Saving with excused flags

      const res = await fetch('/api/hr/monthly-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Failed to save day (${res.status})`;
        try {
          const json = JSON.parse(text);
          message = json.error || json.message || message;
        } catch (_) {
          if (text) message = text;
        }
        throw new Error(message);
      }

      showToast('success', 'Day updated successfully');
      closeModal();
      // Force refresh to get updated data (bypasses cache)
      await loadMonth(true);
    } catch (err) {
      console.error('Save error:', err);
      showToast('error', err.message || 'Failed to save day');
    }
  }

  // ---- Bulk holiday helpers ------------------------------------------------
  function openBulkModal() {
    setBulkStatus('Eid Holiday');
    setBulkReason('');
    setBulkDays([]);
    setBulkOpen(true);
  }

  function closeBulkModal() {
    if (bulkSaving) return;
    setBulkOpen(false);
  }

  function toggleBulkDay(dayNum) {
    setBulkDays((prev) =>
      prev.includes(dayNum)
        ? prev.filter((d) => d !== dayNum)
        : [...prev, dayNum].sort((a, b) => a - b)
    );
  }

  async function handleApplyBulk() {
    if (bulkDays.length === 0) {
      showToast('error', 'Select at least one day.');
      return;
    }

    const apiMonth = data.month || month; // YYYY-MM
    const dates = bulkDays.map(
      (d) => `${apiMonth}-${String(d).padStart(2, '0')}`
    );

    try {
      setBulkSaving(true);
      const res = await fetch('/api/hr/monthly-attendance/bulk-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates,
          status: bulkStatus,
          reason: bulkReason,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Failed to apply (${res.status})`;
        try {
          const json = JSON.parse(text);
          message = json.error || json.message || message;
        } catch (_) {
          if (text) message = text;
        }
        throw new Error(message);
      }

      const json = await res.json();
      const msg =
        json?.message ||
        `Applied ${bulkStatus} to all employees on ${dates.length} day(s).`;
      showToast('success', msg);
      setBulkOpen(false);
      await loadMonth(true);
    } catch (err) {
      console.error('Bulk apply error:', err);
      showToast('error', err.message || 'Failed to apply holiday');
    } finally {
      setBulkSaving(false);
    }
  }

  // Search is applied server-side; keep shift filter on the client
  const filteredEmployees = (data.employees || []).filter((emp) => {
    if (selectedShift && emp.shift !== selectedShift) {
      return false;
    }
    return true;
  });

  // Totals by shift for PRESENT employees only (global), ignoring upcoming days
  const totalsByShift = (data.employees || []).reduce((acc, emp) => {
    const apiMonth = data.month || month;
    (emp.days || []).forEach((day) => {
      if (isUpcomingDayClient(day.date, apiMonth)) return;

      const isPresent =
        day.status === 'Present' ||
        day.status === 'Work From Home' ||
        (day.checkIn || day.checkOut);

      if (isPresent && day.shift) {
        acc[day.shift] = (acc[day.shift] || 0) + 1;
      }
    });
    return acc;
  }, {});

  const dayNumbers = Array.from(
    { length: data.daysInMonth || 0 },
    (_, i) => i + 1
  );

  // ===================== EXCEL EXPORT (ExcelJS) ========================
  async function handleExport() {
    if (!data.employees || data.employees.length === 0) {
      showToast('error', 'No data to export');
      return;
    }

    const activeCols = exportColumns.filter((c) => c.enabled);

    if (activeCols.length === 0 && !exportIncludeDays) {
      showToast(
        'error',
        'Please enable at least one base column or include daily columns.'
      );
      return;
    }

    try {
      const ExcelJS = (await import('exceljs')).default;
      let bankMap = new Map();
      if (exportIncludeBankDetails) {
        let bankRes = await fetch('/api/hr/employees/bank-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empCodes: filteredEmployees.map((e) => e.empCode).filter(Boolean),
            // HR should receive unmasked bank details in Excel.
            mask: false,
          }),
        });
        // Non-HR roles are blocked by API for unmasked exports; retry masked safely.
        if (bankRes.status === 403) {
          bankRes = await fetch('/api/hr/employees/bank-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              empCodes: filteredEmployees.map((e) => e.empCode).filter(Boolean),
              mask: true,
            }),
          });
        }
        if (!bankRes.ok) {
          const txt = await bankRes.text();
          throw new Error(txt || 'Failed to load bank details for export');
        }
        const bankJson = await bankRes.json();
        const items = Array.isArray(bankJson?.items) ? bankJson.items : [];
        bankMap = new Map(items.map((it) => [it.empCode, it]));
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Global Digital Solutions';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(`Attendance ${data.month || ''}`);

      const excelColumns = [
        ...activeCols.map((c) => ({
          header: c.label,
          key: c.key,
          width:
            c.key === 'name'
              ? 26
              : c.key === 'department' || c.key === 'designation'
              ? 22
              : c.key === 'monthlySalary' ||
                c.key === 'netSalary' ||
                c.key === 'salaryDeductAmount'
              ? 16
              : 14,
        })),
        ...(exportIncludeDays
          ? dayNumbers.map((d) => {
              const dd = String(d).padStart(2, '0');
              return {
                header: `${data.month || 'YYYY-MM'}-${dd}`,
                key: `day_${d}`,
                width: 24,
              };
            })
          : []),
        ...(exportIncludeBankDetails
          ? [
              { header: 'Bank Name', key: 'bankName', width: 22 },
              { header: 'Account Title', key: 'accountTitle', width: 24 },
              { header: 'Account Number', key: 'accountNumber', width: 20 },
              { header: 'IBAN', key: 'iban', width: 22 },
            ]
          : []),
      ];

      sheet.columns = excelColumns;

      // Make first two columns a bit wider for code + name
      if (sheet.getColumn(1)) {
        sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width, 14);
      }
      if (sheet.getColumn(2)) {
        sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width, 24);
      }

      // Insert branding rows
      sheet.spliceRows(1, 0, [], []);

      const lastColIndex = excelColumns.length;

      // Logo (A1:B3)
      try {
        const resp = await fetch('/gds.webp');
        if (resp.ok) {
          const arrayBuffer = await resp.arrayBuffer();
          const imageId = workbook.addImage({
            buffer: arrayBuffer,
            extension: 'webp',
          });
          sheet.addImage(imageId, 'A1:B3');
        }
      } catch (e) {
        console.warn('Excel logo load failed:', e);
      }

      // Big gradient title row
      sheet.mergeCells(1, 3, 1, lastColIndex);
      const titleCell = sheet.getCell(1, 3);
      titleCell.value =
        'Global Digital Solutions — Monthly Attendance & Payroll Report';
      titleCell.font = {
        name: 'Segoe UI',
        size: 18,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      titleCell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      titleCell.fill = {
        type: 'gradient',
        gradient: 'angle',
        degree: 120,
        stops: [
          { position: 0, color: { argb: 'FF142657' } },
          { position: 0.5, color: { argb: 'FF0C225C' } },
          { position: 1, color: { argb: 'FF58D34D' } },
        ],
      };
      sheet.getRow(1).height = 32;

      // Subtitle row
      sheet.mergeCells(2, 3, 2, lastColIndex);
      const subtitleCell = sheet.getCell(2, 3);
      subtitleCell.value = `Month: ${
        data.month || month
      }   |   Generated: ${new Date().toLocaleString('en-GB')}`;
      subtitleCell.font = {
        name: 'Segoe UI',
        size: 11,
        color: { argb: 'FFDBEAFE' },
      };
      subtitleCell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      subtitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0C225C' },
      };
      sheet.getRow(2).height = 20;

      // Freeze header row + first two columns
      sheet.views = [{ state: 'frozen', ySplit: 3, xSplit: 2 }];
      // Professional usability: enable autofilter on header row
      sheet.autoFilter = {
        from: { row: 3, column: 1 },
        to: { row: 3, column: lastColIndex },
      };

      // Table header row (row 3)
      const headerRowIndex = 3;
      const headerRow = sheet.getRow(headerRowIndex);
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = {
          name: 'Segoe UI',
          size: 11,
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0C225C' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
          left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
          bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
          right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        };
      });

      const lateColIndex =
        excelColumns.findIndex((c) => c.key === 'lateCount') + 1;
      const earlyColIndex =
        excelColumns.findIndex((c) => c.key === 'earlyCount') + 1;
      const salaryDaysColIndex =
        excelColumns.findIndex((c) => c.key === 'salaryDeductDays') + 1;
      const grossColIndex =
        excelColumns.findIndex((c) => c.key === 'monthlySalary') + 1;
      const netColIndex =
        excelColumns.findIndex((c) => c.key === 'netSalary') + 1;
      const deductAmountColIndex =
        excelColumns.findIndex((c) => c.key === 'salaryDeductAmount') + 1;

      // Numeric formats
      if (salaryDaysColIndex > 0) {
        sheet.getColumn(salaryDaysColIndex).numFmt = '0.000';
      }
      if (grossColIndex > 0) {
        sheet.getColumn(grossColIndex).numFmt = '#,##0.00';
      }
      if (netColIndex > 0) {
        sheet.getColumn(netColIndex).numFmt = '#,##0.00';
      }
      if (deductAmountColIndex > 0) {
        sheet.getColumn(deductAmountColIndex).numFmt = '#,##0.00';
      }

      // Data rows
      filteredEmployees.forEach((emp, idx) => {
        const rowData = {};

        activeCols.forEach((col) => {
          switch (col.key) {
            case 'empCode':
              rowData[col.key] = emp.empCode;
              break;
            case 'name':
              rowData[col.key] = emp.name || '';
              break;
            case 'department':
              rowData[col.key] = emp.department || '';
              break;
            case 'designation':
              rowData[col.key] = emp.designation || '';
              break;
            case 'shift':
              rowData[col.key] = emp.shift || '';
              break;
            case 'lateCount':
              rowData[col.key] = emp.lateViolationCount ?? emp.lateCount ?? 0;
              break;
            case 'earlyCount':
              rowData[col.key] = emp.earlyViolationCount ?? emp.earlyCount ?? 0;
              break;
            case 'salaryDeductDays':
              rowData[col.key] = emp.salaryDeductDays ?? 0;
              break;
            case 'monthlySalary':
              rowData[col.key] = emp.monthlySalary ?? 0;
              break;
            case 'netSalary':
              rowData[col.key] = emp.netSalary ?? 0;
              break;
            case 'salaryDeductAmount':
              rowData[col.key] = emp.salaryDeductAmount ?? 0;
              break;
            default:
              rowData[col.key] = '';
          }
        });

        if (exportIncludeDays) {
          const apiMonth = data.month || month;

          (emp.days || []).forEach((day, i) => {
            const key = `day_${i + 1}`;

            // in Excel, also blank out upcoming days
            if (isUpcomingDayClient(day.date, apiMonth)) {
              rowData[key] = '';
              return;
            }

            const st = day.status || '';
            const inT = day.checkIn ? formatTimeShort(day.checkIn) : '';
            const outT = day.checkOut ? formatTimeShort(day.checkOut) : '';

            const isPartial =
              (day.checkIn && !day.checkOut) ||
              (!day.checkIn && day.checkOut);

            let punchText = '';
            if (inT && outT) {
              punchText = `${inT} / ${outT}`;
            } else             if (!day.checkIn && !day.checkOut) {
              if (st === 'Holiday' || st === 'Eid Holiday') punchText = st;
              else if (
                st === 'Paid Leave' ||
                st === 'Un Paid Leave' ||
                st === 'Sick Leave' ||
                st === 'Marriage Leave' ||
                st === 'Death Leave' ||
                st === 'Maternity Leave' ||
                st === 'Paternity Leave' ||
                st === 'Hajj Leave' ||
                st === 'Umrah Leave'
              ) {
                punchText = st;
              } else if (st === 'Absent') {
                punchText = 'No Punch';
              } else if (st === 'Leave Without Inform') {
                punchText = 'Leave Without Inform';
              }
            } else if (day.checkIn && !day.checkOut) {
              punchText = `${inT} / Missing Check-Out`;
            } else if (!day.checkIn && day.checkOut) {
              punchText = `Missing Check-In / ${outT}`;
            }

            const flags = [];
            if (day.late) flags.push('Late');
            if (day.earlyLeave || isPartial) flags.push('Early');
            if (day.excused) flags.push('Excused');

            const extra = flags.length ? ` (${flags.join(',')})` : '';

            rowData[key] = `${st}${punchText ? ' ' + punchText : ''}${extra}`;
          });
        }

        if (exportIncludeBankDetails) {
          const bank = bankMap.get(emp.empCode) || {};
          rowData.bankName = bank.bankName || '';
          rowData.accountTitle = bank.accountTitle || '';
          rowData.accountNumber = bank.accountNumber || '';
          rowData.iban = bank.iban || '';
        }

        const row = sheet.addRow(rowData);

        if (idx % 2 === 1) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF3F4F6' },
            };
          });
        }

        if (lateColIndex > 0) {
          const c = row.getCell(lateColIndex);
          if (Number(c.value || 0) > 0) {
            c.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFEE2E2' },
            };
            c.font = { color: { argb: 'FFB91C1C' }, bold: true };
          }
        }

        if (earlyColIndex > 0) {
          const c = row.getCell(earlyColIndex);
          if (Number(c.value || 0) > 0) {
            c.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFEE2E2' },
            };
            c.font = { color: { argb: 'FFB91C1C' }, bold: true };
          }
        }

        if (salaryDaysColIndex > 0) {
          const c = row.getCell(salaryDaysColIndex);
          if (Number(c.value || 0) > 0) {
            c.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF97373' },
            };
            c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
          }
        }

        row.eachCell((cell) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: typeof cell.value === 'number' ? 'center' : 'left',
            wrapText: true,
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        });
      });

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 3) row.height = 18;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance-${data.month || 'month'}-GDS.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      showToast(
        'error',
        'Failed to generate Excel file. Check console for details.'
      );
    }
  }
  // ================== END EXCEL EXPORT =========================

  const glossPill = (variant = 'neutral') => getGlossPillStyles(colors, variant);

  const headerActions = (
    <HrHeaderActions className="monthly-header-actions">
      {canExport && (
        <div className="hr-header-actions__group hr-header-actions__group--export">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || !filteredEmployees.length}
            className="monthly-button"
            style={{
              ...glossPill('neutral'),
              cursor: loading || !filteredEmployees.length ? 'not-allowed' : 'pointer',
              opacity: loading || !filteredEmployees.length ? 0.5 : 1,
            }}
          >
            ⬇ Export to Excel
          </button>
          <button
            type="button"
            onClick={() => setShowExportSettings((prev) => !prev)}
            className="monthly-button monthly-export-gear"
            style={{
              ...glossPill('warm'),
              width: 40,
              minWidth: 40,
              padding: 0,
              justifyContent: 'center',
            }}
            title="Export settings"
          >
            ⚙
          </button>

          {showExportSettings && (
            <div
              className="monthly-export-dropdown"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                padding: '10px 12px',
                borderRadius: 12,
                backgroundColor: colors.background.secondary,
                color: colors.text.primary,
                border: `1px solid ${colors.border.default}`,
                boxShadow: theme === 'dark'
                  ? '0 18px 40px rgba(0,0,0,0.55)'
                  : '0 12px 32px rgba(10,44,84,0.18)',
                minWidth: 260,
                fontSize: 11.5,
                zIndex: 30,
              }}
            >
            <div
              style={{
                marginBottom: 6,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              Export fields
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 180,
                overflowY: 'auto',
              }}
            >
              {exportColumns.map((col) => (
                <label
                  key={col.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={() => toggleExportColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
            <div
              style={{
                marginTop: 8,
                paddingTop: 6,
                borderTop: `1px solid ${colors.border.default}`,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={exportIncludeDays}
                  onChange={(e) => setExportIncludeDays(e.target.checked)}
                />
                <span>Include per-day columns</span>
              </label>
              {canExportBankDetails && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    marginTop: 6,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={exportIncludeBankDetails}
                    onChange={(e) => setExportIncludeBankDetails(e.target.checked)}
                  />
                  <span>Include bank details</span>
                </label>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {canUpdate && (
        <button
          type="button"
          onClick={openBulkModal}
          disabled={loading}
          title="Mark Eid / public holidays for all employees at once"
          className="monthly-button"
          style={{
            ...glossPill('warm'),
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          🕌 Mark Eid / Holidays
        </button>
      )}

      <button
        type="button"
        onClick={loadMonth}
        disabled={loading}
        className="monthly-button"
        style={{
          ...glossPill('neutral'),
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading && (
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: '999px',
              ...spinnerRingStyle('rgba(88,211,77,0.3)', '#58D34D'),
              animation: 'spin 0.7s linear infinite',
            }}
          />
        )}
        {loading ? 'Refreshing…' : 'Reload Month'}
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell
      className="monthly-container"
      subtitle="Monthly Attendance · Violation Policy & Payroll Impact"
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
          @keyframes modalFade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes modalZoom {
            from { opacity: 0; transform: translateY(8px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          [data-theme="dark"] tr.row-hover:hover td {
            background-color: var(--theme-row-hover, rgba(20, 42, 72, 0.95)) !important;
          }
          [data-theme="light"] tr.row-hover:hover td {
            background-color: #e5efff !important;
          }

          /* Monthly header — single aligned toolbar row on desktop */
          @media (min-width: 1024px) {
            .monthly-container .hr-global-header__toolbar {
              flex-wrap: nowrap !important;
              align-items: center !important;
              max-width: none !important;
            }
            .monthly-container .hr-header-actions.monthly-header-actions {
              flex-wrap: nowrap !important;
              justify-content: flex-end !important;
              gap: 8px !important;
            }
            .monthly-container .hr-header-actions__group {
              flex-shrink: 0;
            }
            .monthly-container .hr-header-theme {
              flex-shrink: 0;
              margin-left: 4px;
            }
          }

          @media (max-width: 768px) {
            .monthly-container {
              padding: 16px !important;
            }
            .monthly-header-actions {
              flex-direction: column !important;
              width: 100% !important;
              gap: 8px !important;
            }
            .monthly-header-actions button,
            .monthly-header-actions .hr-header-actions__group {
              width: 100% !important;
            }
            .monthly-header-actions .hr-header-actions__group {
              flex-direction: column !important;
            }
            .monthly-controls {
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 12px !important;
            }
            .monthly-controls > div {
              width: 100% !important;
              min-width: auto !important;
            }
            .monthly-search-input {
              width: 100% !important;
              min-width: auto !important;
            }
            .monthly-legend-text {
              font-size: 10px !important;
              line-height: 1.4 !important;
            }
            .monthly-shift-totals {
              font-size: 11px !important;
            }
            .monthly-table-wrapper {
              max-height: calc(100vh - 400px) !important;
              margin-left: -16px !important;
              margin-right: -16px !important;
              padding-left: 16px !important;
              padding-right: 16px !important;
            }
            .monthly-table {
              min-width: 1200px !important;
              font-size: 11px !important;
            }
            .monthly-table th,
            .monthly-table td {
              padding: 6px 4px !important;
              font-size: 11px !important;
            }
            .monthly-modal {
              width: 100% !important;
              max-width: 100% !important;
              height: 100% !important;
              max-height: 100% !important;
              margin: 0 !important;
              border-radius: 0 !important;
              padding: 20px 16px !important;
            }
            .monthly-modal-content {
              max-height: calc(100vh - 100px) !important;
              overflow-y: auto !important;
            }
          }
          @media (max-width: 480px) {
            .monthly-container {
              padding: 12px !important;
            }
            .monthly-table {
              min-width: 1000px !important;
              font-size: 10px !important;
            }
            .monthly-table th,
            .monthly-table td {
              padding: 4px 2px !important;
              font-size: 10px !important;
            }
          }
          
          /* Laptop & Desktop Responsive Styles */
          @media (min-width: 1024px) and (max-width: 1366px) {
            .monthly-container {
              padding: 20px 24px !important;
            }
            .monthly-header-actions button {
              padding: 8px 14px !important;
              font-size: 12px !important;
            }
            .monthly-table {
              min-width: 1400px !important;
              font-size: 11px !important;
            }
            .monthly-table th,
            .monthly-table td {
              padding: 5px 3px !important;
              font-size: 11px !important;
            }
            .monthly-controls input,
            .monthly-controls select {
              min-width: 200px !important;
              font-size: 12px !important;
            }
            .monthly-search-input {
              min-width: 240px !important;
              font-size: 12px !important;
            }
          }
          
          @media (min-width: 1367px) and (max-width: 1440px) {
            .monthly-container {
              padding: 22px 26px !important;
            }
            .monthly-table {
              min-width: 1500px !important;
              font-size: 11.5px !important;
            }
            .monthly-table th,
            .monthly-table td {
              padding: 6px 4px !important;
              font-size: 11.5px !important;
            }
          }
          
          @media (min-width: 1441px) and (max-width: 1920px) {
            .monthly-container {
              padding: 24px 28px !important;
            }
            .monthly-table {
              font-size: 12px !important;
            }
          }
          
          @media (min-width: 1921px) {
            .monthly-container {
              padding: 28px 32px !important;
            }
            .monthly-table {
              font-size: 13px !important;
            }
            .monthly-table th,
            .monthly-table td {
              padding: 7px 5px !important;
              font-size: 13px !important;
            }
          }
        `,
        }}
      />

        <GlassCard style={{ marginTop: 18 }} padding="24px 28px 28px">
          {/* Controls + summary */}
          <div style={{ marginBottom: 14 }}>
            <div
              className="monthly-controls hr-controls-row"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 18,
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
                    Year
                  </label>
                  <select
                    value={month ? month.split('-')[0] : new Date().getFullYear()}
                    onChange={(e) => {
                      const year = e.target.value;
                      const currentMonth = month ? month.split('-')[1] : String(new Date().getMonth() + 1).padStart(2, '0');
                      setMonth(`${year}-${currentMonth}`);
                    }}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                      minWidth: 100,
                      fontSize: 13,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {Array.from({ length: 10 }, (_, i) => {
                      const year = new Date().getFullYear() - 2 + i;
                      return (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      );
                    })}
                  </select>
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
                    Month
                  </label>
                  <select
                    value={month ? month.split('-')[1] : String(new Date().getMonth() + 1).padStart(2, '0')}
                    onChange={(e) => {
                      const monthValue = e.target.value;
                      const currentYear = month ? month.split('-')[0] : new Date().getFullYear();
                      setMonth(`${currentYear}-${monthValue}`);
                    }}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                      minWidth: 140,
                      fontSize: 13,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="01">January</option>
                    <option value="02">February</option>
                    <option value="03">March</option>
                    <option value="04">April</option>
                    <option value="05">May</option>
                    <option value="06">June</option>
                    <option value="07">July</option>
                    <option value="08">August</option>
                    <option value="09">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>
              </div>

              {/* Search bar */}
              <div className="monthly-search-input" style={{ minWidth: 280 }}>
                  <label
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: 4,
                    color: colors.text.primary,
                  }}
                >
                  Search Employee
                </label>
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 10,
                      fontSize: 13,
                      color: colors.text.tertiary,
                    }}
                  >
                    🔍
                  </span>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by code or name…"
                    style={{
                      padding: '7px 10px 7px 28px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border.input}`,
                      backgroundColor: colors.background.input,
                      color: colors.text.primary,
                      fontSize: 13,
                      outline: 'none',
                      width: '100%',
                    }}
                  />
                </div>
              </div>

              {/* Shift filter */}
              <div style={{ minWidth: 200 }}>
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
                <select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: `1px solid ${colors.border.input}`,
                    backgroundColor: colors.background.input,
                    color: colors.text.primary,
                    fontSize: 13,
                    outline: 'none',
                    width: '100%',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All Shifts</option>
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
                </select>
              </div>

              <div
                className="monthly-shift-totals"
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
                        {shift.code}: <strong>{totalsByShift[shift.code] ?? 0}</strong>
                      </span>
                    ))
                  ) : (
                    <span>No shifts configured</span>
                  )}
                </span>
                <span className="monthly-legend-text">
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>Green</span>{' '}
                  = on-time / all violations excused;{' '}
                  <span style={{ color: '#b45309', fontWeight: 600 }}>Amber</span>{' '}
                  = late arrival (not excused);{' '}
                  <span style={{ color: '#c2410c', fontWeight: 600 }}>Orange</span>{' '}
                  = early departure (not excused);{' '}
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>Red</span>{' '}
                  = both late & early (both not excused) / missing punches / absent;{' '}
                  <span style={{ color: '#6b21a8', fontWeight: 600 }}>Purple</span>{' '}
                  = unpaid leave
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: `linear-gradient(90deg, transparent, ${colors.border.default}, transparent)`,
              margin: '4px 0 10px',
            }}
          />

          {/* Table wrapper */}
          <div
            className="monthly-table-wrapper hr-table-scroll table-responsive"
            style={{
              maxHeight: 'calc(100vh - 320px)',
              overflowX: 'auto',
              overflowY: 'auto',
              borderRadius: 12,
              backgroundColor: colors.background.table.row,
              border: `1px solid ${colors.border.table}`,
            }}
            onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          >
            <table
              className="monthly-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 1600,
              }}
            >
              <thead>
                <tr>
                  {/* Emp Code header frozen */}
                  <th
                    style={{
                      ...headerCell,
                      textAlign: 'left',
                      minWidth: 110,
                      width: 110,
                      maxWidth: 110,
                      left: 0,
                      boxShadow:
                        scrollLeft > 0 ? `2px 0 0 ${colors.border.default}` : 'none',
                    }}
                  >
                    Emp Code
                  </th>
                  {/* Name header frozen */}
                  <th
                    style={{
                      ...headerCell,
                      textAlign: 'left',
                      minWidth: 220,
                      width: 220,
                      maxWidth: 220,
                      left: 110,
                      boxShadow:
                        scrollLeft > 0 ? `2px 0 0 ${colors.border.default}` : 'none',
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      ...headerCell,
                      textAlign: 'left',
                      minWidth: 150,
                    }}
                  >
                    Dept
                  </th>
                  <th
                    style={{
                      ...headerCell,
                      textAlign: 'left',
                      minWidth: 170,
                    }}
                  >
                    Designation
                  </th>
                  <th
                    style={{
                      ...headerCell,
                      minWidth: 70,
                    }}
                  >
                    Shift
                  </th>
                  <th
                    style={{
                      ...headerCell,
                      minWidth: 120,
                    }}
                  >
                    Gross Salary
                  </th>
                  <th
                    style={{
                      ...headerCell,
                      minWidth: 120,
                    }}
                  >
                    Net Salary
                  </th>
                  <th
                    style={{
                      ...headerCell,
                      minWidth: 120,
                    }}
                  >
                    Salary&nbsp;Deduct (Days)
                  </th>
                  <th
                    style={{
                      ...headerCell,
                      minWidth: 70,
                    }}
                    title="Late violations (counted separately for salary deduction)"
                  >
                    Late Violations
                  </th>
                  <th
                    style={{
                      ...headerCell,
                      minWidth: 70,
                    }}
                    title="Early violations (counted separately for salary deduction)"
                  >
                    Early Violations
                  </th>
                  {dayNumbers.map((d) => (
                    <th key={d} style={headerCell}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10 + dayNumbers.length}
                      style={{
                        ...baseCell,
                        textAlign: 'center',
                        color: '#6b7280',
                        backgroundColor: '#f9fafb',
                        padding: '14px 12px',
                      }}
                    >
                      {loading
                        ? 'Loading monthly attendance…'
                        : 'No employees match this filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp, idx) => {
                    const apiMonth = data.month || month;

                    return (
                      <tr key={emp.empCode || idx} className="row-hover">
                        {/* Emp Code frozen col */}
                        <td
                          style={{
                            ...baseCell,
                            textAlign: 'left',
                            fontWeight: 600,
                            minWidth: 110,
                            width: 110,
                            maxWidth: 110,
                            position: 'sticky',
                            left: 0,
                            zIndex: 3,
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            boxShadow:
                              scrollLeft > 0
                                ? '2px 0 0 rgba(148,163,184,0.8)'
                                : 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {emp.empCode}
                        </td>

                        {/* Name frozen col */}
                        <td
                          style={{
                            ...baseCell,
                            textAlign: 'left',
                            minWidth: 220,
                            width: 220,
                            maxWidth: 220,
                            position: 'sticky',
                            left: 110,
                            zIndex: 3,
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            boxShadow:
                              scrollLeft > 0
                                ? '2px 0 0 rgba(148,163,184,0.8)'
                                : 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {emp.name || '-'}
                        </td>

                        <td
                          style={{
                            ...baseCell,
                            textAlign: 'left',
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            minWidth: 150,
                          }}
                        >
                          {emp.department || '-'}
                        </td>
                        <td
                          style={{
                            ...baseCell,
                            textAlign: 'left',
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            minWidth: 170,
                          }}
                        >
                          {emp.designation || '-'}
                        </td>
                        <td
                          style={{
                            ...baseCell,
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            minWidth: 70,
                          }}
                        >
                          {emp.shift || '-'}
                        </td>

                        {/* Gross Salary */}
                        <td
                          style={{
                            ...baseCell,
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            minWidth: 120,
                            textAlign: 'right',
                            fontWeight: 500,
                          }}
                          title={`Gross monthly salary`}
                        >
                          {formatCurrency(emp.monthlySalary || 0)}
                        </td>

                        {/* Net Salary */}
                        <td
                          style={{
                            ...baseCell,
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            minWidth: 120,
                            textAlign: 'right',
                            fontWeight: 600,
                            color:
                              (emp.salaryDeductDays || 0) > 0
                                ? colors.success
                                : colors.text.primary,
                          }}
                          title={`Net salary after deductions`}
                        >
                          {formatCurrency(emp.netSalary || 0)}
                        </td>

                        {/* Salary Deduct (Days) */}
                        <td
                          style={{
                            ...baseCell,
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            fontWeight:
                              (emp.salaryDeductDays || 0) > 0 ? 700 : 400,
                            color:
                              (emp.salaryDeductDays || 0) > 0
                                ? colors.error
                                : colors.text.primary,
                            minWidth: 120,
                          }}
                          title={`Total salary deduction days for this month: ${formatSalaryDays(
                            emp.salaryDeductDays
                          )}`}
                        >
                          {formatSalaryDays(emp.salaryDeductDays)}
                        </td>

                        {/* Late Violations (counted separately) */}
                        <td
                          style={{
                            ...baseCell,
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            fontSize: 11,
                            minWidth: 70,
                          }}
                          title="Late violations (counted separately for deduction)"
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              minWidth: 22,
                              justifyContent: 'center',
                              padding: '1px 6px',
                              borderRadius: 999,
                              backgroundColor:
                                (emp.lateViolationCount ?? emp.lateCount ?? 0) > 0 ? '#fee2e2' : '#e5e7eb',
                              color:
                                (emp.lateViolationCount ?? emp.lateCount ?? 0) > 0 ? '#b91c1c' : '#4b5563',
                              fontWeight: 600,
                            }}
                          >
                            {emp.lateViolationCount ?? emp.lateCount ?? 0}
                          </span>
                        </td>

                        {/* Early Violations (counted separately) */}
                        <td
                          style={{
                            ...baseCell,
                            backgroundColor:
                              idx % 2 === 0 
                                ? colors.background.table.row 
                                : colors.background.table.rowEven,
                            fontSize: 11,
                            minWidth: 70,
                          }}
                          title="Early violations (counted separately for deduction)"
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              minWidth: 22,
                              justifyContent: 'center',
                              padding: '1px 6px',
                              borderRadius: 999,
                              backgroundColor:
                                (emp.earlyViolationCount ?? emp.earlyCount ?? 0) > 0 ? '#fee2e2' : '#e5e7eb',
                              color:
                                (emp.earlyViolationCount ?? emp.earlyCount ?? 0) > 0 ? '#b91c1c' : '#4b5563',
                              fontWeight: 600,
                            }}
                          >
                            {emp.earlyViolationCount ?? emp.earlyCount ?? 0}
                          </span>
                        </td>

                        {/* Day-by-day cells */}
                        {(emp.days || []).map((day, i) => {
                          const upcoming = isUpcomingDayClient(
                            day.date,
                            apiMonth
                          );

                          // Grey blank cell for upcoming days
                          if (upcoming) {
                            return (
                              <td
                                key={`${emp.empCode}-${day.date}-${i}`}
                                style={{
                                  ...baseCell,
                                  backgroundColor:
                                    idx % 2 === 0 ? '#f9fafb' : '#e5e7f8',
                                  color: '#9ca3af',
                                  cursor: 'default',
                                }}
                                title="Upcoming working day – punches not closed yet"
                              >
                                <div
                                  style={{ fontSize: 10, marginBottom: 2 }}
                                >
                                  -
                                </div>
                              </td>
                            );
                          }

                          const isPartial =
                            (day.checkIn && !day.checkOut) ||
                            (!day.checkIn && day.checkOut);
                          const isEarlyLike = day.earlyLeave || isPartial;

                          let punchLabel = '';

                          if (day.checkIn && day.checkOut) {
                            punchLabel = `${formatTimeShort(
                              day.checkIn
                            )} / ${formatTimeShort(day.checkOut)}`;
                          } else if (!day.checkIn && !day.checkOut) {
                            if (day.status === 'Holiday' || day.status === 'Eid Holiday') punchLabel = '';
                            else if (
                              day.status === 'Paid Leave' ||
                              day.status === 'Un Paid Leave' ||
                              day.status === 'Sick Leave' ||
                              day.status === 'Marriage Leave' ||
                              day.status === 'Death Leave' ||
                              day.status === 'Maternity Leave' ||
                              day.status === 'Paternity Leave' ||
                              day.status === 'Hajj Leave' ||
                              day.status === 'Umrah Leave'
                            ) {
                              punchLabel = day.status;
                            } else if (day.status === 'Absent') {
                              punchLabel = 'No Punch';
                            } else if (day.status === 'Work From Home') {
                              punchLabel = 'WFH';
                            } else if (day.status === 'Leave Without Inform') {
                              punchLabel = 'LWI';
                            }
                          } else if (day.checkIn && !day.checkOut) {
                            punchLabel = `${formatTimeShort(
                              day.checkIn
                            )} / Missing Check-Out`;
                          } else if (!day.checkIn && day.checkOut) {
                            punchLabel = `Missing Check-In / ${formatTimeShort(
                              day.checkOut
                            )}`;
                          }

                          const timeInfo = punchLabel
                            ? `Punch: ${punchLabel}`
                            : '';

                          const lateExcused = day.lateExcused !== undefined ? day.lateExcused : (day.excused && day.late);
                          const earlyExcused = day.earlyExcused !== undefined ? day.earlyExcused : (day.excused && day.earlyLeave);
                          
                          const titleParts = [
                            `Date: ${day.date}`,
                            `Status: ${day.status || '—'}`,
                            timeInfo,
                            day.late ? `Late: YES${lateExcused ? ' (Excused)' : ''}` : '',
                            isEarlyLike ? `Early leave: YES${earlyExcused ? ' (Excused)' : ''}` : '',
                            (day.awayHours || 0) > 0
                              ? `Away from seat: ${day.awayHours}h (−${(day.awayDeductionDays || 0).toFixed(3)} day)`
                              : '',
                            day.awayNote ? `Away note: ${day.awayNote}` : '',
                            day.reason ? `HR notes: ${day.reason}` : '',
                          ].filter(Boolean);

                          return (
                            <td
                              key={`${emp.empCode}-${day.date}-${i}`}
                              style={getCellStyle(day, colors, baseCell, theme)}
                              onClick={() => openCellModal(emp, day)}
                              title={titleParts.join(' | ')}
                            >
                              <div style={{ fontSize: 10, marginBottom: 2 }}>
                                {statusShortCode(day.status)}
                              </div>
                              <div style={{ fontSize: 10 }}>{punchLabel}</div>
                              {(Number(day.awayHours) || 0) > 0 && (
                                <div
                                  style={{
                                    marginTop: 2,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: '#7c3aed',
                                  }}
                                >
                                  Away {day.awayHours}h
                                </div>
                              )}
                              {((day.late && (day.lateExcused !== undefined ? day.lateExcused : (day.excused && day.late))) ||
                                (isEarlyLike && (day.earlyExcused !== undefined ? day.earlyExcused : (day.excused && day.earlyLeave)))) && (
                                <div
                                  style={{
                                    marginTop: 2,
                                    fontSize: 9,
                                    fontStyle: 'italic',
                                  }}
                                >
                                  Excused
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>

      {/* Toast */}
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

      {/* Edit Day Modal */}
      {modalOpen && selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            animation: 'modalFade 0.18s ease-out',
          }}
          onClick={closeModal}
        >
          <div
            className="monthly-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 900,
              borderRadius: 22,
              backgroundColor: '#f9fafb',
              border: '1px solid #c7d2fe',
              boxShadow: '0 28px 80px rgba(15,23,42,0.75)',
              padding: '22px 26px 22px',
              color: '#0f172a',
              animation: 'modalZoom 0.18s ease-out',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background:
                  'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(16,185,129,0.08))',
              }}
            />
            <div className="monthly-modal-content" style={{ position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {canUpdate ? 'Edit Attendance' : 'View Attendance'}
                  </h3>
                  <p
                    style={{
                      fontSize: 11,
                      color: '#6b7280',
                    }}
                  >
                    {selected.emp.empCode} – {selected.emp.name} –{' '}
                    {selected.day.date} (Shift {selected.emp.shift || '-'})
                  </p>
                  {!canUpdate && (
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      View only — you cannot change this module.
                    </p>
                  )}
                </div>
                <button
                  onClick={closeModal}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#9ca3af',
                    fontSize: 20,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>

              <fieldset
                disabled={!canUpdate}
                style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}
              >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', gap: 12 }}>
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <label style={{ fontSize: 11, fontWeight: 600 }}>
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #cbd5f5',
                        backgroundColor: '#ffffff',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    >
                      <option value="Present">Present (P)</option>
                      <option value="Holiday">Holiday (H)</option>
                      <option value="Eid Holiday">Eid Holiday (Eid)</option>
                      <option value="Absent">Absent (A)</option>
                      <option value="Sick Leave">Sick Leave (SL)</option>
                      <option value="Paid Leave">Paid Leave (PL)</option>
                      <option value="Un Paid Leave">Un Paid Leave (UPL)</option>
                      <option value="Leave Without Inform">Leave Without Inform (LWI)</option>
                      <option value="Marriage Leave">Marriage Leave (ML)</option>
                      <option value="Death Leave">Death Leave (DL)</option>
                      <option value="Maternity Leave">Maternity Leave (MatL)</option>
                      <option value="Paternity Leave">Paternity Leave (PatL)</option>
                      <option value="Hajj Leave">Hajj Leave</option>
                      <option value="Umrah Leave">Umrah Leave</option>
                      <option value="Work From Home">
                        Work From Home (WFH)
                      </option>
                      <option value="Half Day">Half Day</option>
                    </select>
                  </div>

                  {/* Paid Leave uses quarter-based policy (no casual/annual); set via HR Leaves or here */}
                  {editStatus === 'Paid Leave' && (
                    <div style={{ flex: 1, fontSize: 12, color: '#64748b' }}>
                      Paid leave counts against this quarter’s balance (see HR → Leaves).
                    </div>
                  )}

                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <label style={{ fontSize: 11, fontWeight: 600 }}>
                      Check In
                    </label>
                    <input
                      type="time"
                      value={editCheckIn}
                      onChange={(e) => setEditCheckIn(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #cbd5f5',
                        backgroundColor: '#ffffff',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <label style={{ fontSize: 11, fontWeight: 600 }}>
                      Check Out
                    </label>
                    <input
                      type="time"
                      value={editCheckOut}
                      onChange={(e) => setEditCheckOut(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #cbd5f5',
                        backgroundColor: '#ffffff',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <label style={{ fontSize: 11, fontWeight: 600 }}>
                    Reason / HR Notes
                  </label>
                  <textarea
                    rows={3}
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="e.g. Doctor appointment, system issue, field visit – approved by manager."
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5f5',
                      backgroundColor: '#ffffff',
                      fontSize: 13,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Away from workstation — hourly salary deduction */}
                <div
                  style={{
                    marginTop: 4,
                    padding: '12px 14px',
                    borderRadius: 10,
                    backgroundColor: '#faf5ff',
                    border: '1px solid #e9d5ff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b21a8' }}>
                    Away from workstation (hourly deduction)
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
                    Employee marked attendance but was away from their seat. Enter hours away — salary
                    is deducted proportionally (1 hour away = 1 hour of pay). Standard day:{' '}
                    <strong>8 paid hours</strong> plus 1-hour break (break is not deducted from pay).
                  </p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Hours away</label>
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={editAwayHours}
                        onChange={(e) => setEditAwayHours(e.target.value)}
                        placeholder="0"
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #d8b4fe',
                          backgroundColor: '#ffffff',
                          fontSize: 13,
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>Reported by (optional)</label>
                      <input
                        type="text"
                        value={editAwayReportedBy}
                        onChange={(e) => setEditAwayReportedBy(e.target.value)}
                        placeholder="Team lead / supervisor"
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid #d8b4fe',
                          backgroundColor: '#ffffff',
                          fontSize: 13,
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600 }}>Away reason (optional)</label>
                    <input
                      type="text"
                      value={editAwayNote}
                      onChange={(e) => setEditAwayNote(e.target.value)}
                      placeholder="e.g. Not on chair for 2 hours"
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #d8b4fe',
                        backgroundColor: '#ffffff',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                  </div>
                  {selected && Number(editAwayHours) > 0 && (() => {
                    const paidH = selected.day.shiftHours || 8;
                    const breakM = selected.day.breakMinutes ?? 60;
                    const preview = previewAwayDeduction(
                      selected.emp.monthlySalary,
                      paidH,
                      editAwayHours
                    );
                    return (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#5b21b6',
                          backgroundColor: '#ede9fe',
                          padding: '8px 10px',
                          borderRadius: 8,
                        }}
                      >
                        <strong>{paidH}h paid</strong>
                        {breakM > 0 ? ` (+ ${breakM}min break)` : ''} · Hourly rate ≈{' '}
                        <strong>{formatCurrency(preview.hourly)} PKR</strong> · Deduction:{' '}
                        <strong>{formatCurrency(preview.amount)} PKR</strong> ({preview.days.toFixed(3)}{' '}
                        day)
                      </div>
                    );
                  })()}
                </div>

                {/* Late Excused - only show if there's a late violation */}
                {selected.day.late && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '9px 11px',
                      borderRadius: 10,
                      backgroundColor: '#ecfdf3',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <input
                      id="lateExcuseCheckbox"
                      type="checkbox"
                      checked={editLateExcused}
                      onChange={(e) => setEditLateExcused(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <label
                      htmlFor="lateExcuseCheckbox"
                      style={{
                        fontSize: 11.5,
                        color: '#166534',
                        cursor: 'pointer',
                      }}
                    >
                      Treat <strong>late arrival</strong> as <strong>excused</strong>.
                      This will:
                      <br />• keep the punch times in history, <br />
                      • turn the cell green instead of red, <br />
                      • <strong>exclude</strong> late from Late count & salary deduction.
                    </label>
                  </div>
                )}

                {/* Early Excused - only show if there's an early violation or missing punch */}
                {(selected.day.earlyLeave || (!selected.day.checkIn && selected.day.checkOut) || (selected.day.checkIn && !selected.day.checkOut)) && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '9px 11px',
                      borderRadius: 10,
                      backgroundColor: '#ecfdf3',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <input
                      id="earlyExcuseCheckbox"
                      type="checkbox"
                      checked={editEarlyExcused}
                      onChange={(e) => setEditEarlyExcused(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <label
                      htmlFor="earlyExcuseCheckbox"
                      style={{
                        fontSize: 11.5,
                        color: '#166534',
                        cursor: 'pointer',
                      }}
                    >
                      Treat <strong>early departure</strong> as <strong>excused</strong>.
                      This will:
                      <br />• keep the punch times in history, <br />
                      • turn the cell green instead of red, <br />
                      • <strong>exclude</strong> early from Early count & salary deduction.
                    </label>
                  </div>
                )}
              </div>

              </fieldset>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <button
                  onClick={closeModal}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    border: '1px solid #d1d5db',
                    backgroundColor: 'transparent',
                    color: '#374151',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {canUpdate ? 'Cancel' : 'Close'}
                </button>
                {canUpdate && (
                  <button
                    onClick={handleSaveDay}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 999,
                      border: 'none',
                      background:
                        'linear-gradient(135deg,#2563eb,#38bdf8,#22c55e)',
                      color: '#f9fafb',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      boxShadow: '0 10px 24px rgba(37,99,235,0.45)',
                    }}
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Holiday Modal (e.g. Eid) – applies to ALL employees */}
      {canUpdate && bulkOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            animation: 'modalFade 0.18s ease-out',
          }}
          onClick={closeBulkModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 640,
              borderRadius: 22,
              backgroundColor: '#f9fafb',
              border: '1px solid #c7d2fe',
              boxShadow: '0 28px 80px rgba(15,23,42,0.75)',
              padding: '22px 26px 22px',
              color: '#0f172a',
              animation: 'modalZoom 0.18s ease-out',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 12,
              }}
            >
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                  Mark Eid / Holidays for All Employees
                </h3>
                <p style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
                  Pick the day(s) in{' '}
                  <strong>{data.month || month}</strong> and the status, then
                  Apply. It will be set for <strong>every employee</strong> at
                  once.
                </p>
              </div>
              <button
                onClick={closeBulkModal}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#9ca3af',
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Status */}
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}
            >
              <label style={{ fontSize: 11, fontWeight: 600 }}>Status</label>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5f5',
                  backgroundColor: '#ffffff',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                <option value="Eid Holiday">Eid Holiday (Eid)</option>
                <option value="Holiday">Holiday (H)</option>
                <option value="Present">Present (P)</option>
                <option value="Work From Home">Work From Home (WFH)</option>
                <option value="Absent">Absent (A)</option>
              </select>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Eid Holiday & Holiday are paid (no salary deduction).
              </span>
            </div>

            {/* Day picker */}
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <label style={{ fontSize: 11, fontWeight: 600 }}>
                  Select Day(s){' '}
                  {bulkDays.length > 0 && (
                    <span style={{ color: '#2563eb' }}>
                      ({bulkDays.length} selected)
                    </span>
                  )}
                </label>
                {bulkDays.length > 0 && (
                  <button
                    onClick={() => setBulkDays([])}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#dc2626',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 6,
                }}
              >
                {dayNumbers.map((d) => {
                  const selectedDay = bulkDays.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleBulkDay(d)}
                      style={{
                        padding: '8px 0',
                        borderRadius: 8,
                        border: selectedDay
                          ? '1px solid #2563eb'
                          : '1px solid #d1d5db',
                        backgroundColor: selectedDay ? '#2563eb' : '#ffffff',
                        color: selectedDay ? '#ffffff' : '#374151',
                        fontSize: 13,
                        fontWeight: selectedDay ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reason */}
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}
            >
              <label style={{ fontSize: 11, fontWeight: 600 }}>
                Reason / Note (optional)
              </label>
              <input
                type="text"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="e.g. Eid-ul-Adha holidays"
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5f5',
                  backgroundColor: '#ffffff',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}
            >
              <button
                onClick={closeBulkModal}
                disabled={bulkSaving}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  backgroundColor: 'transparent',
                  color: '#374151',
                  fontSize: 13,
                  cursor: bulkSaving ? 'default' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBulk}
                disabled={bulkSaving || bulkDays.length === 0}
                style={{
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    bulkSaving || bulkDays.length === 0
                      ? '#94a3b8'
                      : 'linear-gradient(135deg,#7c3aed,#2563eb,#06b6d4)',
                  color: '#f9fafb',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor:
                    bulkSaving || bulkDays.length === 0 ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 10px 24px rgba(124,58,237,0.45)',
                }}
              >
                {bulkSaving && (
                  <span
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: '999px',
                      ...spinnerRingStyle('rgba(255,255,255,0.4)', '#ffffff'),
                      animation: 'spin 0.7s linear infinite',
                    }}
                  />
                )}
                {bulkSaving ? 'Applying…' : 'Apply to All Employees'}
              </button>
            </div>
          </div>
        </div>
      )}
    </HrPageShell>
  );
}
