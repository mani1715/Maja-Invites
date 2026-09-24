import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import WeddingToolbar from '@/components/nav/WeddingToolbar';
import * as studioApi from '@/api/studio';
import './StudioWeddingDetail.css';

// Ported from "MAJA Studio Wedding Detail.dc.html".
function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

const numberFmt = new Intl.NumberFormat('en-IN');

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function StudioWeddingDetail() {
  const { id } = useParams();
  const vw = useViewportWidth();
  const isMobile = vw < 900;

  const [profile, setProfile] = useState(null);
  const [quickStats, setQuickStats] = useState(null);
  const [rsvps, setRsvps] = useState(null);
  const [wishes, setWishes] = useState(null);
  const [galleryStats, setGalleryStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      studioApi.getProfile(id),
      studioApi.quickStats(id),
      studioApi.listRsvps(id),
      studioApi.listWishes(id),
      studioApi.galleryStats(id),
    ]).then(([p, qs, rs, ws, gs]) => {
      setProfile(p.data);
      setQuickStats(qs.data);
      setRsvps(rs.data);
      setWishes(ws.data);
      setGalleryStats(gs.data);
    }).catch((e) => setError(e?.response?.data?.detail || 'Could not load this wedding.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const copyLink = () => {
    // Canonical invite path from the backend (/invite/00001/<name>); slug fallback.
    const path = profile.invitation_link || `/invite/${profile.slug}`;
    const url = `${window.location.origin}${path}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setToast('Invitation link copied to clipboard.');
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => { setToast(''); setCopied(false); }, 2600);
    }).catch(() => setToast('Could not copy — copy it manually.'));
  };

  const pagePad = vw < 400 ? '22px 14px 44px' : (isMobile ? '24px 18px 48px' : (vw < 1200 ? '32px 28px 52px' : '40px 40px 56px'));
  const cardPadX = isMobile ? '18px' : '24px';
  const kpiCols = vw < 400 ? 'minmax(0,1fr)' : (isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(190px,1fr))');
  const bodyCols = vw < 1024 ? 'minmax(0,1fr)' : (vw < 1280 ? 'minmax(0,1fr) 300px' : 'minmax(0,1fr) 330px');
  const shellCols = isMobile ? '1fr' : (vw < 1200 ? '76px minmax(0,1fr)' : '250px minmax(0,1fr)');

  const names = profile ? [profile.bride_name, profile.groom_name].filter(Boolean).join(' & ') : '';
  const coupleLine = profile?.event_date
    ? `${new Date(profile.event_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}${profile.city ? ` · ${profile.city}` : ''}`
    : '';

  const attending = rsvps ? rsvps.filter((r) => r.status === 'yes').length : 0;
  const declined = rsvps ? rsvps.filter((r) => r.status === 'no').length : 0;

  const activity = (() => {
    if (!rsvps || !wishes) return [];
    const rsvpItems = rsvps.slice(0, 5).map((r) => ({
      key: `rsvp-${r.id}`, at: r.created_at,
      text: `${r.guest_name || 'A guest'} RSVP'd ${r.status === 'yes' ? 'yes' : r.status === 'no' ? 'no' : 'maybe'}${r.guest_count > 1 ? ` for ${r.guest_count}` : ''}.`,
      dot: r.status === 'yes' ? '#a78bfa' : '#f59e0b',
    }));
    const wishItems = (wishes.wishes || []).slice(0, 5).map((w) => ({
      key: `wish-${w.id}`, at: w.created_at,
      text: `${w.author_name || 'A guest'} left a wish.`,
      dot: '#a78bfa',
    }));
    return [...rsvpItems, ...wishItems].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);
  })();

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <MobileNav panel="studio" active="Weddings" />
      <div style={{
        background: 'radial-gradient(68% 42% at 10% -5%,rgba(124,58,237,.13),transparent 62%),radial-gradient(52% 38% at 97% 3%,rgba(167,139,250,.14),transparent 66%),#ffffff',
        color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols,
      }}>
        {!isMobile && <StudioNav active="Weddings" />}

        <main id="main-content" className="stwd-main" style={{ padding: pagePad, minWidth: 0 }}>
          <WeddingToolbar weddingId={id} active="Overview" title={names || 'Wedding'} coupleLine={coupleLine}
            slug={profile?.slug} status={profile?.status === 'PUBLISHED' || profile?.is_published ? 'Published' : 'Draft'} />

          {loading && <DetailSkeleton kpiCols={kpiCols} bodyCols={bodyCols} />}

          {!loading && error && (
            <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '56px 24px' }}>
              <p style={{ fontFamily: "'Spectral',serif", fontSize: 18, margin: '0 0 8px' }}>Couldn&rsquo;t load this wedding.</p>
              <p style={{ fontSize: 13.5, color: '#dc2626', margin: '0 0 18px' }}>{error}</p>
              <button type="button" onClick={load} className="stwd-btn" style={{ background: '#6d28d9', color: '#fff', border: 'none', padding: '0 22px', minHeight: 44, borderRadius: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
            </div>
          )}

          {!loading && !error && profile && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: 14, marginBottom: 28 }}>
                <KpiTile label="Invitation views" value={numberFmt.format(quickStats?.views || 0)} delta={`${numberFmt.format(quickStats?.unique_visitors || 0)} unique visitors`} deltaColor="#6b7280" delay="0s" />
                <KpiTile label="RSVPs in" value={numberFmt.format(quickStats?.rsvps ?? (rsvps?.length || 0))} delta={`${attending} yes · ${declined} no`} deltaColor="#047857" delay=".08s" />
                <KpiTile label="Wishes" value={numberFmt.format(wishes?.counts?.approved || 0)} delta={`${wishes?.counts?.pending || 0} pending review`} deltaColor={(wishes?.counts?.pending || 0) > 0 ? '#f59e0b' : '#6b7280'} delay=".16s" />
                <KpiTile label="Gallery photos" value={numberFmt.format(galleryStats?.total_photos || 0)} delta={galleryStats?.enabled ? `${numberFmt.format(galleryStats?.photos_with_faces || 0)} face-matched` : 'AI gallery not enabled'} deltaColor="#6b7280" delay=".24s" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: bodyCols, gap: 20, alignItems: 'start' }}>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

                  <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, overflow: 'hidden' }}>
                    <div style={{ padding: `20px ${cardPadX} 14px`, borderBottom: '1px solid #e5e7eb' }}>
                      <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 18, margin: '0 0 3px' }}><span>Events in this </span><span className="stwd-hl">wedding</span></h2>
                      <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Each event has its own page, timing and guest list inside the invitation.</p>
                    </div>
                    {(profile.events || []).length === 0 && (
                      <p style={{ padding: `16px ${cardPadX}`, fontSize: 13.5, color: '#6b7280', margin: 0 }}>No events added yet.</p>
                    )}
                    {(profile.events || []).map((e) => (
                      <div key={e.event_id} className="stwd-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: `16px ${cardPadX}`, borderBottom: '1px solid #e5e7eb' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 3px' }}>{e.name}</p>
                          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{e.date}{e.start_time ? `, ${e.start_time}` : ''} &middot; {e.venue_name || 'Venue TBD'}</p>
                        </div>
                        <span style={{ justifySelf: 'end', fontSize: 12, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 999, background: e.enabled ? '#ddd6fe' : '#ede9fe', color: e.enabled ? '#6d28d9' : '#4b5563', whiteSpace: 'nowrap' }}>{e.enabled ? 'Live' : 'Draft'}</span>
                      </div>
                    ))}
                    <div style={{ padding: `16px ${cardPadX}` }}>
                      <a href={profile.invitation_link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 46, padding: '0 20px', border: '1px solid #6d28d9', borderRadius: 14, background: '#ffffff', color: '#6d28d9', fontSize: 14, fontWeight: 600, textDecoration: 'none' }} className="stwd-btn stwd-btn-outline">View live invitation</a>
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: `22px ${cardPadX}` }}>
                    <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 18, margin: '0 0 16px' }}><span>Recent </span><span className="stwd-hl">activity</span></h2>
                    {activity.length === 0 && <p style={{ fontSize: 13.5, color: '#6b7280', margin: 0 }}>No RSVPs or wishes yet.</p>}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {activity.map((a) => (
                        <div key={a.key} className="stwd-row" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '13px 0', borderTop: '1px solid #e5e7eb' }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: a.dot, marginTop: 6, flex: 'none' }} />
                          <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.5, color: '#111827' }}>{a.text}</p>
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{timeAgo(a.at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="stwd-card" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderTop: '3px solid #a78bfa', borderRadius: 20, padding: 22 }}>
                    <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 16, margin: '0 0 4px' }}>Invitation link</h3>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>Share this with the couple. Guests never need an account.</p>
                    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '12px 14px', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, color: '#6b7280', wordBreak: 'break-all', marginBottom: 12 }}>{window.location.host}{profile.invitation_link || `/invite/${profile.slug}`}</div>
                    <button type="button" onClick={copyLink} className="stwd-btn" style={{ width: '100%', minHeight: 46, padding: '0 20px', border: 'none', borderRadius: 14, background: '#6d28d9', color: '#ffffff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}>
                      {copied ? 'Link copied' : 'Copy invitation link'}
                    </button>
                  </div>

                  <div className="stwd-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 22 }}>
                    <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 16, margin: '0 0 14px' }}>Wedding details</h3>
                    {[
                      ['Event type', profile.event_type || '—'],
                      ['Language', (profile.enabled_languages || profile.language || []).join(', ') || '—'],
                      ['Venue', profile.venue || '—'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 0', borderBottom: '1px solid #e5e7eb', fontSize: 13.5, gap: 12 }}>
                        <span style={{ color: '#6b7280', flex: 'none' }}>{label}</span>
                        <span style={{ textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                      </div>
                    ))}
                    <a className="stwd-link" href={`/studio/profile/${id}/gallery`} style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: '#6d28d9' }}>Open AI gallery &rarr;</a>
                  </div>

                  <div className="stwd-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 22 }}>
                    <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 16, margin: '0 0 12px' }}>Couple access</h3>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px', lineHeight: 1.6 }}>The couple signs in separately, scoped to their own invitation.</p>
                    <a href="/couple/access" data-mj-link className="stwd-btn stwd-btn-outline" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 46, padding: '0 20px', border: '1px solid #6d28d9', borderRadius: 14, background: '#ffffff', color: '#6d28d9', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Open couple access</a>
                  </div>
                </div>
              </div>
            </>
          )}

          <div style={{ display: toast ? 'flex' : 'none', position: 'fixed', left: 0, right: 0, bottom: 26, justifyContent: 'center', pointerEvents: 'none', zIndex: 80 }}>
            <div className="stwd-toast" style={{ background: '#2e1065', color: '#ffffff', fontSize: 13, padding: '12px 20px', borderRadius: 14, boxShadow: '0 18px 40px rgba(109,40,217,.30)' }}>{toast}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

function KpiTile({ label, value, delta, deltaColor, delay }) {
  return (
    <div className="stwd-tile stwd-tint" style={{ borderRadius: 20, padding: '20px 22px', animation: 'stwdRise .5s cubic-bezier(.22,.61,.36,1) backwards', animationDelay: delay }}>
      <p style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 10px' }}>{label}</p>
      <p style={{ fontFamily: "'Spectral',serif", fontSize: 'clamp(24px,5.6vw,28px)', margin: '0 0 4px', lineHeight: 1, color: '#2e1065' }}>{value}</p>
      <p style={{ fontSize: 13, color: deltaColor, margin: 0 }}>{delta}</p>
    </div>
  );
}

function DetailSkeleton({ kpiCols, bodyCols }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: 14, marginBottom: 28 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stwd-skel" style={{ borderRadius: 20, height: 96 }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: bodyCols, gap: 20 }}>
        <div className="stwd-skel" style={{ borderRadius: 20, height: 320 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="stwd-skel" style={{ borderRadius: 20, height: 180 }} />
          <div className="stwd-skel" style={{ borderRadius: 20, height: 160 }} />
        </div>
      </div>
    </>
  );
}
