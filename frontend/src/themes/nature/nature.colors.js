/**
 * Nature / Eco — Color Token System
 * Forest greens, lime, spring yellow-green, earthy soil brown.
 */
export const NATURE_COLORS = {
  background:    '#030A03',
  primary:       '#4CAF50',   // leaf green
  secondary:     '#8BC34A',   // lime
  accent:        '#CDDC39',   // spring yellow-green
  text:          '#F1F8E9',
  textMuted:     'rgba(241,248,233,0.65)',
  glass:         'rgba(76,175,80,0.06)',
  glassBorder:   'rgba(76,175,80,0.22)',
  particle:      '#A5D6A7',
  glow:          'rgba(139,195,74,0.28)',
  earth:         '#795548',
  sunray:        'rgba(255,235,59,0.18)',
};

export const natureStyle = () => ({
  '--theme-bg':           NATURE_COLORS.background,
  '--theme-primary':      NATURE_COLORS.primary,
  '--theme-secondary':    NATURE_COLORS.secondary,
  '--theme-accent':       NATURE_COLORS.accent,
  '--theme-text':         NATURE_COLORS.text,
  '--theme-text-muted':   NATURE_COLORS.textMuted,
  '--theme-glass':        NATURE_COLORS.glass,
  '--theme-glass-border': NATURE_COLORS.glassBorder,
  '--theme-particle':     NATURE_COLORS.particle,
  '--theme-glow':         NATURE_COLORS.glow,
  '--lux-gold':           NATURE_COLORS.accent,
  '--lux-primary':        NATURE_COLORS.primary,
  '--lux-border':         NATURE_COLORS.glassBorder,
  background:             NATURE_COLORS.background,
  color:                  NATURE_COLORS.text,
});
