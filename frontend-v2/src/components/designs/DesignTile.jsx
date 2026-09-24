import { useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogueUrl, designName, designCode, ceremonyLabel } from '@/lib/designCatalogue';
import './designTile.css';

// One design in a grid. Shared by the public funnel (/browse) and the studio
// catalogue (/studio/designs) so the two can never drift into showing the same
// design differently — which they did before, one as a gradient swatch and the
// other as nothing at all.
//
// The tile paints in three stages and never shows an empty box or a broken
// frame at any of them:
//   1. the design's dominant colour, known from the manifest;
//   2. the inline LQIP data-URI, which needs no network at all;
//   3. the 480px WebP.
// `width`/`height` come from the manifest too, so the box is reserved at the
// true aspect ratio and the grid does not reflow when the artwork arrives.

export default function DesignTile({
  design, onSelect, href, actions = null, showCeremony = true,
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const name = designName(design);
  const code = designCode(design);
  const src = catalogueUrl(design.src480);
  const ratio = design.w && design.h ? `${design.w} / ${design.h}` : '3 / 4';

  const art = (
    <span
      className="dtile-art"
      style={{
        aspectRatio: ratio,
        background: design.dominant || 'var(--mj-section)',
        backgroundImage: design.lqip ? `url("${design.lqip}")` : undefined,
      }}
    >
      {!failed && src && (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          width={design.w || undefined}
          height={design.h || undefined}
          className={loaded ? 'is-loaded' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        // Reached only if the file is genuinely absent. Say so rather than
        // leaving the LQIP up pretending to be the design.
        <span className="dtile-missing">Artwork not published</span>
      )}
    </span>
  );

  const body = (
    <span className="dtile-body">
      <span className="dtile-name">{name}</span>
      <span className="dtile-meta">
        {showCeremony && <span className="dtile-ceremony">{ceremonyLabel(design.ceremony)}</span>}
        {code && <span className="dtile-code">{code}</span>}
      </span>
    </span>
  );

  if (href) {
    // `Link`, not a bare `<a href>`: this tile is the whole design-browsing
    // funnel, and an anchor made every click a full document load — the app,
    // the catalogue manifest and the artwork all re-fetched to move between two
    // pages of the same SPA.
    return (
      <article className="dtile">
        <Link className="dtile-hit" to={href} onClick={onSelect}>{art}{body}</Link>
        {actions && <div className="dtile-actions">{actions}</div>}
      </article>
    );
  }

  return (
    <article className="dtile">
      {onSelect ? (
        <button type="button" className="dtile-hit" onClick={() => onSelect(design)}>
          {art}{body}
        </button>
      ) : (
        <span className="dtile-hit">{art}{body}</span>
      )}
      {actions && <div className="dtile-actions">{actions}</div>}
    </article>
  );
}
