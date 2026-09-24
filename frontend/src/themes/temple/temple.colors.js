/**
 * South Indian Temple — Color Token System
 * UPDATED: Warm turmeric/cream background matching temple invitation cards
 * Turmeric gold, kumkum red, jasmine white, marigold accents
 */
export const TEMPLE_COLORS = {
  background:    '#FFF8E7',   // Warm cream/jasmine
  primary:       '#B8860B',   // Turmeric gold
  secondary:     '#8B0000',   // Kumkum red
  accent:        '#DAA520',   // Marigold gold
  text:          '#2C1810',   // Dark brown text
  textMuted:     'rgba(44,24,16,0.65)',
  glass:         'rgba(184,134,11,0.08)',
  glassBorder:   'rgba(184,134,11,0.25)',
  particle:      '#FFD700',
  glow:          'rgba(184,134,11,0.35)',
  flame:         '#FF6B35',   // Oil-lamp flame orange
};

/** Spread into a React `style` prop on the theme root to enforce the palette. */
export const templeStyle = () => ({
  '--theme-bg':           TEMPLE_COLORS.background,
  '--theme-primary':      TEMPLE_COLORS.primary,
  '--theme-secondary':    TEMPLE_COLORS.secondary,
  '--theme-accent':       TEMPLE_COLORS.accent,
  '--theme-text':         TEMPLE_COLORS.text,
  '--theme-text-muted':   TEMPLE_COLORS.textMuted,
  '--theme-glass':        TEMPLE_COLORS.glass,
  '--theme-glass-border': TEMPLE_COLORS.glassBorder,
  '--theme-particle':     TEMPLE_COLORS.particle,
  '--theme-glow':         TEMPLE_COLORS.glow,
  '--lux-gold':           TEMPLE_COLORS.accent,
  '--lux-primary':        TEMPLE_COLORS.primary,
  '--lux-border':         TEMPLE_COLORS.glassBorder,
  background:             TEMPLE_COLORS.background,
  color:                  TEMPLE_COLORS.text,
});
