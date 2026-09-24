import { useLayoutEffect, useRef, useState } from 'react';
import './eventCard.css';

// The event invitation card: approved artwork, with the organiser's words
// dropped into the empty centre the artwork was composed around.
//
// EVERY geometry number here comes from `template.layout`, which the backend
// serves per template (backend/event_templates.py). Nothing about Ganesh is
// hardcoded — that file's brief is explicit that a future event type should
// only have to add a config entry, so reading the config is the whole point.
// If you find yourself adding an `if (eventType === ...)` here, stop.
//
// Sizing: the card is a container, and every font size is in `cqw` — 1% of the
// card's own width. That is what makes the text hold its proportions on a
// 320px phone and a 900px preview alike, which is what the layout percentages
// assume. Absolute px would drift on both.

const FALLBACK_LAYOUT = {
  text_zone: { top: '33%', left: '50%', width: '76%', height: '46%', align: 'center', valign: 'top', padding: '1.5%' },
  font_scale: 1,
  line_spacing: 1.16,
  palette: { text: '#3A2A18', accent: '#9A7B3F', muted: '#6B5844' },
  overflow: 'shrink',
};

/** "941:1672" -> 941/1672. Falls back to portrait if the string is odd. */
function ratio(aspect) {
  const [w, h] = String(aspect || '').split(':').map(Number);
  return w > 0 && h > 0 ? w / h : 941 / 1672;
}

export default function EventInvitationCard({
  template,
  content = {},
  // `preview` uses the 900w art, grid cards use the 400w thumb. Same geometry.
  variant = 'preview',
  className = '',
  alt,
}) {
  const zoneRef = useRef(null);
  const textRef = useRef(null);
  const [shrink, setShrink] = useState(1);

  const layout = { ...FALLBACK_LAYOUT, ...(template?.layout || {}) };
  const zone = { ...FALLBACK_LAYOUT.text_zone, ...(layout.text_zone || {}) };
  const palette = { ...FALLBACK_LAYOUT.palette, ...(layout.palette || {}) };

  const art = variant === 'thumb'
    ? (template?.thumbnail_url || template?.preview_url)
    : (template?.preview_url || template?.thumbnail_url);

  const heading = content.heading || '';
  const subheading = content.subheading || '';
  const message = content.welcome_message || content.message || '';
  const hasText = Boolean(heading || subheading || message);

  // `overflow: "shrink"` in the config means shrink-to-fit — never clip, never
  // distort. Clamping lines would clip, so instead we measure and step the
  // scale down. Bounded to 12 passes so a pathological string cannot spin.
  useLayoutEffect(() => {
    if (layout.overflow !== 'shrink' || !hasText) { setShrink(1); return; }
    const zoneEl = zoneRef.current;
    const textEl = textRef.current;
    if (!zoneEl || !textEl) return;

    let s = 1;
    setShrink(1);
    // Read after the browser has laid out at scale 1.
    const fit = () => {
      let guard = 0;
      while (textEl.scrollHeight > zoneEl.clientHeight && s > 0.5 && guard < 12) {
        s -= 0.06;
        textEl.style.setProperty('--evc-shrink', String(s));
        guard += 1;
      }
      setShrink(s);
    };
    const raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, [heading, subheading, message, hasText, layout.overflow, art]);

  if (!template) return null;

  const style = {
    '--evc-ratio': String(ratio(template.aspect_ratio)),
    '--evc-scale': String(layout.font_scale ?? 1),
    '--evc-shrink': String(shrink),
    '--evc-lh': String(layout.line_spacing ?? 1.16),
    '--evc-text': palette.text,
    '--evc-accent': palette.accent,
    '--evc-muted': palette.muted,
    '--evc-top': zone.top,
    '--evc-left': zone.left,
    '--evc-width': zone.width,
    '--evc-height': zone.height,
    '--evc-pad': zone.padding || '1.5%',
  };

  return (
    <div className={`evc ${className}`} style={style}>
      <img
        className="evc-art"
        src={art}
        // The artwork carries the whole visual meaning, so it needs a real
        // description, not "". The template name is what a person would say.
        alt={alt || `${template.name || 'Invitation'} design`}
        loading={variant === 'thumb' ? 'lazy' : 'eager'}
        decoding="async"
        draggable={false}
      />

      {hasText && (
        <div
          ref={zoneRef}
          className="evc-zone"
          data-align={zone.align || 'center'}
          data-valign={zone.valign || 'top'}
        >
          <div ref={textRef} className="evc-text">
            {heading && <p className="evc-heading">{heading}</p>}
            {subheading && <p className="evc-sub">{subheading}</p>}
            {message && <p className="evc-msg">{message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
