import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as pc from '@/api/publicCatalog';
import { INVITE_THEMES, INVITE_THEME_IDS } from '@/lib/inviteThemes';
import { loadCatalogue, groupByTheme, catalogueUrl } from '@/lib/designCatalogue';
import LivePreviewModal from '@/components/invite/LivePreviewModal';
import './themeShowcase.css';

/**
 * The showcase on the home page — the one place a visitor decides whether this
 * product is worth their wedding.
 *
 * WHAT WAS HERE BEFORE. Six invented collection names ("Royal Heritage",
 * "Floral Garden", "Temple Classic" — none of which the catalogue sells) drawn
 * as line-art SVG, none of them clickable, above a hand-drawn phone captioned
 * "Not a mockup". The catalogue of 188 real designs and the live sample
 * invitation both existed; nothing on the home page linked to either, so a
 * visitor could not see a single design without being told a URL. That is what
 * "no previews open" meant.
 *
 * WHAT IT IS NOW. The real ten collections with their real artwork and real
 * counts, plus the four celebration categories the backend serves, and every
 * card opens the live invitation. The legacy landing page did exactly this
 * (category tabs → design grid → preview); this is that behaviour rebuilt on
 * frontend-v2's catalogue, tokens and routes rather than ported.
 *
 * DEGRADES HONESTLY. If the catalogue manifest cannot be fetched the wedding
 * cards still render from the theme tokens — palette, name and blurb are
 * local — and simply carry no artwork and no count, rather than claiming a
 * number nobody verified. If the categories endpoint fails, the tab bar does
 * not appear and the wedding grid stands alone.
 */

// Which ceremony's artwork represents a collection on its card. Marriage is
// the one every collection has and the one people picture when they hear the
// collection's name; the fallback is simply the first design in the set.
const HERO_CEREMONY = 'Marriage';

const CATEGORY_ORDER = ['wedding', 'baby_birthday', 'half_saree', 'puberty', 'dhoti'];

