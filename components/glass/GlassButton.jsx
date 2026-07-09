'use client';

import { useTheme } from '@/lib/theme/ThemeContext';
import { getButtonStyles } from '@/lib/theme/styles';

/**
 * GlassButton — themed button via getButtonStyles().
 */
export default function GlassButton({
  children,
  variant = 'primary',
  disabled = false,
  className = '',
  style,
  type = 'button',
  onClick,
  ...rest
}) {
  const { colors } = useTheme();
  const { base, variant: variantStyle } = getButtonStyles(colors, variant);

  return (
    <button
      type={type}
      disabled={disabled}
      className={`glass-button ${className}`.trim()}
      onClick={onClick}
      style={{
        ...base,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        ...variantStyle,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
