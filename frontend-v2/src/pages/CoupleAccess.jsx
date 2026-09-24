import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CLIENT_LOGOUT_EVENT, clientApproveWish, clientDeleteWish, clientFeatureWish,
  clientLogin, clientLogout, clientOverview, clientWishes, getClientToken,
} from '@/lib/clientAuth';
import { getFull } from '@/api/invitations';
import { getWall } from '@/api/gallery';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import ClientAnalyticsPanel from '@/components/couple/ClientAnalyticsPanel';
import ClientRsvpPanel from '@/components/couple/ClientRsvpPanel';
import ClientContractsPanel from '@/components/couple/ClientContractsPanel';
import ClientProofingPanel from '@/components/couple/ClientProofingPanel';
import './CoupleAccess.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'rsvp', label: 'RSVP' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'proofs', label: 'Proofs' },
];

// Ported from "MAJA Couple Access Portal.dc.html". The prototype's gate mocked
// a slug+passcode pair; the real backend contract (photographer_clients.py)
// is a username/password login scoped to one invitation — the gate fields and
// copy are adapted to that, the visual language (px-night, glass card, petals)
// is kept exact.
function useViewport() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

function daysTo(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const diff = Math.ceil((target.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return diff;
}

export default function CoupleAccess() {
  const { slug: routeSlug } = useParams();
  const navigate = useNavigate();
  const vw = useViewport();
  const isMobile = vw < 760;
  const isTablet = vw >= 760 && vw < 1100;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gateError, setGateError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [overview, setOverview] = useState(null);
  const [dashError, setDashError] = useState(null);

  const [wishes, setWishes] = useState(null); // null = loading
  const [showAllWishes, setShowAllWishes] = useState(false);
  const [busyWish, setBusyWish] = useState(null);
  const [events, setEvents] = useState(null);
  const [shagun, setShagun] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [tab, setTab] = useState('overview');

  // Boot: an existing client_token confirms itself against /client/overview.
  useEffect(() => {
    let live = true;
    if (!getClientToken()) { setBooting(false); return; }
    clientOverview()
      .then(({ data }) => { if (live) { setOverview(data); setAuthed(true); } })
      .catch(() => { clientLogout(); })
      .finally(() => { if (live) setBooting(false); });
    return () => { live = false; };
  }, []);

  // The 7-day client token has no refresh flow — once any /api/client/* call
  // 401s, clientAuth.js clears the token and fires this event. Drop back to
  // the gate with an explanation instead of leaving a dead dashboard on screen.
  useEffect(() => {
    const onExpire = () => {
      setAuthed(false);
      setOverview(null);
      setWishes(null);
      setTab('overview');
      setGateError('Your access link expired. Ask your photographer for a new one.');
    };
    window.addEventListener(CLIENT_LOGOUT_EVENT, onExpire);
    return () => window.removeEventListener(CLIENT_LOGOUT_EVENT, onExpire);
  }, []);

  const loadDashboard = useCallback(async (slug) => {
    setDashError(null);
    const results = await Promise.allSettled([
      clientWishes(),
      getFull(slug),
      getWall(slug, { limit: 6 }),
    ]);
    const [wishesR, fullR, wallR] = results;
    setWishes(wishesR.status === 'fulfilled' ? wishesR.value.data.wishes : []);
    if (fullR.status === 'fulfilled') {
      setEvents(fullR.value.data.invite?.events || []);
      setShagun(fullR.value.data.shagun_enabled ? fullR.value.data.blessings : null);
    } else {
      setEvents([]);
      setShagun(null);
    }
    setGallery(wallR.status === 'fulfilled' ? wallR.value.data : { photos: [], total: 0 });
    if (results.every((r) => r.status === 'rejected')) {
      setDashError('Some details couldn’t load. Pull to refresh or try again shortly.');
    }
  }, []);

  useEffect(() => {
    if (authed && overview?.slug) loadDashboard(overview.slug);
  }, [authed, overview?.slug, loadDashboard]);

  const enter = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setGateError('Enter both your username and passcode.'); return; }
    setSigningIn(true);
    setGateError('');
    try {
      const data = await clientLogin(username.trim(), password);
      const { data: ov } = await clientOverview();
      setOverview(ov);
      setAuthed(true);
      if (data?.event?.slug) navigate(`/couple/access/${data.event.slug}`, { replace: true });
    } catch (err) {
      setGateError(err?.response?.data?.detail || 'That username and passcode don’t go together.');
    } finally {
      setSigningIn(false);
    }
  };

  const leave = () => {
    clientLogout();
    setAuthed(false);
    setOverview(null);
    setWishes(null);
    setPassword('');
    setTab('overview');
  };

  const reloadWishes = useCallback(async () => {
    const { data } = await clientWishes();
    setWishes(data.wishes || []);
  }, []);

  const wishAction = async (id, action) => {
    if (action === 'delete' && !window.confirm('Delete this wish? This can’t be undone.')) return;
    setBusyWish(id);
    try {
      if (action === 'delete') await clientDeleteWish(id);
      else if (action === 'feature') await clientFeatureWish(id);
      else await clientApproveWish(id);
      await reloadWishes();
    } catch (_e) { /* leave the list as-is, buttons stay clickable to retry */ }
    setBusyWish(null);
  };

  const h1Size = isMobile ? 'clamp(22px,6.4vw,26px)' : 'clamp(26px,2.6vw,30px)';
  const h2Size = isMobile ? 'clamp(20px,5.8vw,23px)' : 'clamp(24px,2.4vw,28px)';
  const statSize = isMobile ? 'clamp(21px,6vw,24px)' : 'clamp(24px,2.2vw,28px)';
  const cardPad = isMobile ? '22px 20px' : '26px 26px';

  if (booting) {
    return <div className="cap-page" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5 }}>Loading…</div>;
  }

  if (!authed) {
    return (
      <div className="cap-page" style={{ fontFamily: "'Inter',system-ui,sans-serif", minHeight: '100dvh' }}>
        <div className="cap-night" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '32px 18px' : '48px 24px' }}>
          <div aria-hidden="true" style={{ position: 'absolute', zIndex: -1, top: '-10%', left: 0, right: 0, margin: '0 auto', width: 'clamp(240px,64vw,560px)', height: 'clamp(240px,64vw,560px)', borderRadius: '50%', background: 'radial-gradient(circle,#e5a93c,transparent 70%)', filter: 'blur(60px)', opacity: .45, pointerEvents: 'none', animation: 'mjFloat 13s ease-in-out infinite' }} />
          <span aria-hidden="true" className="px-petal" style={{ left: '10%', animationDelay: '-2s' }} />
          <span aria-hidden="true" className="px-petal" style={{ left: '38%', width: 10, height: 14, opacity: .35, animationDuration: '18s', animationDelay: '-9s' }} />
          <span aria-hidden="true" className="px-petal" style={{ left: '69%', width: 14, height: 18, opacity: .45, animationDuration: '12s', animationDelay: '-5s' }} />
          <span aria-hidden="true" className="px-petal" style={{ left: '92%', animationDuration: '16s', animationDelay: '-11s' }} />
          <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center', marginBottom: 30 }}>
              <div style={{ width: 62, height: 62, borderRadius: 16, background: 'radial-gradient(circle at 35% 30%,#e5a93c,#b57f26 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}>
                <span style={{ fontFamily: "'Spectral',serif", fontSize: 22, color: '#190f33', fontWeight: 500 }}>M</span>
              </div>
              <h1 data-reveal="blur" style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: h1Size, margin: '0 0 12px' }}>Couple <span style={{ color: '#c4b5fd' }}>access</span></h1>
              <p data-reveal style={{ fontSize: 14.5, color: '#ddd6fe', lineHeight: 1.7, margin: 0 }}>The username and passcode your photographer gave you. No account to create.</p>
            </div>
            <form data-reveal="scale" className="cap-glass" onSubmit={enter} style={{ borderRadius: 20, padding: cardPad }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 8px' }}>Username</label>
              <input
                value={username}
                onChange={(e) => { setUsername(e.target.value); setGateError(''); }}
                placeholder="ananya-rohan-maja"
                autoComplete="username"
                style={{ width: '100%', minHeight: 48, padding: '0 15px', borderRadius: 14, border: '1px solid rgba(196,181,253,.28)', background: '#190f33', color: '#f2eefb', fontSize: 15, marginBottom: 18 }}
              />
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 8px' }}>Passcode</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setGateError(''); }}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ width: '100%', minHeight: 48, padding: '0 15px', borderRadius: 14, border: '1px solid rgba(196,181,253,.28)', background: '#190f33', color: '#f2eefb', fontSize: 15 }}
              />
              {gateError && <p className="cap-error">{gateError}</p>}
              <button type="submit" disabled={signingIn} className="cap-btn cap-btn-solid" style={{ width: '100%', minHeight: 48, borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 20 }}>
                {signingIn ? 'Entering…' : 'Enter'}
              </button>
            </form>
            <p data-reveal style={{ fontSize: 12.5, color: '#a78bfa', margin: '22px 0 0', textAlign: 'center', lineHeight: 1.7 }}>
              Forgotten the passcode? Ask your photographer, or write to <a href="mailto:majainvites@gmail.com" className="cap-link">majainvites@gmail.com</a>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const quick = overview.quick || {};
  const galleryInfo = overview.gallery || {};
  const stats = [
    { label: 'RSVPs in', value: quick.rsvp_attending ?? 0, note: `of ${quick.rsvp_total ?? 0} responded` },
    { label: 'Wishes', value: quick.wishes_total ?? 0, note: quick.wishes_pending ? `${quick.wishes_pending} pending` : 'All reviewed' },
    { label: 'Photographs', value: gallery ? gallery.total : galleryInfo.photo_count ?? 0, note: 'Updating live' },
    { label: 'Days to go', value: (() => { const d = daysTo(overview.event_date); return d === null ? '—' : Math.max(d, 0); })(), note: overview.event_date ? new Date(overview.event_date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '' },
  ];
  const wishList = wishes || [];
  const visibleWishes = showAllWishes ? wishList : wishList.slice(0, 5);
  const guestUploads = gallery ? gallery.photos.filter((p) => p.source === 'guest').length : 0;

  return (
    <div className="cap-page" style={{ fontFamily: "'Inter',system-ui,sans-serif", minHeight: '100dvh' }}>
      <header className="cap-ripple" style={{ position: 'relative', borderBottom: '1px solid rgba(196,181,253,.14)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 16px' : '22px 24px', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <p data-reveal style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 6px', fontWeight: 600 }}>Welcome back</p>
            <h1 data-reveal="blur" style={{ fontFamily: "'Spectral',serif", fontStyle: 'italic', fontWeight: 400, fontSize: h2Size, margin: 0 }}>{overview.couple}</h1>
          </div>
          <div data-reveal style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {overview.invite_path && (
              <a href={overview.invite_path} target="_blank" rel="noreferrer" className="cap-btn cap-btn-outline" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 20px', borderRadius: 14, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>View the invitation</a>
            )}
            <button onClick={leave} className="cap-btn cap-btn-outline" style={{ minHeight: 44, padding: '0 20px', borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Leave</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '22px 16px 70px' : '30px 24px 80px' }}>
        {dashError && (
          <div style={{ background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.34)', color: '#fca5a5', borderRadius: 14, padding: '12px 16px', fontSize: 13, marginBottom: 20 }}>{dashError}</div>
        )}

        <nav aria-label="Portal sections" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`cap-btn ${tab === t.id ? 'cap-btn-solid' : 'cap-btn-outline'}`}
              style={{ minHeight: 44, padding: '0 20px', borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'analytics' && <ClientAnalyticsPanel />}
        {tab === 'rsvp' && <ClientRsvpPanel />}
        {tab === 'contracts' && <ClientContractsPanel />}
        {tab === 'proofs' && <ClientProofingPanel />}

        {tab === 'overview' && (
        <>
        <div data-mj-stagger style={{ display: 'grid', gridTemplateColumns: vw < 900 ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 14, marginBottom: 26 }}>
          {stats.map((s) => (
            <div key={s.label} data-reveal className="cap-card cap-lift" style={{ padding: isMobile ? 18 : '22px 24px' }}>
              <p style={{ fontSize: 11.5, color: '#c4b5fd', margin: '0 0 10px' }}>{s.label}</p>
              <p style={{ fontFamily: "'Spectral',serif", fontSize: statSize, margin: '0 0 5px' }}>{s.value}</p>
              <p style={{ fontSize: 12, color: '#c4b5fd', margin: 0 }}>{s.note}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '1.15fr .95fr', gap: isMobile ? 16 : 20, alignItems: 'start' }}>
          <div data-reveal className="cap-card" style={{ padding: cardPad }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 18, margin: 0 }}>Latest wishes</h2>
              <span style={{ fontSize: 12.5, color: '#c4b5fd' }}>{wishes === null ? '…' : `${wishList.length} in total`}</span>
            </div>
            {wishes === null ? (
              <p style={{ fontSize: 13.5, color: '#c4b5fd', margin: 0 }}>Loading wishes…</p>
            ) : wishList.length === 0 ? (
              <p style={{ fontSize: 13.5, color: '#c4b5fd', margin: 0 }}>No wishes yet — they’ll show up here as guests leave them.</p>
            ) : (
              <div data-mj-stagger style={{ display: 'flex', flexDirection: 'column' }}>
                {visibleWishes.map((w) => (
                  <div key={w.id} data-reveal style={{ padding: '16px 0', borderBottom: '1px solid rgba(196,181,253,.14)' }}>
                    <p style={{ fontFamily: "'Spectral',serif", fontStyle: 'italic', fontSize: 15, lineHeight: 1.65, color: '#ede9fe', margin: '0 0 8px' }}>&ldquo;{w.message}&rdquo;</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <p style={{ fontSize: 12.5, color: '#c4b5fd', margin: 0 }}>
                        {w.guest_name}{w.relationship ? ` · ${w.relationship}` : ''}
                        {w.status === 'pending' && <span style={{ marginLeft: 8, fontSize: 11, color: '#e5a93c' }}>· pending</span>}
                        {w.is_featured && <span style={{ marginLeft: 8, fontSize: 11, color: '#e5a93c' }}>· featured</span>}
                      </p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {w.status !== 'approved' && (
                          <button type="button" disabled={busyWish === w.id} onClick={() => wishAction(w.id, 'approve')} aria-label="Approve this wish" className="cap-btn cap-btn-outline" style={{ minHeight: 32, padding: '0 12px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Approve</button>
                        )}
                        <button type="button" disabled={busyWish === w.id} onClick={() => wishAction(w.id, 'feature')} aria-label={w.is_featured ? 'Unfeature this wish' : 'Feature this wish'} className="cap-btn cap-btn-outline" style={{ minHeight: 32, padding: '0 12px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{w.is_featured ? 'Unfeature' : 'Feature'}</button>
                        <button type="button" disabled={busyWish === w.id} onClick={() => wishAction(w.id, 'delete')} aria-label="Delete this wish" className="cap-btn cap-btn-outline" style={{ minHeight: 32, padding: '0 12px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderColor: 'rgba(248,113,113,.4)', color: '#fca5a5' }}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {wishList.length > 5 && (
              <button onClick={() => setShowAllWishes((v) => !v)} className="cap-btn cap-btn-outline" style={{ width: '100%', minHeight: 48, marginTop: 20, borderRadius: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                {showAllWishes ? 'Show fewer' : `Read all ${wishList.length} wishes`}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div data-reveal className="cap-card" style={{ padding: cardPad }}>
              <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 18, margin: '0 0 18px' }}>Your events</h2>
              {events === null ? (
                <p style={{ fontSize: 13.5, color: '#c4b5fd', margin: 0 }}>Loading…</p>
              ) : events.length === 0 ? (
                <p style={{ fontSize: 13.5, color: '#c4b5fd', margin: 0 }}>No events added yet.</p>
              ) : (
                <div data-mj-stagger style={{ display: 'flex', flexDirection: 'column' }}>
                  {events.map((e) => (
                    <div key={e.event_id} data-reveal className="cap-lift" style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(196,181,253,.14)' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 3px' }}>{e.name}</p>
                        <p style={{ fontSize: 12.5, color: '#c4b5fd', margin: 0 }}>{e.venue_name}</p>
                      </div>
                      <span style={{ fontSize: 12.5, color: '#ddd6fe', whiteSpace: 'nowrap', textAlign: 'right' }}>{e.date}{e.start_time ? `, ${e.start_time}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div data-reveal className="cap-card" style={{ padding: cardPad }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 18, margin: 0 }}>Photographs</h2>
                {galleryInfo.live_gallery_path && (
                  <a href={galleryInfo.live_gallery_path} className="cap-link" style={{ fontSize: 12.5, minHeight: 44, display: 'inline-flex', alignItems: 'center', color: '#c4b5fd' }}>Open the wall &rarr;</a>
                )}
              </div>
              {gallery === null ? (
                <p style={{ fontSize: 12.5, color: '#c4b5fd', margin: 0 }}>Loading…</p>
              ) : gallery.photos.length === 0 ? (
                <p style={{ fontSize: 12.5, color: '#c4b5fd', margin: 0 }}>No photographs uploaded yet.</p>
              ) : (
                <>
                  <div data-mj-stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
                    {gallery.photos.slice(0, 6).map((p) => (
                      <img key={p.id} src={resolveMediaUrl(p.thumb_url)} alt="" data-reveal="scale" className="cap-lift" style={{ aspectRatio: '1', borderRadius: 16, objectFit: 'cover', width: '100%' }} loading="lazy" />
                    ))}
                  </div>
                  <p style={{ fontSize: 12.5, color: '#c4b5fd', margin: 0, lineHeight: 1.6 }}>{gallery.total} photograph{gallery.total === 1 ? '' : 's'}, {guestUploads} of them added by guests.</p>
                </>
              )}
            </div>

            <div data-reveal style={{ background: '#6d28d9', border: '1px solid rgba(196,181,253,.18)', borderRadius: 20, padding: cardPad, position: 'relative', overflow: 'hidden', isolation: 'isolate' }}>
              <div aria-hidden="true" style={{ position: 'absolute', zIndex: -1, top: '-40%', right: '-30%', width: 'clamp(160px,50vw,300px)', height: 'clamp(160px,50vw,300px)', borderRadius: '50%', background: 'radial-gradient(circle,#e5a93c,transparent 70%)', filter: 'blur(60px)', opacity: .4, pointerEvents: 'none', animation: 'mjFloat 11s ease-in-out infinite' }} />
              <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 18, margin: '0 0 16px' }}>Shagun received</h2>
              {shagun ? (
                <>
                  <p style={{ fontFamily: "'Spectral',serif", fontSize: statSize, margin: '0 0 6px' }}>&#8377;{(shagun.blessing_total_amount || 0).toLocaleString('en-IN')}</p>
                  <p style={{ fontSize: 12.5, color: '#ede9fe', margin: 0 }}>From {shagun.blessing_count || 0} guest{shagun.blessing_count === 1 ? '' : 's'}</p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: '#ede9fe', margin: 0, lineHeight: 1.6 }}>Digital shagun isn&rsquo;t turned on for this invitation.</p>
              )}
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
