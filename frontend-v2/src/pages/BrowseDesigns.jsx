import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import * as catalog from '@/api/publicCatalog';
import * as publicPricing from '@/api/publicPricing';
import { designImage, themeGradient } from '@/lib/designAssets';
import DesignTile from '@/components/designs/DesignTile';
import {
  loadCatalogue, filterDesigns, designId, designCode, ceremonyLabel, themeLabel,
  catalogueUrl,
} from '@/lib/designCatalogue';
import { EVENT_TYPES } from '@/lib/weddingSchema';
import './BrowseDesigns.css';

// /browse's ceremony ids are lowercase (weddingSchema.EVENT_TYPES); the design
// catalogue keys them by the folder name the artwork actually lives under.
// Mapping them here rather than renaming either side keeps the design codes
// already handed to customers (TMPL-ENG-03) resolving unchanged.
const CEREMONY_DIR = {
  engagement: 'Engagement',
  haldi: 'Haldi',
  mehendi: 'Mehandi',
  mehandi: 'Mehandi',
  wedding: 'Marriage',
  marriage: 'Marriage',
  reception: 'Reception',
  sangeet: 'Sangeeth',
  sangeeth: 'Sangeeth',
};
const DIR_TO_SLUG = {
  Engagement: 'engagement', Haldi: 'haldi', Mehandi: 'mehendi',
  Marriage: 'wedding', Reception: 'reception', Sangeeth: 'sangeet',
};

// The public design-discovery funnel. One component drives the whole
// drill-down because it is one journey, and splitting it into five pages was
// what made the legacy version hard to keep consistent:
//
//   /browse                      every collection
//   /themes/:themeId             one collection, its ceremonies
//   /themes/:themeId/events      same (legacy alias)
//   /themes/:themeId/events/:e   designs for one ceremony
//   /themes/:themeId/gallery     every design in the collection, flat
//
// TWO SOURCES, AND THEY DO NOT OVERLAP AT ALL. This page used to call
// /api/themes for everything, which is why drilling in showed nothing: that
// endpoint returns the eight RENDERING themes from theme_constants.py
// (royal_heritage, temple_gold, peacock_dream, …) and the artwork catalogue is
// keyed by ten entirely different collection ids (south_indian_temple,
// royal_mughal, beach_destination, …). Not one id is in both sets, so
// /api/themes/south_indian_temple answers a genuine 404 and always did.
//
// So the catalogue is checked FIRST and answered locally — no request, no 404
// — and /api/themes supplies the rendering themes alongside it. The two are
// different axes of the same product (which artwork, and how the invitation
// page is styled), and pretending they were one list is what hid 188 designs.

