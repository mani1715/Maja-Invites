/**
 * Royal Mughal — Color Token System
 * UPDATED: Warm ivory/cream background to match invitation cards
 * Gold, deep red, ivory tones for royal elegance
 */
export const MUGHAL_COLORS = {
  background:    '#F5EFE6',   // Warm ivory/cream
  primary:       '#C8962A',   // Royal gold
  secondary:     '#8B1A1A',   // Deep red
  accent:        '#D4AF37',   // Rich gold accent
  text:          '#2C1810',   // Dark brown for readability
  textMuted:     'rgba(44,24,16,0.65)',
  glass:         'rgba(200,150,42,0.08)',
  glassBorder:   'rgba(200,150,42,0.25)',
  particle:      '#E8C97A',
  glow:          'rgba(200,150,42,0.3)',
};

/** Spread into a React `style` prop on the theme root to enforce the palette. */
export const mughalStyle = () => ({
  '--theme-bg':           MUGHAL_COLORS.background,
  '--theme-primary':      MUGHAL_COLORS.primary,
  '--theme-secondary':    MUGHAL_COLORS.secondary,
  '--theme-accent':       MUGHAL_COLORS.accent,
  '--theme-text':         MUGHAL_COLORS.text,
  '--theme-text-muted':   MUGHAL_COLORS.textMuted,
  '--theme-glass':        MUGHAL_COLORS.glass,
  '--theme-glass-border': MUGHAL_COLORS.glassBorder,
  '--theme-particle':     MUGHAL_COLORS.particle,
  '--theme-glow':         MUGHAL_COLORS.glow,
  '--lux-gold':           MUGHAL_COLORS.accent,
  '--lux-primary':        MUGHAL_COLORS.primary,
  '--lux-border':         MUGHAL_COLORS.glassBorder,
  background:             MUGHAL_COLORS.background,
  color:                  MUGHAL_COLORS.text,
});
