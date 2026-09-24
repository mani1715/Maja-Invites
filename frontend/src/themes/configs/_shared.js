/**
 * Shared helpers used by per-theme design config files.
 * Extracted from allDesigns.js as part of Phase 3 (split design configs).
 */
import { OVERLAY } from '../designOverlays';

export const O = OVERLAY;

export const BASE = (theme) => `/designs/all/${theme}`;

export const onDarkText = (accent) => ({
  textColor: '#F5ECD7',
  textBackdrop: 'rgba(10,8,4,0.55)',
});

export const onLightText = (accent, dark) => ({
  textColor: dark,
  textBackdrop: 'rgba(255,255,255,0.62)',
});