export default function BrowseDesigns({ mode = 'themes' }) {
  const { themeId, event } = useParams();
  const navigate = useNavigate();

  const [themes, setThemes] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  // {theme_id: {inr_price, label}} for the collections an admin has priced as a
  // bundle. A MISSING key means there is no bundle offer — not ₹0 — so every
  // read below is guarded and renders nothing when absent.
  const [bundles, setBundles] = useState({});

  useEffect(() => { loadCatalogue().then(setCat); }, []);

  useEffect(() => {
    publicPricing.themeBundles()
      .then(({ data }) => setBundles(data?.bundles || {}))
      .catch(() => setBundles({}));   // pricing is a bonus; never fail the page
  }, []);

  // Collections that actually have artwork, derived from the catalogue.
  const collections = useMemo(() => {
    if (!cat?.length) return [];
    const by = new Map();
    for (const d of cat) {
      const c = by.get(d.theme) || {
        id: d.theme, name: themeLabel(d.theme), total: 0,
        ceremonies: new Set(), cover: d,
      };
      c.total += 1;
      c.ceremonies.add(d.ceremony);
      by.set(d.theme, c);
    }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [cat]);

  const collection = useMemo(
    () => (themeId ? collections.find((c) => c.id === themeId) || null : null),
    [collections, themeId],
  );
  // Once the catalogue has loaded and claimed this id, the API is not involved.
  const isCatalogue = Boolean(collection);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const req = themeId ? catalog.theme(themeId) : catalog.themes();
    req
      .then(({ data }) => {
        if (themeId) setDetail(data?.theme || data);
        else setThemes(data?.themes || []);
      })
      .catch((e) => setError(
        e?.response?.status === 404
          ? 'That collection does not exist.'
          : e?.response?.data?.detail || 'Could not load the designs.',
      ))
      .finally(() => setLoading(false));
  }, [themeId]);

  useEffect(() => {
    // Wait for the catalogue before deciding: firing the request first would
    // set the 404 error state for every collection that is served locally.
    if (cat === null) return;
    if (themeId && collections.some((c) => c.id === themeId)) {
      setLoading(false);
      setError(null);
      return;
    }
    load();
  }, [cat, collections, themeId, load]);

  const active = detail || null;
  const title = collection?.name || active?.name || 'Browse designs';

  useSeo({
    title: themeId ? `${title} designs` : 'Browse wedding invitation designs',
    description: themeId
      ? `${title} — see every ceremony design in this collection before you order.`
      : 'Ten invitation collections and 188 designs, from South Indian temple to modern minimal. Browse every design before you order.',
  });

  const filtered = useMemo(() => {
    if (!themes) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return themes;
    return themes.filter((t) => [t.name, t.description, t.id]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)));
  }, [themes, q]);

  const filteredCollections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return collections;
    return collections.filter((c) => `${c.name} ${c.id}`.toLowerCase().includes(needle));
  }, [collections, q]);

  return (
    <div className="brw-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora brw-hero">
        <div className="brw-hero-inner">
          <nav className="brw-crumbs" aria-label="Breadcrumb">
            <Link to="/browse" data-mj-link>All collections</Link>
            {themeId && <><span aria-hidden="true"> / </span><span>{title}</span></>}
            {event && <><span aria-hidden="true"> / </span><span style={{ textTransform: 'capitalize' }}>{event}</span></>}
          </nav>
          <h1 className="brw-h1">
            {themeId ? <>{title}</> : <>Every design, <span className="brw-hl">before you order</span></>}
          </h1>
          <p className="brw-sub">
            {themeId
              ? (active?.description || 'Pick the ceremony you want to see designs for.')
              : 'We build the invitation for you — but you choose how it looks. Browse the full catalogue, then tell us which one.'}
          </p>
          {/* Only when an admin has actually priced this collection as a
              bundle. No price means no offer, which is why there is no
              "price on request" fallback here. */}
          {themeId && bundles[themeId]?.inr_price > 0 && (
            <p className="brw-bundle">
              <strong>{rupees(bundles[themeId].inr_price)}</strong> for the whole collection
              {bundles[themeId].label ? ` — ${bundles[themeId].label}` : ''}
            </p>
          )}
        </div>
      </header>

      <main id="main-content" className="brw-body">
        {loading && (
          <div className="brw-grid">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="brw-skel" />)}
          </div>
        )}

        {!loading && error && (
          <div className="brw-error" role="alert">
            <p className="brw-error-title">{error}</p>
            <div className="brw-error-actions">
              <button type="button" className="brw-btn brw-btn--primary" onClick={load}>Try again</button>
              <Link className="brw-btn brw-btn--ghost" to="/browse">All collections</Link>
            </div>
          </div>
        )}

        {/* ---- level 1: every collection ---- */}
        {!loading && !error && !themeId && (
          <>
            <div className="brw-toolbar">
              <input
                className="brw-search"
                data-mj-field
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search collections…"
                aria-label="Search collections"
              />
              <span className="brw-count">
                {filteredCollections.length + filtered.length} collection
                {filteredCollections.length + filtered.length === 1 ? '' : 's'}
              </span>
            </div>

            {filteredCollections.length === 0 && filtered.length === 0 ? (
              <p className="brw-empty">Nothing matches &ldquo;{q}&rdquo;.</p>
            ) : (
              <>
                {filteredCollections.length > 0 && (
                  <div className="brw-grid">
                    {filteredCollections.map((c) => (
                      <Link key={c.id} to={`/themes/${c.id}`} className="brw-card">
                        <span
                          className="brw-thumb"
                          style={{
                            background: c.cover.dominant || themeGradient(c.id),
                            backgroundImage: c.cover.lqip ? `url("${c.cover.lqip}")` : undefined,
                            backgroundSize: 'cover',
                          }}
                        >
                          <img src={catalogueUrl(c.cover.src480)} alt="" loading="lazy" />
                        </span>
                        <span className="brw-card-body">
                          <span className="brw-card-name">{c.name}</span>
                          <span className="brw-card-desc">
                            {c.total} designs across {c.ceremonies.size} ceremonies.
                          </span>
                          {bundles[c.id]?.inr_price > 0 && (
                            <span className="brw-tag">
                              Whole collection {rupees(bundles[c.id].inr_price)}
                            </span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {filtered.length > 0 && (
                  <>
                    <h2 className="brw-h2">Page styles</h2>
                    <p className="brw-empty" style={{ margin: '0 0 18px' }}>
                      These set how the finished invitation page looks and moves —
                      colours, type and animation. They are chosen alongside the
                      artwork above, not instead of it.
                    </p>
                    <div className="brw-grid">
                      {filtered.map((t) => (
                        <Link key={t.id} to={`/themes/${t.id}`} className="brw-card">
                          <span className="brw-thumb" style={{ background: themeGradient(t.id) }}>
                            {designImage(t) && <img src={designImage(t)} alt="" loading="lazy" />}
                          </span>
                          <span className="brw-card-body">
                            <span className="brw-card-name">{t.name}</span>
                            {t.description && <span className="brw-card-desc">{t.description}</span>}
                            {t.plan_label && <span className="brw-tag">{t.plan_label}</span>}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ---- level 2: one collection, its ceremonies ---- */}
        {!loading && !error && themeId && !event && mode !== 'gallery' && (
          <>
            <div className="brw-toolbar">
              <span className="brw-count">
                {isCatalogue ? `${collection.total} designs — choose a ceremony` : 'Choose a ceremony'}
              </span>
              <Link to={`/themes/${themeId}/gallery`} className="brw-btn brw-btn--ghost">See every design</Link>
            </div>
            <div className="brw-grid brw-grid--wide">
              {(isCatalogue
                ? [...collection.ceremonies].sort().map((dir) => ({
                  id: DIR_TO_SLUG[dir] || dir.toLowerCase(),
                  label: ceremonyLabel(dir),
                  cover: cat.find((d) => d.theme === themeId && d.ceremony === dir),
                  n: cat.filter((d) => d.theme === themeId && d.ceremony === dir).length,
                }))
                : EVENT_TYPES.map((et) => ({ id: et.id, label: et.label, cover: null, n: 0 }))
              ).map((et) => (
                <Link key={et.id} to={`/themes/${themeId}/events/${et.id}`} className="brw-card">
                  <span
                    className="brw-thumb"
                    style={{
                      background: et.cover?.dominant || themeGradient(themeId),
                      backgroundImage: et.cover?.lqip ? `url("${et.cover.lqip}")` : undefined,
                      backgroundSize: 'cover',
                    }}
                  >
                    {et.cover
                      ? <img src={catalogueUrl(et.cover.src480)} alt="" loading="lazy" />
                      : <span className="brw-thumb-label">{et.label}</span>}
                  </span>
                  <span className="brw-card-body">
                    <span className="brw-card-name">{et.label}</span>
                    <span className="brw-card-desc">
                      {et.n > 0
                        ? `${et.n} design${et.n === 1 ? '' : 's'} for the ${et.label.toLowerCase()} card.`
                        : `Designs for the ${et.label.toLowerCase()} card.`}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* ---- level 3: designs (one ceremony, or the whole theme) ---- */}
        {!loading && !error && themeId && (event || mode === 'gallery') && (
          <DesignGrid theme={active} themeId={themeId} event={event} />
        )}

        <section className="brw-cta">
          <h2 className="brw-cta-title">Found one you like?</h2>
          <p className="brw-cta-body">
            You do not build it — we do. Tell us the design and your details, and
            the finished invitation comes back as a link you can share.
          </p>
          <div className="brw-cta-actions">
            <Link className="brw-btn brw-btn--primary" to="/pricing">See pricing</Link>
            <button
              type="button"
              className="brw-btn brw-btn--ghost"
              onClick={() => navigate('/contact')}
            >
              Ask us a question
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function DesignGrid({ theme, themeId, event }) {
  // Two sources, and they name entirely different things. The local catalogue
  // holds the ARTWORK (188 designs across ten collections); /api/themes holds
  // the eight PAGE STYLES. No id appears in both, so a collection is served
  // from one or the other, never merged — see the note at the top of the file.
  const [local, setLocal] = useState(null);
  useEffect(() => { loadCatalogue().then(setLocal); }, []);

  const localDesigns = useMemo(() => {
    if (!local?.length) return [];
    return filterDesigns(local, {
      theme: themeId,
      ceremony: event ? (CEREMONY_DIR[String(event).toLowerCase()] || '') : '',
    });
  }, [local, themeId, event]);

  const designs = useMemo(() => {
    const all = theme?.designs || theme?.design_list || [];
    if (!event) return all;
    // Designs may carry the ceremony either as event_type or in a list.
    return all.filter((d) => {
      const et = d.event_type || d.event;
      if (Array.isArray(d.events)) return d.events.includes(event);
      return !et || et === event;
    });
  }, [theme, event]);

  // Prefer the catalogue's own wording: /browse's route slug is "wedding" but
  // the artwork folder — and the design code MRG — call it Marriage, and the
  // heading should agree with the codes on the cards under it.
  const dir = event ? CEREMONY_DIR[String(event).toLowerCase()] : '';
  const label = event
    ? (dir ? ceremonyLabel(dir) : EVENT_TYPES.find((e) => e.id === event)?.label || event)
    : 'Every design';

  if (localDesigns.length > 0) {
    return (
      <>
        <div className="brw-toolbar">
          <span className="brw-count">
            {label} · {localDesigns.length} design{localDesigns.length === 1 ? '' : 's'}
          </span>
          <Link to={`/themes/${themeId}`} className="brw-btn brw-btn--ghost">Back to ceremonies</Link>
        </div>
        <div className="brw-grid">
          {localDesigns.map((d) => (
            <DesignTile
              key={designId(d)}
              design={d}
              showCeremony={!event}
              href={`/preview/design/${encodeURIComponent(designCode(d))}`}
            />
          ))}
        </div>
        <p className="brw-empty" style={{ marginTop: 18 }}>
          {event
            ? `Every card above is a real ${ceremonyLabel(CEREMONY_DIR[String(event).toLowerCase()] || '').toLowerCase()} design.`
            : 'Every card above is a real design from this collection.'}
          {' '}Quote its code when you order and you get exactly that one.
        </p>
      </>
    );
  }

  if (designs.length === 0) {
    return (
      <>
        <div className="brw-toolbar">
          <span className="brw-count">{label}</span>
          <Link to={`/themes/${themeId}`} className="brw-btn brw-btn--ghost">Back to ceremonies</Link>
        </div>
        <p className="brw-empty">
          No individual artwork is published for this collection yet. The
          collection itself is available to order — the team will send proofs
          before anything goes live.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="brw-toolbar">
        <span className="brw-count">{label} · {designs.length} design{designs.length === 1 ? '' : 's'}</span>
        <Link to={`/themes/${themeId}`} className="brw-btn brw-btn--ghost">Back to ceremonies</Link>
      </div>
      <div className="brw-grid">
        {designs.map((d, i) => {
          const src = designImage(d);
          const id = d.design_id || d.id || i;
          return (
            <Link key={id} to={`/preview/theme/${themeId}?design=${encodeURIComponent(id)}`} className="brw-card">
              <span className="brw-thumb brw-thumb--tall" style={{ background: themeGradient(themeId) }}>
                {src && <img src={src} alt={d.name || `Design ${i + 1}`} loading="lazy" />}
              </span>
              <span className="brw-card-body">
                <span className="brw-card-name">{d.name || `Design ${i + 1}`}</span>
                {d.description && <span className="brw-card-desc">{d.description}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

// Bundle prices arrive as whole rupees from pricing_features.py. Formatted here
// rather than by each caller so the collection card and the collection hero can
// never render the same number two ways.
function rupees(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}
