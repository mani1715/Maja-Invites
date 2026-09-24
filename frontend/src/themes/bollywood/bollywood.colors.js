/**
 * Bollywood Luxury — Color Token System
 * Velvet black-purple, hot magenta pink, gold, spotlight white.
 */
export const BOLLYWOOD_COLORS = {
  background:    '#0A0005',
  primary:       '#FF0080',   // hot magenta
  secondary:     '#FFD700',   // cinema gold
  accent:        '#FF6B00',   // spotlight orange
  text:          '#FFFFFF',
  textMuted:     'rgba(255,255,255,0.65)',
  glass:         'rgba(255,0,128,0.06)',
  glassBorder:   'rgba(255,215,0,0.30)',
  particle:      '#FFD700',
  glow:          'rgba(255,0,128,0.40)',
  curtain:       '#800020',
  lens:          'rgba(255,255,255,0.9)',
};

export const bollywoodStyle = () => ({
  '--theme-bg':           BOLLYWOOD_COLORS.background,
  '--theme-primary':      BOLLYWOOD_COLORS.primary,
  '--theme-secondary':    BOLLYWOOD_COLORS.secondary,
  '--theme-accent':       BOLLYWOOD_COLORS.accent,
  '--theme-text':         BOLLYWOOD_COLORS.text,
  '--theme-text-muted':   BOLLYWOOD_COLORS.textMuted,
  '--theme-glass':        BOLLYWOOD_COLORS.glass,
  '--theme-glass-border': BOLLYWOOD_COLORS.glassBorder,
  '--theme-particle':     BOLLYWOOD_COLORS.particle,
  '--theme-glow':         BOLLYWOOD_COLORS.glow,
  '--lux-gold':           BOLLYWOOD_COLORS.secondary,
  '--lux-primary':        BOLLYWOOD_COLORS.primary,
  '--lux-border':         BOLLYWOOD_COLORS.glassBorder,
  background:             BOLLYWOOD_COLORS.background,
  color:                  BOLLYWOOD_COLORS.text,
});
