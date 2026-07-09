/**
 * Theme-aware style utilities
 * Glassmorphism styles built on Phase 1 tokens (lib/theme/colors.js).
 *
 * Accepts either a theme string ('dark' | 'light') or a resolved colors object
 * from useTheme().colors for use in components.
 */

import { getThemeColors } from './colors';

function resolveColors(themeOrColors) {
  if (typeof themeOrColors === 'string') {
    const mode = themeOrColors === 'light' ? 'light' : 'dark';
    return { colors: getThemeColors(mode), mode };
  }

  if (themeOrColors?.glass) {
    return {
      colors: themeOrColors,
      mode: themeOrColors.mode === 'light' ? 'light' : 'dark',
    };
  }

  return { colors: getThemeColors('dark'), mode: 'dark' };
}

function glassBackdrop(colors, source = 'glass') {
  const token = source === 'header' ? colors.glassHeader : colors.glass;
  const blur = token?.blur || '28px';
  const saturate = token?.saturate || '130%';
  return {
    WebkitBackdropFilter: `blur(${blur}) saturate(${saturate})`,
    backdropFilter: `blur(${blur}) saturate(${saturate})`,
  };
}

/** Avoid mixing `border` shorthand with side-specific border colors (React warning). */
function solidBorder({ color, top, bottom, left, right, width = '1px', style = 'solid' }) {
  const out = {
    borderWidth: width,
    borderStyle: style,
    borderColor: color,
  };
  if (top !== undefined) out.borderTopColor = top;
  if (bottom !== undefined) out.borderBottomColor = bottom;
  if (left !== undefined) out.borderLeftColor = left;
  if (right !== undefined) out.borderRightColor = right;
  return out;
}

/**
 * Gloss sheen + rim highlight layers for glass surfaces.
 */
export function getGlossLayers(colors, source = 'glass') {
  const glossSource = source === 'header' ? colors.glassHeader?.gloss : colors.glass?.gloss;
  const borderToken = source === 'header' ? colors.glassHeader?.border : colors.glass?.border;

  if (!glossSource) {
    return { sheen: {}, rim: {} };
  }

  return {
    sheen: {
      position: 'absolute',
      inset: 0,
      background: glossSource.sheen,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      zIndex: 0,
    },
    rim: {
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      pointerEvents: 'none',
      boxShadow: glossSource.insetShadow,
      zIndex: 0,
      ...solidBorder({
        color: 'transparent',
        top: glossSource.rimTop,
        bottom: glossSource.rimBottom,
        left: borderToken,
        right: borderToken,
      }),
    },
  };
}

/**
 * Glossy pill button for headers / toolbars.
 */
export function getGlossPillStyles(colors, variant = 'neutral') {
  const isLightPage = colors.glass?.text === '#0f172a' || colors.mode === 'light';

  const variants = {
    neutral: {
      bg: isLightPage ? 'rgba(10, 44, 84, 0.52)' : colors.glass.pillNeutral,
      border: isLightPage ? 'rgba(255, 255, 255, 0.38)' : colors.glass.border,
      glow: isLightPage ? 'rgba(10, 44, 84, 0.35)' : 'rgba(255, 255, 255, 0.12)',
    },
    warm: {
      bg: isLightPage ? 'rgba(180, 83, 9, 0.45)' : colors.glass.pillWarm,
      border: 'rgba(251, 191, 36, 0.55)',
      glow: 'rgba(251, 191, 36, 0.28)',
    },
    slate: {
      bg: isLightPage ? 'rgba(51, 65, 85, 0.5)' : 'rgba(100, 116, 139, 0.24)',
      border: 'rgba(148, 163, 184, 0.5)',
      glow: 'rgba(100, 116, 139, 0.28)',
    },
    rose: {
      bg: isLightPage ? 'rgba(190, 18, 60, 0.42)' : 'rgba(244, 63, 94, 0.22)',
      border: 'rgba(251, 113, 133, 0.55)',
      glow: 'rgba(244, 63, 94, 0.28)',
    },
  };

  const v = variants[variant] || variants.neutral;

  return {
    padding: '8px 14px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    minHeight: 40,
    whiteSpace: 'nowrap',
    color: '#ffffff',
    background: `linear-gradient(180deg, rgba(255,255,255,0.32) 0%, ${v.bg} 42%, ${v.bg} 100%)`,
    ...solidBorder({
      color: v.border,
      top: 'rgba(255, 255, 255, 0.55)',
    }),
    boxShadow: `0 4px 16px ${v.glow}, inset 0 1px 0 rgba(255,255,255,0.42)`,
    ...glassBackdrop(colors),
    transition: 'transform 0.2s, box-shadow 0.2s',
  };
}

/**
 * Tab navigation — high contrast inactive + gloss active (Nova-style).
 */
