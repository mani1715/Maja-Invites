/**
 * Beach Destination — Color Token System
 * Deep ocean night, tropical cyan, sunset orange, golden sand.
 */
export const BEACH_COLORS = {
  background:    '#030D1A',
  primary:       '#00B4D8',   // tropical cyan
  secondary:     '#F4A261',   // sunset orange
  accent:        '#E9C46A',   // golden sand
  text:          '#F8F9FA',   // sea-foam white
  textMuted:     'rgba(248,249,250,0.65)',
  glass:         'rgba(0,180,216,0.06)',
  glassBorder:   'rgba(0,180,216,0.22)',
  particle:      '#E9C46A',
  glow:          'rgba(244,162,97,0.32)',
  horizon:       '#FF6B6B',   // coral sunset
};

export const beachStyle = () => ({
  '--theme-bg':           BEACH_COLORS.background,
  '--theme-primary':      BEACH_COLORS.primary,
  '--theme-secondary':    BEACH_COLORS.secondary,
  '--theme-accent':       BEACH_COLORS.accent,
  '--theme-text':         BEACH_COLORS.text,
  '--theme-text-muted':   BEACH_COLORS.textMuted,
  '--theme-glass':        BEACH_COLORS.glass,
  '--theme-glass-border': BEACH_COLORS.glassBorder,
  '--theme-particle':     BEACH_COLORS.particle,
  '--theme-glow':         BEACH_COLORS.glow,
  '--lux-gold':           BEACH_COLORS.accent,
  '--lux-primary':        BEACH_COLORS.primary,
  '--lux-border':         BEACH_COLORS.glassBorder,
  background:             BEACH_COLORS.background,
  color:                  BEACH_COLORS.text,
});
