// premiumEditorial — the "MAJA Premium" portfolio design, as real React.
//
// Source of truth: design/claude-design/MAJA Premium.dc.html (Claude Design
// project "MAJA Wedding Design Tiers"). That file uses the dc-runtime's
// template language — `<sc-for>`, `<sc-if>`, `{{ }}` bindings, and the
// `style-hover` / `style-focus` / `style-after` pseudo-attributes, none of
// which exist in real HTML. They are translated here rather than shipping the
// 70 KB runtime that interprets them.
//
// WHY THIS IS A "LAYOUT", NOT A DESIGN TOKEN SET
// ----------------------------------------------
// The other nine portfolio designs are token sets (bg / ink / accent / heading
// …) painted by one shared renderer in PublicPhotographerProfile. This design
// cannot be expressed that way: the layout IS the design — an editorial
// 12-column asymmetric grid, a stories rail, films, vertical reels, a
// collections table, an availability calendar and an enquiry form. So it
// registers as a `layout` and takes over the page body.
//
// HONESTY (CLAUDE.md "no fake hyping")
// ------------------------------------
// The source design is populated with invented content — "320+ weddings",
// "12 years", award recognitions, five-star reviews. Rendering any of that on
// a real photographer's page would be lying to their prospective clients, and
// is the same mistake that got DEFAULT_WORKS/DEFAULT_TESTIMONIALS deleted from
// portfolio_service.py.
//
// So every block here is conditional on real data existing. The demo content is
// reachable only through `demoFallback`, which returns undefined unless the
// profile is flagged `is_demo`. A real studio with no testimonials renders no
// testimonials section — not someone else's.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEMO_AVAILABILITY, DEMO_CONTACT, DEMO_FILMS, DEMO_PACKAGES, DEMO_PROJECTS,
  DEMO_RECOGNITION, DEMO_REELS, DEMO_SOCIAL, DEMO_STATS, DEMO_TESTIMONIALS,
  demoFallback,
} from '@/data/portfolioDemoContent';
import { resolveMediaUrl } from '@/utils/mediaUrl';

const INK = '#171410';
const PAPER = '#F4F1EA';
const PAPER_2 = '#EAE5DA';
const MUTED = '#4A443B';
const FAINT = '#8A8175';
const BRONZE = '#9A6A45';
const GOLD = '#D8B48A';

const SERIF = "'Cormorant Garamond',Georgia,serif";
const MONO = 'ui-monospace,Menlo,monospace';

// The dc-runtime's style-hover/style-focus have no HTML equivalent, so the
// interactive states live in one scoped stylesheet instead of inline.
const CSS = `
.pe-root{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;overflow-x:hidden;background:${PAPER};color:${INK}}
.pe-root a{color:${INK};text-decoration:none}
.pe-root a:hover{color:${BRONZE}}
.pe-root :focus-visible{outline:2px solid ${BRONZE};outline-offset:4px}
.pe-root input,.pe-root textarea,.pe-root button{font:inherit;color:inherit}
@keyframes pe-ken{from{transform:scale(1.06)}to{transform:scale(1.16)}}
@keyframes pe-line{from{transform:translateY(108%)}to{transform:translateY(0)}}
.pe-zoom{transition:transform 1.3s cubic-bezier(.16,.84,.28,1)}
.pe-veil{opacity:0;transition:opacity .6s ease}
.pe-slide{transform:translateY(112%);transition:transform .7s cubic-bezier(.16,.84,.28,1)}
.pe-arrow span{display:inline-block;transition:transform .45s cubic-bezier(.2,.7,.2,1)}
@media (hover:hover){
  .pe-card:hover .pe-zoom{transform:scale(1.06)}
  .pe-card:hover .pe-veil{opacity:1}
  .pe-card:hover .pe-slide{transform:translateY(0)}
  .pe-arrow:hover span{transform:translateX(7px)}
  .pe-cta:hover{background:${INK};color:${PAPER}}
  .pe-navlink:hover::after{transform:scaleX(1)}
  .pe-tile:hover{background:${PAPER_2}}
  .pe-month:hover{background:#221D17}
  .pe-story:hover{transform:translateY(-6px);box-shadow:0 30px 70px -34px rgba(23,20,16,.55)}
}
.pe-navlink{position:relative}
.pe-navlink::after{content:'';position:absolute;left:0;bottom:0;width:100%;height:1px;background:${BRONZE};transform:scaleX(0);transform-origin:left;transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.pe-field:focus{border-color:${BRONZE};outline:none}
.pe-reveal{opacity:0;transform:translateY(22px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}
.pe-reveal.pe-in{opacity:1;transform:none}
/* The source collapses its 12-col grid to 2 at 820px. Without this the
   asymmetric spans (7/5, 4/8) produce slivers on a phone. */
@media (max-width:820px){.pe-grid12{grid-template-columns:repeat(2,1fr) !important}.pe-grid12>*{grid-column:span 2 !important;align-self:auto !important}}
@media (max-width:760px){.pe-navlinks{display:none !important}.pe-mobilebar{display:grid !important}.pe-root{padding-bottom:66px}}
@media (prefers-reduced-motion:reduce){
  .pe-root *{animation-duration:.001ms !important;transition-duration:.001ms !important}
  .pe-reveal{opacity:1;transform:none}
  .pe-ken{animation:none !important}
}
`;