export function getTabStyles(themeOrColors = 'dark', isActive = false) {
  const { colors, mode } = resolveColors(themeOrColors);

  const shared = {
    padding: '12px 24px',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  };

  if (isActive) {
    return {
      ...shared,
      ...solidBorder({
        color: mode === 'dark' ? 'rgba(14,165,233,0.45)' : colors.primary[400],
        top: mode === 'dark' ? 'rgba(14,165,233,0.55)' : 'rgba(255,255,255,0.95)',
      }),
      background:
        mode === 'dark'
          ? 'linear-gradient(180deg, rgba(14,165,233,0.35) 0%, rgba(10,44,84,0.72) 48%, rgba(6,21,37,0.85) 100%)'
          : `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, ${colors.primary[50]} 100%)`,
      color: mode === 'dark' ? '#ffffff' : colors.primary[800],
      boxShadow:
        mode === 'dark'
          ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.35)'
          : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 4px 16px rgba(14,165,233,0.2)',
      ...glassBackdrop(colors),
    };
  }

  return {
    ...shared,
    ...solidBorder({
      color: mode === 'dark' ? 'rgba(14,165,233,0.18)' : colors.border.default,
    }),
    background: mode === 'dark' ? 'rgba(10,44,84,0.45)' : 'rgba(255,255,255,0.72)',
    color: mode === 'dark' ? '#e2e8f0' : colors.text.secondary,
    boxShadow: mode === 'dark' ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.22)',
    ...glassBackdrop(colors),
  };
}

/**
 * Frosted glass card / panel surface with gloss.
 */
export function getCardStyles(themeOrColors = 'dark', options = {}) {
  const { colors } = resolveColors(themeOrColors);
  const { padding = 24, borderRadius = 16 } = options;

  return {
    position: 'relative',
    overflow: 'hidden',
    borderRadius,
    padding,
    background: colors.glass.panelBg,
    ...solidBorder({
      color: colors.glass.border,
      top: colors.glass.gloss?.rimTop || colors.glass.border,
      bottom: colors.glass.borderBottom || colors.glass.border,
    }),
    boxShadow: colors.glass.shadow,
    ...glassBackdrop(colors),
    color: colors.glass.text,
  };
}

/**
 * Table styles — opaque wrapper + solid rows (no blur on data rows).
 */
export function getTableStyles(themeOrColors = 'dark') {
  const { colors, mode } = resolveColors(themeOrColors);

  const rowBg = colors.background.table.row;
  const rowEvenBg = colors.background.table.rowEven;
  const rowHoverBg = colors.background.table.rowHover;

  return {
    wrapper: {
      borderRadius: 14,
      border: `1px solid ${colors.glass.border}`,
      boxShadow: colors.glass.shadow,
      background: colors.glass.panelBg,
      ...glassBackdrop(colors),
      overflow: 'hidden',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13,
    },
    th: {
      padding: '10px 12px',
      textAlign: 'left',
      borderBottom: `1px solid ${colors.border.table}`,
      fontWeight: 600,
      fontSize: 13,
      color: colors.text.table.header,
      backgroundColor: colors.background.table.header,
    },
    td: {
      padding: '9px 12px',
      borderBottom: `1px solid ${colors.border.table}`,
      fontSize: 13,
      color: colors.text.table.cell,
      backgroundColor: rowBg,
    },
    tr: {
      backgroundColor: rowBg,
      transition: 'background-color 0.15s',
    },
    trEven: {
      backgroundColor: rowEvenBg,
    },
    trHover: {
      backgroundColor: rowHoverBg,
    },
    tdEven: {
      backgroundColor: rowEvenBg,
    },
    tdHover: {
      backgroundColor: rowHoverBg,
    },
  };
}

/**
 * Input styles for glass surfaces — opaque control, no backdrop-filter.
 * Returns { base, focus, placeholderColor } for inline React styles.
 */
export function getInputStyles(themeOrColors = 'dark', options = {}) {
  const { colors, mode } = resolveColors(themeOrColors);

  return {
    base: {
      width: options.width ?? '100%',
      padding: options.padding ?? '10px 14px',
      borderRadius: options.borderRadius ?? 10,
      border: `1px solid ${colors.glass.border}`,
      background:
        mode === 'dark'
          ? colors.background.input
          : 'rgba(255, 253, 252, 0.94)',
      color: colors.glass.text,
      fontSize: options.fontSize ?? 14,
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxSizing: 'border-box',
    },
    focus: {
      borderColor: colors.primary[500],
      boxShadow: `0 0 0 3px ${colors.primary[500]}33`,
    },
    placeholderColor: colors.text.tertiary,
  };
}

/**
 * Select/dropdown styles — extends glass input base.
 */
