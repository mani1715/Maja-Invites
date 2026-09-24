/**
 * Christian Elegant — Color Token System
 * Candlelight cream, stained glass purple, gold cross, ghost-white text.
 */
export const CHRISTIAN_COLORS = {
  background:    '#08080F',
  primary:       '#F5F5DC',   // cream / candlelight
  secondary:     '#7B68EE',   // stained-glass purple
  accent:        '#FFD700',   // gold cross
  text:          '#F8F8FF',   // ghost white
  textMuted:     'rgba(248,248,255,0.6)',
  glass:         'rgba(245,245,220,0.04)',
  glassBorder:   'rgba(245,245,220,0.18)',
  particle:      '#FFFFFF',
  glow:          'rgba(255,215,0,0.22)',
  stainedRed:    '#E63946',
  stainedBlue:   '#457B9D',
  stainedGreen:  '#2DC653',
};

export const christianStyle = () => ({
  '--theme-bg':           CHRISTIAN_COLORS.background,
  '--theme-primary':      CHRISTIAN_COLORS.primary,
  '--theme-secondary':    CHRISTIAN_COLORS.secondary,
  '--theme-accent':       CHRISTIAN_COLORS.accent,
  '--theme-text':         CHRISTIAN_COLORS.text,
  '--theme-text-muted':   CHRISTIAN_COLORS.textMuted,
  '--theme-glass':        CHRISTIAN_COLORS.glass,
  '--theme-glass-border': CHRISTIAN_COLORS.glassBorder,
  '--theme-particle':     CHRISTIAN_COLORS.particle,
  '--theme-glow':         CHRISTIAN_COLORS.glow,
  '--lux-gold':           CHRISTIAN_COLORS.accent,
  '--lux-primary':        CHRISTIAN_COLORS.primary,
  '--lux-border':         CHRISTIAN_COLORS.glassBorder,
  background:             CHRISTIAN_COLORS.background,
  color:                  CHRISTIAN_COLORS.text,
});
