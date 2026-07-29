/**
 * ConfirmDialog — theme-aware centered confirmation
 */
'use client';

import { useTheme } from '@/lib/theme/ThemeContext';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  loading = false,
}) {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const variantColors = {
    danger: {
      accent: colors.error || '#dc2626',
      btnBg: colors.error || '#dc2626',
      soft: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)',
    },
    warning: {
      accent: '#f59e0b',
      btnBg: '#f59e0b',
      soft: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.12)',
    },
    info: {
      accent: colors.primary?.[500] || '#3b82f6',
      btnBg: colors.primary?.[500] || '#3b82f6',
      soft: isDark ? `${colors.primary?.[500] || '#3b82f6'}22` : `${colors.primary?.[500] || '#3b82f6'}14`,
    },
  };

  const v = variantColors[variant] || variantColors.danger;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          borderRadius: 16,
          padding: 22,
          background: isDark ? '#0f172a' : colors.background?.card || '#fff',
          border: `1px solid ${colors.glass?.border || colors.border?.default}`,
          boxShadow: colors.glass?.shadow || '0 20px 50px rgba(0,0,0,0.35)',
          animation: 'confirmPopIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: v.soft,
            color: v.accent,
            fontWeight: 800,
            fontSize: 18,
            marginBottom: 14,
          }}
        >
          {variant === 'info' ? 'i' : '!'}
        </div>

        <h3
          style={{
            margin: '0 0 8px',
            fontSize: 17,
            fontWeight: 750,
            color: colors.text?.primary || '#0f172a',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.55,
            color: colors.text?.secondary || '#64748b',
          }}
        >
          {message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: `1px solid ${colors.border?.default || '#cbd5e1'}`,
              background: isDark ? 'rgba(255,255,255,0.04)' : colors.background?.secondary || '#f8fafc',
              color: colors.text?.primary,
              fontWeight: 650,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              try {
                await onConfirm?.();
              } finally {
                if (!loading) onClose?.();
              }
            }}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: v.btnBg,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              boxShadow: `0 8px 18px ${v.accent}40`,
            }}
          >
            {loading ? 'Please wait…' : confirmText}
          </button>
        </div>

        <style jsx>{`
          @keyframes confirmPopIn {
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
