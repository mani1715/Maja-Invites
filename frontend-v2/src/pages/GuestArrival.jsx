import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBySlug, checkIn, roomLookup } from '@/api/invitations';
import './GuestArrival.css';

// Ported from "MAJA Guest Arrival.dc.html". The "Know your room" tab's fake
// hardcoded room/hotel is replaced with the real GET /invite/{slug}/room-lookup
// search; "Check in" posts to the real POST /invite/{slug}/check-in (no table
// number in the response — the confirmation screen doesn't invent one). The
// Welcome tab's voice-note player has no backing audio asset or endpoint in
// this lane's contract, so it stays as static onboarding chrome (no data is
// claimed or faked), same as marketing copy elsewhere in the app.
function useViewport() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

export default function GuestArrival() {
  const { slug } = useParams();
  const vw = useViewport();
  const isPhone = vw < 640;
  const isMobile = vw < 760;

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [screen, setScreen] = useState('Welcome');

  const [playing, setPlaying] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const [ciName, setCiName] = useState('');
  const [ciPhone, setCiPhone] = useState('');
  const [party, setParty] = useState('2');
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(null); // response payload on success
  const [ciError, setCiError] = useState('');

  const [roomQuery, setRoomQuery] = useState('');
  const [roomState, setRoomState] = useState(null); // 'found' | 'missing' | 'error' | null
  const [roomMatches, setRoomMatches] = useState([]);
  const [roomBusy, setRoomBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getBySlug(slug)
      .then(({ data }) => { if (live) setProfile(data); })
      .catch((e) => { if (live) setProfileError(e?.response?.data?.detail || 'This invitation link could not be found.'); });
    return () => { live = false; };
  }, [slug]);

  const sections = profile?.sections_enabled || {};
  const checkInEnabled = !profile || sections.check_in !== false;
  const roomsEnabled = !profile || sections.guest_rooms !== false;

  const submitCheckIn = async (e) => {
    e.preventDefault();
    if (!ciName.trim() || !ciPhone.trim()) { setCiError('Name and phone are needed.'); return; }
    setCheckingIn(true);
    setCiError('');
    try {
      const { data } = await checkIn(slug, { guest_name: ciName.trim(), guest_phone: ciPhone.trim(), note: `Party of ${party}` });
      setCheckedIn(data);
    } catch (e) {
      setCiError(e?.response?.data?.detail || 'Could not check you in right now — please try again.');
    } finally {
      setCheckingIn(false);
    }
  };

  const resetCheckIn = () => { setCheckedIn(null); setCiName(''); setCiPhone(''); };

  const findRoom = async (e) => {
    e.preventDefault();
    const q = roomQuery.trim();
    if (q.length < 2) { setRoomState('missing'); setRoomMatches([]); return; }
    setRoomBusy(true);
    try {
      const { data } = await roomLookup(slug, q);
      setRoomMatches(data.matches || []);
      setRoomState(data.matches && data.matches.length ? 'found' : 'missing');
    } catch (_e) {
      setRoomState('error');
      setRoomMatches([]);
    } finally {
      setRoomBusy(false);
    }
  };

  const navPad = isPhone ? '10px 14px' : isMobile ? '12px 16px' : '16px 24px';
  const mainPad = isPhone ? '32px 18px 56px' : isMobile ? '40px 28px 64px' : '56px 32px 80px';
  const cardPad = isPhone ? '20px 18px' : isMobile ? '22px 20px' : '28px 30px';
  const h1Size = isMobile ? 'clamp(26px,8vw,32px)' : 'clamp(34px,3.6vw,42px)';
  const h2Size = isMobile ? 'clamp(22px,6.6vw,26px)' : 'clamp(27px,2.8vw,32px)';

  const SCREENS = ['Welcome', ...(checkInEnabled ? ['Check in'] : []), ...(roomsEnabled ? ['Know your room'] : [])];

  const coupleFirstName = profile?.bride_name?.split(' ')[0] || profile?.groom_name?.split(' ')[0] || 'there';

  return (
    <div className="ga-page" style={{ fontFamily: "'Inter',system-ui,sans-serif", minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <nav className="ga-glass ga-nav" style={{ padding: navPad, borderWidth: '0 0 1px' }}>
        {SCREENS.map((label) => {
          const on = screen === label;
          return (
            <button
              key={label}
              onClick={() => setScreen(label)}
              className="ga-btn"
              style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, border: `1px solid ${on ? '#6d28d9' : 'rgba(196,181,253,.28)'}`, background: on ? '#6d28d9' : 'transparent', color: on ? '#ffffff' : '#ddd6fe', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none' }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      <main id="main-content" className="ga-night" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: mainPad }}>
        <div aria-hidden="true" style={{ position: 'absolute', zIndex: -1, top: '-12%', left: 0, right: 0, margin: '0 auto', width: 'clamp(240px,60vw,540px)', height: 'clamp(240px,60vw,540px)', borderRadius: '50%', background: 'radial-gradient(circle,#e5a93c,transparent 70%)', filter: 'blur(60px)', opacity: .28, pointerEvents: 'none', animation: 'mjFloat 13s ease-in-out infinite' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '8%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '41%', width: 10, height: 14, opacity: .35, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '73%', width: 14, height: 18, opacity: .45, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '93%', animationDuration: '16s', animationDelay: '-11s' }} />
        {profileError ? (
          <div className="ga-card" style={{ padding: cardPad, textAlign: 'center', maxWidth: 420, position: 'relative', zIndex: 1 }}>
            <p style={{ fontFamily: "'Spectral',serif", fontSize: 19, margin: '0 0 10px' }}>Can&rsquo;t open this page.</p>
            <p style={{ fontSize: 14, color: '#ddd6fe', margin: 0 }}>{profileError}</p>
          </div>
        ) : (
          <>
            {screen === 'Welcome' && (
              <div style={{ maxWidth: 520, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <p data-reveal style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#c4b5fd', margin: '0 0 22px', fontWeight: 600 }}>A note for you <span style={{ color: '#e5a93c' }}>&#10022;</span></p>
                <h1 data-reveal="blur" style={{ fontFamily: "'Spectral',serif", fontStyle: 'italic', fontWeight: 400, fontSize: h1Size, margin: '0 0 18px', lineHeight: 1.2 }}>{coupleFirstName}, <span style={{ color: '#c4b5fd' }}>you&rsquo;re here.</span></h1>
                <p data-reveal style={{ fontSize: 15.5, color: '#ddd6fe', lineHeight: 1.75, margin: '0 0 34px' }}>Welcome to the celebration. When you&rsquo;re ready, the full invitation is one tap away.</p>

                <div data-reveal="scale" className="ga-glass ga-lift" style={{ borderRadius: 20, padding: cardPad, marginBottom: 26 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                    <button onClick={() => setPlaying((p) => !p)} className="ga-btn" style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: '#6d28d9', color: '#ffffff', fontSize: 19, cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {playing ? '❘❘' : '▶'}
                    </button>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Welcome message</p>
                      <p style={{ fontSize: 12.5, color: '#c4b5fd', margin: 0 }}>{playing ? 'Playing…' : 'Tap to play'}</p>
                    </div>
                  </div>
                </div>

                <div data-reveal style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <a href={`/invite/${slug}`} className="ga-btn ga-btn-solid" style={{ flex: 1, minWidth: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 14, fontSize: 14.5, fontWeight: 600, textDecoration: 'none' }}>Open the invitation</a>
                  <button onClick={() => setBookmarked((b) => !b)} className="ga-btn ga-btn-outline" style={{ flex: 1, minWidth: 170, minHeight: 48, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{bookmarked ? 'Saved to your phone' : 'Save for later'}</button>
                </div>
                <p data-reveal style={{ fontSize: 12, color: '#a78bfa', margin: '20px 0 0', lineHeight: 1.6 }}>You can come back to this page any time from the same link.</p>
              </div>
            )}

            {screen === 'Check in' && (
              <div style={{ maxWidth: 480, width: '100%', position: 'relative', zIndex: 1 }}>
                {checkedIn ? (
                  <div style={{ textAlign: 'center' }}>
                    <div data-reveal="scale" style={{ width: 64, height: 64, borderRadius: '50%', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 29, margin: '0 auto 24px' }}>&#10003;</div>
                    <h1 data-reveal="blur" style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: h2Size, margin: '0 0 12px' }}>You&rsquo;re checked in.</h1>
                    <p data-reveal style={{ fontSize: 15, color: '#ddd6fe', lineHeight: 1.75, margin: '0 0 12px' }}>Thanks, {checkedIn.guest_name}. The hosts have been notified.</p>
                    <p data-reveal style={{ fontSize: 13, color: '#a78bfa', margin: '0 0 30px' }}>Show this screen at the welcome desk if anyone asks.</p>
                    <button data-reveal onClick={resetCheckIn} className="ga-btn ga-btn-outline" style={{ minHeight: 48, padding: '0 20px', borderRadius: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Check someone else in</button>
                  </div>
                ) : (
                  <>
                    <p data-reveal style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#c4b5fd', margin: '0 0 16px', fontWeight: 600, textAlign: 'center' }}>Check in</p>
                    <h1 data-reveal="blur" style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: h2Size, margin: '0 0 12px', textAlign: 'center' }}>Let them know you made it.</h1>
                    <p data-reveal style={{ fontSize: 14.5, color: '#ddd6fe', lineHeight: 1.75, margin: '0 0 30px', textAlign: 'center' }}>It tells the hosts you&rsquo;re here.</p>
                    <form data-reveal="scale" onSubmit={submitCheckIn} className="ga-glass" style={{ borderRadius: 20, padding: cardPad }}>
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c4b5fd', margin: '0 0 8px' }}>Your name</label>
                      <input value={ciName} onChange={(e) => { setCiName(e.target.value); setCiError(''); }} placeholder="As it appears on the invitation" style={{ width: '100%', minHeight: 48, padding: '0 15px', borderRadius: 14, border: '1px solid rgba(196,181,253,.28)', background: 'rgba(255,255,255,.06)', color: '#f2eefb', fontSize: 15, marginBottom: 18 }} />
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c4b5fd', margin: '0 0 8px' }}>Phone</label>
                      <input value={ciPhone} onChange={(e) => { setCiPhone(e.target.value); setCiError(''); }} placeholder="+91" style={{ width: '100%', minHeight: 48, padding: '0 15px', borderRadius: 14, border: '1px solid rgba(196,181,253,.28)', background: 'rgba(255,255,255,.06)', color: '#f2eefb', fontSize: 15, marginBottom: 18 }} />
                      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c4b5fd', margin: '0 0 8px' }}>How many of you</label>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 26, flexWrap: 'wrap' }}>
                        {['1', '2', '3', '4', '5+'].map((label) => {
                          const on = party === label;
                          return (
                            <button key={label} type="button" onClick={() => setParty(label)} className="ga-btn" style={{ minWidth: 52, minHeight: 48, borderRadius: 14, border: `1px solid ${on ? '#6d28d9' : 'rgba(196,181,253,.28)'}`, background: on ? '#6d28d9' : 'transparent', color: on ? '#ffffff' : '#ddd6fe', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                          );
                        })}
                      </div>
                      {ciError && <p className="ga-error" style={{ marginBottom: 18 }}>{ciError}</p>}
                      <button type="submit" disabled={checkingIn} className="ga-btn ga-btn-solid" style={{ width: '100%', minHeight: 48, borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{checkingIn ? 'Checking in…' : 'Submit'}</button>
                    </form>
                    <p data-reveal style={{ fontSize: 12, color: '#a78bfa', margin: '14px 0 0', textAlign: 'center' }}>Takes a second. No account needed.</p>
                  </>
                )}
              </div>
            )}

            {screen === 'Know your room' && (
              <div style={{ maxWidth: 520, width: '100%', position: 'relative', zIndex: 1 }}>
                <p data-reveal style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#c4b5fd', margin: '0 0 16px', fontWeight: 600, textAlign: 'center' }}>Know your room</p>
                <h1 data-reveal="blur" style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: h2Size, margin: '0 0 12px', textAlign: 'center' }}>Where you&rsquo;re staying.</h1>
                <p data-reveal style={{ fontSize: 14.5, color: '#ddd6fe', lineHeight: 1.75, margin: '0 0 30px', textAlign: 'center' }}>Type your name the way it appears on the invitation and we&rsquo;ll find your room.</p>

                <form data-reveal onSubmit={findRoom} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
                  <input value={roomQuery} onChange={(e) => { setRoomQuery(e.target.value); setRoomState(null); }} placeholder="Your name" style={{ flex: 1, minWidth: 200, minHeight: 48, padding: '0 15px', borderRadius: 14, border: '1px solid rgba(196,181,253,.28)', background: 'rgba(255,255,255,.06)', color: '#f2eefb', fontSize: 15 }} />
                  <button type="submit" disabled={roomBusy} className="ga-btn ga-btn-solid" style={{ minHeight: 48, padding: '0 20px', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: 'none' }}>{roomBusy ? '…' : 'Find'}</button>
                </form>

                {roomState === 'found' && roomMatches.map((m) => (
                  <div key={m.id} data-reveal="scale" className="ga-card ga-lift" style={{ padding: cardPad, marginBottom: 12 }}>
                    <p style={{ fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#c4b5fd', margin: '0 0 12px', fontWeight: 600 }}>{m.guest_name}</p>
                    <p style={{ fontFamily: "'Spectral',serif", fontSize: isMobile ? 'clamp(32px,10vw,38px)' : 'clamp(40px,4vw,46px)', margin: '0 0 6px' }}>{m.room_number || 'Room TBD'}</p>
                    {m.building && <p style={{ fontSize: 15, color: '#ddd6fe', margin: '0 0 24px' }}>{m.building}{m.floor ? ` · ${m.floor}` : ''}</p>}
                    <div data-mj-stagger style={{ display: 'flex', flexDirection: 'column', gap: 13, borderTop: '1px solid rgba(196,181,253,.22)', paddingTop: 20 }}>
                      {m.check_in && <div data-reveal style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5 }}><span style={{ color: '#c4b5fd' }}>Check-in</span><span style={{ textAlign: 'right' }}>{m.check_in}</span></div>}
                      {m.check_out && <div data-reveal style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5 }}><span style={{ color: '#c4b5fd' }}>Check-out</span><span style={{ textAlign: 'right' }}>{m.check_out}</span></div>}
                      {m.notes && <div data-reveal style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5 }}><span style={{ color: '#c4b5fd' }}>Notes</span><span style={{ textAlign: 'right' }}>{m.notes}</span></div>}
                    </div>
                    {m.address && (
                      <a href={m.map_link || `https://maps.google.com/?q=${encodeURIComponent(m.address)}`} target="_blank" rel="noreferrer" className="ga-btn ga-btn-solid" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 24, minHeight: 48, lineHeight: '48px', borderRadius: 14, fontSize: 13.5, fontWeight: 600 }}>Directions</a>
                    )}
                  </div>
                ))}

                {roomState === 'missing' && (
                  <div data-reveal="scale" className="ga-card" style={{ padding: cardPad, textAlign: 'center' }}>
                    <p style={{ fontFamily: "'Spectral',serif", fontSize: 19, margin: '0 0 10px' }}>No room under that name.</p>
                    <p style={{ fontSize: 14, color: '#ddd6fe', lineHeight: 1.7, margin: 0 }}>Try the name on your invitation, or ask whoever booked for your family.</p>
                  </div>
                )}

                {roomState === 'error' && (
                  <div data-reveal="scale" className="ga-card" style={{ padding: cardPad, textAlign: 'center' }}>
                    <p style={{ fontSize: 14, color: '#fca5a5', margin: 0 }}>Couldn&rsquo;t search right now — please try again.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
