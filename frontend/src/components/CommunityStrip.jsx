/**
 * CommunityStrip — photographers and their latest work, on the home page.
 *
 * The owner asked for the community's faces to be visible from the front page:
 * each photographer's name and profile photo, tappable through to their profile
 * (posts · reels · portfolio). Reads the public feed, which already carries the
 * byline (`author`, `author_avatar`, `author_city`, `author_url`) — so this adds
 * no new backend and no new source of truth.
 *
 * Renders NOTHING when the feed is empty or unreachable, so the home page is
 * unchanged until photographers actually post.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Sparkles, Play } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function CommunityStrip({ limit = 8 }) {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/api/public/pixora/feed`, { params: { limit: 24 } })
      .then(({ data }) => { if (alive) setPosts(data.posts || []); })
      .catch(() => { if (alive) setPosts([]); });
    return () => { alive = false; };
  }, []);

  if (!posts || posts.length === 0) return null;

  // One card per photographer (their most recent post), so the strip shows the
  // community's people rather than one prolific studio eight times over.
  const seen = new Set();
  const cards = [];
  for (const p of posts) {
    if (seen.has(p.studio_id)) continue;
    seen.add(p.studio_id);
    cards.push(p);
    if (cards.length >= limit) break;
  }

  return (
    <section className="relative z-10 px-6 py-20 md:px-16" data-testid="home-community-strip">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="lux-eyebrow mb-2 block">◆ From our photographers</span>
            <h2 className="font-display text-3xl md:text-4xl" style={{ color: 'var(--lux-text)' }}>
              The people behind the lens.
            </h2>
            <p className="mt-2 max-w-xl text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              Real work from the studios on MAJA. Tap a name to see their posts, reels and portfolio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/community/reels" className="lux-btn inline-flex items-center gap-2 text-[11px]"
              data-testid="home-community-reels">
              <Play className="h-3.5 w-3.5" /> Watch reels
            </Link>
            <Link to="/community" className="lux-btn lux-btn-ghost inline-flex items-center gap-2 text-[11px]"
              data-testid="home-community-all">
              <Sparkles className="h-3.5 w-3.5" /> Open community
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {cards.map((p) => {
            const isReel = p.kind === 'reel' || !!p.video_url;
            const initials = (p.author || '?').trim().charAt(0).toUpperCase();
            // A reel opens the full-screen player pinned to itself; a photo opens the
            // photographer's profile (posts · reels · portfolio).
            const target = isReel ? `/community/reels?start=${encodeURIComponent(p.id)}` : (p.author_url || '/community');
            return (
              <Link key={p.id} to={target}
                className="lux-glass overflow-hidden no-underline transition-transform"
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-4px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                data-testid={`home-community-card-${p.studio_id}`}>
                <div className="relative" style={{ aspectRatio: '1 / 1', background: 'var(--lux-panel)' }}>
                  {p.image_url ? (
                    <img src={p.image_url} alt="" loading="lazy" decoding="async"
                      className="h-full w-full object-cover" />
                  ) : p.video_url ? (
                    // A reel usually has no cover image. `preload="metadata"` pulls
                    // just the first frame as the thumbnail — muted + no controls so
                    // the whole card stays a single tap target to the profile.
                    <video src={p.video_url} muted playsInline preload="metadata"
                      className="h-full w-full bg-black object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <Sparkles className="h-6 w-6" style={{ color: 'rgba(212,175,55,0.5)' }} />
                    </div>
                  )}
                  {isReel && (
                    <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full"
                      style={{ background: 'rgba(10,7,4,0.65)' }}>
                      <Play className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 p-3">
                  {p.author_avatar ? (
                    <img src={p.author_avatar} alt="" loading="lazy"
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                      style={{ border: '1px solid rgba(212,175,55,0.5)' }} />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs"
                      style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A', border: '1px solid rgba(212,175,55,0.4)' }}>
                      {initials}
                    </span>
                  )}
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm" style={{ color: 'var(--lux-text)' }}>{p.author}</span>
                    {p.author_city && (
                      <span className="block truncate text-[11px] capitalize" style={{ color: 'var(--lux-text-faint)' }}>
                        {p.author_city}
                      </span>
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
