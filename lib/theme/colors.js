/**
 * Global Theme Configuration — GDS brand + glassmorphism
 *
 * Palette from GDS logo: deep navy, electric cyan (#13a8e5), globe blue, accent green.
 * Glass tokens mirror CSS custom properties in app/globals.css.
 */

/** GDS signature gradient — navy → mid blue → electric cyan */
export const GDS_GRADIENT_STOPS = {
  dark: ['#0a2c54', '#0f5ba5', '#13a8e5'],
  light: ['#0f5ba5', '#0ea5e9', '#38bdf8'],
};

export const colors = {
  // Primary — GDS electric cyan / navy blue
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0f5ba5',
    800: '#0a2c54',
    900: '#061525',
  },

  // Secondary — GDS globe green
  secondary: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },

  accent: {
    blue: '#0ea5e9',
    cyan: '#13a8e5',
    green: '#22c55e',
    yellow: '#fbbf24',
    orange: '#f97316',
    red: '#ef4444',
    purple: '#6366f1',
    navy: '#0a2c54',
  },

  success: '#22c55e',
  warning: '#fbbf24',
  error: '#ef4444',
  info: '#0ea5e9',

  // Dark Mode — navy base + cyan glass
  dark: {
    background: {
      primary: '#020617',
      secondary: '#0c1628',
      tertiary: '#152438',
      card: 'rgba(12, 28, 52, 0.75)',
      hover: 'rgba(18, 38, 66, 0.82)',
      table: {
        header: 'rgba(12, 28, 52, 0.88)',
        row: 'rgba(8, 18, 36, 0.82)',
        rowEven: 'rgba(14, 32, 58, 0.85)',
        rowHover: 'rgba(20, 42, 72, 0.9)',
      },
      input: 'rgba(12, 28, 52, 0.8)',
      legend: 'rgba(8, 18, 36, 0.78)',
    },
    text: {
      primary: '#ffffff',
      secondary: '#e2e8f0',
      tertiary: '#cbd5e1',
      muted: '#94a3b8',
      table: {
        header: '#f8fafc',
        cell: '#e2e8f0',
      },
    },
    border: {
      default: 'rgba(14, 165, 233, 0.2)',
      hover: 'rgba(14, 165, 233, 0.4)',
      active: 'rgba(19, 168, 229, 0.55)',
      table: 'rgba(255, 255, 255, 0.06)',
      input: 'rgba(14, 165, 233, 0.18)',
    },
    gradient: {
      primary: 'linear-gradient(135deg, #061525 0%, #0a2c54 45%, #0f5ba5 100%)',
      card:
        'linear-gradient(165deg, rgba(15,55,95,0.55) 0%, rgba(14,165,233,0.08) 6%, rgba(12,40,72,0.62) 50%, rgba(10,30,55,0.7) 100%)',
      overlay:
        'radial-gradient(circle at 18% 22%, rgba(19,168,229,0.22) 0%, transparent 46%), radial-gradient(circle at 82% 78%, rgba(15,91,165,0.18) 0%, transparent 44%), linear-gradient(160deg, #020617 0%, #061525 40%, #0a2c54 72%, #0f172a 100%)',
      header: 'linear-gradient(135deg, #061525 0%, #0a2c54 45%, #0f5ba5 100%)',
    },
    glass: {
      panelBg:
        'linear-gradient(165deg, rgba(15,55,95,0.55) 0%, rgba(14,165,233,0.08) 6%, rgba(12,40,72,0.62) 50%, rgba(10,30,55,0.7) 100%)',
      blur: '32px',
      saturate: '120%',
      border: 'rgba(14, 165, 233, 0.28)',
      borderBottom: 'rgba(0, 0, 0, 0.28)',
      text: '#ffffff',
      shadow:
        '0 10px 36px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
      gloss: {
        sheen:
          'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 24%, transparent 50%)',
        rimTop: 'rgba(14, 165, 233, 0.35)',
        rimBottom: 'rgba(0, 0, 0, 0.22)',
        insetShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.2)',
      },
      pillNeutral: 'rgba(15, 55, 95, 0.5)',
      pillWarm: 'rgba(251, 146, 60, 0.18)',
    },
    pageBackground: {
      base: '#020617',
      gradient:
        'radial-gradient(circle at 16% 20%, rgba(19, 168, 229, 0.24) 0%, transparent 46%), radial-gradient(circle at 84% 76%, rgba(15, 91, 165, 0.2) 0%, transparent 44%), radial-gradient(circle at 50% 100%, rgba(10, 44, 84, 0.3) 0%, transparent 55%), linear-gradient(160deg, #020617 0%, #061525 38%, #0a2c54 70%, #0f172a 100%)',
    },
    glassHeader: {
      gradient:
        'linear-gradient(135deg, rgba(8,28,52,0.94) 0%, rgba(10,44,84,0.9) 48%, rgba(15,91,165,0.86) 100%)',
      overlay:
        'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 38%, rgba(0,0,0,0.12) 100%)',
      border: 'rgba(14, 165, 233, 0.3)',
      blur: '32px',
      saturate: '120%',
      gloss: {
        sheen:
          'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 26%, transparent 54%)',
        rimTop: 'rgba(14, 165, 233, 0.38)',
        rimBottom: 'rgba(0, 0, 0, 0.18)',
        insetShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.18)',
      },
    },
  },

  // Light Mode — clean sky wash + GDS blue glass
  light: {
    background: {
      primary: '#f0f9ff',
      secondary: '#e0f2fe',
      tertiary: '#f8fafc',
      card: 'rgba(255, 255, 255, 0.65)',
      hover: 'rgba(255, 255, 255, 0.78)',
      table: {
        header: 'rgba(255, 255, 255, 0.7)',
        row: 'rgba(255, 255, 255, 0.55)',
        rowEven: 'rgba(255, 255, 255, 0.62)',
        rowHover: 'rgba(224, 242, 254, 0.85)',
      },
      input: 'rgba(255, 255, 255, 0.75)',
      legend: 'rgba(240, 249, 255, 0.9)',
    },
    text: {
      primary: '#0f172a',
      secondary: '#334155',
      tertiary: '#64748b',
      muted: '#94a3b8',
      table: {
        header: '#1e293b',
        cell: '#0f172a',
      },
    },
    border: {
      default: 'rgba(14, 165, 233, 0.18)',
      hover: 'rgba(14, 165, 233, 0.35)',
      active: 'rgba(2, 132, 199, 0.5)',
      table: 'rgba(14, 165, 233, 0.1)',
      input: 'rgba(14, 165, 233, 0.2)',
    },
    gradient: {
      primary: 'linear-gradient(135deg, #0a2c54 0%, #0f5ba5 50%, #13a8e5 100%)',
      card:
        'linear-gradient(168deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.58) 55%, rgba(224,242,254,0.45) 100%)',
      overlay:
        'radial-gradient(circle at 12% 18%, rgba(56,189,248,0.35) 0%, transparent 46%), radial-gradient(circle at 88% 82%, rgba(14,165,233,0.25) 0%, transparent 44%), linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 45%, #f8fafc 100%)',
      header: 'linear-gradient(135deg, #0a2c54 0%, #0f5ba5 50%, #13a8e5 100%)',
    },
    glass: {
      panelBg:
        'linear-gradient(168deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.72) 55%, rgba(224,242,254,0.55) 100%)',
      blur: '32px',
      saturate: '130%',
      border: 'rgba(255, 255, 255, 0.85)',
      borderBottom: 'rgba(14, 165, 233, 0.12)',
      text: '#0f172a',
      shadow:
        '0 8px 32px rgba(10, 44, 84, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
      gloss: {
        sheen:
          'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 22%, transparent 48%)',
        rimTop: 'rgba(255, 255, 255, 1)',
        rimBottom: 'rgba(14, 165, 233, 0.1)',
        insetShadow: 'inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(14,165,233,0.08)',
      },
      pillNeutral: 'rgba(255, 255, 255, 0.65)',
      pillWarm: 'rgba(251, 191, 36, 0.22)',
    },
    pageBackground: {
      base: '#f0f9ff',
      gradient:
        'radial-gradient(circle at 14% 20%, rgba(56, 189, 248, 0.4) 0%, transparent 46%), radial-gradient(circle at 86% 78%, rgba(14, 165, 233, 0.28) 0%, transparent 44%), radial-gradient(circle at 50% 50%, rgba(186, 230, 253, 0.35) 0%, transparent 55%), linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 40%, #f8fafc 100%)',
    },
    glassHeader: {
      gradient:
        'linear-gradient(135deg, rgba(10,44,84,0.94) 0%, rgba(15,91,165,0.9) 48%, rgba(19,168,229,0.86) 100%)',
      overlay:
        'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.06) 40%, transparent 100%)',
      border: 'rgba(255, 255, 255, 0.35)',
      blur: '32px',
      saturate: '130%',
      gloss: {
        sheen:
          'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.12) 28%, transparent 52%)',
        rimTop: 'rgba(255, 255, 255, 0.55)',
        rimBottom: 'rgba(0, 0, 0, 0.08)',
        insetShadow: 'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(0,0,0,0.06)',
      },
    },
  },
};

