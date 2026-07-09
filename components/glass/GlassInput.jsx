'use client';

import { useTheme } from '@/lib/theme/ThemeContext';
import { getInputStyles, getSelectStyles } from '@/lib/theme/styles';

/**
 * GlassInput — themed input/select/textarea via getInputStyles() / getSelectStyles().
 */
export default function GlassInput({
  asTextarea = false,
  asSelect = false,
  className = '',
  style,
  onFocus,
  onBlur,
  children,
  ...rest
}) {
  const { colors } = useTheme();
  const inputStyles = asSelect
    ? getSelectStyles(colors)
    : getInputStyles(colors);

  const focusHandlers = {
    onFocus: (e) => {
      e.currentTarget.style.borderColor = inputStyles.focus.borderColor;
      e.currentTarget.style.boxShadow = inputStyles.focus.boxShadow;
      onFocus?.(e);
    },
    onBlur: (e) => {
      e.currentTarget.style.border = inputStyles.base.border;
      e.currentTarget.style.boxShadow = 'none';
      onBlur?.(e);
    },
  };

  const shared = {
    className: `glass-input ${className}`.trim(),
    style: { ...inputStyles.base, ...style },
    ...focusHandlers,
    ...rest,
  };

  if (asTextarea) {
    return <textarea {...shared} />;
  }

  if (asSelect) {
    return <select {...shared}>{children}</select>;
  }

  return <input {...shared} />;
}
