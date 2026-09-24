/**
 * EventInvitationCard.jsx — MAJA Dynamic Event Engine: the invitation card.
 * =========================================================================
 *
 * The ONE place event invitation content is composed onto the approved artwork.
 * Renders through the shared `UniversalDesignRenderer` (event mode) — the SAME
 * engine the wedding invitations use — so the Builder preview, the public preview,
 * and the published invitation are pixel-identical (preview consistency, per brief).
 * The artwork is never modified; only the text zone is filled.
 */
import React, { useEffect, useState } from 'react';
import UniversalDesignRenderer from '../../themes/UniversalDesignRenderer';
import { EventService } from '../../services/eventApi';

function fmtDate(start, end) {
  if (!start) return '';
  try {
    const opt = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const s = new Date(`${start}T00:00:00`);
    if (!end || end === start) return s.toLocaleDateString('en-IN', opt);
    const e = new Date(`${end}T00:00:00`);
    const short = { day: 'numeric', month: 'short' };
    return `${s.toLocaleDateString('en-IN', short)} – ${e.toLocaleDateString('en-IN', { ...short, year: 'numeric' })}`;
  } catch (_) { return start; }
}

/** 9 → "9th", 1 → "1st", 22 → "22nd". Empty string when unset. */
function ordinal(n) {
  const v = parseInt(n, 10);
  if (!v || v < 1) return '';
  const rem100 = v % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${v}th`;
  return `${v}${({ 1: 'st', 2: 'nd', 3: 'rd' })[v % 10] || 'th'}`;
}

/** Map an event document to the renderer's text-zone content. */
export function buildEventContent(event) {
  const c = event.content || {};
  const org = event.organizer || {};
  const ven = event.venue || {};
  // Hero eyebrow: the celebration edition ("11th Year Celebration") leads when the
  // host has set one, followed by who is hosting. The layout shrinks to fit, so the
  // extra clause never clips the artwork's parchment zone.
  const hosted = org.name
    ? `${org.hosted_by_label || 'Hosted by'} ${org.name}`
    : (c.subheading || 'You are cordially invited');
  const edition = ordinal(event.festival_edition);
  const eyebrow = edition ? `${edition} Year Celebration · ${hosted}` : hosted;
  return {
    headline: c.heading || event.event_name || 'Ganesh Chaturthi',
    eyebrow,
    title: event.title || 'Untitled Event',
    date: fmtDate(event.start_date, event.end_date),
    venue: ven.venue_name || ven.address || '',
    message: c.welcome_message || '',
  };
}

export function EventInvitationCard({ event, template, className = '', style = {} }) {
  if (!template) return null;
  const design = { id: template.template_id, title: template.name, image: template.preview_url, overlays: [] };
  const theme = { tokens: {}, id: null };
  return (
    <UniversalDesignRenderer
      design={design}
      theme={theme}
      eventMode={{ layout: template.layout, content: buildEventContent(event) }}
      className={className}
      style={style}
      eager
    />
  );
}

/** Live preview used inside the Builder — resolves the selected template from the
 *  catalog and renders the exact card that will be published. */
export function EventLivePreview({ event }) {
  const [template, setTemplate] = useState(null);
  const tid = event.template_id || (event.theme && event.theme.template);

  useEffect(() => {
    let alive = true;
    EventService.templates(event.event_type)
      .then((r) => {
        if (!alive) return;
        const list = r.templates || [];
        setTemplate(list.find((t) => t.template_id === tid) || list[0] || null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [event.event_type, tid]);

  if (!template) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Preparing preview…</p>;
  }
  return (
    <div className="mx-auto" style={{ maxWidth: '22rem' }}>
      <EventInvitationCard event={event} template={template} />
    </div>
  );
}

export default EventInvitationCard;
