'use client';

import { getGlossLayers } from '@/lib/theme/styles';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Specular gloss sheen + rim highlight for glass surfaces.
 */
export default function GlossOverlay() {
  const { colors } = useTheme();
  const layers = getGlossLayers(colors);

  return (
    <>
      <div aria-hidden="true" style={layers.sheen} />
      <div aria-hidden="true" style={layers.rim} />
    </>
  );
}
