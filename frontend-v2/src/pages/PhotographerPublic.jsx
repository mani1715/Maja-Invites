import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as publicPortfolio from '@/api/publicPortfolio';
import StudioShowcase from '@/components/community/StudioShowcase';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { resolveDesign } from '@/lib/portfolioDesigns';
import './PhotographerPublic.css';

// Ported from frontend/src/pages/PublicPhotographerProfile.jsx (legacy) against
// GET /api/public/photographer/{slug}/portfolio (backend/portfolio_service.py —
// {slug} resolves an id OR a pretty slug). Curl-verified against localhost:8001.
//
// Scope cut vs legacy (owner's call, see LANE brief): no work-viewer modal (plain
// grid), no by-category regrouping, no 3D scroll motion, no account-gate, no
// enquiry-form lead capture — this route is read-only discovery + contact CTA.
//
// Design tokens for all TEN portfolioDesigns come from lib/portfolioDesigns.js
// (the single source of truth also used by StudioPortfolio.jsx and
// PortfolioSamples.jsx) via resolveDesign(). This page used to hand-maintain a
// second copy of the same ten token maps; that copy has been retired in favor
// of the import. Signature background motifs (grain/aurora/filmstrip/…) are
// still not ported here — those are decoration on top of these tokens, and the
// lib's `signature` field is unused by this page's renderer.
//
// `premium_editorial` used to be missing here on the grounds that its full
// layout engine was out of scope. The fallback then quietly rendered it as
// `premium_gallery_wall`: a premium studio could pick "Premium Editorial" in
// the picker, get a success response from POST /api/portfolio/design, and have
// its public page painted in a different design's palette with no error
// anywhere. Ten designs are sold and the picker presents them identically, so
// ten render distinctly. Its tokens below are the ones the design already
// declares — sand/copper with a Cormorant display face — not invented here.
//
// The asymmetric-grid LAYOUT remains unbuilt; the design's description no
// longer promises it.
//
// One field disagrees between this page's former hand-copy and the lib: the
// lib's premium_editorial declares body: "'Helvetica Neue',Helvetica,Arial,
// sans-serif" (no Inter), but this page has always rendered that design with
// Inter first. Overriding only that field here preserves exact current
// rendering instead of silently switching to the lib's value — flagged for
// the design owner to reconcile; see task report.
function resolveTokens(designId, tier) {
  const d = resolveDesign(designId, tier);
  if (d.id === 'premium_editorial') {
    return { ...d, body: "'Inter','Helvetica Neue',Arial,sans-serif" };
  }
  return d;
}

function workPoster(w) {
  return resolveMediaUrl(w?.thumbnail_url || w?.image_url || '');
}

