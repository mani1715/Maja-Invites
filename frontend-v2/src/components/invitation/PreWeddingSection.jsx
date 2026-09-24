import { useState } from 'react';

// Video-host detection ported from the legacy PreWeddingSection.jsx (Drive /
// YouTube / Vimeo -> embeddable preview URL); trimmed of framer-motion and
// lucide-react, neither of which frontend-v2 depends on.
const DRIVE_RE = /drive\.google\.com\/file\/d\/([^/]+)/i;
const DRIVE_OPEN_RE = /drive\.google\.com\/open\?id=([^&]+)/i;
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/i;

function toEmbedUrl(url) {
  if (!url) return null;
  let m = url.match(DRIVE_RE) || url.match(DRIVE_OPEN_RE);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  m = url.match(YT_RE);
  if (m) return `https://www.youtube.com/embed/${m[1]}?rel=0`;
  m = url.match(VIMEO_RE);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

function isVideoLink(link) {
  if (link.kind === 'video') return true;
  if (link.kind === 'link') return false;
  return toEmbedUrl(link.url) !== null;
}

export default function PreWeddingSection({ preWeddingLinks, sections }) {
  const [open, setOpen] = useState(null);
  if (!sections.pre_wedding) return null;
  const links = (preWeddingLinks || []).filter((l) => l && l.url);
  if (!links.length) return null;

  const videos = links.filter(isVideoLink);
  const others = links.filter((l) => !isVideoLink(l));
  const hero = videos[0];
  const heroEmbed = hero ? toEmbedUrl(hero.url) : null;
  const extraVideos = videos.slice(1);

  return (
    <section className="gi-section gi-section--wide" data-reveal>
      <p className="gi-eyebrow">Before the vows</p>
      <h2 className="gi-split-title gi-prewed-title">Our pre-wedding film</h2>

      {heroEmbed && (
        <div className="gi-prewed-embed">
          <iframe
            title={hero.label || 'Pre-wedding video'}
            src={heroEmbed}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}

      {extraVideos.length > 0 && (
        <div className="gi-prewed-grid" data-mj-stagger>
          {extraVideos.map((l, i) => (
            <button
              key={l.id || i}
              type="button"
              className="gi-prewed-thumb"
              data-reveal="scale"
              data-mj-lift
              onClick={() => setOpen(l)}
            >
              <span className="gi-prewed-play" aria-hidden="true">&#9658;</span>
              <span className="gi-prewed-label">{l.label || 'Watch'}</span>
            </button>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="gi-prewed-links">
          {others.map((l, i) => (
            <a key={l.id || i} href={l.url} target="_blank" rel="noreferrer" className="gi-prewed-link-card" data-mj-lift>
              {l.label || l.url}
            </a>
          ))}
        </div>
      )}

      {open && (
        <div className="gi-modal-backdrop" onClick={() => setOpen(null)}>
          <div className="px-glass-d gi-modal gi-modal--wide" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="gi-modal-close" onClick={() => setOpen(null)} aria-label="Close">&times;</button>
            {toEmbedUrl(open.url) ? (
              <div className="gi-prewed-embed">
                <iframe
                  title={open.label || 'Video'}
                  src={toEmbedUrl(open.url)}
                  allowFullScreen
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                />
              </div>
            ) : (
              <p className="mj-body">
                Couldn&rsquo;t preview this link. <a href={open.url} target="_blank" rel="noreferrer">Open it directly</a>.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
