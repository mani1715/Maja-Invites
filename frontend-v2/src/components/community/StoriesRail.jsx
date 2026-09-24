import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as catalog from '@/api/publicCatalog';
import './storiesRail.css';

// Studio stories on the public community page.
//
// GET /api/public/pixora/stories groups every unexpired story by studio and
// attaches that studio's name, avatar, city and profile URL. It had no reader
// at all, so photographers posting stories were posting into a surface no
// visitor could see.
//
// Opening a story is a viewer, not a link-out: a story is a full-bleed image or
// a short text card, and it belongs over the page rather than on a route of its
// own. The studio name inside the viewer is the link out to their profile.

export default function StoriesRail() {
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(null);   // { group, index }

  useEffect(() => {
    let live = true;
    catalog.stories()
      .then(({ data }) => {
        if (!live) return;
        // A group with no stories left (all expired) must not render a tile
        // that opens onto nothing.
        setGroups((data.groups || []).filter((g) => (g.stories || []).length));
      })
      .catch(() => setGroups([]));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const step = (dir) => {
    setOpen((cur) => {
      if (!cur) return cur;
      const next = cur.index + dir;
      if (next < 0) return cur;
      if (next >= cur.group.stories.length) return null;   // past the end: close
      return { ...cur, index: next };
    });
  };

  if (!groups.length) return null;

  const story = open ? open.group.stories[open.index] : null;

  return (
    <>
      <div className="srail" role="list" aria-label="Studio stories">
        {groups.map((g) => (
          <button
            key={g.studio_id}
            type="button"
            role="listitem"
            className="srail-item"
            onClick={() => setOpen({ group: g, index: 0 })}
          >
            <span className="srail-ring">
              <span className="srail-av">
                {g.avatar
                  ? <img src={g.avatar} alt="" loading="lazy" />
                  : <span className="srail-initial">{(g.name || '?').slice(0, 1)}</span>}
              </span>
            </span>
            <span className="srail-name">{g.name}</span>
            <span className="srail-count">{g.stories.length}</span>
          </button>
        ))}
      </div>

      {open && story && (
        <div
          className="srail-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`Stories from ${open.group.name}`}
          onClick={() => setOpen(null)}
        >
          <div className="srail-stage" onClick={(e) => e.stopPropagation()}>
            <div className="srail-progress" aria-hidden="true">
              {open.group.stories.map((s, i) => (
                <span key={s.id} className={i <= open.index ? 'is-on' : ''} />
              ))}
            </div>

            <header className="srail-head">
              <Link to={open.group.url || '/photographers'} className="srail-author">
                {open.group.name}
              </Link>
              {open.group.city && <span className="srail-city">{open.group.city}</span>}
              <button type="button" className="srail-close" onClick={() => setOpen(null)} aria-label="Close">×</button>
            </header>

            <div className="srail-body">
              {/* A story is `type: image | video | text`. A text story has no
                  url, so rendering an <img> for it would be a broken frame. */}
              {story.type === 'video' && story.url && (
                <video src={story.url} controls autoPlay playsInline className="srail-media" />
              )}
              {story.type !== 'video' && story.url && (
                <img src={story.url} alt={story.caption || ''} className="srail-media" />
              )}
              {!story.url && (
                <p className="srail-text">{story.caption || 'No caption'}</p>
              )}
              {story.url && story.caption && <p className="srail-caption">{story.caption}</p>}
            </div>

            <button type="button" className="srail-nav srail-nav--prev"
                    onClick={() => step(-1)} disabled={open.index === 0} aria-label="Previous">‹</button>
            <button type="button" className="srail-nav srail-nav--next"
                    onClick={() => step(1)} aria-label="Next">›</button>
          </div>
        </div>
      )}
    </>
  );
}
