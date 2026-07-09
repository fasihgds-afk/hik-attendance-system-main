'use client';

import { useTheme } from '@/lib/theme/ThemeContext';
import { getCardStyles } from '@/lib/theme/styles';
import GlossOverlay from './GlossOverlay';

/**
 * GlassCard — warm frosted panel with gloss sheen.
 */
export default function GlassCard({
  children,
  className = '',
  padding = 24,
  borderRadius = 20,
  style,
  ...rest
}) {
  const { colors } = useTheme();

  return (
    <div
      className={`glass-surface hr-glass-card ${className}`.trim()}
      style={{
        ...getCardStyles(colors, { padding: 0, borderRadius }),
        ...style,
      }}
      {...rest}
    >
      <GlossOverlay />
      <div
        className="hr-glass-card__body"
        style={{
          position: 'relative',
          zIndex: 1,
          padding,
        }}
      >
        {children}
      </div>
    </div>
  );
}
