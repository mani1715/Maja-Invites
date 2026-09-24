/**
 * EventDesignStrip.jsx — a shoppable row of EVENT invitation designs.
 * ===================================================================
 *
 * One component, used on every surface that should merchandise event designs:
 *   • the photographer panel (studios show designs to their clients)
 *   • any future landing surface the owner asks for
 * NOT on the public home page — per the owner, festival designs are reached through
 * Browse → Religious → Ganesh, so the home page stays a wedding shop-front.
 * Each card opens the FULL scrollable preview (/events/preview/:type/:template) —
 * the same finished-invitation preview the wedding designs get.
 *
 * Data comes from the approved template catalogue + the owner-set price sheet, so
 * nothing here is duplicated or hardcoded. Renders NOTHING when the event module is
 * off or the type has no designs, so it can be dropped anywhere safely.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { EventService } from '@/services/eventApi';

export default function EventDesignStrip({
  eventType = 'ganesh_chaturthi',
  title = 'Ganesh Chaturthi',
  eyebrow = '◆ Festivals',
  blurb = 'Ten hand-crafted designs — with per-day schedule, prasadam, blessings and donation tracking built in.',
  limit = 8,
  className = '',
}) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);
  const [price, setPrice] = useState(null);

  useEffect(() => {
    let alive = true;
    EventService.templates(eventType)
      .then((r) => { if (alive) setTemplates(r.templates || []); })
      .catch(() => { if (alive) setTemplates([]); });
    EventService.eventPricing(eventType)
      .then((p) => { if (alive) setPrice(p && p.from_price_inr); })
      .catch(() => {});
    return () => { alive = false; };
  }, [eventType]);

  if (!templates || templates.length === 0) return null;   // module off / no designs

  return (
    <section className={`px-5 md:px-10 py-14 ${className}`} data-testid={`event-strip-${eventType}`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <span className="lux-eyebrow block mb-2">{eyebrow}</span>
            <h2 className="font-display text-3xl md:text-4xl" style={{ color: 'var(--lux-text)' }}>
              {title}
            </h2>
            <p className="text-sm mt-2 max-w-xl" style={{ color: 'var(--lux-text-muted)' }}>
              {blurb}
              {price != null && (
                <> Invitations from <span className="text-gold">₹{Number(price).toLocaleString('en-IN')}</span>.</>
              )}
            </p>
          </div>
          <button
            onClick={() => navigate('/browse/religious/ganesh')}
            className="lux-btn lux-btn-ghost inline-flex items-center gap-2 text-[11px]"
            data-testid={`event-strip-all-${eventType}`}>
            <Sparkles className="w-3.5 h-3.5" /> See all designs
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {templates.slice(0, limit).map((t) => (
            <button
              key={t.template_id}
              onClick={() => navigate(`/events/preview/${eventType}/${t.template_id}`)}
              className="lux-glass text-left overflow-hidden transition-transform"
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-4px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              data-testid={`event-strip-card-${t.template_id}`}>
              <div className="relative w-full" style={{ aspectRatio: '941 / 1672', background: 'var(--lux-panel)' }}>
                {t.thumbnail_url && (
                  <img src={t.thumbnail_url} alt={t.name || ''} loading="lazy" decoding="async"
                    className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-3">
                <h3 className="font-heading text-sm" style={{ color: 'var(--lux-text)' }}>{t.name}</h3>
                {t.palette && (
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--lux-text-faint)' }}>{t.palette}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
