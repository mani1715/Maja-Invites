import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import DesignTile from '@/components/designs/DesignTile';
import * as pp from '@/api/publicPricing';
import {
  loadCatalogue, findByCode, filterDesigns, designName, designCode, designId,
  themeLabel, ceremonyLabel, catalogueUrl,
} from '@/lib/designCatalogue';
import './DesignPreview.css';

// One design, full size, at /preview/design/:code.
//
// The tiles in /browse and /studio/designs used to point at
// /preview/theme/:themeId, which is the whole-collection gallery — clicking a
// specific design showed you every design except, particularly, that one. This
// is the page a design code actually resolves to, and it is the page a
// customer is looking at when they quote that code back.

export default function DesignPreview() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [all, setAll] = useState(null);
  const [price, setPrice] = useState(null);   // { inr, includes[] } | null

  useEffect(() => { loadCatalogue().then(setAll); }, []);

  const design = useMemo(() => (all ? findByCode(all, code) : null), [all, code]);

  // Same collection, same ceremony — what someone comparing options wants next.
  const siblings = useMemo(() => {
    if (!all || !design) return [];
    return filterDesigns(all, { theme: design.theme, ceremony: design.ceremony })
      .filter((d) => designId(d) !== designId(design))
      .slice(0, 8);
  }, [all, design]);

  // The price a visitor would pay for THIS design, and what that covers. Two
  // sources: the new pricing engine first, falling back to the store catalogue
  // which is the one currently populated. Quoting nothing when a real price
  // exists is worse than either.
  useEffect(() => {
    if (!design) { setPrice(null); return undefined; }
    let live = true;
    const code = designCode(design);
    pp.storeCatalog(code, design.theme)
      .then(({ data }) => {
        if (!live) return;
        const inr = data?.design_price_inr;
        if (typeof inr !== 'number') { setPrice(null); return; }
        setPrice({
          inr,
          includes: (data.included_features || [])
            .filter((f) => f.included)
            .map((f) => f.label)
            .filter(Boolean),
        });
      })
      .catch(() => { if (live) setPrice(null); });
    return () => { live = false; };
  }, [design]);

  const name = design ? designName(design) : '';
  useSeo({
    title: design ? `${name} — ${themeLabel(design.theme)} invitation` : 'Design preview',
    description: design
      ? `${name}: a ${themeLabel(design.theme).toLowerCase()} ${ceremonyLabel(design.ceremony).toLowerCase()} invitation design. Quote code ${designCode(design)} when you order.`
      : 'Preview one invitation design in full.',
  });

  const order = () => {
    if (!design) return;
    try {
      sessionStorage.setItem('maja_selected_design', JSON.stringify({
        design_id: designCode(design),
        theme_id: design.theme,
        event_type: design.ceremony,
        name: `${themeLabel(design.theme)} — ${ceremonyLabel(design.ceremony)}`,
        image: catalogueUrl(design.src480),
      }));
    } catch (_e) { /* private mode */ }
    navigate('/cart');
  };

  // The 960 variant is present for most designs but not all; falling back to
  // the 480 is right, and claiming a 960 that is not deployed is not — Vite
  // answers 200 with index.html for a missing file, so the <img> would fail
  // silently rather than 404.
  const hero = design ? catalogueUrl(design.src960 || design.src480) : '';

  return (
    <div className="dpv-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <main id="main-content" className="dpv-body">
        {all === null && <div className="dpv-skel" aria-label="Loading design" />}

        {all !== null && !design && (
          <div className="dpv-missing" role="alert">
            <h1 className="dpv-h1">No design with that code</h1>
            <p className="dpv-sub">
              <strong>{String(code || '').toUpperCase()}</strong> does not match any design in
              the catalogue. Codes look like <code>TMPL-ENG-03</code> — collection,
              ceremony, then the design&rsquo;s number within that set.
            </p>
            <Link className="dpv-btn dpv-btn--primary" to="/browse">Browse the catalogue</Link>
          </div>
        )}

        {design && (
          <>
            <nav className="dpv-crumbs" aria-label="Breadcrumb">
              <Link to="/browse" data-mj-link>All collections</Link>
              <span aria-hidden="true"> / </span>
              <Link to={`/themes/${design.theme}`} data-mj-link>{themeLabel(design.theme)}</Link>
              <span aria-hidden="true"> / </span>
              <span>{ceremonyLabel(design.ceremony)}</span>
            </nav>

            <div className="dpv-split">
              <figure
                className="dpv-figure"
                style={{
                  aspectRatio: design.w && design.h ? `${design.w} / ${design.h}` : '3 / 4',
                  background: design.dominant || 'var(--mj-section)',
                  backgroundImage: design.lqip ? `url("${design.lqip}")` : undefined,
                }}
              >
                <img src={hero} alt={name} width={design.w || undefined} height={design.h || undefined} />
              </figure>

              <div className="dpv-info">
                <p className="dpv-eyebrow">{themeLabel(design.theme)}</p>
                <h1 className="dpv-h1">{name}</h1>
                <p className="dpv-code">{designCode(design)}</p>
                <dl className="dpv-facts">
                  <div><dt>Ceremony</dt><dd>{ceremonyLabel(design.ceremony)}</dd></div>
                  <div><dt>Collection</dt><dd>{themeLabel(design.theme)}</dd></div>
                  {design.w > 0 && design.h > 0 && (
                    <div><dt>Artwork</dt><dd>{design.w} × {design.h}</dd></div>
                  )}
                </dl>
                {/* Price only when the server gave one. No "from ₹…", no
                    placeholder figure. */}
                {price && (
                  <div className="dpv-price">
                    <span className="dpv-price-amount">
                      ₹{price.inr.toLocaleString('en-IN')}
                    </span>
                    <span className="dpv-price-note">for this invitation, built for you</span>
                    {price.includes.length > 0 && (
                      <ul className="dpv-includes">
                        {price.includes.slice(0, 8).map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                <p className="dpv-sub">
                  You do not build this yourself. Quote the code above when you
                  order and the team produces the finished invitation as a link
                  you can share — your names, your dates, this design.
                </p>
                <div className="dpv-actions">
                  <button type="button" className="dpv-btn dpv-btn--primary" onClick={order}>
                    Use this design
                  </button>
                  {/* The artwork above is the card. This is the whole
                      invitation — hero, ceremonies, RSVP, blessings — in this
                      design's palette and fonts, which is what the buyer is
                      actually choosing between. */}
                  <Link className="dpv-btn dpv-btn--ghost" to={`/preview/luxe?theme=${design.theme}`}>
                    See it as a live invitation
                  </Link>
                  <Link className="dpv-btn dpv-btn--ghost" to={`/themes/${design.theme}/events/${design.ceremony.toLowerCase()}`}>
                    More {ceremonyLabel(design.ceremony).toLowerCase()} designs
                  </Link>
                </div>
              </div>
            </div>

            {siblings.length > 0 && (
              <section className="dpv-more">
                <h2 className="dpv-h2">
                  Others in {themeLabel(design.theme)} · {ceremonyLabel(design.ceremony)}
                </h2>
                <div className="dpv-grid">
                  {siblings.map((d) => (
                    <DesignTile
                      key={designId(d)}
                      design={d}
                      showCeremony={false}
                      href={`/preview/design/${encodeURIComponent(designCode(d))}`}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