const HATCH_DARK = 'repeating-linear-gradient(135deg,rgba(23,20,16,.05) 0 10px,transparent 10px 20px)';
const HATCH_LIGHT = 'repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 10px,transparent 10px 20px)';

/** Scroll reveal. The source ran an IntersectionObserver with a 4s failsafe that
 *  force-shows everything — keep the failsafe: an observer that never fires
 *  (odd browser, zero-height container) would otherwise leave the whole page
 *  invisible, which is worse than no animation. */
function useReveal() {
  const root = useRef(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return undefined;
    const els = Array.from(host.querySelectorAll('.pe-reveal'));
    if (!els.length) return undefined;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.add('pe-in'));
      return undefined;
    }
    let io;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('pe-in');
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      els.forEach((el) => io.observe(el));
    }
    const failsafe = setTimeout(() => els.forEach((el) => el.classList.add('pe-in')), 4000);
    return () => { if (io) io.disconnect(); clearTimeout(failsafe); };
  }, []);
  return root;
}

/** A media tile. Falls back to the design's hatch placeholder when there is no
 *  real image — which is what a brand-new studio with an empty gallery sees. */
function Tile({ src, alt, ratio, slot, dark, children }) {
  const url = src ? resolveMediaUrl(src) : '';
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: dark ? '#241F19' : '#E5DED2', aspectRatio: ratio }}>
      {url ? (
        <img
          className="pe-zoom" src={url} alt={alt || ''} loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div className="pe-zoom" style={{ position: 'absolute', inset: 0, background: dark ? HATCH_LIGHT : HATCH_DARK }} />
      )}
      {slot && !url && (
        <span style={{ position: 'absolute', left: 14, bottom: 12, fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: FAINT }}>{slot}</span>
      )}
      {children}
    </div>
  );
}

const SPANS = [
  { span: 7, r: '3/2', align: 'start', slot: 'Baraat, wide' },
  { span: 5, r: '4/5', align: 'end', slot: 'Bride portrait, 4:5' },
  { span: 4, r: '4/5', align: 'start', slot: 'Mehendi detail, hands' },
  { span: 8, r: '16/9', align: 'end', slot: 'Sangeet, candid' },
  { span: 6, r: '1/1', align: 'start', slot: 'Muhurtham, close' },
  { span: 6, r: '1/1', align: 'start', slot: 'Vidaai, reportage' },
  { span: 12, r: '21/9', align: 'start', slot: 'Reception, panoramic' },
];

