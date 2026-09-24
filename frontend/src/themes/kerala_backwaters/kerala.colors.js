/**
 * Kerala Backwaters — Color Token System
 * Deep teal water, parchment ivory, sacred gold, lotus pink, banana-leaf green.
 * Replaces the previous Bollywood Luxury theme.
 */
export const KERALA_COLORS = {
  background:    '#0B3D45',  // deep backwater teal (night-water hero)
  primary:       '#0E6070',  // mid-teal highlight
  secondary:     '#D4A24C',  // brass/temple gold
  accent:        '#E85A8A',  // lotus pink
  text:          '#F5ECD7',  // ivory parchment
  textMuted:     'rgba(245,236,215,0.72)',
  glass:         'rgba(11,61,69,0.45)',
  glassBorder:   'rgba(212,162,76,0.40)',
  particle:      '#F8E1A8',  // warm gold sparkle on water
  glow:          'rgba(212,162,76,0.45)',
  bananaLeaf:    '#2F5D3A',
  water:         '#083840',
  waterHighlight:'#10707E',
  lotus:         '#F4A6C0',
  lotusDeep:     '#CD3F75',
  lily:          '#FFF6E9',
};

export const keralaStyle = () => ({
  '--theme-bg':           KERALA_COLORS.background,
  '--theme-primary':      KERALA_COLORS.primary,
  '--theme-secondary':    KERALA_COLORS.secondary,
  '--theme-accent':       KERALA_COLORS.accent,
  '--theme-text':         KERALA_COLORS.text,
  '--theme-text-muted':   KERALA_COLORS.textMuted,
  '--theme-glass':        KERALA_COLORS.glass,
  '--theme-glass-border': KERALA_COLORS.glassBorder,
  '--theme-particle':     KERALA_COLORS.particle,
  '--theme-glow':         KERALA_COLORS.glow,
  '--lux-gold':           KERALA_COLORS.secondary,
  '--lux-primary':        KERALA_COLORS.primary,
  '--lux-border':         KERALA_COLORS.glassBorder,
  background:             KERALA_COLORS.background,
  color:                  KERALA_COLORS.text,
});