/**
 * Get theme colors based on mode
 */
export function getThemeColors(mode = 'dark') {
  const baseColors = mode === 'dark' ? colors.dark : colors.light;

  return {
    ...colors,
    mode,
    background: baseColors.background,
    text: baseColors.text,
    border: baseColors.border,
    gradient: baseColors.gradient,
    glass: baseColors.glass,
    pageBackground: baseColors.pageBackground,
    glassHeader: baseColors.glassHeader,
    gdsStops: GDS_GRADIENT_STOPS[mode],
    card: {
      background: baseColors.background.card,
      border: baseColors.border.default,
      shadow:
        mode === 'dark'
          ? '0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 8px 32px rgba(10, 44, 84, 0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
    },
    button: {
      primary: colors.primary[500],
      primaryHover: colors.primary[600],
      secondary: baseColors.background.tertiary,
      secondaryHover: baseColors.background.hover,
    },
    table: {
      header: {
        background: baseColors.background.table.header,
        color: baseColors.text.table.header,
        border: baseColors.border.table,
      },
      cell: {
        background: baseColors.background.table.row,
        color: baseColors.text.table.cell,
        border: baseColors.border.table,
        backgroundEven: baseColors.background.table.rowEven,
        backgroundHover: baseColors.background.table.rowHover,
      },
    },
    input: {
      background: baseColors.background.input,
      border: baseColors.border.input,
      color: baseColors.text.primary,
      placeholder: baseColors.text.tertiary,
    },
  };
}

export default colors;
