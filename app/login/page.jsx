// app/login/page.jsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTheme } from "@/lib/theme/ThemeContext";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { AppShell, GlassCard } from "@/components/glass";

function LoginInner() {
  const searchParams = useSearchParams();
  const { theme, colors } = useTheme();

  const employeeLoginLocked = false;

  const initialModeFromUrl = searchParams.get("role");
  const [mode, setMode] = useState(
    initialModeFromUrl === "hr"
      ? "HR"
      : initialModeFromUrl === "employee"
        ? "EMPLOYEE"
        : "EMPLOYEE"
  );

  const [hrEmail, setHrEmail] = useState("");
  const [hrPassword, setHrPassword] = useState("");
  const [showHrPassword, setShowHrPassword] = useState(false);
  const [empCode, setEmpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (employeeLoginLocked && mode === "EMPLOYEE") {
      setMode("HR");
    }
  }, [employeeLoginLocked, mode]);

  async function handleHrSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        mode: "HR",
        email: hrEmail,
        password: hrPassword,
        callbackUrl: "/hr/employees",
      });

      if (!result || result.error) {
        setErrorMsg("Invalid HR email or password.");
        setLoading(false);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      window.location.href = "/hr/employees";
    } catch (err) {
      console.error("HR login error", err);
      setErrorMsg("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handleEmployeeSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (employeeLoginLocked) {
      setErrorMsg("Employee login is currently locked. Please contact HR.");
      return;
    }

    setLoading(true);

    try {
      const code = empCode.trim();
      const precheck = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "EMPLOYEE", empCode: code }),
      });
      const precheckBody = await precheck.json().catch(() => ({}));
      if (!precheck.ok) {
        setErrorMsg(
          precheckBody.error ||
            precheckBody.message ||
            (precheck.status === 403
              ? "Your employee portal access is disabled. Please contact HR."
              : "Unknown employee code. Check with HR.")
        );
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        redirect: false,
        mode: "EMPLOYEE",
        empCode: code,
        password: "",
        callbackUrl: "/employee/dashboard",
      });

      if (!result || result.error) {
        setErrorMsg("Unable to sign in. Check with HR.");
        setLoading(false);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      window.location.href = "/employee/dashboard";
    } catch (err) {
      console.error("Employee login error", err);
      setErrorMsg("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const isDark = theme === "dark";

  // Original GDS login gradient (navy → blue → green accent)
  const leftGradient = isDark
    ? "linear-gradient(135deg, #0F162A 0%, #0c225c 52%, #0f5ba5 78%, rgba(34, 197, 94, 0.45) 100%)"
    : "linear-gradient(135deg, #0a2c54 0%, #0f5ba5 55%, #13a8e5 82%, rgba(34, 197, 94, 0.35) 100%)";

  const submitGradient = isDark
    ? "linear-gradient(135deg, #0a2c54 0%, #0f5ba5 50%, #22c55e 100%)"
    : "linear-gradient(135deg, #0f5ba5 0%, #0ea5e9 50%, #22c55e 100%)";

  const labelStyle = {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.text.secondary,
    fontWeight: 600,
  };

  const inputStyle = {
    padding: "10px 13px",
    borderRadius: 12,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.input.border,
    backgroundColor: colors.input.background,
    fontSize: 14,
    outline: "none",
    color: colors.input.color,
    width: "100%",
    boxSizing: "border-box",
    transition: "all 0.2s ease",
  };

  const formShellStyle = {
    padding: "14px 16px 16px",
    borderRadius: 18,
    background: isDark
      ? "rgba(12, 28, 52, 0.55)"
      : "rgba(255, 255, 255, 0.72)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.border.default,
    boxShadow: colors.card.shadow,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    WebkitBackdropFilter: "blur(12px)",
    backdropFilter: "blur(12px)",
  };

  return (
    <AppShell>
      <div className="login-page-wrapper">
        {/* Floating planets in the page background */}
        <div className="login-space" aria-hidden="true">
          <div className="login-stars">
            {Array.from({ length: 28 }).map((_, i) => (
              <span key={i} className="login-star" />
            ))}
          </div>

          <span className="login-nebula login-nebula--1" />
          <span className="login-nebula login-nebula--2" />

          <div className="login-orbit-system login-orbit-system--tl">
            <span className="login-orbit-track login-orbit-track--lg" />
            <span className="login-orbit-track login-orbit-track--md" />
            <span className="login-orbit-arm login-orbit-arm--1">
              <span className="login-planet login-planet--cyan" />
            </span>
            <span className="login-orbit-arm login-orbit-arm--2">
              <span className="login-planet login-planet--amber" />
            </span>
          </div>

          <div className="login-orbit-system login-orbit-system--br">
            <span className="login-orbit-track login-orbit-track--xl" />
            <span className="login-orbit-track login-orbit-track--sm" />
            <span className="login-orbit-arm login-orbit-arm--3">
              <span className="login-planet login-planet--violet login-planet--ringed" />
            </span>
            <span className="login-orbit-arm login-orbit-arm--4">
              <span className="login-planet login-planet--lime" />
            </span>
          </div>

          <div className="login-orbit-system login-orbit-system--tr">
            <span className="login-orbit-arm login-orbit-arm--5">
              <span className="login-planet login-planet--rose" />
            </span>
          </div>

          <span className="login-comet" />
          <span className="login-comet login-comet--delay" />
        </div>

        <div className="login-theme-toggle">
          <ThemeToggle />
        </div>

        <div className="login-container">
          <GlassCard className="login-card" padding={0} borderRadius={30}>
            {/* LEFT PANEL — brand (same layout as original) */}
            <div className="login-left-panel" style={{ background: leftGradient }}>
              <div className="login-left-orbit-system" aria-hidden="true">
                <span className="login-left-sun" />
                <span className="login-left-path login-left-path--1">
                  <span className="login-left-orb login-left-orb--1" />
                </span>
                <span className="login-left-path login-left-path--2">
                  <span className="login-left-orb login-left-orb--2" />
                </span>
                <span className="login-left-path login-left-path--3">
                  <span className="login-left-orb login-left-orb--3" />
                </span>
                <span className="login-left-orb login-left-orb--float-1" />
                <span className="login-left-orb login-left-orb--float-2" />
              </div>

              <div className="login-left-content">
                <div
                  style={{
                    width: 180,
                    height: 180,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 24,
                    overflow: "hidden",
                    border: `2px solid ${colors.secondary[500]}`,
                    boxShadow: "0 18px 38px rgba(0, 0, 0, 0.85)",
                  }}
                >
                  <img
                    src="/gds.png"
                    alt="Global Digital Solutions"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>

                <p className="login-left-kicker">Sign in to your account</p>
                <p className="login-left-desc">
                  Manage attendance, monitor shifts and keep your team on time.
                  Log in with your company credentials to access the GDS
                  Attendance Control Center.
                </p>
              </div>

              <div className="login-left-footer">
                <div style={{ fontWeight: 600 }}>Global Digital Solutions</div>
                <div>Centralized Attendance &amp; HR Portal</div>
              </div>
            </div>

            {/* RIGHT PANEL — forms (same layout as original) */}
            <div
              className="login-right-panel"
              style={{
                background: isDark ? colors.background.card : colors.glass.panelBg,
                color: colors.text.primary,
              }}
            >
              <div className="login-form-title">
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: colors.text.primary,
                    letterSpacing: 0.5,
                  }}
                >
                  Login Your Account
                </div>
              </div>

              <div className="login-toggle-buttons">
                <button
                  type="button"
                  onClick={() => setMode("HR")}
                  style={{
                    flex: 1,
                    padding: "9px 10px",
                    borderRadius: 999,
                    borderWidth: "2px",
                    borderStyle: "solid",
                    borderColor:
                      mode === "HR" ? colors.primary[500] : colors.border.default,
                    backgroundColor:
                      mode === "HR" ? `${colors.primary[500]}15` : "transparent",
                    color: colors.text.primary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  HR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!employeeLoginLocked) setMode("EMPLOYEE");
                  }}
                  disabled={employeeLoginLocked}
                  style={{
                    flex: 1,
                    padding: "9px 10px",
                    borderRadius: 999,
                    borderWidth: "2px",
                    borderStyle: "solid",
                    borderColor:
                      mode === "EMPLOYEE"
                        ? colors.primary[500]
                        : colors.border.default,
                    backgroundColor:
                      mode === "EMPLOYEE"
                        ? `${colors.primary[500]}15`
                        : "transparent",
                    color: colors.text.primary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: employeeLoginLocked ? "not-allowed" : "pointer",
                    opacity: employeeLoginLocked ? 0.4 : 1,
                  }}
                >
                  Employee
                </button>
              </div>

              {errorMsg && (
                <div className="login-error">{errorMsg}</div>
              )}

              {mode === "HR" ? (
                <form className="login-form" onSubmit={handleHrSubmit} style={formShellStyle}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={labelStyle}>EMAIL ADDRESS</label>
                    <input
                      type="email"
                      value={hrEmail}
                      onChange={(e) => setHrEmail(e.target.value)}
                      required
                      placeholder="hr@globaldigitalsolutions.com"
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = colors.primary[500];
                        e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = colors.input.border;
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={labelStyle}>PASSWORD</label>
                    <div className="login-password-wrap" style={{ position: "relative", width: "100%" }}>
                      <input
                        type={showHrPassword ? "text" : "password"}
                        value={hrPassword}
                        onChange={(e) => setHrPassword(e.target.value)}
                        required
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className="login-password-input"
                        style={{
                          ...inputStyle,
                          paddingRight: 48,
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = colors.primary[500];
                          e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = colors.input.border;
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                      <button
                        type="button"
                        className="login-password-toggle"
                        onClick={() => setShowHrPassword((prev) => !prev)}
                        aria-label={showHrPassword ? "Hide password" : "Show password"}
                        title={showHrPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          zIndex: 5,
                          width: 34,
                          height: 34,
                          border: `1px solid ${colors.border.default}`,
                          borderRadius: 8,
                          background:
                            theme === "dark" ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.95)",
                          color: colors.input?.color || colors.text.primary,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          lineHeight: 1,
                          boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                        }}
                      >
                        {showHrPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="login-submit-button"
                    disabled={loading}
                    style={{
                      marginTop: 8,
                      padding: "11px 16px",
                      borderRadius: 999,
                      border: "none",
                      width: "100%",
                      background: submitGradient,
                      color: "#ffffff",
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      cursor: loading ? "default" : "pointer",
                      boxShadow: `0 16px 36px ${colors.primary[500]}55`,
                      opacity: loading ? 0.75 : 1,
                    }}
                  >
                    {loading ? "SIGNING IN..." : "SIGN IN"}
                  </button>
                </form>
              ) : employeeLoginLocked ? (
                <div className="login-form login-locked" style={formShellStyle}>
                  Employee login is currently locked by administration.
                  <br />
                  Please contact HR if you believe this is a mistake.
                </div>
              ) : (
                <form
                  className="login-form"
                  onSubmit={handleEmployeeSubmit}
                  style={formShellStyle}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={labelStyle}>Employee Code</label>
                    <input
                      value={empCode}
                      onChange={(e) => setEmpCode(e.target.value)}
                      required
                      placeholder="e.g. 00082"
                      style={inputStyle}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = colors.primary[500];
                        e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primary[500]}20`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = colors.input.border;
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="login-submit-button"
                    disabled={loading}
                    style={{
                      marginTop: 8,
                      padding: "11px 16px",
                      borderRadius: 999,
                      border: "none",
                      width: "100%",
                      background: submitGradient,
                      color: "#ffffff",
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      cursor: loading ? "default" : "pointer",
                      boxShadow: `0 16px 36px ${colors.primary[500]}55`,
                      opacity: loading ? 0.75 : 1,
                    }}
                  >
                    {loading ? "Checking..." : "Sign In"}
                  </button>
                </form>
              )}

              <div className="login-copyright">
                © {new Date().getFullYear()} Global Digital Solutions Internal Use Only
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
          }}
        >
          Loading...
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
