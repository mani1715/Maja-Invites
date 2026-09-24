/**
 * Modern Minimal — Color Token System
 * Pure black, silver/white, faint gold accent (used sparingly).
 * Quiet, refined, architectural.
 */
export const MINIMAL_COLORS = {
  background:    '#0F0F0F',
  primary:       '#C0C0C0',   // silver
  secondary:     '#FFFFFF',
  accent:        '#D4AF37',   // gold (used sparingly)
  text:          '#F0F0F0',
  textMuted:     'rgba(240,240,240,0.55)',
  glass:         'rgba(255,255,255,0.04)',
  glassBorder:   'rgba(255,255,255,0.12)',
  particle:      'rgba(255,255,255,0.6)',
  glow:          'rgba(255,255,255,0.08)',
};

export const minimalStyle = () => ({
  '--theme-bg':           MINIMAL_COLORS.background,
  '--theme-primary':      MINIMAL_COLORS.primary,
  '--theme-secondary':    MINIMAL_COLORS.secondary,
  '--theme-accent':       MINIMAL_COLORS.accent,
  '--theme-text':         MINIMAL_COLORS.text,
  '--theme-text-muted':   MINIMAL_COLORS.textMuted,
  '--theme-glass':        MINIMAL_COLORS.glass,
  '--theme-glass-border': MINIMAL_COLORS.glassBorder,
  '--theme-particle':     MINIMAL_COLORS.particle,
  '--theme-glow':         MINIMAL_COLORS.glow,
  '--lux-gold':           MINIMAL_COLORS.accent,
  '--lux-primary':        MINIMAL_COLORS.primary,
  '--lux-border':         MINIMAL_COLORS.glassBorder,
  background:             MINIMAL_COLORS.background,
  color:                  MINIMAL_COLORS.text,
});