export default function PremiumEditorial({ profile = {}, works = [], testimonials = [], onEnquire }) {
  const rootRef = useReveal();
  const [year, setYear] = useState(Object.keys(DEMO_AVAILABILITY)[0] || 2026);
  const [form, setForm] = useState({});
  const [state, setState] = useState({ sending: false, sent: false, error: '' });

  const studioName = profile.studio_name || profile.name || 'Studio';
  const short = (studioName || '').toUpperCase();

  // Real data first, demo only for is_demo. `?? undefined` matters: an empty
  // real array must stay empty, not fall through to invented content.
  const demoWorks = demoFallback(profile, DEMO_PROJECTS);
  const quotes = testimonials.length ? testimonials.map((t) => ({
    t: t.text || t.body || t.quote, by: t.author || t.name, meta: t.meta || '',
  })) : (demoFallback(profile, DEMO_TESTIMONIALS) || []);
  const films = demoFallback(profile, DEMO_FILMS) || (profile.films || []);
  const reels = demoFallback(profile, DEMO_REELS) || (profile.reels || []);
  const packages = demoFallback(profile, DEMO_PACKAGES) || (profile.packages || []);
  const recognition = demoFallback(profile, DEMO_RECOGNITION) || (profile.awards || []);
  const stats = demoFallback(profile, DEMO_STATS) || [];
  const contact = demoFallback(profile, DEMO_CONTACT) || (profile.contact || {});
  const socials = demoFallback(profile, DEMO_SOCIAL) || (profile.social || []);
  const availability = demoFallback(profile, DEMO_AVAILABILITY) || null;

  const gallery = useMemo(() => SPANS.map((g, i) => {
    const w = works[i];
    return {
      ...g,
      no: String(i + 1).padStart(2, '0'),
      src: w ? (w.image_url || w.url) : '',
      cap: w ? (w.title || '') : '',
    };
  }), [works]);

  const stories = useMemo(() => {
    if (demoWorks) return demoWorks;
    return (profile.stories || []).slice(0, 3);
  }, [demoWorks, profile.stories]);

  const nav = [
    { label: 'Work', href: '#work' },
    stories.length && { label: 'Stories', href: '#stories' },
    films.length && { label: 'Films', href: '#films' },
    reels.length && { label: 'Reels', href: '#reels' },
    packages.length && { label: 'Collections', href: '#services' },
    availability && { label: 'Availability', href: '#availability' },
  ].filter(Boolean);

  const submit = (e) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      setState({ sending: false, sent: false, error: 'Please add your name and email so the studio can reply.' });
      return;
    }
    setState({ sending: true, sent: false, error: '' });
    Promise.resolve(onEnquire ? onEnquire(form) : null)
      .then(() => setState({ sending: false, sent: true, error: '' }))
      .catch(() => setState({ sending: false, sent: false, error: 'Could not send just now — please try again.' }));
  };

  const field = (label, key, type, ph) => (
    <label key={key} style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: FAINT }}>{label}</span>
      <input
        className="pe-field" type={type} placeholder={ph} value={form[key] || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        style={{ background: 'transparent', border: 0, borderBottom: '1px solid rgba(23,20,16,.28)', padding: '12px 0', minHeight: 48, fontSize: 16 }}
      />
    </label>
  );

  const H2 = { margin: 0, fontFamily: SERIF, fontSize: 'clamp(30px,4vw,54px)', fontWeight: 300 };
  const WRAP = { maxWidth: 1560, margin: '0 auto', padding: 'clamp(64px,9vw,130px) clamp(20px,4vw,56px)' };
  const EYEBROW = { fontSize: 10, letterSpacing: '.26em', textTransform: 'uppercase', color: FAINT };

  return (
    <div className="pe-root" ref={rootRef}>
      <style>{CSS}</style>

      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60 }}>
        <div style={{ background: 'rgba(244,241,234,.9)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(23,20,16,.08)' }}>
          <div style={{ maxWidth: 1560, margin: '0 auto', padding: '16px clamp(20px,4vw,56px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <a href="#top" style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: '.22em', fontWeight: 400 }}>{short}</a>
            <nav aria-label="Primary" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px,2.4vw,34px)', flexWrap: 'wrap' }}>
              <div className="pe-navlinks" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px,2.4vw,34px)', flexWrap: 'wrap' }}>
                {nav.map((n) => (
                  <a key={n.href} href={n.href} className="pe-navlink" style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: MUTED, padding: '6px 0' }}>{n.label}</a>
                ))}
              </div>
              <a href="#enquire" className="pe-arrow pe-cta" style={{ padding: '12px 22px', border: `1px solid ${INK}`, fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 10, transition: 'background .4s,color .4s' }}>Enquire <span>→</span></a>
            </nav>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero. Type clamps on min(vw,vh) in the source for a reason: a
            width-only clamp gives a landscape phone a 116px headline in a
            390px-tall window and the hero overflows the screen. */}
        <section style={{ position: 'relative', minHeight: '92vh', display: 'grid', placeItems: 'center', padding: '120px clamp(20px,4vw,56px) 60px', background: INK, color: PAPER, overflow: 'hidden' }}>
          {profile.hero_image ? (
            <img src={resolveMediaUrl(profile.hero_image)} alt="" fetchpriority="high"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .55 }} />
          ) : (
            <div className="pe-ken" style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(120deg,rgba(255,255,255,.045) 0 10px,transparent 10px 22px)', animation: 'pe-ken 26s ease-in-out infinite alternate', willChange: 'transform' }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 30%,transparent 25%,rgba(0,0,0,.55) 100%)' }} />
          <div style={{ position: 'relative', textAlign: 'center', maxWidth: 1100 }}>
            {profile.tagline && (
              <p className="pe-reveal" style={{ margin: '0 0 26px', fontSize: 10, letterSpacing: '.42em', textTransform: 'uppercase', color: 'rgba(244,241,234,.65)' }}>{profile.tagline}</p>
            )}
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 300, fontSize: 'clamp(46px,min(8.2vw,11vh),116px)', lineHeight: .98, letterSpacing: '-.015em' }}>
              <span style={{ display: 'block', overflow: 'hidden' }}>
                <span style={{ display: 'block', animation: 'pe-line 1.1s cubic-bezier(.16,.84,.28,1) .15s both' }}>{studioName}</span>
              </span>
              {profile.cover_description && (
                <span style={{ display: 'block', overflow: 'hidden', paddingBottom: '.06em' }}>
                  <em style={{ display: 'block', fontStyle: 'italic', color: GOLD, animation: 'pe-line 1.1s cubic-bezier(.16,.84,.28,1) .3s both' }}>{profile.cover_description}</em>
                </span>
              )}
            </h1>
            <div className="pe-reveal" style={{ marginTop: 38, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="#work" style={{ padding: '16px 30px', background: PAPER, color: INK, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', minHeight: 50, display: 'inline-flex', alignItems: 'center' }}>Wedding stories</a>
              <a href="#enquire" style={{ padding: '16px 30px', border: '1px solid rgba(244,241,234,.4)', color: PAPER, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', minHeight: 50, display: 'inline-flex', alignItems: 'center' }}>Check open dates</a>
            </div>
          </div>
        </section>

        {(profile.about || stats.length > 0) && (
          <section style={{ ...WRAP, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 'clamp(32px,6vw,90px)', alignItems: 'center' }}>
            {profile.about && (
              <p className="pe-reveal" style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(24px,2.9vw,40px)', lineHeight: 1.32, fontWeight: 300, textWrap: 'pretty' }}>{profile.about}</p>
            )}
            {stats.length > 0 && (
              <div className="pe-reveal">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 24, borderTop: '1px solid rgba(23,20,16,.14)', paddingTop: 24 }}>
                  {stats.map((s) => (
                    <div key={s.l}>
                      <div style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 1, fontWeight: 300 }}>{s.n}</div>
                      <div style={{ marginTop: 8, fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: FAINT }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section id="work" style={{ maxWidth: 1560, margin: '0 auto', padding: '0 clamp(20px,4vw,56px) clamp(64px,9vw,130px)' }}>
          <div className="pe-reveal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24, flexWrap: 'wrap', marginBottom: 48, borderTop: '1px solid rgba(23,20,16,.14)', paddingTop: 22 }}>
            <h2 style={H2}>Signature work</h2>
            <span style={EYEBROW}>Selected frames</span>
          </div>
          <div className="pe-grid12" style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 'clamp(12px,1.6vw,26px)' }}>
            {gallery.map((g) => (
              <figure key={g.no} className="pe-reveal pe-card" style={{ margin: 0, gridColumn: `span ${g.span}`, alignSelf: g.align }}>
                <Tile src={g.src} alt={g.cap} ratio={g.r} slot={g.slot}>
                  <div className="pe-veil" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(23,20,16,.7),rgba(23,20,16,.04))', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 18, overflow: 'hidden' }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', color: 'rgba(244,241,234,.8)' }}>{g.no}</span>
                    <span style={{ overflow: 'hidden' }}>
                      <span className="pe-slide" style={{ display: 'flex', alignItems: 'center', gap: 10, color: PAPER, fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase' }}>View frame <span>→</span></span>
                    </span>
                  </div>
                </Tile>
                <figcaption style={{ paddingTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: FAINT }}>
                  <span>{g.cap}</span><span>{g.no}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {stories.length > 0 && (
          <section id="stories" style={{ background: PAPER_2, borderTop: '1px solid rgba(23,20,16,.1)' }}>
            <div style={WRAP}>
              <h2 className="pe-reveal" style={{ ...H2, marginBottom: 54 }}>Featured wedding stories</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(28px,4vw,56px)' }}>
                {stories.map((s) => (
                  <div key={s.no || s.couple || s.title} className="pe-reveal pe-card pe-arrow pe-story" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 'clamp(20px,3vw,44px)', alignItems: 'center', background: PAPER, padding: 'clamp(16px,2vw,26px)', transition: 'transform .7s cubic-bezier(.2,.7,.2,1),box-shadow .7s' }}>
                    <Tile src={s.image_url} alt={s.couple || s.title} ratio="16/11" slot={s.cover}>
                      <div className="pe-veil" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(23,20,16,.55),transparent 60%)' }} />
                    </Tile>
                    <div style={{ padding: 'clamp(6px,2vw,26px)' }}>
                      <span style={{ fontSize: 10, letterSpacing: '.28em', textTransform: 'uppercase', color: BRONZE }}>
                        {[s.days, s.place, s.date].filter(Boolean).join(' · ')}
                      </span>
                      <h3 style={{ margin: '14px 0 12px', fontFamily: SERIF, fontSize: 'clamp(28px,3.2vw,44px)', fontWeight: 300, lineHeight: 1.1 }}>{s.couple || s.title}</h3>
                      <p style={{ margin: '0 0 22px', color: MUTED, maxWidth: '46ch', textWrap: 'pretty' }}>{s.blurb}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {films.length > 0 && (
          <section id="films" style={{ background: INK, color: PAPER }}>
            <div style={WRAP}>
              <div className="pe-reveal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20, flexWrap: 'wrap', marginBottom: 44 }}>
                <h2 style={{ ...H2, color: PAPER }}>Films</h2>
                <span style={{ ...EYEBROW, color: 'rgba(244,241,234,.55)' }}>Cut in-house</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 'clamp(16px,2vw,28px)' }}>
                {films.map((f) => (
                  <article key={f.title} className="pe-reveal">
                    <Tile src={f.poster} alt={f.title} ratio="16/9" dark>
                      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                        <span style={{ width: 60, height: 60, border: '1px solid rgba(244,241,234,.6)', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, letterSpacing: '.1em', color: PAPER }}>PLAY</span>
                      </div>
                      <span style={{ position: 'absolute', right: 12, bottom: 10, fontFamily: MONO, fontSize: 10, color: 'rgba(244,241,234,.55)' }}>{f.len}</span>
                    </Tile>
                    <h3 style={{ margin: '16px 0 6px', fontFamily: SERIF, fontSize: 24, fontWeight: 300 }}>{f.title}</h3>
                    <p style={{ margin: '0 0 8px', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(244,241,234,.55)' }}>{f.meta}</p>
                    <p style={{ margin: 0, fontSize: 14, color: 'rgba(244,241,234,.7)', textWrap: 'pretty' }}>{f.note}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {reels.length > 0 && (
          <section id="reels" style={{ background: INK, color: PAPER, borderTop: '1px solid rgba(244,241,234,.14)' }}>
            <div style={{ ...WRAP, padding: 'clamp(56px,8vw,110px) clamp(20px,4vw,56px)' }}>
              <div className="pe-reveal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20, flexWrap: 'wrap', marginBottom: 36 }}>
                <h2 style={{ ...H2, color: PAPER, fontSize: 'clamp(28px,3.4vw,44px)' }}>Reels</h2>
                <span style={{ ...EYEBROW, color: 'rgba(244,241,234,.55)' }}>Vertical cuts · 9:16</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 'clamp(12px,1.6vw,20px)' }}>
                {reels.map((r) => (
                  <article key={r.title} className="pe-card">
                    <Tile src={r.poster} alt={r.title} ratio="9/16" slot={r.slot} dark>
                      <div className="pe-veil" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(23,20,16,.8),transparent 55%)', display: 'grid', placeItems: 'center' }}>
                        <span style={{ width: 52, height: 52, border: '1px solid rgba(244,241,234,.7)', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 9, letterSpacing: '.12em', color: PAPER }}>PLAY</span>
                      </div>
                      <span style={{ position: 'absolute', right: 12, bottom: 10, fontFamily: MONO, fontSize: 10, color: 'rgba(244,241,234,.6)' }}>{r.len}</span>
                    </Tile>
                    <h3 style={{ margin: '12px 0 4px', fontFamily: SERIF, fontSize: 20, fontWeight: 400 }}>{r.title}</h3>
                    <p style={{ margin: 0, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(244,241,234,.5)' }}>{r.meta}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {packages.length > 0 && (
          <section id="services" style={WRAP}>
            <h2 className="pe-reveal" style={{ ...H2, marginBottom: 44 }}>Collections</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 0 }}>
              {packages.map((s) => (
                <div key={s.no || s.name} className="pe-reveal pe-tile" style={{ background: PAPER, padding: 'clamp(26px,3vw,40px)', display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid rgba(23,20,16,.16)', margin: '0 -1px -1px 0', transition: 'background .5s' }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.16em', color: BRONZE }}>{s.no}</span>
                  <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 28, fontWeight: 400 }}>{s.name}</h3>
                  <p style={{ margin: 0, fontSize: 15, color: MUTED, textWrap: 'pretty' }}>{[s.line, s.detail].filter(Boolean).join(' — ')}</p>
                  <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, color: MUTED }}>
                    {(s.inc || []).map((i) => (
                      <li key={i} style={{ display: 'flex', gap: 10 }}><span style={{ color: BRONZE }}>—</span>{i}</li>
                    ))}
                  </ul>
                  <span style={{ marginTop: 'auto', paddingTop: 18, fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: FAINT }}>{s.price}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {quotes.length > 0 && (
          <section style={{ ...WRAP, padding: 'clamp(64px,9vw,120px) clamp(20px,4vw,56px)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'clamp(28px,4vw,60px)' }}>
              {quotes.map((q, i) => (
                <figure key={i} className="pe-reveal" style={{ margin: 0, borderTop: '1px solid rgba(23,20,16,.16)', paddingTop: 24 }}>
                  <blockquote style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(20px,2vw,26px)', lineHeight: 1.4, fontWeight: 300, textWrap: 'pretty' }}>“{q.t}”</blockquote>
                  <figcaption style={{ marginTop: 20, fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', color: FAINT }}>{[q.by, q.meta].filter(Boolean).join(' · ')}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {recognition.length > 0 && (
          <section style={{ ...WRAP, padding: '0 clamp(20px,4vw,56px) clamp(48px,6vw,90px)' }}>
            <div className="pe-reveal" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {recognition.map((r, i) => (
                <span key={i} style={{ border: '1px solid rgba(23,20,16,.2)', padding: '9px 14px', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED }}>
                  {typeof r === 'string' ? r : [r.name, r.note].filter(Boolean).join(' — ')}
                </span>
              ))}
            </div>
            {profile.is_demo && (
              <p style={{ margin: '14px 0 0', fontSize: 11, color: FAINT }}>Sample content — recognitions shown are fictional.</p>
            )}
          </section>
        )}

        {availability && (
          <section id="availability" style={{ background: INK, color: PAPER }}>
            <div style={{ ...WRAP, padding: 'clamp(64px,9vw,120px) clamp(20px,4vw,56px)' }}>
              <div className="pe-reveal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20, flexWrap: 'wrap', marginBottom: 40 }}>
                <h2 style={{ ...H2, color: PAPER }}>Availability {year}</h2>
                <div style={{ display: 'flex', gap: 10 }}>
                  {Object.keys(availability).map((y) => (
                    <button
                      key={y} type="button" onClick={() => setYear(Number(y))}
                      aria-pressed={Number(y) === Number(year)}
                      style={{ background: Number(y) === Number(year) ? PAPER : 'transparent', color: Number(y) === Number(year) ? INK : PAPER, border: '1px solid rgba(244,241,234,.35)', padding: '10px 18px', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', cursor: 'pointer', minHeight: 44 }}
                    >{y}</button>
                  ))}
                </div>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 0 }}>
                {(availability[year] || []).map(([name, status]) => (
                  <li key={name} className="pe-month" style={{ background: INK, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid rgba(244,241,234,.18)', margin: '0 -1px -1px 0', transition: 'background .4s' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 300 }}>{name}</span>
                    <span style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: { Available: '#9FC0A8', Limited: GOLD, Booked: 'rgba(244,241,234,.42)' }[status] }}>{status}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section id="enquire" style={{ ...WRAP, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'clamp(32px,5vw,80px)' }}>
          <div className="pe-reveal">
            <h2 style={{ margin: '0 0 20px', fontFamily: SERIF, fontSize: 'clamp(34px,5vw,70px)', fontWeight: 300, lineHeight: 1.04, textWrap: 'balance' }}>
              Let's talk about<br /><em style={{ fontStyle: 'italic', color: BRONZE }}>your days.</em>
            </h2>
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 16 }}>
              {[['Studio', studioName], ['Phone', contact.phone], ['Email', contact.email], ['Address', contact.address], ['Hours', contact.hours]]
                .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <dt style={{ minWidth: 88, fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: FAINT, paddingTop: 4 }}>{k}</dt>
                    <dd style={{ margin: 0, wordBreak: 'break-word', color: MUTED }}>{v}</dd>
                  </div>
                ))}
            </dl>
            {socials.length > 0 && (
              <div style={{ marginTop: 26, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {socials.map((s) => (
                  <span key={s.label} style={{ fontSize: 13, color: MUTED }}>{s.label} <span style={{ color: FAINT }}>{s.handle}</span></span>
                ))}
              </div>
            )}
          </div>

          <form className="pe-reveal" style={{ display: 'grid', gap: 18 }} onSubmit={submit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid rgba(23,20,16,.14)', paddingBottom: 12 }}>
              <span style={{ fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', color: FAINT }}>Enquiry</span>
            </div>
            {field('Your name', 'name', 'text', 'Priya Sharma')}
            {field('Email', 'email', 'email', 'priya@example.com')}
            {field('Dates', 'dates', 'text', '18–20 December 2026')}
            {field('Venues / cities', 'place', 'text', 'Udaipur, Rajasthan')}
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: FAINT }}>About the celebration</span>
              <textarea
                className="pe-field" rows={4} placeholder="Events, venues, what you'd hate to miss"
                value={form.message || ''} onChange={(e) => setForm({ ...form, message: e.target.value })}
                style={{ background: 'transparent', border: 0, borderBottom: '1px solid rgba(23,20,16,.28)', padding: '12px 0', fontSize: 16, resize: 'vertical' }}
              />
            </label>
            {state.error && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#9A3B2F' }}>{state.error}</p>}
            {state.sent && (
              <p role="status" style={{ margin: 0, padding: '16px 18px', background: PAPER_2, border: '1px solid rgba(23,20,16,.16)', fontSize: 14, color: '#3A352D' }}>
                Enquiry received — the studio usually replies within 48 hours.
              </p>
            )}
            <button type="submit" disabled={state.sending} style={{ marginTop: 10, padding: 18, background: INK, color: PAPER, border: 0, fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', cursor: 'pointer', minHeight: 54, opacity: state.sending ? .6 : 1, transition: 'background .4s,opacity .3s' }}>
              {state.sent ? 'Received — we reply within 48 hours' : (state.sending ? 'Sending…' : 'Send enquiry')}
            </button>
          </form>
        </section>
      </main>

      <div className="pe-mobilebar" style={{ display: 'none', position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 70, gridTemplateColumns: '1fr 1fr', background: 'rgba(244,241,234,.96)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(23,20,16,.14)' }}>
        <a href={availability ? '#availability' : '#work'} style={{ minHeight: 62, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase' }}>{availability ? 'Availability' : 'Work'}</a>
        <a href="#enquire" style={{ minHeight: 62, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: INK, color: PAPER, fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase' }}>Enquire <span>→</span></a>
      </div>
    </div>
  );
}
