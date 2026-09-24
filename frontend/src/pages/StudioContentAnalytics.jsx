// StudioContentAnalytics — /studio/pixora-analytics (C5). A photographer's content
// performance: reach, top posts/reels, tag reach, follower growth, best time to post,
// and what their audience also likes. All honest — aggregated from real activity.
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  BarChart3, Eye, Heart, MessageCircle, Bookmark, Share2, Users, Hash,
  Clock, Loader2, TrendingUp, ArrowLeft, Film, Camera,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const token = () => { try { return localStorage.getItem('admin_token'); } catch (_) { return null; } };
const cfg = () => ({ headers: { Authorization: `Bearer ${token()}` } });
const WINDOWS = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['all', 'All time']];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="lux-glass p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--lux-text-faint)' }}>
        <Icon className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} />{label}
      </div>
      <div className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{Number(value || 0).toLocaleString('en-IN')}</div>
    </div>
  );
}

function ContentRow({ p }) {
  return (
    <div className="flex items-center gap-3 py-2" data-testid={`analytics-row-${p.id}`}>
      {p.thumbnail ? (
        <img src={p.thumbnail} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
      ) : (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded" style={{ background: 'rgba(212,175,55,0.14)' }}>
          {p.kind === 'reel' ? <Film className="h-4 w-4" style={{ color: '#E8C97A' }} /> : <Camera className="h-4 w-4" style={{ color: '#E8C97A' }} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]" style={{ color: 'var(--lux-text)' }}>{p.title || (p.kind === 'reel' ? 'Reel' : 'Post')}</div>
        <div className="flex flex-wrap gap-x-3 text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
          <span>{p.views} views</span><span>{p.likes} likes</span><span>{p.saves} saves</span><span>{p.shares} shares</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm" style={{ color: '#E8C97A' }}>{p.engagement}</div>
        <div className="text-[9px] uppercase tracking-[0.12em]" style={{ color: 'var(--lux-text-faint)' }}>score</div>
      </div>
    </div>
  );
}

export default function StudioContentAnalytics() {
  const [window, setWindow] = useState('30d');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (!token()) { setErr('Sign in as a photographer to see your analytics.'); return; }
    setData(null); setErr('');
    axios.get(`${API_URL}/api/pixora/content-analytics`, { params: { window }, ...cfg() })
      .then(({ data: d }) => setData(d))
      .catch((e) => setErr(e?.response?.status === 401 ? 'Your session expired — sign in again.' : 'Could not load analytics.'));
  }, [window]);
  useEffect(() => { load(); }, [load]);

  const t = data?.totals || {};

  return (
    <div className="luxe min-h-screen" style={{ background: 'var(--lux-bg)' }} data-testid="studio-content-analytics">
      <div className="mx-auto max-w-4xl px-3 py-6 lg:px-6">
        <Link to="/studio/community" className="mb-3 inline-flex items-center gap-1.5 text-[12px] no-underline" style={{ color: 'var(--lux-text-muted)' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Pixora
        </Link>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" style={{ color: '#E8C97A' }} />
            <h1 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>Content analytics</h1>
          </div>
          <div className="flex gap-1.5">
            {WINDOWS.map(([k, label]) => (
              <button key={k} onClick={() => setWindow(k)} data-testid={`analytics-window-${k}`}
                className="rounded-lg px-2.5 py-1.5 text-[11px]"
                style={window === k ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06', fontWeight: 600 }
                  : { border: '1px solid var(--lux-border)', color: 'var(--lux-text-muted)' }}>{label}</button>
            ))}
          </div>
        </div>

        {err ? (
          <div className="lux-glass p-8 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>{err}</div>
        ) : !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: '#E8C97A' }} /></div>
        ) : (
          <div className="space-y-5">
            {/* headline stats */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <Stat icon={Eye} label="Views" value={t.views} />
              <Stat icon={Heart} label="Likes" value={t.likes} />
              <Stat icon={MessageCircle} label="Comments" value={t.comments} />
              <Stat icon={Bookmark} label="Saves" value={t.saves} />
              <Stat icon={Share2} label="Shares" value={t.shares} />
              <Stat icon={Users} label="Followers" value={data.total_followers} />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* top content */}
              <div className="lux-glass p-4">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--lux-text-faint)' }}>
                  <TrendingUp className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} /> Top content
                </div>
                {(data.top_content || []).length === 0 ? (
                  <p className="py-3 text-[13px]" style={{ color: 'var(--lux-text-faint)' }}>Post something to see performance here.</p>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--lux-border)' }}>
                    {data.top_content.map((p) => <ContentRow key={p.id} p={p} />)}
                  </div>
                )}
              </div>

              {/* tag reach + growth + best time */}
              <div className="space-y-5">
                <div className="lux-glass p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--lux-text-faint)' }}>
                    <Hash className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} /> Top tags by reach
                  </div>
                  {(data.top_tags || []).length === 0 ? (
                    <p className="text-[13px]" style={{ color: 'var(--lux-text-faint)' }}>Add #tags to your posts to grow reach.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {data.top_tags.map((tg) => (
                        <Link key={tg.tag} to={`/community/tag/${encodeURIComponent(tg.tag)}`}
                          className="rounded-full px-2 py-1 text-[11px] no-underline" style={{ background: 'rgba(124,58,237,0.14)', color: '#C4A6F5' }}>
                          #{tg.tag} · {tg.reach}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lux-glass p-4">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--lux-text-faint)' }}>
                    <Users className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} /> Follower growth
                  </div>
                  <div className="font-display text-2xl" style={{ color: '#7BD88F' }}>+{data.new_followers}</div>
                  <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>new followers this period</div>
                </div>

                <div className="lux-glass p-4">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--lux-text-faint)' }}>
                    <Clock className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} /> Best time to post
                  </div>
                  {data.best_time ? (
                    <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>
                      {DAYS[data.best_time.weekday]} · {String(data.best_time.hour).padStart(2, '0')}:00
                    </div>
                  ) : (
                    <p className="text-[13px]" style={{ color: 'var(--lux-text-faint)' }}>Not enough data yet — keep posting.</p>
                  )}
                </div>
              </div>
            </div>

            {/* audience topics */}
            {(data.audience_topics || []).length > 0 && (
              <div className="lux-glass p-4">
                <div className="mb-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--lux-text-faint)' }}>Your audience also likes</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.audience_topics.map((a) => (
                    <span key={a.topic} className="rounded-full px-2 py-1 text-[11px]" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>#{a.topic}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