export default function PhotographerPublic() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading', data: null });
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null });
    publicPortfolio.portfolio(slug)
      .then(({ data }) => { if (!cancelled) setState({ status: 'ready', data }); })
      .catch((e) => { if (!cancelled) setState({ status: e?.response?.status === 404 ? 'notfound' : 'error', data: null }); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const studioName = state.data?.studio?.name;
    if (!studioName) return undefined;
    const prevTitle = document.title;
    const brand = state.data?.white_label?.entitled
      ? (state.data.white_label.brand_name || null) : null;
    document.title = brand
      ? `${studioName} — Wedding Photography Portfolio · ${brand}`
      : `${studioName} — Wedding Photography Portfolio · MAJA`;
    return () => { document.title = prevTitle; };
  }, [state.data]);

  if (state.status === 'loading') {
    return <div className="mjpf-loading">Loading portfolio…</div>;
  }
  if (state.status === 'notfound') {
    return (
      <div className="mjpf-notfound">
        <h1>Photographer not found</h1>
        <p>This portfolio link may be out of date, or the studio hasn&rsquo;t published a portfolio yet.</p>
        <Link to="/photographers">Browse the directory</Link>
      </div>
    );
  }
  if (state.status === 'error' || !state.data) {
    return (
      <div className="mjpf-notfound">
        <h1>Couldn&rsquo;t load this portfolio</h1>
        <p>Please try again in a moment.</p>
      </div>
    );
  }

  const { studio, profile, works, testimonials, rating, review_count, tier, sections, design_id } = state.data;
  // The portfolio response already carries white_label — the page just never
  // destructured it, so a studio entitled to their own branding still got
  // MAJA's. Read it here rather than calling /api/public/studio/{id}/
  // white-label separately, which would be a second request for data already
  // in hand. `entitled` is the server's decision; when it is false the studio's
  // plan does not include branding and the stored values must be ignored.
  const wl = (state.data.white_label && state.data.white_label.entitled)
    ? state.data.white_label : null;
  const has = (s) => (sections || []).includes(s);
  const T = resolveTokens(design_id, tier);
  const loc = profile?.location || {};
  const social = profile?.social || {};
  const contact = profile?.contact || {};
  const styles = profile?.styles || [];
  const services = profile?.services || [];
  const faqs = (profile?.faqs || []).filter((f) => f?.q);
  const gallery = (works && works.length ? works : state.data.featured || []).slice(0, 24);

  const pageStyle = {
    '--pf-bg': T.bg, '--pf-surface': T.surface, '--pf-ink': T.ink, '--pf-ink-soft': T.inkSoft,
    '--pf-line': T.line, '--pf-accent': T.accent, '--pf-accent-ink': T.accentInk,
    '--pf-heading': T.heading, '--pf-body': T.body,
  };

  return (
    <div className={`mjpf-page ${T.dark ? 'is-dark' : 'is-light'}`} style={pageStyle}>
      <div className="mjpf-hero">
        {profile?.hero_image
          ? <img className="mjpf-hero-img" src={resolveMediaUrl(profile.hero_image)} alt="" />
          : <div className="mjpf-hero-fallback" />}
        <div className="mjpf-hero-fade" />
      </div>

      <div className="mjpf-shell">
        <div className="mjpf-identity">
          <div className="mjpf-avatar">
            {profile?.avatar ? <img src={resolveMediaUrl(profile.avatar)} alt="" /> : <span>{(studio?.name || '?').charAt(0)}</span>}
          </div>
          <div className="mjpf-identity-text">
            <span className="mjpf-tier-badge">{tier === 'premium' ? 'Premium studio' : tier === 'basic' ? 'Verified listing' : 'Photographer'}</span>
            <h1>{studio?.name}</h1>
            {profile?.tagline && <p className="mjpf-tagline">{profile.tagline}</p>}
            <div className="mjpf-facts">
              {(loc.city || loc.state) && <span>{[loc.city, loc.state].filter(Boolean).join(', ')}</span>}
              {profile?.experience_years ? <span>{profile.experience_years}+ yrs experience</span> : null}
              {typeof rating === 'number' && <span>★ {rating} ({review_count})</span>}
            </div>
          </div>
        </div>

        {design_id === 'premium_editorial' && (
          <p className="mjpf-editorial-note">
            This studio&rsquo;s chosen editorial layout isn&rsquo;t available on this viewer yet — showing MAJA&rsquo;s default premium theme instead.
          </p>
        )}

        {profile?.cover_description && <p className="mjpf-cover">{profile.cover_description}</p>}

        {has('about') && (profile?.about || profile?.journey) && (
          <section className="mjpf-section">
            {profile?.about && (<><h2>About</h2><p>{profile.about}</p></>)}
            {profile?.journey && (<><h2>Our Journey</h2><p>{profile.journey}</p></>)}
          </section>
        )}

        {(services.length > 0 || styles.length > 0) && (
          <section className="mjpf-section">
            {services.length > 0 && (
              <>
                <h2>Services</h2>
                <div className="mjpf-chips">{services.map((s) => <span key={s}>{s}</span>)}</div>
              </>
            )}
            {styles.length > 0 && (
              <>
                <h2>Style</h2>
                <div className="mjpf-chips mjpf-chips-accent">{styles.map((s) => <span key={s}>{s}</span>)}</div>
              </>
            )}
          </section>
        )}

        {has('featured_work') && gallery.length > 0 && (
          <section className="mjpf-section">
            <h2>Works</h2>
            <div className="mjpf-gallery">
              {gallery.map((w, i) => {
                const poster = workPoster(w);
                return (
                  <figure key={w.id || i} className="mjpf-gallery-item">
                    {poster ? <img src={poster} alt={w.title || ''} loading="lazy" /> : <div className="mjpf-gallery-empty" />}
                    {w.title && <figcaption>{w.title}</figcaption>}
                  </figure>
                );
              })}
            </div>
          </section>
        )}

        {has('testimonials') && (testimonials || []).length > 0 && (
          <section className="mjpf-section">
            <h2>What Clients Say</h2>
            <div className="mjpf-testimonials">
              {testimonials.map((t) => (
                <div key={t.id} className="mjpf-testimonial">
                  {typeof t.rating === 'number' && <span className="mjpf-stars">{'★'.repeat(Math.round(t.rating))}{'☆'.repeat(5 - Math.round(t.rating))}</span>}
                  <p>&ldquo;{t.text}&rdquo;</p>
                  <span className="mjpf-testimonial-author">— {t.author}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {faqs.length > 0 && (
          <section className="mjpf-section">
            <h2>Frequently Asked Questions</h2>
            <div className="mjpf-faqs">
              {faqs.map((f, i) => (
                <div key={i} className="mjpf-faq-item">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                    <span>{f.q}</span>
                    <span className="mjpf-faq-icon">{openFaq === i ? '−' : '+'}</span>
                  </button>
                  {openFaq === i && f.a && <p className="mjpf-faq-answer">{f.a}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {has('contact') && (
          <section className="mjpf-section mjpf-contact">
            <h2>Get In Touch</h2>
            <div className="mjpf-contact-links">
              {contact.phone && <a href={`tel:${contact.phone}`}>Call {contact.phone}</a>}
              {social.whatsapp && <a href={social.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>}
              {contact.email && <a href={`mailto:${contact.email}`}>Email</a>}
              {social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer">Instagram</a>}
              {social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer">Facebook</a>}
              {social.website && <a href={social.website} target="_blank" rel="noreferrer">Website</a>}
              {!contact.phone && !social.whatsapp && !contact.email && (
                <span className="mjpf-contact-none">This studio hasn&rsquo;t added contact details yet.</span>
              )}
            </div>
          </section>
        )}

        {/* Highlights + packages. Renders nothing when the studio has neither,
            so a portfolio never shows an empty "Packages" heading. */}
        <StudioShowcase studioId={studio?.id} />

        <div className="mjpf-footer">
          <Link to="/photographers">← Browse all photographers</Link>
          {/* hide_maja_branding is only honoured when the plan entitles it —
              `wl` is already null otherwise. */}
          {wl?.hide_maja_branding
            ? (wl.brand_name ? <span>{wl.brand_name}</span> : null)
            : <span>Powered by MAJA Invites</span>}
        </div>
      </div>
    </div>
  );
}
