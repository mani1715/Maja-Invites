import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Home, Clock, Images, Layers, Search } from 'lucide-react';
import PublicChrome from '@/components/PublicChrome';
import { BROWSE_ROOTS, resolveBrowsePath } from '@/data/browseTree';
import { getDedupedEventDesigns } from '@/themes/allDesigns';
import { EventService } from '@/services/eventApi';

/* ──────────────────────────────────────────────────────────────────────────
   CategoryBrowser — one page drives the whole /browse/* drill-down.
     • node with children     → render its children as category cards
     • node with `gallery`     → load that theme+event's REAL designs and render
                                 them as a searchable gallery grid (single source
                                 of truth = the theme config; nothing duplicated)
     • node with `comingSoon`  → render a professional Coming Soon state
   Card click on a design → opens the existing DesignFullPreview by index.
   ────────────────────────────────────────────────────────────────────────── */

/* ── A real-design gallery for one (themeId, event). ─────────────────────── */
function DesignGallery({ themeId, event, style, navigate }) {
  const [designs, setDesigns] = useState(null); // null = loading
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    setDesigns(null);
    getDedupedEventDesigns(themeId, event)
      .then((list) => { if (alive) setDesigns(list || []); })
      .catch(() => { if (alive) setDesigns([]); });
    return () => { alive = false; };
  }, [themeId, event]);

  const filtered = useMemo(() => {
    if (!designs) return [];
    const q = query.trim().toLowerCase();
    if (!q) return designs;
    return designs.filter((d) =>
      (d.title || '').toLowerCase().includes(q) ||
      (d.id || '').toLowerCase().includes(q) ||
      (d.headline || '').toLowerCase().includes(q));
  }, [designs, query]);

  if (designs === null) {
    return <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }} data-testid="gallery-loading">Loading designs…</p>;
  }
  if (designs.length === 0) {
    return <ComingSoon label={`${style || ''} ${event}`.trim()} />;
  }

  return (
    <>
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-full mb-7 w-full max-w-xs"
        style={{ border: '1px solid var(--lux-border)' }}>
        <Search className="w-4 h-4 text-gold" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search designs"
          className="bg-transparent outline-none text-sm w-full" style={{ color: 'var(--lux-text)' }} data-testid="gallery-search" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5" data-testid="design-gallery">
        {filtered.map((d, i) => {
          // original index in the FULL event list (preview route opens by index)
          const idx = (typeof d._eventIndex === 'number') ? d._eventIndex : designs.indexOf(d);
          return (
            <button
              key={d.id || i}
              onClick={() => navigate(`/themes/${themeId}/events/${event}/design/${idx}`)}
              className="lux-glass text-left overflow-hidden transition-transform"
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-4px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              data-testid={`design-card-${d.id || idx}`}
            >
              <div className="relative w-full" style={{ aspectRatio: '4 / 5', background: 'var(--lux-panel)' }}>
                {d.image && (
                  <img src={d.image} alt={d.title || ''} loading="lazy" decoding="async"
                    className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-3.5">
                <h3 className="font-heading text-sm md:text-base" style={{ color: 'var(--lux-text)' }}>{d.title || d.id}</h3>
                <p className="text-[11px] mt-1 capitalize" style={{ color: 'var(--lux-text-faint)' }}>
                  {style ? `${style} · ` : ''}{event}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="text-sm mt-4" style={{ color: 'var(--lux-text-muted)' }}>No designs match “{query}”.</p>
      )}
    </>
  );
}

/* ── A live gallery for a Dynamic Event Engine event type (e.g. Ganesh). ───
   Loads the approved templates from /api/events/templates/<eventType> (the single
   source of truth in event_templates.py) and renders them as cards. Clicking a card
   opens the full scrollable invitation preview (/events/preview/:type/:template) — the
   event twin of the wedding design preview. No artwork is duplicated here. */
function EventTemplateGallery({ eventType, label, navigate }) {
  const [templates, setTemplates] = useState(null); // null = loading
  const [error, setError] = useState(false);
  const [prices, setPrices] = useState(null);       // owner-set "from" price

  useEffect(() => {
    let alive = true;
    EventService.eventPricing(eventType)
      .then((p) => { if (alive) setPrices(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [eventType]);

  useEffect(() => {
    let alive = true;
    setTemplates(null); setError(false);
    EventService.templates(eventType)
      .then((res) => { if (alive) setTemplates(res?.templates || []); })
      .catch(() => { if (alive) { setTemplates([]); setError(true); } });
    return () => { alive = false; };
  }, [eventType]);

  if (templates === null) {
    return <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }} data-testid="event-gallery-loading">Loading designs…</p>;
  }
  if (error || templates.length === 0) {
    return <ComingSoon label={label} />;
  }

  const fromPrice = prices && prices.from_price_inr != null ? prices.from_price_inr : null;

  return (
    <>
      {fromPrice != null && (
        <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }} data-testid="event-gallery-from-price">
          Invitations from <span className="text-gold">₹{Number(fromPrice).toLocaleString('en-IN')}</span> · tap a design to open the full preview
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5" data-testid="event-template-gallery">
        {templates.map((t) => (
          <button
            key={t.template_id}
            onClick={() => navigate(`/events/preview/${eventType}/${t.template_id}`)}
            className="lux-glass text-left overflow-hidden transition-transform"
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-4px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            data-testid={`event-template-${t.template_id}`}
          >
            <div className="relative w-full" style={{ aspectRatio: '941 / 1672', background: 'var(--lux-panel)' }}>
              {t.thumbnail_url && (
                <img src={t.thumbnail_url} alt={t.name || ''} loading="lazy" decoding="async"
                  className="w-full h-full object-cover" />
              )}
            </div>
            <div className="p-3.5">
              <h3 className="font-heading text-sm md:text-base" style={{ color: 'var(--lux-text)' }}>{t.name || t.template_id}</h3>
              {t.palette && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--lux-text-faint)' }}>{t.palette}</p>
              )}
            </div>
          </button>
        ))}
      </div>

    </>
  );
}

/* ── Professional Coming Soon state (categories with no designs yet). ────── */
function ComingSoon({ label }) {
  return (
    <div className="lux-glass p-12 md:p-16 text-center" data-testid="coming-soon">
      <div className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-5"
        style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(139,0,0,0.18))', border: '1px solid var(--lux-border-strong)' }}>
        <Clock className="w-6 h-6" style={{ color: '#D4AF37' }} />
      </div>
      <h2 className="font-display text-2xl md:text-3xl mb-2" style={{ color: 'var(--lux-text)' }}>Coming Soon</h2>
      <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--lux-text-muted)' }}>
        {label ? <><span className="text-gold">{label}</span> designs are being hand-crafted. </> : ''}
        Check back shortly — new collections are added regularly.
      </p>
    </div>
  );
}

export default function CategoryBrowser() {
  const navigate = useNavigate();
  const params = useParams();
  const splat = params['*'] || '';
  const segments = splat.split('/').filter(Boolean);

  const resolved = segments.length ? resolveBrowsePath(segments) : { node: null, trail: [] };

  if (segments.length && !resolved) {
    return (
      <PublicChrome title="Browse — MAJA Invitations">
        <div className="min-h-[60vh] grid place-items-center px-6 text-center">
          <div>
            <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--lux-text)' }}>Category not found.</h2>
            <Link to="/browse" className="lux-btn lux-btn-ghost no-underline">Back to all categories</Link>
          </div>
        </div>
      </PublicChrome>
    );
  }

  const node = resolved.node;
  const trail = resolved.trail;
  const isGalleryNode = !!(node && node.gallery);
  const isEventGalleryNode = !!(node && node.eventTemplates);
  const isSoonNode = !!(node && node.comingSoon);
  const children = node ? (node.children || []) : BROWSE_ROOTS;
  const title = node ? node.label : 'Invitation Categories';
  const subtitle = isGalleryNode
    ? `${node.style ? node.style + ' · ' : ''}${node.label} designs.`
    : isEventGalleryNode
      ? `${node.label} invitation designs.`
      : isSoonNode
        ? 'This collection is on the way.'
        : node
          ? `Choose from ${node.label}.`
          : 'Pick an occasion to begin. Each opens into styles, events and designs.';

  const goTo = (child) => {
    if ((child.children && child.children.length) || child.gallery || child.comingSoon || child.eventTemplates) {
      // categories, galleries and coming-soon all get their own URL
      navigate(`/browse/${[...segments, child.slug].join('/')}`);
    } else if (child.design) {
      const { themeId, event, index } = child.design;
      navigate(`/themes/${themeId}/events/${event}/design/${index}`);
    }
  };

  const parentPath = segments.length > 1 ? `/browse/${segments.slice(0, -1).join('/')}` : '/browse';

  return (
    <PublicChrome
      title={`${title} — MAJA Invitations`}
      description="Browse MAJA wedding & event invitations by occasion, style, event and design."
    >
      <section className="relative px-6 md:px-16 py-12 md:py-16 z-10">
        {/* Breadcrumb */}
        <nav className="flex items-center flex-wrap gap-1.5 text-[11px] tracking-[0.18em] uppercase mb-6"
          style={{ color: 'var(--lux-text-muted)' }} data-testid="browse-breadcrumb">
          <Link to="/" className="inline-flex items-center gap-1 hover:text-[var(--lux-gold)] no-underline" style={{ color: 'inherit' }}>
            <Home className="w-3.5 h-3.5" /> Home
          </Link>
          <ChevronRight className="w-3 h-3 opacity-50" />
          <Link to="/browse" className="hover:text-[var(--lux-gold)] no-underline" style={{ color: 'inherit' }}>Categories</Link>
          {trail.map((n, i) => {
            const to = `/browse/${segments.slice(0, i + 1).join('/')}`;
            const last = i === trail.length - 1;
            return (
              <React.Fragment key={n.slug}>
                <ChevronRight className="w-3 h-3 opacity-50" />
                {last ? (
                  <span style={{ color: 'var(--lux-gold)' }}>{n.label}</span>
                ) : (
                  <Link to={to} className="hover:text-[var(--lux-gold)] no-underline" style={{ color: 'inherit' }}>{n.label}</Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Header + back */}
        <div className="flex items-end justify-between flex-wrap gap-4 mb-9">
          <div>
            <h1 className="font-display tracking-wide" style={{ color: 'var(--lux-text)', fontSize: 'clamp(1.9rem, 4vw, 3rem)' }}>{title}</h1>
            <p className="text-sm mt-2 max-w-xl" style={{ color: 'var(--lux-text-muted)' }}>{subtitle}</p>
          </div>
          {segments.length > 0 && (
            <button
              onClick={() => navigate(parentPath)}
              className="inline-flex items-center gap-2 text-[11px] tracking-[0.25em] uppercase px-4 py-2.5 rounded-md"
              style={{ color: 'var(--lux-text)', background: 'rgba(212,175,55,0.12)', border: '1px solid var(--lux-border-strong)' }}
              data-testid="browse-back"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
        </div>

        {/* Body: gallery | coming-soon | category cards */}
        {isGalleryNode ? (
          <DesignGallery themeId={node.gallery.themeId} event={node.gallery.event} style={node.style} navigate={navigate} />
        ) : isEventGalleryNode ? (
          <EventTemplateGallery eventType={node.eventTemplates} label={node.label} navigate={navigate} />
        ) : isSoonNode ? (
          <ComingSoon label={node.label} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5" data-testid="browse-grid">
            {children.map((child) => {
              const isCat = !!(child.children && child.children.length);
              const isGallery = !!child.gallery || !!child.eventTemplates;
              const isDesign = !!child.design;
              const isSoon = !!child.comingSoon;
              const count = isCat ? child.children.length : 0;
              const badge = isSoon ? 'Soon' : isGallery ? 'Gallery' : isDesign ? 'Design' : `${count}`;
              const sub = isSoon ? 'Coming soon' : isGallery ? 'View designs' : isDesign ? 'Open invitation' : `${count} ${count === 1 ? 'option' : 'options'}`;
              return (
                <button
                  key={child.slug}
                  onClick={() => !isSoon && goTo(child)}
                  disabled={isSoon}
                  className="lux-glass p-5 md:p-6 text-left relative overflow-hidden transition-transform"
                  style={{ cursor: isSoon ? 'not-allowed' : 'pointer', opacity: isSoon ? 0.55 : 1, minHeight: 132 }}
                  onMouseEnter={(e) => { if (!isSoon) e.currentTarget.style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                  data-testid={`browse-card-${child.slug}`}
                >
                  <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] tracking-wider uppercase"
                    style={{
                      color: isSoon ? '#16110C' : '#0F1A06',
                      background: isSoon
                        ? 'rgba(255,248,220,0.45)'
                        : (isGallery || isDesign)
                          ? 'linear-gradient(135deg, rgba(212,175,55,0.95), rgba(180,140,40,0.9))'
                          : 'linear-gradient(135deg, rgba(138,154,91,0.9), rgba(100,120,70,0.9))',
                      fontWeight: 700,
                    }}>
                    {isSoon ? <Clock className="w-2.5 h-2.5" /> : (isGallery || isDesign) ? <Images className="w-2.5 h-2.5" /> : <Layers className="w-2.5 h-2.5" />}
                    {badge}
                  </div>

                  <div className="w-10 h-10 rounded-xl grid place-items-center mb-4"
                    style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(139,0,0,0.18))', border: '1px solid var(--lux-border-strong)' }}>
                    {(isGallery || isDesign) ? <Images className="w-5 h-5" style={{ color: '#D4AF37' }} /> : <Layers className="w-5 h-5" style={{ color: '#D4AF37' }} />}
                  </div>

                  <h3 className="font-heading text-base md:text-lg pr-12" style={{ color: 'var(--lux-text)' }}>{child.label}</h3>
                  <p className="text-[12px] mt-1.5" style={{ color: 'var(--lux-text-muted)' }}>{sub}</p>

                  {!isSoon && <ChevronRight className="w-4 h-4 absolute bottom-4 right-4" style={{ color: 'rgba(212,175,55,0.7)' }} />}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </PublicChrome>
  );
}
