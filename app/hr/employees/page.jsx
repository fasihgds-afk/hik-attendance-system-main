// next-app/app/hr/employees/page.jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "@/lib/theme/ThemeContext";
import { getGlossPillStyles, getTabStyles, getAccentPanelStyles, spinnerRingStyle } from "@/lib/theme/styles";
import { HrPageShell, HrHeaderActions, HrHeaderBadge, GlassCard } from "@/components/glass";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/components/ui/AutoLogoutWarning";
import { sessionHasPermission } from "@/lib/auth/permissionClient";

export default function HrDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession(); // logged-in user
  const { colors, theme } = useTheme(); // Theme colors and current theme mode
  const [tab, setTab] = useState("overview"); // 'overview' | 'employees' | 'attendance'

  const can = (moduleKey, action = "view") => sessionHasPermission(session, moduleKey, action);
  const canRegisterUsers = can("users", "create") || can("users", "view");
  const canViewEmployees = can("employees");
  const canViewArchived = can("archivedEmployees");
  const canViewShifts = can("shifts");
  const canViewPortal = can("portalAccess");
  const canViewDepartments = can("departments");
  const canViewSettings = can("companySettings");
  const canViewViolations = can("violationRules");
  const canViewDaily = can("dailyAttendance");
  const canViewMonthly = can("monthlyAttendance");
  const canViewSalary = can("salaryReport");
  const canViewLeaves = can("leaves");
  const canViewLeavePolicy = can("leavePolicy");
  const canViewComplaints = can("complaints");
  const canViewAssets = can("assets");
  const canViewAttendanceTab = canViewDaily || canViewMonthly || canViewSalary;
  const showHrOverviewStats =
    canViewEmployees || canViewDepartments || canViewLeaves || canViewDaily || canViewMonthly;

  // Auto logout after 30 minutes of inactivity (with 5 minute warning)
  const { showWarning, timeRemaining, handleStayLoggedIn, handleLogout: autoLogout } = useAutoLogout({
    inactivityTime: 30 * 60 * 1000, // 30 minutes
    warningTime: 5 * 60 * 1000, // 5 minutes warning
    enabled: true,
    onLogout: () => {
      signOut({ redirect: false, callbackUrl: '/login?role=hr' }).then(() => {
        router.push('/login?role=hr');
      });
    },
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

  // ---- EMPLOYEE DATA FOR OVERVIEW STATS ----
  // LAZY LOADING: Don't load data immediately - only when needed
  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0); // Total from API meta
  const [statsLoading, setStatsLoading] = useState(false); // Start as false - no loading initially
  const [statsError, setStatsError] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false); // Track if data has been loaded
  
  // Leave statistics state
  const [leaveStats, setLeaveStats] = useState([]);
  const [loadingLeaveStats, setLoadingLeaveStats] = useState(false);

  // Department stats from API (accurate counts for ALL employees)
  const [departmentCounts, setDepartmentCounts] = useState([]);

  // Lazy load function - only called when needed
  // OPTIMIZATION: Load paginated data, use meta.total for stats
  async function loadEmployees() {
    // Prevent duplicate loads
    if (statsLoading || dataLoaded) return;

    let cancelled = false;
    try {
      setStatsLoading(true);
      setStatsError("");

      // OPTIMIZATION: Load first page with limit=50 for better department stats
      const res = await fetch("/api/hr/employees?limit=50&page=1", {
        cache: 'no-store', // Always get fresh data
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const response = await res.json();
      
      // Handle standardized API response format with pagination
      // New format: { success, message, data: { employees }, meta: { total, page, limit, hasNext }, error }
      // Old format (backward compatibility): { employees } or array
      let list = [];
      let total = 0;
      
      if (Array.isArray(response)) {
        list = response;
        total = response.length;
      } else if (response.success !== undefined) {
        // New standardized format with pagination
        if (!response.success) {
          throw new Error(response.error || response.message || 'Failed to load employees');
        }
        list = response.data?.employees || response.data?.items || [];
        // Meta is at top level, not inside data
        total = response.meta?.total || response.data?.meta?.total || list.length;
      } else {
        // Legacy format (backward compatibility)
        list = response.employees || response.items || [];
        total = response.meta?.total || list.length;
      }

      if (!cancelled) {
        setEmployees(list);
        setTotalEmployees(total);
        setDataLoaded(true);
      }
    } catch (err) {
      if (!cancelled) {
        console.error("Employee stats load error:", err);
        setStatsError(err.message || "Failed to load employee stats.");
      }
    } finally {
      if (!cancelled) {
        setStatsLoading(false);
      }
    }
  }

  // Load accurate department counts (ALL employees, not paginated)
  async function loadDepartmentStats() {
    try {
      const res = await fetch("/api/hr/employees/dept-stats", { cache: "no-store" });
      if (res.ok) {
        const response = await res.json();
        if (response.success && response.data?.departmentCounts) {
          setDepartmentCounts(response.data.departmentCounts);
        }
      }
    } catch (err) {
      console.error("Failed to load department stats:", err);
    }
  }

  // Load leave statistics
  async function loadLeaveStats() {
    try {
      setLoadingLeaveStats(true);
      const year = new Date().getFullYear();
      const res = await fetch(`/api/hr/leaves?year=${year}`);
      if (res.ok) {
        const response = await res.json();
        if (response.success) {
          setLeaveStats(response.data?.paidLeaves || []);
        }
      }
    } catch (err) {
      console.error('Failed to load leave stats:', err);
    } finally {
      setLoadingLeaveStats(false);
    }
  }

  // Load data when overview tab is clicked or after a short delay (lazy loading)
  useEffect(() => {
    if (!session || !showHrOverviewStats) return;

    // If overview tab is active, load data after a short delay (non-blocking)
    if (tab === "overview" && !dataLoaded && !statsLoading) {
      // OPTIMIZATION: Reduced delay for faster data loading (page still renders first)
      const timer = setTimeout(() => {
        loadEmployees();
        loadDepartmentStats(); // Accurate counts for ALL employees
        loadLeaveStats();
      }, 100); // 100ms delay - faster perceived performance

      return () => clearTimeout(timer);
    } else if (tab === "overview" && dataLoaded) {
      // Load leave stats and department stats if employees are already loaded
      loadDepartmentStats();
      loadLeaveStats();
    }
  }, [tab, session, dataLoaded, statsLoading, showHrOverviewStats]);


  // 📊 Compute stats from employees + department counts from API
  // departmentCounts: Use API (accurate for ALL employees) when available, else fallback to first page
  const stats = useMemo(() => {
    let activeCount = 0;
    let fallbackDeptCounts = [];

    employees.forEach((emp) => {
      if (
        typeof emp.status === "string" &&
        emp.status.toLowerCase() === "active"
      ) {
        activeCount++;
      }
    });

    // Build fallback from first page only (used before API returns)
    if (employees.length > 0) {
      const deptMap = new Map();
      employees.forEach((emp) => {
        const dept = emp.department || "Unassigned";
        deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      });
      fallbackDeptCounts = Array.from(deptMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    }

    // Use API department counts when available (accurate for ALL employees)
    const deptCounts = departmentCounts.length > 0 ? departmentCounts : fallbackDeptCounts;
    const totalDepts = deptCounts.length;

    return {
      totalEmployees: totalEmployees || employees.length,
      totalDepartments: totalDepts,
      activeEmployees: activeCount || employees.length,
      departmentCounts: deptCounts,
    };
  }, [employees, totalEmployees, departmentCounts]);

  const tabs = [
    { id: "overview", label: "Overview" },
    ...(canViewEmployees || canViewArchived || canRegisterUsers
      ? [{ id: "employees", label: "Employees" }]
      : []),
    ...(canViewAttendanceTab ? [{ id: "attendance", label: "Attendance" }] : []),
  ];

  function openSalaryReport() {
    router.push("/hr/salary-report");
  }

  function openMonthlyAttendance() {
    router.push("/hr/attendance/monthly");
  }

  function openDailyAttendance() {
    router.push("/hr/dashboard"); // Daily attendance dashboard
  }

  function openEmployeesManage() {
    router.push("/hr/employees/manage");
  }

  function openEmployeesDirectory() {
    router.push("/hr/employees/directory");
  }

  function openShiftManagement() {
    router.push("/hr/shifts");
  }

  function openDepartmentPolicies() {
    router.push("/hr/departments");
  }

  function openViolationRules() {
    router.push("/hr/violation-rules");
  }

  function openCompanySettings() {
    router.push("/hr/company-settings");
  }

  function openPortalAccess() {
    router.push("/hr/portal-access");
  }

  function openFormerEmployees() {
    router.push("/hr/employees/archived");
  }

  function openComplaints() {
    router.push("/hr/complaints");
  }

  function openUsersPage() {
    router.push("/hr/users");
  }

  function openAssetsPage() {
    router.push("/hr/assets");
  }

  /** Overview hub cards — same visual language as stats row (kicker, headline, icon, one CTA) */
  const hub = useMemo(() => {
    const isDark = theme === "dark";
    const glassBg = colors.glass.panelBg;
    const brandCyanRgb = "14, 165, 233";
    const labelColor = isDark ? "#bae6fd" : colors.primary[700];
    const subLabelColor = isDark ? "#e2e8f0" : colors.text.secondary;
    const bodyColor = isDark ? "#cbd5e1" : colors.text.secondary;

    const hubBorderColor = colors.glass.border;
    const hubHoverBorderColor = `rgba(${brandCyanRgb}, 0.42)`;
    const hubShadow = colors.glass.shadow;
    const hubHoverShadow = isDark
      ? `0 12px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)`
      : `0 12px 28px rgba(10, 44, 84, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.85)`;
    const hubIconStyle = isDark
      ? {
          bg: `linear-gradient(135deg, rgba(10, 44, 84, 0.72), rgba(6, 21, 37, 0.82))`,
          border: `rgba(${brandCyanRgb}, 0.35)`,
          stroke: colors.primary[400],
        }
      : {
          bg: `linear-gradient(135deg, rgba(224, 242, 254, 0.95), rgba(186, 230, 253, 0.88))`,
          border: `rgba(${brandCyanRgb}, 0.28)`,
          stroke: colors.primary[700],
        };
    const hubBtnStyle = {
      background: `linear-gradient(135deg, ${colors.primary[700]}, ${colors.primary[500]})`,
      color: "#ffffff",
    };

    const hubVariant = {
      borderColor: hubBorderColor,
      boxShadow: hubShadow,
      hoverBorderColor: hubHoverBorderColor,
      hoverShadow: hubHoverShadow,
      background: glassBg,
      kickerColor: labelColor,
      headlineColor: colors.text.primary,
      hintColor: subLabelColor,
      descColor: bodyColor,
      icon: hubIconStyle,
      btn: hubBtnStyle,
    };

    const variants = {
      employees: hubVariant,
      register: hubVariant,
      shift: hubVariant,
      attendance: hubVariant,
      leave: hubVariant,
      settings: hubVariant,
      portal: hubVariant,
      complaints: hubVariant,
      assets: hubVariant,
    };

    const card = (key) => {
      const v = variants[key];
      return {
        borderRadius: 14,
        padding: "16px 18px",
        background: v.background,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: v.borderColor,
        boxShadow: v.boxShadow,
        WebkitBackdropFilter: `blur(${colors.glass.blur}) saturate(${colors.glass.saturate || '130%'})`,
        backdropFilter: `blur(${colors.glass.blur}) saturate(${colors.glass.saturate || '130%'})`,
        position: "relative",
        overflow: "hidden",
        transition: "transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        boxSizing: "border-box",
      };
    };

    const hoverProps = (key) => {
      const v = variants[key];
      return {
        onMouseEnter: (e) => {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = v.hoverShadow;
          e.currentTarget.style.borderColor = v.hoverBorderColor;
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = v.boxShadow;
          e.currentTarget.style.borderColor = v.borderColor;
        },
      };
    };

    const topRow = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 10,
      gap: 10,
    };
    const kicker = (key) => {
      const v = variants[key];
      return {
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: v.kickerColor,
        marginBottom: 6,
        fontWeight: 700,
      };
    };
    const headline = (key) => {
      const v = variants[key];
      return {
        fontSize: "clamp(1.05rem, 1.25vw, 1.2rem)",
        fontWeight: 700,
        color: v.headlineColor,
        lineHeight: 1.3,
        margin: 0,
        letterSpacing: "-0.01em",
      };
    };
    const hint = (key) => {
      const v = variants[key];
      return {
        fontSize: 12,
        color: v.hintColor,
        marginTop: 6,
        fontWeight: 600,
      };
    };
    const desc = (key) => {
      const v = variants[key];
      return {
        fontSize: 13,
        lineHeight: 1.55,
        color: v.descColor,
        margin: "10px 0 0 0",
        flex: "1 1 auto",
        minHeight: "3.75rem",
      };
    };
    const icon48 = (key) => {
      const ic = variants[key].icon;
      return {
        width: 40,
        height: 40,
        borderRadius: 10,
        background: ic.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: ic.border,
        flexShrink: 0,
      };
    };
    const iconStroke = (key) => variants[key].icon.stroke;

    const actionsCol = {
      display: "flex",
      flexDirection: "column",
      marginTop: "auto",
      paddingTop: 12,
      flexShrink: 0,
    };

    const btn = (key) => {
      const b = variants[key].btn;
      return {
        width: "100%",
        minHeight: 40,
        padding: "8px 14px",
        borderRadius: 10,
        border: "none",
        background: b.background,
        color: b.color,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        transition: "filter 0.15s ease, transform 0.15s ease",
        boxShadow: isDark ? "0 4px 14px rgba(14, 165, 233, 0.22)" : "0 2px 8px rgba(15,23,42,0.08)",
      };
    };

    return {
      card,
      hoverProps,
      topRow,
      kicker,
      headline,
      hint,
      desc,
      icon48,
      iconStroke,
      actionsCol,
      btn,
      isDark,
    };
  }, [colors, theme]);

  const glassSurface = useMemo(
    () => ({
      background: colors.glass.panelBg,
      border: `1px solid ${colors.glass.border}`,
      boxShadow: colors.glass.shadow,
      WebkitBackdropFilter: `blur(${colors.glass.blur}) saturate(${colors.glass.saturate || '130%'})`,
      backdropFilter: `blur(${colors.glass.blur}) saturate(${colors.glass.saturate || '130%'})`,
    }),
    [colors]
  );

  const overviewInsightsPanel = useMemo(
    () => ({
      ...glassSurface,
      borderRadius: 18,
      overflow: "hidden",
      marginBottom: 24,
      position: "relative",
    }),
    [glassSurface]
  );

  const glossPill = (variant = "neutral") => getGlossPillStyles(colors, variant);

  const tabPanel = (accent) => getAccentPanelStyles(colors, accent);

  const tabMutedText = colors.text.secondary;

  const headerMeta = session?.user ? (
    <HrHeaderBadge>
      {session.user.email} · {session.user.role}
    </HrHeaderBadge>
  ) : null;

  const headerActions = (
    <HrHeaderActions>
      {canViewAssets && (
        <button type="button" onClick={openAssetsPage} style={glossPill("neutral")}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          IT Assets
        </button>
      )}
      {canViewDepartments && (
        <button type="button" onClick={openDepartmentPolicies} style={glossPill("neutral")}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Departments
        </button>
      )}
      {canViewViolations && (
        <button type="button" onClick={openViolationRules} style={glossPill("warm")}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Violation Rules
        </button>
      )}
      {canViewSettings && (
        <button type="button" onClick={openCompanySettings} style={glossPill("slate")}>
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Company Settings
      </button>
      )}
      {canViewPortal && (
        <button type="button" onClick={openPortalAccess} style={glossPill("rose")}>
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Portal Access
      </button>
      )}
      <button type="button" onClick={handleLogout} style={glossPill("neutral")}>
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Logout
      </button>
    </HrHeaderActions>
  );

  return (
    <HrPageShell
      subtitle="HR & Attendance Management Dashboard"
      meta={headerMeta}
      actions={headerActions}
    >
      <style jsx>{`
          /* Hub: 1 col phone → 2 col tablet → 3 col laptop/desktop; equal row heights */
          .overview-action-grid {
            display: grid;
            gap: clamp(10px, 1.5vw, 14px);
            align-items: stretch;
            grid-template-columns: 1fr;
          }
          @media (min-width: 560px) {
            .overview-action-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
          @media (min-width: 1024px) {
            .overview-action-grid {
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }
          }
          .overview-hub-card-span {
            grid-column: 1 / -1;
            max-width: min(100%, 420px);
            width: 100%;
            justify-self: center;
          }
          .overview-metrics-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .overview-metric {
            padding: 22px 24px;
            border-right: 1px solid rgba(14, 165, 233, 0.15);
          }
          .overview-metric:last-child {
            border-right: none;
          }
          .overview-dept-block {
            padding: 20px 24px 24px;
          }
          .overview-dept-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 14px;
          }
          .overview-dept-chip {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 500;
            color: #e2e8f0;
            background: rgba(15, 55, 95, 0.58);
            border: 1px solid rgba(14, 165, 233, 0.38);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          }
          .overview-dept-chip strong {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 26px;
            height: 22px;
            padding: 0 7px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            color: #ffffff;
            background: rgba(8, 18, 36, 0.7);
            border: 1px solid rgba(14, 165, 233, 0.3);
          }
          @media (max-width: 1280px) {
            .stats-grid {
              grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)) !important;
            }
            .dept-section-header {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 10px !important;
            }
            .tabs-container {
              flex-wrap: wrap !important;
            }
            .tab-button {
              padding: 10px 16px !important;
              font-size: 13px !important;
            }
          }
          @media (max-width: 900px) {
            .overview-action-grid {
              grid-template-columns: minmax(0, 1fr) !important;
            }
            .overview-hub-card-span {
              grid-column: auto !important;
              max-width: none !important;
              justify-self: stretch !important;
            }
          }
          @media (max-width: 768px) {
            .tabs-container {
              flex-wrap: wrap !important;
              gap: 8px !important;
            }
            .tab-button {
              flex: 1 1 auto !important;
              min-width: 100px !important;
              font-size: 12px !important;
              padding: 8px 12px !important;
            }
            .stats-grid {
              grid-template-columns: 1fr !important;
              gap: 12px !important;
            }
            .card-content {
              padding: 16px !important;
            }
          }
          @media (min-width: 1024px) and (max-width: 1366px) {
            .card-content {
              padding: 18px !important;
            }
          }
      `}</style>

      {showWarning && (
        <AutoLogoutWarning
          isOpen={showWarning}
          timeRemaining={timeRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogoutNow={autoLogout}
        />
      )}

      {/* MAIN CARD */}
      <GlassCard
          className="container-responsive"
          padding="16px 20px 20px"
          borderRadius={24}
          style={{
            width: '100%',
            margin: "0 auto",
          }}
        >
        {/* ENHANCED TABS */}
        <div
          className="tabs-container hr-tab-bar"
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
            paddingBottom: 12,
            borderBottom: `1px solid ${colors.glass.border}`,
            position: "relative",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab-button"
              onClick={() => setTab(t.id)}
              style={getTabStyles(colors, tab === t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT – your existing content unchanged */}
        {tab === "overview" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6, color: colors.text.primary, fontWeight: 700 }}>Overview</h2>
            <p
              style={{
                fontSize: 13,
                color: colors.text.secondary,
                marginBottom: 14,
                lineHeight: 1.6,
              }}
            >
              {showHrOverviewStats
                ? "Live snapshot of your workforce – headcount, departments and quick access to employee & attendance tools."
                : "Quick access to the modules available on your account."}
            </p>
            
            {/* Trigger data load when overview tab is viewed */}
            {showHrOverviewStats && !dataLoaded && !statsLoading && (
              <div style={{ 
                padding: "20px", 
                textAlign: "center",
                color: colors.text.secondary,
                fontSize: 14,
              }}>
                <div style={{ marginBottom: 12 }}>📊 Loading statistics...</div>
                <button
                  onClick={loadEmployees}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: `1px solid ${colors.border.default}`,
                    backgroundColor: colors.background.button,
                    color: colors.text.primary,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Load Data Now
                </button>
              </div>
            )}

            {/* Show loading spinner while loading */}
            {showHrOverviewStats && statsLoading && (
              <div style={{ 
                padding: "40px", 
                textAlign: "center",
                color: colors.text.secondary,
                fontSize: 14,
                marginBottom: 24,
              }}>
                <div style={{ 
                  display: "inline-block",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  ...spinnerRingStyle(colors.border.default, colors.primary[500], '4px'),
                  animation: "spin 1s linear infinite",
                  marginBottom: 12,
                }} />
                <div>Loading dashboard data...</div>
              </div>
            )}

            {/* Overview insights — unified metrics + departments */}
            {showHrOverviewStats && dataLoaded && !statsLoading && (
            <div className="overview-insights" style={overviewInsightsPanel}>
              <div aria-hidden="true" style={{ height: 3, background: colors.gradient.primary }} />
              <div className="overview-metrics-strip">
                {[
                  {
                    label: 'Total Employees',
                    value: stats.totalEmployees,
                    foot: (
                      <>
                        <span style={{ color: colors.secondary[400], fontWeight: 700 }}>Active</span>
                        {' '}workforce
                      </>
                    ),
                  },
                  {
                    label: 'Departments',
                    value: stats.totalDepartments,
                    foot: 'Organizational units',
                  },
                  {
                    label: 'Active Employees',
                    value: stats.activeEmployees,
                    foot: 'Currently working',
                  },
                ].map((metric) => (
                  <div key={metric.label} className="overview-metric">
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: 1.4,
                        color: theme === 'dark' ? '#bae6fd' : colors.primary[700],
                        fontWeight: 700,
                        marginBottom: 10,
                      }}
                    >
                      {metric.label}
                    </div>
                    <div
                      style={{
                        fontSize: 40,
                        fontWeight: 800,
                        color: colors.text.primary,
                        lineHeight: 1,
                        marginBottom: 8,
                      }}
                    >
                      {metric.value}
                    </div>
                    <div style={{ fontSize: 13, color: colors.text.secondary }}>{metric.foot}</div>
                  </div>
                ))}
              </div>
              <div
                aria-hidden="true"
                style={{ height: 1, margin: '0 20px', background: 'rgba(14, 165, 233, 0.15)' }}
              />
              <div className="overview-dept-block">
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: colors.text.primary }}>
                  Employees by Department
                </h3>
                <p style={{ fontSize: 13, color: colors.text.secondary, margin: '6px 0 0' }}>
                  Organizational distribution across departments
                </p>
                {statsError && (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 11,
                      color: '#fecaca',
                      backgroundColor: 'rgba(127,29,29,0.3)',
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(248,113,113,0.7)',
                      width: 'fit-content',
                    }}
                  >
                    {statsError}
                  </div>
                )}
                {stats.departmentCounts.length === 0 ? (
                  <div style={{ fontSize: 13, color: colors.text.secondary, marginTop: 14 }}>
                    No employees found yet. Add some from the Employee Manager.
                  </div>
                ) : (
                  <div className="overview-dept-chips">
                    {stats.departmentCounts.map((dept) => (
                      <span key={dept.name} className="overview-dept-chip">
                        {dept.name}
                        <strong>{dept.count}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Overview hub — same glass theme as metrics panel above */}
            <div className="overview-hub-panel" style={{ ...overviewInsightsPanel, marginTop: 4 }}>
              <div aria-hidden="true" style={{ height: 3, background: colors.gradient.primary }} />
              <div className="overview-action-grid" style={{ padding: 16 }}>
{(canViewEmployees || canViewArchived) && (
              <>
              {/* EMPLOYEES */}
              <div style={hub.card("employees")} {...hub.hoverProps("employees")}>
                <div style={hub.topRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={hub.kicker("employees")}>Employees</div>
                    <h3 style={hub.headline("employees")}>Workforce</h3>
                    <div style={hub.hint("employees")}>Profiles, salaries &amp; departments</div>
                  </div>
                  <div style={hub.icon48("employees")} aria-hidden>
                    <svg width="20" height="20" fill="none" stroke={hub.iconStroke("employees")} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <p style={hub.desc("employees")}>
                  Add, edit, and manage employee profiles. Update salaries, shifts, departments, and personal information.
                </p>
                <div style={hub.actionsCol}>
{canViewEmployees && (
                  <button
                    type="button"
                    onClick={openEmployeesManage}
                    style={hub.btn("employees")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Manager
                  </button>
                  )}
                  {canViewArchived && (
                  <button
                    type="button"
                    onClick={openFormerEmployees}
                    style={{
                      ...hub.btn("employees"),
                      background: "transparent",
                      color: colors.text?.secondary || "#64748b",
                      border: `1px solid ${colors.border?.default || "#cbd5e1"}`,
                      boxShadow: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    Former Employees
                  </button>
                  )}
                </div>
              </div>
              </>
              )}


              {canRegisterUsers && (
                <div style={hub.card("register")} {...hub.hoverProps("register")}>
                  <div style={hub.topRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={hub.kicker("register")}>Onboarding</div>
                      <h3 style={hub.headline("register")}>New user</h3>
                      <div style={hub.hint("register")}>Register portal account</div>
                    </div>
                    <div style={hub.icon48("register")} aria-hidden>
                      <svg width="20" height="20" fill="none" stroke={hub.iconStroke("register")} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-3-4a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                    </div>
                  </div>
                  <p style={hub.desc("register")}>
                    Open the users page to create portal logins, set module permissions, and manage existing HR accounts.
                  </p>
                  <div style={hub.actionsCol}>
                    <button
                      type="button"
                      onClick={openUsersPage}
                      style={hub.btn("register")}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.filter = "brightness(1.06)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.filter = "";
                        e.currentTarget.style.transform = "";
                      }}
                    >
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Open Users Page
                    </button>
                  </div>
                </div>
              )}

{canViewShifts && (
              <>
              {/* SHIFT MANAGEMENT */}
              <div style={hub.card("shift")} {...hub.hoverProps("shift")}>
                <div style={hub.topRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={hub.kicker("shift")}>Shifts</div>
                    <h3 style={hub.headline("shift")}>Shift management</h3>
                    <div style={hub.hint("shift")}>Schedules &amp; grace periods</div>
                  </div>
                  <div style={hub.icon48("shift")} aria-hidden>
                    <svg width="20" height="20" fill="none" stroke={hub.iconStroke("shift")} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p style={hub.desc("shift")}>
                  Create and manage shifts, configure shift times, grace periods, and assign shifts to employees with effective dates.
                </p>
                <div style={hub.actionsCol}>
                  <button
                    type="button"
                    onClick={openShiftManagement}
                    style={hub.btn("shift")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Shift Management
                  </button>
                </div>
              </div>
              </>
              )}


              {canViewPortal && (
              <>
              {/* EMPLOYEE PORTAL ACCESS */}
              <div style={hub.card("portal")} {...hub.hoverProps("portal")}>
                <div style={hub.topRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={hub.kicker("portal")}>Security</div>
                    <h3 style={hub.headline("portal")}>Portal access</h3>
                    <div style={hub.hint("portal")}>Block or activate sign-in</div>
                  </div>
                  <div style={hub.icon48("portal")} aria-hidden>
                    <svg width="20" height="20" fill="none" stroke={hub.iconStroke("portal")} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
                <p style={hub.desc("portal")}>
                  Control which employees can log in to the employee portal. Blocked staff see a clear message at login.
                </p>
                <div style={hub.actionsCol}>
                  <button
                    type="button"
                    onClick={openPortalAccess}
                    style={hub.btn("portal")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    Manage Portal Access
                  </button>
                </div>
              </div>
              </>
              )}


              {canViewSettings && (
              <>
              {/* COMPANY SETTINGS */}
              <div style={hub.card("settings")} {...hub.hoverProps("settings")}>
                <div style={hub.topRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={hub.kicker("settings")}>Configuration</div>
                    <h3 style={hub.headline("settings")}>Company settings</h3>
                    <div style={hub.hint("settings")}>Timezone, off-days &amp; salary mode</div>
                  </div>
                  <div style={hub.icon48("settings")} aria-hidden>
                    <svg width="20" height="20" fill="none" stroke={hub.iconStroke("settings")} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>
                <p style={hub.desc("settings")}>
                  Set company timezone, weekly off days, night-shift rules, and how working days per month are calculated.
                </p>
                <div style={hub.actionsCol}>
                  <button
                    type="button"
                    onClick={openCompanySettings}
                    style={hub.btn("settings")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    Open Company Settings
                  </button>
                </div>
              </div>
              </>
              )}


              {canViewAttendanceTab && (
              <>
              {/* ATTENDANCE */}
              <div style={hub.card("attendance")} {...hub.hoverProps("attendance")}>
                <div style={hub.topRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={hub.kicker("attendance")}>Attendance</div>
                    <h3 style={hub.headline("attendance")}>Time &amp; punches</h3>
                    <div style={hub.hint("attendance")}>Daily &amp; monthly views</div>
                  </div>
                  <div style={hub.icon48("attendance")} aria-hidden>
                    <svg width="20" height="20" fill="none" stroke={hub.iconStroke("attendance")} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                </div>
                <p style={hub.desc("attendance")}>
                  View daily punches and monthly summaries, including late/early flags and comprehensive reports.
                </p>
                <div style={hub.actionsCol}>
                  <button
                    type="button"
                    onClick={() => setTab("attendance")}
                    style={hub.btn("attendance")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Go to Attendance Center
                  </button>
                </div>
              </div>
              </>
              )}


              {(canViewLeaves || canViewLeavePolicy) && (
              <>
              {/* LEAVE MANAGEMENT */}
              <div style={hub.card("leave")} {...hub.hoverProps("leave")}>
                <div style={hub.topRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={hub.kicker("leave")}>Leave</div>
                    <h3 style={hub.headline("leave")}>Leave management</h3>
                    <div style={hub.hint("leave")}>Balances &amp; policies</div>
                  </div>
                  <div style={hub.icon48("leave")} aria-hidden>
                    <svg width="20" height="20" fill="none" stroke={hub.iconStroke("leave")} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <p style={hub.desc("leave")}>
                  View all employees&apos; paid leave balances, mark casual/annual leaves, and track leave usage statistics.
                </p>
                <div style={hub.actionsCol}>
                  <button
                    type="button"
                    onClick={() => router.push("/hr/leaves")}
                    style={hub.btn("leave")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View All Leaves
                  </button>
                </div>
              </div>
              </>
              )}


              {canViewAssets && (
              <>
              <div style={hub.card("assets")} {...hub.hoverProps("assets")}>
                <div style={hub.topRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={hub.kicker("assets")}>IT Admin</div>
                    <h3 style={hub.headline("assets")}>IT Assets</h3>
                    <div style={hub.hint("assets")}>Laptops, PCs &amp; accessories</div>
                  </div>
                  <div style={hub.icon48("assets")} aria-hidden>
                    <svg width="20" height="20" fill="none" stroke={hub.iconStroke("assets")} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <p style={hub.desc("assets")}>
                  Manage company hardware inventory and assign laptops, desktops, monitors, keyboards, mice and related gear to employees.
                </p>
                <div style={hub.actionsCol}>
                  <button
                    type="button"
                    onClick={openAssetsPage}
                    style={hub.btn("assets")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    Open IT Assets
                  </button>
                </div>
              </div>
              </>
              )}


              {canViewComplaints && (
              <>
              {/* COMPLAINTS — centered span only when 5 tiles (no register card) */}
              <div
                className={canRegisterUsers ? undefined : "overview-hub-card-span"}
                style={hub.card("complaints")}
                {...hub.hoverProps("complaints")}
              >
                <div style={hub.topRow}>
                  <div style={{ minWidth: 0 }}>
                    <div style={hub.kicker("complaints")}>Complaints</div>
                    <h3 style={hub.headline("complaints")}>Employee feedback</h3>
                    <div style={hub.hint("complaints")}>Respond &amp; track cases</div>
                  </div>
                  <div style={hub.icon48("complaints")} aria-hidden>
                    <svg width="20" height="20" fill="none" stroke={hub.iconStroke("complaints")} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <p style={hub.desc("complaints")}>
                  View and respond to employee complaints. Update status, add HR response, and manage internal notes.
                </p>
                <div style={hub.actionsCol}>
                  <button
                    type="button"
                    onClick={openComplaints}
                    style={hub.btn("complaints")}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.06)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "";
                      e.currentTarget.style.transform = "";
                    }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Open Complaints
                  </button>
                </div>
              </div>
              </>
              )}

            </div>
            </div>
          </div>
        )}

        {tab === "employees" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6, color: colors.text.primary }}>Employees</h2>
            <p
              style={{
                fontSize: 13,
                color: tabMutedText,
                marginBottom: 14,
              }}
            >
              Shortcut to open the full employee management console at{" "}
              <code>/hr/employees/manage</code>.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              <div style={tabPanel(theme === 'dark' ? 'rgba(37,99,235,0.55)' : 'rgba(37,99,235,0.28)')}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>
                  Employee Shift Management
                </div>
                <div style={{ fontSize: 12, color: tabMutedText }}>
                  Add employees, edit full profiles, shift assignments, salary details, and secure bank details.
                </div>

                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {canRegisterUsers && (
                    <button
                      type="button"
                      onClick={openUsersPage}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 999,
                        border: "none",
                        background: "linear-gradient(135deg,#f97316,#fb7185)",
                        color: "#111827",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Manage Portal Users
                    </button>
                  )}

                  {canViewEmployees && (
                  <button
                    type="button"
                    onClick={openEmployeesManage}
                    style={{
                      padding: "8px 18px",
                      borderRadius: 999,
                      border: "none",
                      background: "linear-gradient(135deg,#22c55e,#2dd4bf)",
                      color: "#022c22",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Open Employee Manager
                  </button>
                  )}
                </div>
              </div>

              {canViewEmployees && (
              <div style={tabPanel(theme === 'dark' ? 'rgba(16,185,129,0.55)' : 'rgba(16,185,129,0.28)')}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary }}>
                  Employee Directory (Read-Only)
                </div>
                <div style={{ fontSize: 12, color: tabMutedText }}>
                  Fast lookup page for HR with basic employee information only. No edit controls, cleaner for quick checks.
                </div>
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={openEmployeesDirectory}
                    style={{
                      padding: "8px 18px",
                      borderRadius: 999,
                      border: "none",
                      background: "linear-gradient(135deg,#10b981,#34d399)",
                      color: "#022c22",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Open Directory
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        )}

        {tab === "attendance" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6, color: colors.text.primary }}>
              Attendance Center
            </h2>
            <p
              style={{
                fontSize: 13,
                color: tabMutedText,
                marginBottom: 14,
              }}
            >
              Choose whether you want to see <strong>daily punches</strong> or{" "}
              <strong>monthly summaries</strong>. These buttons open{" "}
              <code>/hr/dashboard</code> and <code>/hr/attendance/monthly</code>.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              {/* Daily attendance card */}
              {canViewDaily && (
              <div style={tabPanel(theme === 'dark' ? 'rgba(34,197,94,0.55)' : 'rgba(34,197,94,0.28)')}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: colors.text.primary,
                  }}
                >
                  Daily Attendance
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: colors.text.secondary,
                    marginBottom: 10,
                  }}
                >
                  View all punches for a single day — in/out times, lates,
                  early-outs and absents for each employee.
                </p>
                <button
                  type="button"
                  onClick={openDailyAttendance}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(135deg,#22c55e,#16a34a)",
                    color: "#022c22",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Daily Attendance
                </button>
              </div>
              )}

              {/* Monthly attendance card */}
              {canViewMonthly && (
              <div style={tabPanel(theme === 'dark' ? 'rgba(14,165,233,0.5)' : 'rgba(14,165,233,0.28)')}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: colors.text.primary,
                  }}
                >
                  Monthly Attendance
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: colors.text.secondary,
                    marginBottom: 10,
                  }}
                >
                  Open your existing monthly view to see totals for each
                  employee: presents, absents, lates, early-outs and salary
                  deductions.
                </p>
                <button
                  type="button"
                  onClick={openMonthlyAttendance}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      `linear-gradient(135deg, ${colors.primary[500]}, ${colors.secondary[500]})`,
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Monthly Attendance
                </button>
              </div>
              )}

              {/* Salary report card */}
              {canViewSalary && (
              <div style={tabPanel(theme === 'dark' ? 'rgba(168,85,247,0.55)' : 'rgba(168,85,247,0.28)')}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 6,
                    color: colors.text.primary,
                  }}
                >
                  Salary Report
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: colors.text.secondary,
                    marginBottom: 10,
                  }}
                >
                  View and download net salary (after deduction) by employee
                  and month — PDF or Excel.
                </p>
                <button
                  type="button"
                  onClick={openSalaryReport}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(135deg,#a855f7,#6366f1)",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Salary Report
                </button>
              </div>
              )}
            </div>
          </div>
        )}
      </GlassCard>
    </HrPageShell>
  );
}
