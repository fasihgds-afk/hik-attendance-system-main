/**
 * CenterAlert — centered theme-aware success/error/info popup
 */
'use client';

import { useEffect } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';

export default function CenterAlert({
  isOpen,
  type = 'info', // success | error | warning | info
  title,
  message,
  onClose,
  autoCloseMs = 2800,
  okText = 'OK',
}) {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen || !autoCloseMs) return undefined;
    const t = setTimeout(() => onClose?.(), autoCloseMs);
    return () => clearTimeout(t);
  }, [isOpen, autoCloseMs, onClose, message]);

  if (!isOpen || !message) return null;

  const tones = {
    success: {
      accent: colors.success || '#16a34a',
      soft: isDark ? 'rgba(34,197,94,0.16)' : 'rgba(34,197,94,0.12)',
      mark: '✓',
      defaultTitle: 'Success',
    },
    error: {
      accent: colors.error || '#dc2626',
      soft: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.12)',
      mark: '✕',
      defaultTitle: 'Something went wrong',
    },
    warning: {
      accent: '#f59e0b',
      soft: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.12)',
      mark: '!',
      defaultTitle: 'Notice',
    },
    info: {
      accent: colors.primary?.[500] || '#0ea5e9',
      soft: isDark ? 'rgba(14,165,233,0.16)' : 'rgba(14,165,233,0.12)',
      mark: 'i',
      defaultTitle: 'Notice',
    },
  };

  const tone = tones[type] || tones.info;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 130,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          width: 'min(400px, 100%)',
          borderRadius: 16,
          padding: 22,
          background: isDark ? '#0f172a' : colors.background?.card || '#fff',
          border: `1px solid ${colors.glass?.border || colors.border?.default}`,
          boxShadow: colors.glass?.shadow || '0 20px 50px rgba(0,0,0,0.35)',
          textAlign: 'center',
          animation: 'centerAlertIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            margin: '0 auto 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: tone.soft,
            color: tone.accent,
            fontWeight: 800,
            fontSize: 22,
          }}
        >
          {tone.mark}
        </div>
        <h3
          style={{
            margin: '0 0 8px',
            fontSize: 17,
            fontWeight: 750,
            color: colors.text?.primary,
          }}
        >
          {title || tone.defaultTitle}
        </h3>
        <p
          style={{
            margin: '0 0 18px',
            fontSize: 13,
            lineHeight: 1.55,
            color: colors.text?.secondary,
          }}
        >
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            minWidth: 110,
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: `linear-gradient(135deg, ${colors.primary?.[700] || tone.accent}, ${colors.primary?.[500] || tone.accent})`,
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            boxShadow: `0 8px 18px ${tone.accent}33`,
          }}
        >
          {okText}
        </button>

        <style jsx>{`
          @keyframes centerAlertIn {
            from {
              opacity: 0;
              transform: translateY(8px) scale(0.96);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