export function getSelectStyles(themeOrColors = 'dark', options = {}) {
  const input = getInputStyles(themeOrColors, options);

  return {
    ...input,
    base: {
      ...input.base,
      cursor: 'pointer',
      minWidth: options.minWidth ?? 120,
    },
  };
}

/**
 * Glass page header — GDS gradient + overlay.
 */
export function getGlassHeaderStyles(themeOrColors = 'dark', options = {}) {
  const { colors, mode } = resolveColors(themeOrColors);
  const {
    padding = '16px 22px',
    borderRadius = 14,
    marginBottom = 18,
  } = options;
  const headerText = '#ffffff';

  return {
    header: {
      background: colors.glassHeader.gradient,
      ...solidBorder({
        color: colors.glassHeader.border,
        top: colors.glassHeader.gloss?.rimTop || colors.glassHeader.border,
      }),
      boxShadow: colors.glass.shadow,
      ...glassBackdrop(colors, 'header'),
      color: headerText,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding,
      borderRadius,
      marginBottom,
      flexWrap: 'wrap',
    },
    overlay: {
      position: 'absolute',
      inset: 0,
      background: colors.glassHeader.overlay,
      pointerEvents: 'none',
      borderRadius: 'inherit',
      zIndex: 0,
    },
    gloss: getGlossLayers(colors, 'header'),
    brand: {
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      position: 'relative',
      zIndex: 1,
      minWidth: 0,
    },
    logo: {
      width: 90,
      height: 90,
      borderRadius: 20,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      flexShrink: 0,
      background: 'rgba(255, 255, 255, 0.12)',
    },
    logoImage: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      display: 'block',
      transform: 'scale(1.02)',
    },
    title: {
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: 0.4,
      lineHeight: 1.05,
      color: headerText,
    },
    subtitle: {
      fontSize: 13,
      opacity: 0.95,
      marginTop: 6,
      color: headerText,
    },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'nowrap',
      position: 'relative',
      zIndex: 1,
    },
  };
}

/**
 * Static page background (animation deferred to Phase 4).
 */
export function getPageBackgroundStyles(themeOrColors = 'dark') {
  const { colors } = resolveColors(themeOrColors);

  return {
    background: colors.pageBackground.gradient,
  };
}

/**
 * Button styles — primary uses GDS gradient; secondary uses glass panel.
 */
export function getButtonStyles(themeOrColors = 'dark', variant = 'primary') {
  const { colors } = resolveColors(themeOrColors);

  const shared = {
    padding: '10px 20px',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 13,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
    transition: 'transform 0.2s, box-shadow 0.2s, opacity 0.2s',
  };

  const variants = {
    primary: {
      background: `linear-gradient(180deg, rgba(255,255,255,0.2) 0%, ${colors.gradient.header} 35%, ${colors.gradient.header} 100%)`,
      color: '#ffffff',
      ...solidBorder({
        color: colors.glass.border,
        top: 'rgba(255, 255, 255, 0.35)',
      }),
      boxShadow: `${colors.glass.shadow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
    },
    secondary: {
      background: colors.glass.panelBg,
      color: colors.glass.text,
      ...solidBorder({
        color: colors.glass.border,
        top: colors.glass.gloss?.rimTop || colors.glass.border,
      }),
      boxShadow: colors.glass.shadow,
      WebkitBackdropFilter: `blur(${colors.glass.blur})`,
      backdropFilter: `blur(${colors.glass.blur})`,
    },
    ghost: {
      background: 'transparent',
      color: colors.glass.text,
      border: `1px solid ${colors.glass.border}`,
      boxShadow: 'none',
    },
    danger: {
      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
      color: '#ffffff',
      border: '1px solid rgba(239, 68, 68, 0.4)',
      boxShadow: '0 4px 16px rgba(239, 68, 68, 0.3)',
    },
  };

  return {
    base: shared,
    variant: variants[variant] || variants.primary,
  };
}

/**
 * Accent-bordered glass panel for hub / tab shortcut cards.
 */
export function getAccentPanelStyles(themeOrColors = 'dark', accentColor = 'rgba(14, 165, 233, 0.35)') {
  const { colors } = resolveColors(themeOrColors);
  const isDark = colors.mode === 'dark';

  return {
    borderRadius: 16,
    padding: '16px 18px',
    background: colors.glass.panelBg,
    ...solidBorder({ color: accentColor }),
    boxShadow: isDark ? '0 12px 32px rgba(0, 0, 0, 0.32)' : colors.glass.shadow,
    ...glassBackdrop(colors),
    color: colors.text.primary,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };
}

/** @deprecated Use getCardStyles — kept as alias for glass components */
export function getGlassSurfaceStyles(themeOrColors, options) {
  return getCardStyles(themeOrColors, options);
}
