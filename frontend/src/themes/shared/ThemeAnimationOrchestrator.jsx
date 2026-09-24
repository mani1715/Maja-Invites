/* ════════════════════════════════════════════════════════════════════════
 * Opening / Closing Orchestrators (Feb 2026 — unified simple zoom-in)
 *
 * The previous theme-specific 3D opening animations were retired per user
 * feedback ("the opening animations look ugly"). EVERY theme now uses one
 * calm 2.5-second zoom-in over the couple's chosen opening photo with
 * their names rendered in the luxe serif palette.
 *
 *   • Per-theme opening props (themeId / event / eventType / monogram /
 *     date) are still accepted for backwards compatibility, but only
 *     `image`, `bride`, `groom`, `date` and `onComplete` are read.
 *   • CinematicClosing is preserved — closing sequence still uses the
 *     design photo and remains theme-flavored.
 * ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import ZoomInOpening from './ZoomInOpening';
import CinematicClosing from './CinematicClosing';

export function OpeningOrchestrator({
  // Legacy props (themeId/eventType/event/monogram) intentionally ignored
  // so all themes share the same opening UX.
  image,
  openingImage,
  couplePhoto,
  bride,
  groom,
  date,
  onComplete,
}) {
  // Prefer the explicit opening photo, fall back to couple photo, then hero design.
  const bgUrl = openingImage || couplePhoto || image || '';
  return (
    <ZoomInOpening
      image={bgUrl}
      bride={bride}
      groom={groom}
      date={date}
      duration={2.5}
      onComplete={onComplete}
    />
  );
}

export function ClosingOrchestrator({ themeId, image, bride, groom, date, event, eventType }) {
  const determinedEventType = eventType || event?.event_type || event?.type || 'marriage';
  return (
    <CinematicClosing
      themeId={themeId}
      image={image}
      bride={bride}
      groom={groom}
      date={date}
      eventType={determinedEventType}
    />
  );
}

export default OpeningOrchestrator;
