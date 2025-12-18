"use client";

import { useEffect, useState } from "react";

export default function MobileOnlyGuard({ children }) {
  const [isMobile, setIsMobile] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    function checkDevice() {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const screenWidth = window.innerWidth;
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      // Mobile and tablet device patterns (ALLOW these)
      const mobileTabletPatterns = [
        /Android/i,
        /webOS/i,
        /iPhone/i,
        /iPad/i,
        /iPod/i,
        /BlackBerry/i,
        /Windows Phone/i,
        /Mobile/i,
        /Tablet/i,
      ];

      // Desktop/laptop user agent patterns (BLOCK these)
      const desktopPatterns = [
        /Windows NT/i,
        /Macintosh/i,
        /Linux/i,
        /X11/i,
      ];

      // Check if user agent matches mobile/tablet patterns
      const isMobileTabletUserAgent = mobileTabletPatterns.some((pattern) =>
        pattern.test(userAgent)
      );

      // Check if user agent matches desktop patterns (but not mobile)
      const isDesktopUserAgent = desktopPatterns.some((pattern) =>
        pattern.test(userAgent)
      ) && !isMobileTabletUserAgent;

      // Determine if device should be ALLOWED (mobile/tablet):
      // 1. User agent matches mobile/tablet patterns → ALLOW
      // 2. User agent matches desktop patterns → BLOCK
      // 3. Otherwise (unknown): if has touch AND small screen (<= 768px) → ALLOW, else BLOCK
      let shouldAllow = false;
      
      if (isMobileTabletUserAgent) {
        // Clearly a mobile/tablet device → ALLOW
        shouldAllow = true;
      } else if (isDesktopUserAgent) {
        // Clearly a desktop/laptop → BLOCK
        shouldAllow = false;
      } else {
        // Unknown device: check touch + screen size
        // If has touch screen and small screen, likely a tablet/phone → ALLOW
        shouldAllow = hasTouchScreen && screenWidth <= 768;
      }

      setIsMobile(shouldAllow);
      setIsChecking(false);
    }

    checkDevice();

    // Re-check on window resize (debounced)
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkDevice, 200);
    };
    
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Show loading state while checking
  if (isChecking) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "#0a1929",
          color: "#fff",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "50px",
              height: "50px",
              border: "4px solid #1e3a5f",
              borderTop: "4px solid #4a90e2",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 20px",
            }}
          />
          <p style={{ fontSize: "16px", color: "#b0bec5" }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show restriction message for desktop/laptop
  if (!isMobile) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "#0a1929",
          backgroundImage:
            "linear-gradient(135deg, #0a1929 0%, #1e3a5f 50%, #0a1929 100%)",
          color: "#fff",
          padding: "20px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: "600px",
            padding: "40px",
            backgroundColor: "rgba(30, 58, 95, 0.6)",
            borderRadius: "16px",
            border: "1px solid rgba(74, 144, 226, 0.2)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: "120px",
              height: "120px",
              margin: "0 auto 30px",
              backgroundColor: "rgba(74, 144, 226, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid rgba(74, 144, 226, 0.3)",
            }}
          >
            <svg
              width="60"
              height="60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4a90e2"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: "32px",
              fontWeight: "700",
              marginBottom: "16px",
              color: "#fff",
              letterSpacing: "-0.5px",
            }}
          >
            Mobile & Tablet Access Only
          </h1>

          {/* Message */}
          <p
            style={{
              fontSize: "18px",
              lineHeight: "1.6",
              color: "#b0bec5",
              marginBottom: "24px",
            }}
          >
            This application is optimized for mobile devices and tablets. 
            Please access it from your smartphone or tablet for the best experience.
          </p>

          {/* Supported Devices */}
          <div
            style={{
              marginTop: "32px",
              padding: "20px",
              backgroundColor: "rgba(0, 0, 0, 0.2)",
              borderRadius: "12px",
              border: "1px solid rgba(74, 144, 226, 0.1)",
            }}
          >
            <p
              style={{
                fontSize: "14px",
                color: "#90a4ae",
                marginBottom: "12px",
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Supported Devices
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "12px",
                fontSize: "14px",
                color: "#b0bec5",
              }}
            >
              <span
                style={{
                  padding: "6px 12px",
                  backgroundColor: "rgba(74, 144, 226, 0.1)",
                  borderRadius: "6px",
                  border: "1px solid rgba(74, 144, 226, 0.2)",
                }}
              >
                📱 Smartphones
              </span>
              <span
                style={{
                  padding: "6px 12px",
                  backgroundColor: "rgba(74, 144, 226, 0.1)",
                  borderRadius: "6px",
                  border: "1px solid rgba(74, 144, 226, 0.2)",
                }}
              >
                📱 Tablets
              </span>
              <span
                style={{
                  padding: "6px 12px",
                  backgroundColor: "rgba(74, 144, 226, 0.1)",
                  borderRadius: "6px",
                  border: "1px solid rgba(74, 144, 226, 0.2)",
                }}
              >
                📱 iPads
              </span>
            </div>
          </div>

          {/* Footer Note */}
          <p
            style={{
              fontSize: "12px",
              color: "#78909c",
              marginTop: "32px",
              fontStyle: "italic",
            }}
          >
            Global Digital Solutions Attendance Portal
          </p>
        </div>

        {/* CSS Animation */}
        <style jsx>{`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  // Allow access for mobile/tablet devices
  return <>{children}</>;
}

