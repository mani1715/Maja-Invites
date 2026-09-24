import { useEffect, useState } from 'react';
import * as catalog from '@/api/publicCatalog';
import './studioShowcase.css';

// A studio's highlights and packages on their public portfolio.
//
// Three endpoints with no reader:
//   /api/public/pixora/highlights/{sid}  saved story collections
//   /api/public/pixora/highlight/{id}    one collection's items
//   /api/public/pixora/packages/{sid}    what the studio sells, with prices
//
// The packages one matters most commercially — a studio could set up their
// pricing and no visitor could ever see it, so every enquiry started from
// "what do you charge?".
//
// Both sections render only when the studio has something. A portfolio with no
// packages should say nothing rather than show an empty "Packages" heading,
// which reads as a studio that forgot to fill it in.

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function StudioShowcase({ studioId }) {
  const [highlights, setHighlights] = useState([]);
  const [packages, setPackages] = useState([]);
  const [open, setOpen] = useState(null);      // { highlight, items, index }

  useEffect(() => {
    if (!studioId) return undefined;
    let live = true;
    Promise.allSettled([
      catalog.studioHighlights(studioId),
      catalog.studioPackages(studioId),
    ]).then(([h, p]) => {
      if (!live) return;
      setHighlights(h.status === 'fulfilled' ? (h.value.data?.highlights || []) : []);
      setPackages(p.status === 'fulfilled' ? (p.value.data?.packages || []) : []);
    });
    return () => { live = false; };
  }, [studioId]);

  const openHighlight = async (h) => {
    // The list gives a cover and a title; the items come from the detail call.
    try {
      const { data } = await catalog.highlight(h.id);
      const items = data?.items || data?.stories || [];
      if (items.length) setOpen({ highlight: h, items, index: 0 });
    } catch (_e) {
      // A highlight that cannot be opened is not worth a modal saying so —
      // leave the page as it was.
    }
  };

  if (!highlights.length && !packages.length) return null;

  const item = open ? open.items[open.index] : null;

  return (
    <>
      {highlights.length > 0 && (
        <section className="sshow" aria-labelledby="sshow-h-title">
          <h2 id="sshow-h-title" className="sshow-title">Highlights</h2>
          <div className="sshow-rail" role="list">
            {highlights.map((h) => (
              <button key={h.id} type="button" role="listitem"
                      className="sshow-hl" onClick={() => openHighlight(h)}>
                <span className="sshow-hl-art">
                  {h.cover_url
                    ? <img src={h.cover_url} alt="" loading="lazy" />
                    : <span className="sshow-hl-blank" aria-hidden="true" />}
                </span>
                <span className="sshow-hl-name">{h.title || 'Highlight'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {packages.length > 0 && (
        <section className="sshow" aria-labelledby="sshow-p-title">
          <h2 id="sshow-p-title" className="sshow-title">Packages</h2>
          <div className="sshow-pkgs">
            {packages.map((pk) => (
              <article key={pk.id || pk.name} className="sshow-pkg">
                <h3 className="sshow-pkg-name">{pk.name || pk.title}</h3>
                {pk.tier && pk.tier !== 'custom' && (
                  <p className="sshow-pkg-tier">{pk.tier}</p>
                )}
                {/* Price only when there IS one. A package with no price set
                    says "on request" rather than showing ₹0. */}
                {/* The server sends `price_inr`, and sends 0 for a package
                    that is quoted after a call. Reading `price` here showed
                    "Price on request" for an 85,000-rupee package — verified
                    against the real payload, not the field name I expected. */}
                <p className="sshow-pkg-price">
                  {pk.price_inr > 0 ? inr(pk.price_inr) : 'Price on request'}
                  {pk.price_inr > 0 && pk.unit ? <span className="sshow-pkg-unit"> / {pk.unit}</span> : null}
                </p>
                {pk.description && <p className="sshow-pkg-desc">{pk.description}</p>}
                {(pk.includes || pk.features || []).length > 0 && (
                  <ul className="sshow-pkg-list">
                    {(pk.includes || pk.features || []).slice(0, 8).map((f, i) => (
                      <li key={i}>{typeof f === 'string' ? f : f?.label || ''}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {open && item && (
        <div className="sshow-viewer" role="dialog" aria-modal="true"
             aria-label={open.highlight.title || 'Highlight'} onClick={() => setOpen(null)}>
          <div className="sshow-stage" onClick={(e) => e.stopPropagation()}>
            <header className="sshow-vhead">
              <span>{open.highlight.title || 'Highlight'}</span>
              <span className="sshow-vcount">{open.index + 1} / {open.items.length}</span>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close">×</button>
            </header>
            <div className="sshow-vbody">
              {item.type === 'video' && item.url
                ? <video src={item.url} controls autoPlay playsInline />
                : item.url
                  ? <img src={item.url} alt={item.caption || ''} />
                  : <p className="sshow-vtext">{item.caption || ''}</p>}
            </div>
            <div className="sshow-vnav">
              <button type="button" disabled={open.index === 0}
                      onClick={() => setOpen((c) => ({ ...c, index: c.index - 1 }))}>‹ Prev</button>
              <button type="button" disabled={open.index >= open.items.length - 1}
                      onClick={() => setOpen((c) => ({ ...c, index: c.index + 1 }))}>Next ›</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
