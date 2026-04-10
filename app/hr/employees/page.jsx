// next-app/app/hr/employees/page.jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "@/lib/theme/ThemeContext";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import AutoLogoutWarning from "@/components/ui/AutoLogoutWarning";
import RegisterUserModal from "@/components/users/RegisterUserModal";

export default function HrDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession(); // logged-in user
  const { colors, theme } = useTheme(); // Theme colors and current theme mode
  const [tab, setTab] = useState("overview"); // 'overview' | 'employees' | 'attendance'

  // Treat HR as admin (you can later add ADMIN role)
  const isAdmin = session?.user?.role === "HR";

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
  const [showRegisterModal, setShowRegisterModal] = useState(false);
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
    if (!session) return;

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
  }, [tab, session, dataLoaded, statsLoading]);


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
    { id: "employees", label: "Employees" },
    { id: "attendance", label: "Attendance" },
  ];

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

  function openComplaints() {
    router.push("/hr/complaints");
  }

  function openRegisterModal() {
    setShowRegisterModal(true);
  }

  function closeRegisterModal() {
    setShowRegisterModal(false);
  }

  function handleRegisterSuccess() {
    // Optionally refresh data or show a toast
    // You can add a toast notification here if needed
  }

  /** Overview hub cards — same visual language as stats row (kicker, headline, icon, one CTA) */
  const hub = useMemo(() => {
    const isDark = theme === "dark";
    const shD = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
    const shL = "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)";

    const variants = {
      employees: {
        border: `1px solid rgba(59, 130, 246, 0.28)`,
        boxShadow: isDark ? shD : shL,
        hoverBorder: "1px solid rgba(59, 130, 246, 0.5)",
        hoverShadow: isDark
          ? "0 12px 32px rgba(59, 130, 246, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          : "0 12px 28px rgba(59, 130, 246, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        background: colors.gradient.card,
        kickerColor: colors.text.tertiary,
        headlineColor: colors.text.primary,
        hintColor: colors.text.muted,
        descColor: colors.text.secondary,
        icon: {
          bg: "linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(59, 130, 246, 0.1))",
          border: "1px solid rgba(59, 130, 246, 0.35)",
          stroke: "#60a5fa",
        },
        btn: { background: colors.primary[600], color: "#ffffff" },
      },
      register: {
        border: "1px solid rgba(251, 146, 60, 0.4)",
        boxShadow: isDark ? shD : shL,
        hoverBorder: "1px solid rgba(253, 186, 116, 0.65)",
        hoverShadow: isDark
          ? "0 12px 32px rgba(234, 88, 12, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          : "0 12px 28px rgba(234, 88, 12, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        background: isDark
          ? "linear-gradient(135deg, #7c2d12 0%, #9a3412 100%)"
          : "linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)",
        kickerColor: isDark ? "#fdba74" : "#c2410c",
        headlineColor: colors.text.primary,
        hintColor: isDark ? "#fdba74" : "#ea580c",
        descColor: isDark ? "rgba(255, 255, 255, 0.85)" : colors.text.secondary,
        icon: {
          bg: "linear-gradient(135deg, rgba(251, 146, 60, 0.35), rgba(251, 146, 60, 0.12))",
          border: "1px solid rgba(253, 186, 116, 0.45)",
          stroke: "#fb923c",
        },
        btn: {
          background: isDark ? "rgba(255, 255, 255, 0.92)" : "#ea580c",
          color: isDark ? "#7c2d12" : "#ffffff",
        },
      },
      shift: {
        border: `1px solid rgba(99, 102, 241, 0.35)`,
        boxShadow: isDark ? shD : shL,
        hoverBorder: "1px solid rgba(129, 140, 248, 0.55)",
        hoverShadow: isDark
          ? "0 12px 32px rgba(99, 102, 241, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          : "0 12px 28px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        background: isDark
          ? `linear-gradient(135deg, ${colors.primary[900]} 0%, ${colors.primary[800]} 100%)`
          : `linear-gradient(135deg, ${colors.primary[100]} 0%, ${colors.primary[200]} 100%)`,
        kickerColor: isDark ? colors.primary[300] : colors.primary[700],
        headlineColor: colors.text.primary,
        hintColor: isDark ? "#a5b4fc" : colors.primary[700],
        descColor: isDark ? "rgba(255, 255, 255, 0.82)" : colors.text.secondary,
        icon: {
          bg: "linear-gradient(135deg, rgba(99, 102, 241, 0.32), rgba(99, 102, 241, 0.14))",
          border: "1px solid rgba(129, 140, 248, 0.45)",
          stroke: "#a5b4fc",
        },
        btn: {
          background: isDark ? "rgba(255, 255, 255, 0.92)" : colors.primary[700],
          color: isDark ? colors.primary[900] : "#ffffff",
        },
      },
      attendance: {
        border: `1px solid rgba(34, 197, 94, 0.35)`,
        boxShadow: isDark ? shD : shL,
        hoverBorder: "1px solid rgba(74, 222, 128, 0.55)",
        hoverShadow: isDark
          ? "0 12px 32px rgba(34, 197, 94, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          : "0 12px 28px rgba(34, 197, 94, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        background: isDark
          ? `linear-gradient(135deg, ${colors.secondary[900]} 0%, ${colors.secondary[800]} 100%)`
          : `linear-gradient(135deg, ${colors.secondary[100]} 0%, ${colors.secondary[200]} 100%)`,
        kickerColor: isDark ? colors.secondary[300] : colors.secondary[700],
        headlineColor: colors.text.primary,
        hintColor: isDark ? "#86efac" : colors.secondary[700],
        descColor: isDark ? "rgba(255, 255, 255, 0.82)" : colors.text.secondary,
        icon: {
          bg: "linear-gradient(135deg, rgba(34, 197, 94, 0.32), rgba(34, 197, 94, 0.14))",
          border: "1px solid rgba(74, 222, 128, 0.45)",
          stroke: "#4ade80",
        },
        btn: {
          background: isDark ? "rgba(255, 255, 255, 0.92)" : colors.secondary[700],
          color: isDark ? "#14532d" : "#ffffff",
        },
      },
      leave: {
        border: "1px solid rgba(45, 212, 191, 0.35)",
        boxShadow: isDark ? shD : shL,
        hoverBorder: "1px solid rgba(45, 212, 191, 0.55)",
        hoverShadow: isDark
          ? "0 12px 32px rgba(20, 184, 166, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          : "0 12px 28px rgba(20, 184, 166, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        background: isDark
          ? "linear-gradient(135deg, #134e4a 0%, #115e59 100%)"
          : "linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)",
        kickerColor: isDark ? "#5eead4" : "#0f766e",
        headlineColor: colors.text.primary,
        hintColor: isDark ? "#99f6e4" : "#0d9488",
        descColor: isDark ? "rgba(255, 255, 255, 0.82)" : colors.text.secondary,
        icon: {
          bg: "linear-gradient(135deg, rgba(20, 184, 166, 0.3), rgba(20, 184, 166, 0.12))",
          border: "1px solid rgba(45, 212, 191, 0.4)",
          stroke: "#2dd4bf",
        },
        btn: {
          background: isDark ? "rgba(255, 255, 255, 0.92)" : "#0f766e",
          color: isDark ? "#134e4a" : "#ffffff",
        },
      },
      complaints: {
        border: "1px solid rgba(167, 139, 250, 0.35)",
        boxShadow: isDark ? shD : shL,
        hoverBorder: "1px solid rgba(196, 181, 253, 0.55)",
        hoverShadow: isDark
          ? "0 12px 32px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          : "0 12px 28px rgba(139, 92, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        background: isDark
          ? "linear-gradient(135deg, #4c1d95 0%, #5b21b6 100%)"
          : "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)",
        kickerColor: isDark ? "#d8b4fe" : "#6d28d9",
        headlineColor: colors.text.primary,
        hintColor: isDark ? "#c4b5fd" : "#5b21b6",
        descColor: isDark ? "rgba(255, 255, 255, 0.82)" : colors.text.secondary,
        icon: {
          bg: "linear-gradient(135deg, rgba(139, 92, 246, 0.32), rgba(139, 92, 246, 0.14))",
          border: "1px solid rgba(167, 139, 250, 0.45)",
          stroke: "#c4b5fd",
        },
        btn: {
          background: isDark ? "rgba(255, 255, 255, 0.92)" : "#6d28d9",
          color: isDark ? "#4c1d95" : "#ffffff",
        },
      },
    };

    const card = (key) => {
      const v = variants[key];
      return {
        borderRadius: 14,
        padding: "16px 18px",
        background: v.background,
        border: v.border,
        boxShadow: v.boxShadow,
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
          e.currentTarget.style.border = v.hoverBorder;
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = v.boxShadow;
          e.currentTarget.style.border = v.border;
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
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: v.kickerColor,
        marginBottom: 6,
        fontWeight: 600,
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
        fontSize: 11,
        color: v.hintColor,
        marginTop: 6,
        fontWeight: 500,
      };
    };
    const desc = (key) => {
      const v = variants[key];
      return {
        fontSize: 12,
        lineHeight: 1.5,
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
        border: ic.border,
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
        boxShadow: isDark ? "0 4px 14px rgba(0,0,0,0.2)" : "0 2px 8px rgba(15,23,42,0.08)",
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

  const headerActionBtn = {
    padding: "8px 14px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 7,
    minHeight: 40,
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  };

  return (
    <>
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
          .header-text-stack {
            min-width: 0;
          }
          .header-buttons {
            flex-wrap: wrap;
            align-items: center;
            justify-content: flex-end;
            gap: 6px;
            flex: 0 0 auto;
            align-self: center;
            min-width: 0;
          }
          .header-buttons > button {
            flex: 0 0 auto;
          }
          .header-buttons button svg {
            width: 18px !important;
            height: 18px !important;
            flex-shrink: 0;
          }
          @media (min-width: 1024px) {
            .header-buttons {
              gap: 8px !important;
            }
            .header-buttons button {
              padding: 9px 16px !important;
              font-size: 14px !important;
              min-height: 44px !important;
            }
            .header-buttons button svg {
              width: 20px !important;
              height: 20px !important;
            }
          }
          @media (min-width: 1440px) {
            .header-buttons button {
              padding: 10px 18px !important;
              font-size: 15px !important;
              min-height: 46px !important;
            }
            .header-buttons button svg {
              width: 21px !important;
              height: 21px !important;
            }
          }
          @media (max-width: 1280px) {
            .header-container {
              padding: 16px 20px !important;
            }
            .header-brand-row {
              gap: 12px !important;
            }
            .header-buttons {
              justify-content: flex-end !important;
              gap: 8px !important;
            }
            .stats-grid {
              grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)) !important;
            }
            .dept-section-header {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 10px !important;
            }
            .main-container {
              padding: 18px 16px 24px !important;
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
          .header-brand-row {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .header-buttons {
            justify-content: flex-start !important;
            width: 100% !important;
            align-self: stretch !important;
          }
          .header-logo {
            width: 60px !important;
            height: 60px !important;
          }
          .header-title {
            font-size: 18px !important;
          }
          .header-subtitle {
            font-size: 11px !important;
          }
          .header-buttons button {
            flex: 1 1 calc(50% - 4px) !important;
            min-width: 120px !important;
            justify-content: center !important;
          }
          .main-container {
            padding: 16px !important;
          }
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
        @media (max-width: 480px) {
          .main-container {
            padding: 12px !important;
          }
          .header-title {
            font-size: 16px !important;
          }
        }
        
        /* Laptop & Desktop Responsive Styles */
        @media (min-width: 1024px) and (max-width: 1366px) {
          .main-container {
            padding: 20px 24px !important;
          }
          .header-container {
            padding: 16px 20px !important;
          }
          .header-logo {
            width: 56px !important;
            height: 56px !important;
          }
          .header-title {
            font-size: 19px !important;
          }
          .header-buttons {
            flex-wrap: wrap !important;
          }
          .card-content {
            padding: 18px !important;
          }
        }
        
        @media (min-width: 1367px) and (max-width: 1440px) {
          .main-container {
            padding: 22px 26px !important;
          }
        }
        
        @media (min-width: 1441px) and (max-width: 1920px) {
          .main-container {
            padding: 24px 28px !important;
          }
        }
        
        @media (min-width: 1921px) {
          .main-container {
            padding: 28px 32px !important;
          }
          .header-title {
            font-size: 24px !important;
          }
          .header-logo {
            width: 72px !important;
            height: 72px !important;
          }
        }
      `}</style>
      <div
        className="main-container"
        style={{
          minHeight: "100vh",
          width: "100%",
          maxWidth: "100%",
          marginLeft: 0,
          marginRight: 0,
          boxSizing: "border-box",
          padding: "24px 28px 32px",
          background: colors.gradient.overlay,
          color: colors.text.primary,
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
      {/* 🔹 ENHANCED PROFESSIONAL HEADER */}
      <div className="container-responsive" style={{ margin: "0 auto 24px auto", width: '100%' }}>
        <div
          className="header-container"
            style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "18px 22px",
            borderRadius: 20,
            background: colors.gradient.header,
            color: theme === 'dark' ? '#ffffff' : colors.text.primary,
            boxShadow: theme === 'dark' 
              ? "0 20px 50px rgba(19, 168, 229, 0.25), 0 8px 16px rgba(0, 0, 0, 0.3)"
              : "0 20px 50px rgba(59, 130, 246, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1)",
            border: `1px solid ${colors.border.default}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Background Pattern */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)",
              pointerEvents: "none",
            }}
          />
          <div
            className="header-brand-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              width: "100%",
              position: "relative",
              zIndex: 1,
              minWidth: 0,
            }}
          >
            <div
              className="header-logo"
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                overflow: "hidden",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 6px 14px rgba(0, 0, 0, 0.2)",
                border: "2px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              <img
                src="/gds.png"
                alt="Global Digital Solutions logo"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
            <div
              className="header-text-stack"
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}
            >
                <div
                  className="header-title"
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: 0.4,
                    margin: 0,
                    lineHeight: 1.2,
                    textShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
                  }}
                >
                  Global Digital Solutions
                </div>
              <div
                className="header-subtitle"
                style={{
                  fontSize: 13,
                  opacity: 0.95,
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                HR &amp; Attendance Management Dashboard
              </div>
              {session?.user && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "rgba(255, 255, 255, 0.9)",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    padding: "4px 10px",
                    borderRadius: 12,
                    width: "fit-content",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                  }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.8 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>{session.user.email}</span>
                  <span style={{ opacity: 0.6 }}>•</span>
                  <span style={{ fontWeight: 600 }}>{session.user.role}</span>
                </div>
              )}
            </div>
            <div
              className="header-buttons"
              style={{
                display: "flex",
                alignItems: "center",
                position: "relative",
                zIndex: 1,
              }}
            >
              <button
                type="button"
                onClick={openDepartmentPolicies}
                style={{
                  ...headerActionBtn,
                  border: "1px solid rgba(255, 255, 255, 0.28)",
                  backgroundColor: "rgba(255, 255, 255, 0.14)",
                  color: "#ffffff",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.24)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.14)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Departments
              </button>

              <button
                type="button"
                onClick={openViolationRules}
                style={{
                  ...headerActionBtn,
                  border: "1px solid rgba(245, 158, 11, 0.45)",
                  backgroundColor: "rgba(245, 158, 11, 0.18)",
                  color: "#ffffff",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 2px 8px rgba(245, 158, 11, 0.2)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(245, 158, 11, 0.28)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(245, 158, 11, 0.18)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Violation Rules
              </button>

              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                style={{
                  ...headerActionBtn,
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  background:
                    theme === "dark"
                      ? `linear-gradient(135deg, ${colors.background.card} 0%, ${colors.background.secondary} 100%)`
                      : "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)",
                  color: theme === "dark" ? colors.text.primary : colors.primary[700],
                  fontWeight: 700,
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.15)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.filter = "brightness(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.filter = "";
                }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
              <ThemeToggle />
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  ...headerActionBtn,
                  border: "1px solid rgba(255, 255, 255, 0.28)",
                  backgroundColor: "rgba(255, 255, 255, 0.14)",
                  color: "#ffffff",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.24)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.14)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Auto Logout Warning */}
      {showWarning && (
        <AutoLogoutWarning
          isOpen={showWarning}
          timeRemaining={timeRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogoutNow={autoLogout}
        />
      )}

      {/* Register User Modal */}
      <RegisterUserModal
        isOpen={showRegisterModal}
        onClose={closeRegisterModal}
        onSuccess={handleRegisterSuccess}
      />

      {/* MAIN CARD */}
      <div
          className="container-responsive"
          style={{
          width: '100%',
          margin: "0 auto",
          borderRadius: 16,
          background: colors.background.card,
          boxShadow: theme === 'dark' 
            ? "0 20px 60px rgba(15,23,42,0.9)"
            : "0 20px 60px rgba(0,0,0,0.08)",
          padding: "16px 20px 20px",
          border: `1px solid ${colors.border.default}`,
        }}
      >
        {/* ENHANCED TABS */}
        <div
          className="tabs-container"
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
            paddingBottom: 12,
            borderBottom: `2px solid ${colors.border.default}`,
            position: "relative",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab-button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: tab === t.id ? `${colors.primary[500]}20` : "transparent",
                color: tab === t.id ? colors.primary[500] : colors.text.muted,
                position: "relative",
                transition: "all 0.2s",
                borderBottom: tab === t.id ? `2px solid ${colors.primary[500]}` : "2px solid transparent",
                marginBottom: "-14px",
              }}
              onMouseEnter={(e) => {
                if (tab !== t.id) {
                  e.currentTarget.style.backgroundColor = colors.background.hover;
                  e.currentTarget.style.color = colors.text.secondary;
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t.id) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = colors.text.muted;
                }
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT – your existing content unchanged */}
        {tab === "overview" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6, color: colors.text.primary }}>Overview</h2>
            <p
              style={{
                fontSize: 13,
                color: colors.text.muted,
                marginBottom: 14,
              }}
            >
              Live snapshot of your workforce – headcount, departments and quick
              access to employee &amp; attendance tools.
            </p>
            
            {/* Trigger data load when overview tab is viewed */}
            {!dataLoaded && !statsLoading && (
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
            {statsLoading && (
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
                  border: `4px solid ${colors.border.default}`,
                  borderTopColor: colors.primary[500],
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  marginBottom: 12,
                }} />
                <div>Loading dashboard data...</div>
              </div>
            )}

            {/* ENHANCED STATS CARDS - Only show when data is loaded */}
            {dataLoaded && !statsLoading && (
            <div
              className="stats-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
                marginBottom: 24,
              }}
            >
              {/* Total Employees */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "20px 24px",
                  background: colors.gradient.card,
                  border: `1px solid ${colors.primary[500]}33`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(59, 130, 246, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.2)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        color: colors.text.tertiary,
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      Total Employees
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: colors.text.primary,
                        lineHeight: 1,
                        marginBottom: 8,
                      }}
                    >
                      {statsLoading ? (
                        <span style={{ fontSize: 24, color: colors.text.muted }}>⋯</span>
                      ) : (
                        stats.totalEmployees
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#3b82f6" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ color: colors.success, fontWeight: 600 }}>Active</span>
                  <span>workforce</span>
                </div>
              </div>

              {/* Departments */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "20px 24px",
                  background: theme === 'dark' 
                    ? `linear-gradient(135deg, ${colors.primary[900]} 0%, ${colors.primary[800]} 100%)`
                    : `linear-gradient(135deg, ${colors.primary[100]} 0%, ${colors.primary[200]} 100%)`,
                  border: `1px solid ${colors.primary[500]}33`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        color: theme === 'dark' ? colors.primary[300] : colors.primary[700],
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      Departments
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: colors.text.primary,
                        lineHeight: 1,
                        marginBottom: 8,
                      }}
                    >
                      {statsLoading ? (
                        <span style={{ fontSize: 24, color: "#6366f1" }}>⋯</span>
                      ) : (
                        stats.totalDepartments
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(99, 102, 241, 0.15))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(99, 102, 241, 0.4)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#818cf8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#a5b4fc",
                  }}
                >
                  Organizational units
                </div>
              </div>

              {/* Active Employees */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "20px 24px",
                  background: theme === 'dark' 
                    ? `linear-gradient(135deg, ${colors.secondary[900]} 0%, ${colors.secondary[800]} 100%)`
                    : `linear-gradient(135deg, ${colors.secondary[100]} 0%, ${colors.secondary[200]} 100%)`,
                  border: `1px solid ${colors.success}33`,
                  boxShadow: theme === 'dark' 
                    ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                    : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
                  position: "relative",
                  overflow: "hidden",
                  transition: "all 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(34, 197, 94, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.3)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 1.5,
                        color: theme === 'dark' ? colors.secondary[300] : colors.secondary[700],
                        marginBottom: 8,
                        fontWeight: 600,
                      }}
                    >
                      Active Employees
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: colors.text.primary,
                        lineHeight: 1,
                        marginBottom: 8,
                      }}
                    >
                      {statsLoading ? (
                        <span style={{ fontSize: 24, color: "#22c55e" }}>⋯</span>
                      ) : (
                        stats.activeEmployees
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(34, 197, 94, 0.15))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid rgba(34, 197, 94, 0.4)",
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="#4ade80" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#86efac",
                  }}
                >
                  Currently working
                </div>
              </div>
            </div>
            )}

            {/* ENHANCED Employees by department - Only show when data is loaded */}
            {dataLoaded && !statsLoading && (
            <div
              style={{
                borderRadius: 16,
                padding: "24px",
                background: colors.gradient.card,
                border: `1px solid ${colors.border.default}`,
                marginBottom: 24,
                boxShadow: theme === 'dark' 
                  ? "0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)"
                  : "0 8px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
              }}
            >
              <div
                className="dept-section-header"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                      }}
                    >
                      <svg width="20" height="20" fill="none" stroke="#3b82f6" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <h3
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          marginBottom: 4,
                          color: colors.text.primary,
                        }}
                      >
                        Employees by Department
                      </h3>
                      <p
                        style={{
                          fontSize: 13,
                          color: colors.text.muted,
                        }}
                      >
                        Organizational distribution across departments
                      </p>
                    </div>
                  </div>
                </div>

                {statsError && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#fecaca",
                      backgroundColor: "rgba(127,29,29,0.3)",
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid rgba(248,113,113,0.7)",
                    }}
                  >
                    {statsError}
                  </div>
                )}
              </div>

              {statsLoading ? (
                <div
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
                  }}
                >
                  Loading department breakdown…
                </div>
              ) : stats.departmentCounts.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
                  }}
                >
                  No employees found yet. Add some from the Employee Manager.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {stats.departmentCounts.map((dept, idx) => {
                    const deptChipPalette = [
                      { bg: "rgba(59, 130, 246, 0.15)", border: "rgba(59, 130, 246, 0.3)", text: "#3b82f6", badge: "rgba(59, 130, 246, 0.2)" },
                      { bg: "rgba(34, 197, 94, 0.15)", border: "rgba(34, 197, 94, 0.3)", text: "#22c55e", badge: "rgba(34, 197, 94, 0.2)" },
                      { bg: "rgba(251, 191, 36, 0.15)", border: "rgba(251, 191, 36, 0.3)", text: "#fbbf24", badge: "rgba(251, 191, 36, 0.2)" },
                      { bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.3)", text: "#ef4444", badge: "rgba(239, 68, 68, 0.2)" },
                      { bg: "rgba(168, 85, 247, 0.15)", border: "rgba(168, 85, 247, 0.3)", text: "#a855f7", badge: "rgba(168, 85, 247, 0.2)" },
                    ];
                    const chip = deptChipPalette[idx % deptChipPalette.length];
                    return (
                      <div
                        key={dept.name}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 12,
                          border: `1px solid ${chip.border}`,
                          backgroundColor: chip.bg,
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          fontWeight: 500,
                          color: colors.text.primary,
                          transition: "all 0.2s",
                          cursor: "default",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = `0 4px 12px ${chip.badge}`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <span style={{ color: chip.text, fontWeight: 600 }}>{dept.name}</span>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 8,
                            backgroundColor: chip.badge,
                            color: chip.text,
                            fontWeight: 700,
                            fontSize: 12,
                            border: `1px solid ${chip.border}`,
                          }}
                        >
                          {dept.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Overview hub cards — stats-style tiles, one CTA each */}
            <div className="overview-action-grid">
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
                </div>
              </div>

              {isAdmin && (
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
                    Create a new user with email and role. They can sign in after you complete onboarding from the employee manager if needed.
                  </p>
                  <div style={hub.actionsCol}>
                    <button
                      type="button"
                      onClick={openRegisterModal}
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
                      Register user
                    </button>
                  </div>
                </div>
              )}

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

              {/* COMPLAINTS — centered span only when 5 tiles (no register card) */}
              <div
                className={isAdmin ? undefined : "overview-hub-card-span"}
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

            </div>
          </div>
        )}

        {tab === "employees" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Employees</h2>
            <p
              style={{
                fontSize: 13,
                color: "#9ca3af",
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
              <div
                style={{
                  borderRadius: 16,
                  padding: "16px 18px",
                  background: "radial-gradient(circle at top, #020617, #020617)",
                  border: "1px solid rgba(37,99,235,0.85)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Employee Shift Management
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  Add employees, edit full profiles, shift assignments, salary details, and secure bank details.
                </div>

                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={openRegisterModal}
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
                      + Register New User
                    </button>
                  )}

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
                </div>
              </div>

              <div
                style={{
                  borderRadius: 16,
                  padding: "16px 18px",
                  background: "radial-gradient(circle at top, #0b1a33, #020617)",
                  border: "1px solid rgba(16,185,129,0.65)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Employee Directory (Read-Only)
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
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
            </div>
          </div>
        )}

        {tab === "attendance" && (
          <div style={{ padding: "14px 4px 4px" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>
              Attendance Center
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#9ca3af",
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
              <div
                style={{
                  borderRadius: 16,
                  padding: "16px 18px",
                  background:
                    "radial-gradient(circle at top left,#020617,#020617)",
                  border: "1px solid rgba(34,197,94,0.8)",
                  boxShadow: "0 16px 40px rgba(6,95,70,0.7)",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Daily Attendance
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
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

              {/* Monthly attendance card */}
              <div
                style={{
                  borderRadius: 16,
                  padding: "16px 18px",
                  background:
                    "radial-gradient(circle at top left,#020617,#020617)",
                  border: "1px solid rgba(59,130,246,0.85)",
                  boxShadow: "0 16px 40px rgba(30,64,175,0.6)",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  Monthly Attendance
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: colors.text.muted,
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
                      "linear-gradient(135deg,#3b82f6,#22c55e)",
                    color: "#020617",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Monthly Attendance
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
