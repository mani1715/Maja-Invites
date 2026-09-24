/**
 * Punjabi Sangeet — Color Token System
 * Phulkari orange, rani pink magenta, bright gold, warm cream — high energy.
 */
export const PUNJABI_COLORS = {
  background:    '#1A0A00',
  primary:       '#FF6B00',   // phulkari orange
  secondary:     '#D4008B',   // rani pink / magenta
  accent:        '#FFD700',   // gold
  text:          '#FFF5E6',   // warm cream
  textMuted:     'rgba(255,245,230,0.65)',
  glass:         'rgba(255,107,0,0.07)',
  glassBorder:   'rgba(255,107,0,0.30)',
  particle:      '#FFD700',
  glow:          'rgba(212,0,139,0.35)',
  special:       '#00C896',   // parrot green chunni accent
};

export const punjabiStyle = () => ({
  '--theme-bg':           PUNJABI_COLORS.background,
  '--theme-primary':      PUNJABI_COLORS.primary,
  '--theme-secondary':    PUNJABI_COLORS.secondary,
  '--theme-accent':       PUNJABI_COLORS.accent,
  '--theme-text':         PUNJABI_COLORS.text,
  '--theme-text-muted':   PUNJABI_COLORS.textMuted,
  '--theme-glass':        PUNJABI_COLORS.glass,
  '--theme-glass-border': PUNJABI_COLORS.glassBorder,
  '--theme-particle':     PUNJABI_COLORS.particle,
  '--theme-glow':         PUNJABI_COLORS.glow,
  '--lux-gold':           PUNJABI_COLORS.accent,
  '--lux-primary':        PUNJABI_COLORS.secondary,
  '--lux-border':         PUNJABI_COLORS.glassBorder,
  background:             PUNJABI_COLORS.background,
  color:                  PUNJABI_COLORS.text,
});
