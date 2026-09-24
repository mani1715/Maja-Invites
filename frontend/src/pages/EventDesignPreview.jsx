/**
 * EventDesignPreview.jsx — the full, scrollable preview of ONE event design.
 * Route: /events/preview/:eventType/:templateId
 *
 * The event twin of DesignFullPreview (weddings): the poster sits centred on a zoomed,
 * softly blurred copy of its own artwork, and the whole invitation scrolls underneath
 * filled with sample details — so a visitor sees a finished invitation, not a blank
 * template. Reuses the REAL renderer (EventInvitationView), so the preview and the
 * published link can never drift apart.
 *
 * "Get this design" opens the owner-priced offer (design + plans + feature add-ons from
 * /api/events/design-offer) and continues into the purchase flow.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Home, ShoppingBag, X } from 'lucide-react';
import { EventService } from '@/services/eventApi';
import { EventInvitationView } from './EventPublicInvitation';
import { sampleEventFor } from '@/data/eventSampleData';
import LoadingFallback from '@/components/LoadingFallback';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function EventDesignPreview() {
  const { eventType, templateId } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [state, setState] = useState('loading');     // loading | ready | missing
  const [offer, setOffer] = useState(null);
  const [offerOpen, setOfferOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    EventService.templates(eventType)
      .then((r) => {
        if (!alive) return;
        const list = r.templates || [];
        const t = list.find((x) => x.template_id === templateId) || list[0];
        setTemplate(t || null);
        setState(t ? 'ready' : 'missing');
      })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [eventType, templateId]);

  const openOffer = useCallback(() => {
    setOfferOpen(true);
    if (offer) return;
    EventService.eventDesignOffer(eventType, templateId)
      .then(setOffer)
      .catch(() => setOffer({ design_price_inr: 0, plans: [], feature_addons: [] }));
  }, [eventType, templateId, offer]);

  if (state === 'loading') return <LoadingFallback variant="page" />;
  if (state === 'missing' || !template) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="text-lg font-medium">Design not available</p>
        <button onClick={() => navigate('/browse/religious/ganesh')} className="mt-4 text-sm underline">
          Back to designs
        </button>
      </div>
    );
  }

  const sample = { ...sampleEventFor(eventType, template.name), template };

  return (
    <div className="relative" data-testid="event-design-preview">
      {/* top controls — mirrors the wedding preview bar */}
      <div className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-between px-4 py-3"
        style={{ background: 'linear-gradient(180deg, rgba(20,14,8,0.72) 0%, rgba(20,14,8,0) 100%)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] uppercase tracking-[0.25em]"
            style={{ color: '#FFF8DC', background: 'rgba(20,14,8,0.55)', border: '1px solid rgba(255,248,220,0.28)' }}
            data-testid="event-preview-back">
            <ArrowLeft className="h-4 w-4" /> Designs
          </button>
          <button onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] uppercase tracking-[0.25em]"
            style={{ color: '#FFF8DC', background: 'rgba(20,14,8,0.55)', border: '1px solid rgba(255,248,220,0.28)' }}
            aria-label="Home">
            <Home className="h-4 w-4" /> Home
          </button>
        </div>
        <button onClick={openOffer}
          className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.25em]"
          style={{ color: '#241A12', background: '#D4AF37' }}
          data-testid="event-preview-get">
          <ShoppingBag className="h-3.5 w-3.5" /> Get this design
        </button>
      </div>

      {/* the invitation itself — same component the published link renders */}
      <EventInvitationView event={sample} slug="" template={template} preview />

      {/* design caption + bottom CTA */}
      <div className="relative mx-auto max-w-xl px-4 pb-20 text-center" style={{ zIndex: 2 }}>
        <p className="text-[10px] uppercase tracking-[0.45em]" style={{ color: '#F3D79A' }}>◆ This design</p>
        <h2 className="mt-2 leading-tight"
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif', color: '#FFF6E2',
            fontSize: 'clamp(1.9rem, 7vw, 2.7rem)', textShadow: '0 2px 18px rgba(0,0,0,0.55)',
          }}>
          {template.name}
        </h2>
        {template.palette && (
          <p className="mt-2 text-[12px] uppercase tracking-[0.3em]"
            style={{ color: 'rgba(255,246,226,0.85)', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
            {template.palette}
          </p>
        )}
        <p className="mt-3 text-[13px]" style={{ color: 'rgba(255,246,226,0.72)', textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>
          Sample details shown — your invitation is filled with your own.
        </p>
        <button onClick={openOffer}
          className="mt-7 w-full rounded-full px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: '#241A12', background: '#D4AF37', boxShadow: '0 12px 30px rgba(0,0,0,0.35)' }}
          data-testid="event-preview-get-bottom">
          <ShoppingBag className="mr-2 inline h-4 w-4" /> Get this design
        </button>
      </div>

      {/* owner-priced offer */}
      {offerOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setOfferOpen(false)}
          data-testid="event-offer-modal">
          <div className="w-full max-w-md overflow-hidden rounded-2xl"
            style={{ background: '#171310', border: '1px solid rgba(212,175,55,0.35)', maxHeight: '88vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5"
              style={{ borderBottom: '1px solid rgba(212,175,55,0.18)' }}>
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: 'rgba(255,248,220,0.55)' }}>
                  {(offer && offer.event_name) || 'Event'}
                </div>
                <div className="mt-1 font-display text-lg" style={{ color: '#FFF8DC' }}>{template.name}</div>
              </div>
              <button onClick={() => setOfferOpen(false)} aria-label="Close" style={{ color: '#FFF8DC' }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {!offer ? (
              <p className="p-8 text-center text-sm" style={{ color: 'rgba(255,248,220,0.6)' }}>Loading price…</p>
            ) : (
              <div className="px-5 py-5">
                {offer.design_price_inr > 0 ? (
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-3xl" style={{ color: '#D4AF37' }}>{inr(offer.design_price_inr)}</span>
                    <span className="text-xs" style={{ color: 'rgba(255,248,220,0.6)' }}>for this design, plus your plan</span>
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: 'rgba(255,248,220,0.75)' }}>
                    This design is included — you only pay for the plan you choose.
                  </div>
                )}

                <div className="mt-5 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: 'rgba(255,248,220,0.55)' }}>Plans</div>
                  {(offer.plans || []).map((p) => (
                    <div key={p.key} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
                      style={{ background: 'rgba(212,175,55,0.08)', border: `1px solid ${p.featured ? '#D4AF37' : 'rgba(212,175,55,0.2)'}` }}
                      data-testid={`event-offer-plan-${p.key}`}>
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#FFF8DC' }}>
                          {p.name}
                          {p.featured && (
                            <span className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: '#D4AF37', color: '#241A12' }}>POPULAR</span>
                          )}
                        </div>
                        {p.tagline && <div className="text-[11px]" style={{ color: 'rgba(255,248,220,0.6)' }}>{p.tagline}</div>}
                      </div>
                      <div className="shrink-0 font-display text-sm" style={{ color: '#D4AF37' }}>
                        {inr((offer.design_price_inr || 0) + p.price)}
                      </div>
                    </div>
                  ))}
                  {(offer.plans || []).length === 0 && (
                    <p className="text-sm" style={{ color: 'rgba(255,248,220,0.6)' }}>Pricing is being updated — please try again shortly.</p>
                  )}
                </div>

                <button
                  onClick={() => navigate(`/create/ganesh?design=${encodeURIComponent(template.template_id)}`)}
                  className="mt-5 w-full rounded-md px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.25em]"
                  style={{ color: '#241A12', background: '#D4AF37' }}
                  data-testid="event-offer-continue">
                  <ShoppingBag className="mr-2 inline h-4 w-4" /> Choose a plan & create
                </button>
                <p className="mt-2 text-center text-[10px]" style={{ color: 'rgba(255,248,220,0.5)' }}>
                  Secure checkout · prices set by MAJA Invites
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
