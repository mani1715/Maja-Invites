/**
 * Bengali Traditional — Color Token System
 * Sindoor red, turmeric gold, shankha white, alta vermillion accents.
 */
export const BENGALI_COLORS = {
  background:    '#0D0505',
  primary:       '#CC0000',   // sindoor / alta red
  secondary:     '#FFD700',   // turmeric / haldi gold
  accent:        '#FFFFFF',   // shankha white
  text:          '#FFF8F0',   // warm ivory
  textMuted:     'rgba(255,248,240,0.65)',
  glass:         'rgba(204,0,0,0.06)',
  glassBorder:   'rgba(204,0,0,0.25)',
  particle:      '#CC0000',
  glow:          'rgba(255,215,0,0.3)',
  flame:         '#FF4500',
};

export const bengaliStyle = () => ({
  '--theme-bg':           BENGALI_COLORS.background,
  '--theme-primary':      BENGALI_COLORS.primary,
  '--theme-secondary':    BENGALI_COLORS.secondary,
  '--theme-accent':       BENGALI_COLORS.accent,
  '--theme-text':         BENGALI_COLORS.text,
  '--theme-text-muted':   BENGALI_COLORS.textMuted,
  '--theme-glass':        BENGALI_COLORS.glass,
  '--theme-glass-border': BENGALI_COLORS.glassBorder,
  '--theme-particle':     BENGALI_COLORS.particle,
  '--theme-glow':         BENGALI_COLORS.glow,
  '--lux-gold':           BENGALI_COLORS.secondary,
  '--lux-primary':        BENGALI_COLORS.primary,
  '--lux-border':         BENGALI_COLORS.glassBorder,
  background:             BENGALI_COLORS.background,
  color:                  BENGALI_COLORS.text,
});
