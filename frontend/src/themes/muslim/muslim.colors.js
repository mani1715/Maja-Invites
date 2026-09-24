/**
 * Muslim Nikah — Color Token System
 * Islamic gold, Islamic green, warm cream background, pale gold accents.
 * UPDATED: Background now matches invitation card colors (cream/beige)
 */
export const MUSLIM_COLORS = {
  background:    '#F5EFE6',   // Warm cream/beige to match invitation
  primary:       '#C5A028',   // Islamic gold
  secondary:     '#8B1538',   // Deep red/maroon for accents
  accent:        '#D4AF37',   // Rich gold accent
  text:          '#2C2416',   // Dark brown text for readability
  textMuted:     'rgba(44,36,22,0.6)',
  glass:         'rgba(197,160,40,0.08)',
  glassBorder:   'rgba(197,160,40,0.25)',
  particle:      '#C5A028',
  glow:          'rgba(197,160,40,0.35)',
  moon:          '#F5DEB3',
};

export const muslimStyle = () => ({
  '--theme-bg':           MUSLIM_COLORS.background,
  '--theme-primary':      MUSLIM_COLORS.primary,
  '--theme-secondary':    MUSLIM_COLORS.secondary,
  '--theme-accent':       MUSLIM_COLORS.accent,
  '--theme-text':         MUSLIM_COLORS.text,
  '--theme-text-muted':   MUSLIM_COLORS.textMuted,
  '--theme-glass':        MUSLIM_COLORS.glass,
  '--theme-glass-border': MUSLIM_COLORS.glassBorder,
  '--theme-particle':     MUSLIM_COLORS.particle,
  '--theme-glow':         MUSLIM_COLORS.glow,
  '--lux-gold':           MUSLIM_COLORS.primary,
  '--lux-primary':        MUSLIM_COLORS.primary,
  '--lux-border':         MUSLIM_COLORS.glassBorder,
  background:             MUSLIM_COLORS.background,
  color:                  MUSLIM_COLORS.text,
});
