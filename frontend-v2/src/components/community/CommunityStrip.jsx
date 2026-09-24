import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '@/api/client';
import './communityStrip.css';

// Live community work on the marketing pages.
//
// The home page was entirely static — it imported no API module and fetched
// nothing — while /api/public/pixora/feed and /api/public/pixora/reels/feed
// were serving real photographers' work to two pages nobody lands on first.
// This puts that work where visitors actually arrive, and every card links
// back to the photographer who shot it, which is the whole point: the feed is
// how a studio's portfolio gets seen.
//
// IT RENDERS NOTHING WHEN THERE IS NOTHING. No skeletons left up forever, no
// "coming soon", no sample cards. An empty community on a young site is a fact,
// and inventing posts to fill the space would misrepresent the platform to the
// exact people deciding whether to join it.

const REEL_LIMIT = 6;
const POST_LIMIT = 6;

export default function CommunityStrip({
  title = 'From the studios on MAJA',
  sub = 'Real work, posted by the photographers who shot it.',
}) {
  const [reels, setReels] = useState([]);
  const [posts, setPosts] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | empty
  // Media that failed to load. A post can outlive its file — storage cleanup,
  // a moved bucket — and under Vite a missing image is not even a 404: the SPA
  // fallback answers 200 with index.html, so the <img> just renders empty. A
  // broken frame on the home page is worse than one fewer card, so a card whose
  // art fails is dropped rather than shown hollow.
  const [dead, setDead] = useState(() => new Set());
  const markDead = (id) => setDead((prev) => {
    if (prev.has(id)) return prev;
    const next = new Set(prev);
    next.add(id);
    return next;
  });

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      // The reels feed is a POST because it carries the viewer's local interest
      // vector; sending none is valid and yields the unpersonalised ranking.
      client.post('/api/public/pixora/reels/feed', { limit: REEL_LIMIT, interests: [] }),
      client.get('/api/public/pixora/feed', { params: { limit: POST_LIMIT * 2, kind: 'post' } }),
    ]).then(([r, p]) => {
      if (!live) return;
      const rs = r.status === 'fulfilled' ? (r.value.data?.reels || []) : [];
      const ps = p.status === 'fulfilled' ? (p.value.data?.posts || []) : [];
      // A post with no picture is fine in the feed itself but makes a poor
      // marketing tile, so the strip shows the ones that have one.
      const withArt = ps.filter((x) => x.image_url || (x.images || []).length).slice(0, POST_LIMIT);
      setReels(rs);
      setPosts(withArt);
      setState(rs.length || withArt.length ? 'ready' : 'empty');
    });
    return () => { live = false; };
  }, []);

  const liveReels = reels.filter((r) => !dead.has(r.id));
  const livePosts = posts.filter((p) => !dead.has(p.id));

  // Everything having failed is the same as there being nothing.
  if (state !== 'ready' || (liveReels.length === 0 && livePosts.length === 0)) return null;

  return (
    <section className="cstrip" aria-labelledby="cstrip-title">
      <div className="cstrip-inner">
        <header className="cstrip-head">
          <div>
            <p className="cstrip-eyebrow">Community</p>
            <h2 id="cstrip-title" className="cstrip-title">{title}</h2>
            <p className="cstrip-sub">{sub}</p>
          </div>
          <Link to="/community" className="cstrip-more" data-mj-link>
            See the whole feed &rarr;
          </Link>
        </header>

        {liveReels.length > 0 && (
          <>
            <div className="cstrip-rail" role="list" aria-label="Recent reels">
              {liveReels.map((r) => (
                <Link
                  key={r.id}
                  role="listitem"
                  to={`/community/reels?reel=${encodeURIComponent(r.id)}`}
                  className="cstrip-reel"
                >
                  <span className="cstrip-reel-art">
                    {/* A reel's poster frame is its image_url when it has one;
                        otherwise the video element paints its own first frame.
                        `preload="metadata"` keeps the home page from pulling
                        six full videos. */}
                    {r.image_url
                      ? <img src={r.image_url} alt="" loading="lazy" onError={() => markDead(r.id)} />
                      : <video src={r.video_url} muted playsInline preload="metadata" onError={() => markDead(r.id)} />}
                    <span className="cstrip-play" aria-hidden="true">▶</span>
                  </span>
                  <span className="cstrip-reel-meta">
                    <span className="cstrip-author">{r.author}</span>
                    {r.author_city && <span className="cstrip-city">{r.author_city}</span>}
                  </span>
                </Link>
              ))}
            </div>
            <Link to="/community/reels" className="cstrip-more cstrip-more--inline" data-mj-link>
              Watch all reels &rarr;
            </Link>
          </>
        )}

        {livePosts.length > 0 && (
          <div className="cstrip-grid">
            {livePosts.map((p) => {
              const src = p.image_url || (p.images || [])[0];
              return (
                <article key={p.id} className="cstrip-card">
                  <Link to={`/community?post=${encodeURIComponent(p.id)}`} className="cstrip-card-art">
                    <img src={src} alt={p.title || ''} loading="lazy" onError={() => markDead(p.id)} />
                  </Link>
                  <div className="cstrip-card-body">
                    {p.title && <h3 className="cstrip-card-title">{p.title}</h3>}
                    <p className="cstrip-card-meta">
                      {/* Straight to the photographer — the reason a studio
                          posts here at all. */}
                      <Link to={p.author_url || '/photographers'} data-mj-link className="cstrip-author-link">
                        {p.author}
                      </Link>
                      {p.location && <span className="cstrip-city"> · {p.location}</span>}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="cstrip-foot">
          Every photograph here belongs to the studio that posted it.{' '}
          <Link to="/photographers" data-mj-link>Browse photographers</Link>.
        </p>
      </div>
    </section>
  );
}