export default function ThemeShowcase() {
  const [cats, setCats] = useState([]);            // from /api/event-categories
  const [active, setActive] = useState('wedding');
  const [catalogue, setCatalogue] = useState(null); // null = still loading
  const [catDesigns, setCatDesigns] = useState({}); // categoryId -> designs[]
  const [preview, setPreview] = useState(null);     // { title, subtitle, src, fullHref, ... }

  useEffect(() => {
    let live = true;
    loadCatalogue().then((d) => { if (live) setCatalogue(d); });
    pc.eventCategories()
      .then(({ data }) => {
        if (!live) return;
        const list = (data?.categories || []).filter((c) => c && c.id);
        list.sort((a, b) => CATEGORY_ORDER.indexOf(a.id) - CATEGORY_ORDER.indexOf(b.id));
        setCats(list);
      })
      .catch(() => { /* tabs are an enhancement; the wedding grid stands alone */ });
    return () => { live = false; };
  }, []);

  // Category designs are fetched the first time that tab is opened, not on
  // mount: four extra requests on the home page for tabs nobody clicked is a
  // cost every visitor pays for a minority of them.
  useEffect(() => {
    if (active === 'wedding' || catDesigns[active]) return undefined;
    let live = true;
    pc.categoryDesigns(active)
      .then(({ data }) => { if (live) setCatDesigns((m) => ({ ...m, [active]: data?.designs || [] })); })
      .catch(() => { if (live) setCatDesigns((m) => ({ ...m, [active]: [] })); });
    return () => { live = false; };
  }, [active, catDesigns]);

  // One card per master theme, in the catalogue's own order, carrying the
  // theme's real design count and a real piece of its artwork.
  const collections = useMemo(() => {
    const grouped = catalogue ? groupByTheme(catalogue) : {};
    return INVITE_THEME_IDS.map((id) => {
      const theme = INVITE_THEMES[id];
      const g = grouped[id];
      const ceremonies = g ? Object.keys(g.ceremonies) : [];
      const pool = g ? (g.ceremonies[HERO_CEREMONY] || g.ceremonies[ceremonies[0]] || []) : [];
      return {
        id,
        name: theme.name,
        culture: theme.culture,
        blurb: theme.blurb,
        palette: [theme.colors.primary, theme.colors.accent, theme.colors.bg],
        total: g?.total || 0,
        ceremonies: ceremonies.length,
        hero: pool[0] || null,
      };
    });
  }, [catalogue]);

  const openThemePreview = (c) => setPreview({
    title: c.name,
    subtitle: c.culture,
    src: `/preview/luxe?theme=${encodeURIComponent(c.id)}&embed=1`,
    fullHref: `/preview/luxe?theme=${encodeURIComponent(c.id)}`,
    browseHref: `/themes/${c.id}`,
    browseLabel: c.total ? `See all ${c.total} designs` : 'See the designs',
  });

  const openCategoryPreview = (cat, design) => setPreview({
    title: design ? design.name : cat.label,
    subtitle: cat.tagline,
    src: `/preview/celebration/${cat.id}?embed=1`,
    fullHref: `/preview/celebration/${cat.id}`,
    browseHref: '/browse',
    browseLabel: 'See wedding designs',
  });

  const activeCat = cats.find((c) => c.id === active);

  return (
    <>
      {cats.length > 1 && (
        <div className="tsc-tabs" role="tablist" aria-label="Invitation type">
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active === c.id}
              className={`tsc-tab ${active === c.id ? 'is-active' : ''}`}
              onClick={() => setActive(c.id)}
            >
              <span aria-hidden="true" className="tsc-tab-icon">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {active === 'wedding' && (
        <div data-mj-stagger className="tsc-grid" data-testid="showcase-collections">
          {collections.map((c) => (
            <article data-reveal="blur" key={c.id} className="tsc-card">
              <button
                type="button"
                className="tsc-art-hit"
                onClick={() => openThemePreview(c)}
                aria-label={`Preview a live ${c.name} invitation`}
              >
                <span
                  className="tsc-art"
                  style={{
                    background: c.hero?.dominant
                      || `linear-gradient(150deg, ${c.palette[0]}, ${c.palette[1]})`,
                    backgroundImage: c.hero?.lqip ? `url("${c.hero.lqip}")` : undefined,
                  }}
                >
                  {c.hero && (
                    <img
                      src={catalogueUrl(c.hero.src480)}
                      alt={`${c.name} invitation design`}
                      loading="lazy"
                      decoding="async"
                      width={c.hero.w || undefined}
                      height={c.hero.h || undefined}
                    />
                  )}
                  <span className="tsc-art-cue">Preview live</span>
                </span>
              </button>

              <div className="tsc-body">
                <div className="tsc-body-head">
                  <h3 className="tsc-name">{c.name}</h3>
                  <span className="tsc-swatches" aria-hidden="true">
                    {c.palette.map((hex, i) => (
                      <span key={i} className="tsc-swatch" style={{ background: hex }} />
                    ))}
                  </span>
                </div>
                <p className="tsc-blurb">{c.blurb}</p>
                {/* Counts come from the manifest. When it has not loaded the
                    line is omitted rather than guessed. */}
                {c.total > 0 && (
                  <p className="tsc-count">
                    {c.total} designs &middot; {c.ceremonies} ceremonies
                  </p>
                )}
                <div className="tsc-actions">
                  <button type="button" className="tsc-btn" onClick={() => openThemePreview(c)}>
                    Preview
                  </button>
                  <Link className="tsc-btn tsc-btn--ghost" to={`/themes/${c.id}`}>
                    All designs
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {active !== 'wedding' && activeCat && (
        <div className="tsc-cat">
          <p className="tsc-cat-lead">{activeCat.tagline}</p>
          {catDesigns[active] === undefined && <div className="tsc-cat-loading" aria-label="Loading designs" />}
          {catDesigns[active]?.length === 0 && (
            <p className="tsc-cat-empty">
              These designs are not published yet. The {activeCat.label.toLowerCase()} invitation
              itself is live — open the preview to see exactly what it does.
              {' '}
              <button type="button" className="tsc-inline-btn" onClick={() => openCategoryPreview(activeCat, null)}>
                Preview a {activeCat.label.toLowerCase()} invitation
              </button>
            </p>
          )}
          {catDesigns[active]?.length > 0 && (
            <div className="tsc-grid tsc-grid--cat" data-testid={`showcase-designs-${active}`}>
              {catDesigns[active].map((d) => (
                <article key={d.design_id} className="tsc-card">
                  <button
                    type="button"
                    className="tsc-art-hit"
                    onClick={() => openCategoryPreview(activeCat, d)}
                    aria-label={`Preview ${d.name}`}
                  >
                    <span className="tsc-art" style={{ background: activeCat.hero_gradient }}>
                      {/* `thumbnail`, not `preview_image` — the originals run to
                          6 MB apiece and this is a 280px tile. */}
                      <img
                        src={d.thumbnail || d.preview_image}
                        alt={d.name}
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="tsc-art-cue">Preview live</span>
                    </span>
                  </button>
                  <div className="tsc-body">
                    <div className="tsc-body-head">
                      <h3 className="tsc-name">{d.name}</h3>
                    </div>
                    <div className="tsc-actions">
                      <button
                        type="button"
                        className="tsc-btn"
                        onClick={() => openCategoryPreview(activeCat, d)}
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <LivePreviewModal
        open={!!preview}
        title={preview?.title || ''}
        subtitle={preview?.subtitle}
        src={preview?.src || ''}
        fullHref={preview?.fullHref || ''}
        browseHref={preview?.browseHref}
        browseLabel={preview?.browseLabel}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
