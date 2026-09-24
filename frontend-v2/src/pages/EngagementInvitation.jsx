import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { submitRsvp, submitWish, getWishes } from '@/api/invitations';
import { drawQr } from '@/lib/miniQr';

// One-off engagement invitation — Sai Vamsi & Sai Sahithi (23 Aug 2026).
// Ported from the Claude Design canvas "Engagement Invitation.dc.html". The
// LAYOUT + copy are hardwired to this couple, but the live bits are wired to the
// real product for THIS event via its slug:
//   • QR  -> {origin}/invite/{slug}/find-my-photos   (the real face-match QR)
//   • Find my photos -> the real FindMyPhotos flow at /invite/{slug}/find-my-photos
//   • RSVP -> POST /api/rsvp (submitRsvp)
//   • countdown -> the event's date
// Rendered by GuestInvitation when invite.design_id === 'engagement_saivamsi'.
// Assets live in /public/engagement (copied from the design export).

const COUPLE = {
  nameA: 'Sai Vamsi',
  nameB: 'Sai Sahithi',
  aParents: 'S/o Shri Chinimilli Arunbabu Garu &<br>Smt. Surya Kumari Garu<br>Anyam Vedanshi Sathya',
  bParents: 'D/o Shri Pusala Rangaiah Garu &<br>Smt. Adi Lakshmi Garu',
  invitedByLeft: 'Shri Pusala Rangaiah Garu<br>Smt. Adi Lakshmi Garu',
  invitedByRight: 'Shri Chinimilli Arunbabu Garu<br>Smt. Surya Kumari Garu<br>Anyam Vedanshi Sathya',
  dateLabel: '23 August 2026',
  dayLabel: 'Sunday',
  timeLabel: '09:30 AM',
  venue: 'Sri Seetharama Function Hall',
  venueSub: 'Prodduvaka, Andhra Pradesh',
  mapUrl: 'https://maps.app.goo.gl/8fWmtyqYzCAPKB1u6?g_st=ic',
  shareText: 'Sai Vamsi & Sai Sahithi — Engagement Ceremony, 23 August 2026',
};
const EVENT_ISO = '2026-08-23T09:30:00+05:30';
const SEAL_VIDEO_URL = '/engagement/seal-opening.mp4';
// WebP (≈10× smaller than the source PNGs) — the whole first-load payload.
const ARCH_BG_URL = '/engagement/arch-background.webp';
const HERO_POSTER_URL = '/engagement/hero-poster.webp';
// The approved seal video is ~5s; the names reveal starts on its `ended` event,
// this is only the fallback runtime for the safety timeout.
const REVEAL_SECONDS = 5;

const KEYFRAMES = `
@keyframes engFallA{0%{transform:translate3d(0,-10vh,0) rotate(0);opacity:0}8%{opacity:.85}100%{transform:translate3d(26px,112vh,0) rotate(300deg);opacity:0}}
@keyframes engFallB{0%{transform:translate3d(0,-10vh,0) rotate(0);opacity:0}8%{opacity:.7}100%{transform:translate3d(-38px,112vh,0) rotate(-260deg);opacity:0}}
@keyframes engFallC{0%{transform:translate3d(0,-10vh,0) rotate(10deg);opacity:0}10%{opacity:.6}100%{transform:translate3d(12px,112vh,0) rotate(200deg);opacity:0}}
@keyframes engGlow{0%,100%{box-shadow:0 6px 20px rgba(58,42,30,.22),0 0 0 0 rgba(169,130,47,.35)}50%{box-shadow:0 6px 20px rgba(58,42,30,.22),0 0 0 10px rgba(169,130,47,0)}}
@keyframes engTap{0%,100%{opacity:.62}50%{opacity:1}}
@keyframes engSpin{to{transform:rotate(360deg)}}
@keyframes engFadeIn{from{opacity:0}to{opacity:1}}
@keyframes engGlowIn{0%{opacity:0}60%{opacity:1}100%{opacity:.4}}
@keyframes engOmIn{0%{opacity:0;transform:scale(.7);filter:blur(8px)}70%{opacity:1;transform:scale(1.06);filter:blur(0)}100%{opacity:1;transform:scale(1);filter:blur(0)}}
@keyframes engNameIn{from{opacity:0;clip-path:inset(0 50% 0 50%);letter-spacing:.22em;transform:scale(.97)}to{opacity:1;clip-path:inset(0 -8% 0 -8%);letter-spacing:normal;transform:none}}
.eng-map:hover{background:#5A141C!important;transform:translateY(-2px)}
.eng-btn:hover{background:#6E1B24!important;color:#F7EFDD!important}
.eng-share:hover{background:rgba(169,130,47,.16)!important}
.eng-rsvp:hover{background:rgba(169,130,47,.12)!important}
.eng-music:hover{transform:scale(1.06)!important}
`;

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Marcellus&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Pinyon+Script&family=Jost:wght@300;400;500&display=swap';

const PETALS = [
  ['6%', 11, 8, 'rgba(255,252,242,.9)', 'engFallA 17s linear -1s infinite'],
  ['17%', 9, 7, 'rgba(226,188,96,.75)', 'engFallB 21s linear -6s infinite'],
  ['28%', 12, 9, 'rgba(255,250,238,.85)', 'engFallC 24s linear -12s infinite'],
  ['38%', 8, 6, 'rgba(201,167,92,.7)', 'engFallA 19s linear -3s infinite'],
  ['47%', 10, 7, 'rgba(255,252,242,.8)', 'engFallB 26s linear -16s infinite'],
  ['57%', 11, 8, 'rgba(232,199,120,.65)', 'engFallC 20s linear -8s infinite'],
  ['66%', 9, 7, 'rgba(255,250,238,.9)', 'engFallA 23s linear -14s infinite'],
  ['76%', 12, 9, 'rgba(214,180,104,.6)', 'engFallB 18s linear -5s infinite'],
  ['85%', 10, 7, 'rgba(255,252,242,.85)', 'engFallC 27s linear -19s infinite'],
  ['93%', 8, 6, 'rgba(226,188,96,.7)', 'engFallA 22s linear -10s infinite'],
];

const pad = (n) => String(n).padStart(2, '0');
const Reveal = (props) => <div data-reveal {...props} />;
// The couple/parents strings are hardwired constants; split their <br> markers
// into real <br/> elements (React escapes the text) rather than injecting HTML.
const lines = (text) => text.split('<br>').map((s, i, a) => <span key={i}>{s}{i < a.length - 1 && <br />}</span>);
const kicker = { fontFamily: "'Jost',sans-serif", fontSize: 'clamp(11px,3vw,13px)', letterSpacing: '.3em', textTransform: 'uppercase', color: '#7A5A18', fontWeight: 500 };
const card = { border: '1px solid rgba(169,130,47,.4)', background: 'linear-gradient(180deg,rgba(255,252,244,.94),rgba(247,238,218,.86))' };

export default function EngagementInvitation({ slug, invite = {} }) {
  const eventISO = invite.event_date || EVENT_ISO;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [now, setNow] = useState(() => Date.now());
  const [curtain, setCurtain] = useState(() => !reduceMotion);
  // Opening state machine: closed (tap prompt) → video (approved seal MP4) →
  // names (the blessing/name reveal, AFTER the video) → curtain lifts.
  const [phase, setPhase] = useState('closed');
  // The opening curtain stays on a "One moment…" loader until the seal video is
  // buffered enough to play through AND the first-viewport art is decoded, so the
  // tap never lands on a blank frame or a stuttering, still-buffering video.
  const [videoReady, setVideoReady] = useState(false);
  const [imgsReady, setImgsReady] = useState(false);
  const mediaReady = videoReady && imgsReady;
  const [rsvp, setRsvp] = useState({ name: '', phone: '', status: '', msg: '', busy: false });
  const [wishes, setWishes] = useState([]);
  const [showAllWishes, setShowAllWishes] = useState(false);
  const [wishForm, setWishForm] = useState({ name: '', message: '', status: '', busy: false });
  const rootRef = useRef(null);
  const qrRef = useRef(null);
  const videoRef = useRef(null);
  const revealTimer = useRef(null);
  const revealDone = useRef(false);
  const namesDone = useRef(false);

  const qrTarget = invite.face_match_url
    || (typeof window !== 'undefined' && slug ? `${window.location.origin}/invite/${slug}/find-my-photos` : '');

  // fonts + keyframes + resource hints, once. Order matters for first paint:
  // preconnect to the font hosts (saves the DNS+TLS handshake), then preload the
  // three first-load assets (seal video + arch bg + hero poster) so they download
  // in parallel with — not after — the JS, and are ready under the curtain.
  useEffect(() => {
    const head = document.head;
    const add = (id, make) => {
      if (document.getElementById(id)) return;
      const el = make();
      el.id = id;
      head.appendChild(el);
    };
    add('eng-pre-gapi', () => {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = 'https://fonts.googleapis.com';
      return l;
    });
    add('eng-pre-gstatic', () => {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = 'https://fonts.gstatic.com'; l.crossOrigin = 'anonymous';
      return l;
    });
    add('eng-fonts', () => {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = FONT_LINK;
      return l;
    });
    add('eng-kf', () => {
      const s = document.createElement('style');
      s.textContent = KEYFRAMES;
      return s;
    });
    // Warm the seal video + first-viewport art while the loader shows, so the
    // tap starts playback instantly and the curtain lifts onto a decoded page.
    add('eng-video-preload', () => {
      const l = document.createElement('link');
      l.rel = 'preload'; l.as = 'video'; l.type = 'video/mp4'; l.href = SEAL_VIDEO_URL;
      return l;
    });
    add('eng-hero-preload', () => {
      const l = document.createElement('link');
      l.rel = 'preload'; l.as = 'image'; l.href = HERO_POSTER_URL; l.fetchPriority = 'high';
      return l;
    });
    add('eng-arch-preload', () => {
      const l = document.createElement('link');
      l.rel = 'preload'; l.as = 'image'; l.href = ARCH_BG_URL;
      return l;
    });
  }, []);

  // wishes wall for this event (featured/top-3 first, then newest)
  useEffect(() => {
    if (!slug) return undefined;
    let alive = true;
    getWishes(slug).then(({ data }) => { if (alive) setWishes(data.wishes || []); }).catch(() => {});
    return () => { alive = false; };
  }, [slug]);

  // countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // QR
  useEffect(() => {
    if (qrRef.current && qrTarget) { try { drawQr(qrRef.current, qrTarget); } catch { /* noop */ } }
  }, [qrTarget]);

  // Preload the first-viewport assets the moment the page mounts, so they are
  // decoded and ready UNDER the seal video by the time it finishes — no blank
  // frame, no image waterfall when the curtain lifts. Only the critical
  // above-the-fold media (fixed background + printed hero), nothing below it.
  useEffect(() => { preloadFirstViewport(); }, []);

  useEffect(() => () => clearTimeout(revealTimer.current), []);

  // Safety net: never strand the loader if the video's canplaythrough or an
  // image decode never fires (flaky mobile network, a codec that skips the
  // event). After 8s, force-ready so the tap prompt always appears.
  useEffect(() => {
    const t = setTimeout(() => { setVideoReady(true); setImgsReady(true); }, 8000);
    return () => clearTimeout(t);
  }, []);

  const target = new Date(eventISO).getTime();
  const secs = Math.floor(Math.max(0, target - now) / 1000);
  const cd = {
    Days: pad(Math.floor(secs / 86400)),
    Hours: pad(Math.floor(secs / 3600) % 24),
    Minutes: pad(Math.floor(secs / 60) % 60),
    Seconds: pad(secs % 60),
  };

  // First-viewport assets only — the fixed arch background and the printed hero
  // poster. Kick a decode so they are paint-ready before the seal video ends;
  // best-effort (Image().decode can reject on some engines). Nothing below the
  // fold is touched — no full-gallery preload.
  const preloadFirstViewport = () => {
    const load = (src) => new Promise((res) => {
      const img = new Image();
      const done = () => res();
      img.onload = () => { if (img.decode) img.decode().then(done, done); else done(); };
      img.onerror = done;          // never hang the loader on a broken asset
      img.src = src;
    });
    Promise.all([ARCH_BG_URL, HERO_POSTER_URL].map(load)).then(() => setImgsReady(true));
  };

  // Lift the curtain exactly once. Fades it out over the real invitation already
  // decoded underneath. Removal is driven by a timeout, NOT anim.onfinish — a
  // backgrounded tab (or an engine that never fires onfinish) must still lift it.
  const finishReveal = () => {
    if (revealDone.current) return;
    revealDone.current = true;
    clearTimeout(revealTimer.current);
    const curtainEl = rootRef.current?.querySelector('[data-curtain]');
    if (curtainEl) {
      try {
        curtainEl.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' },
        );
      } catch { /* WAAPI unsupported — the timeout still removes it */ }
    }
    setTimeout(() => setCurtain(false), curtainEl ? 700 : 0);
  };

  // AFTER the video: the blessing + names reveal (ॐ, shloka, couple, date), then
  // the curtain lifts into the invitation. The reveal itself is pure CSS
  // (per-element `animation` with staggered delays in the JSX) so it needs no
  // rAF/WAAPI and can't get stranded by a throttled/backgrounded tab. This just
  // switches the phase and schedules the lift on a plain timer. Idempotent (video
  // `ended`/`error` + the safety timeout all call it).
  const playNames = () => {
    if (namesDone.current) return;
    namesDone.current = true;
    clearTimeout(revealTimer.current);
    setPhase('names');
    revealTimer.current = setTimeout(finishReveal, reduceMotion ? 1200 : 3600);
  };

  // The seal video is shown paused (first frame) as the closed state. One tap
  // starts it playing; when it ends the names reveal runs, then the curtain
  // lifts. The <video> element persists across closed→video (same DOM node), so
  // play() resumes the very frame on screen. No music, no door swing.
  const startVideo = () => {
    if (phase !== 'closed') return;
    preloadFirstViewport();
    setPhase('video');
    const v = videoRef.current;
    if (v) { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
    // Safety net if the browser never fires the video's `ended` event.
    revealTimer.current = setTimeout(playNames, (REVEAL_SECONDS + 2) * 1000);
  };

  const pickRsvp = async (status) => {
    if (rsvp.busy) return;
    if (!rsvp.name.trim() || !rsvp.phone.trim()) {
      setRsvp((s) => ({ ...s, status, msg: 'Please add your name and phone above.' }));
      return;
    }
    setRsvp((s) => ({ ...s, status, busy: true, msg: '' }));
    try {
      await submitRsvp(slug, { guest_name: rsvp.name.trim(), guest_phone: rsvp.phone.trim(), status, guest_count: 1 });
      const note = { yes: 'We cannot wait to see you there.', maybe: 'We hope you can make it.', no: 'You will be missed — thank you for your blessings.' };
      setRsvp((s) => ({ ...s, busy: false, msg: note[status] || 'Thank you for your reply.' }));
    } catch (e) {
      setRsvp((s) => ({ ...s, busy: false, msg: e?.response?.data?.detail || 'Could not save your RSVP. Please try again.' }));
    }
  };

  // Canonical public link — never the VM IP. The invite payload carries the
  // absolute canonical_url / public_base (build_public_url); fall back to the
  // current URL only if neither is present.
  const shareLink = (() => {
    const c = invite.canonical_url || '';
    if (/^https?:\/\//i.test(c)) return c;
    if (invite.public_base && c) return `${invite.public_base.replace(/\/$/, '')}${c}`;
    return typeof window !== 'undefined' ? window.location.href : c;
  })();

  const shareWhatsapp = () => {
    // Clean, warm, professional — no emoji (they tofu on some devices). The rich
    // image preview comes from the link's OG tags when shared on WhatsApp.
    const msg = [
      "You're warmly invited",
      '',
      `${COUPLE.nameA} & ${COUPLE.nameB}`,
      'request the honour of your presence as they celebrate their engagement.',
      '',
      `${COUPLE.dayLabel}, ${COUPLE.dateLabel} · ${COUPLE.timeLabel}`,
      `${COUPLE.venue}, ${COUPLE.venueSub}`,
      '',
      'Open your invitation here:',
      shareLink,
      '',
      'With love and blessings,',
      'The Chinimilli & Pusala families',
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const submitWishForm = async () => {
    if (wishForm.busy) return;
    if (!wishForm.name.trim() || !wishForm.message.trim()) {
      setWishForm((s) => ({ ...s, status: 'Please add your name and a wish.' }));
      return;
    }
    setWishForm((s) => ({ ...s, busy: true, status: '' }));
    try {
      const { data } = await submitWish(slug, { guest_name: wishForm.name.trim(), message: wishForm.message.trim() });
      if (data?.status === 'approved') {
        setWishes((prev) => [{ id: `me-${Date.now()}`, guest_name: wishForm.name.trim(), message: wishForm.message.trim(), is_featured: false }, ...prev]);
        setWishForm({ name: '', message: '', status: 'Thank you — your wish is on the wall.', busy: false });
      } else {
        setWishForm({ name: '', message: '', status: 'Thank you — your wish will appear once approved.', busy: false });
      }
    } catch (e) {
      setWishForm((s) => ({ ...s, busy: false, status: e?.response?.data?.detail || 'Could not send your wish. Please try again.' }));
    }
  };

  const flourish = (max) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '18px auto', maxWidth: max }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(169,130,47,0),#C9A75C)' }} />
      <div style={{ width: 5, height: 5, border: '1px solid #A9822F', transform: 'rotate(45deg)' }} />
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#C9A75C,rgba(169,130,47,0))' }} />
    </div>
  );

  return (
    <div ref={rootRef} style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", color: '#3A2A1E', position: 'relative', minHeight: '100vh', overflowX: 'hidden', background: '#EFE2C6' }}>
      {/* fixed background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: `#EFE2C6 url('${ARCH_BG_URL}') center top/cover no-repeat` }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'linear-gradient(180deg,rgba(247,239,221,.42) 0%,rgba(249,242,226,.84) 26%,rgba(246,237,216,.92) 100%)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}>
        {PETALS.map(([left, w, h, bg, anim], i) => (
          <div key={i} style={{ position: 'absolute', left, top: 0, width: w, height: h, borderRadius: '60% 40% 55% 45%', background: bg, animation: anim }} />
        ))}
      </div>

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 'min(720px,100%)', margin: '0 auto', padding: '0 clamp(14px,4.6vw,28px)' }}>
        {/* HERO POSTER */}
        <div style={{ padding: 'clamp(18px,5vw,30px) 0 0' }}>
          <div style={{ width: '100%', overflow: 'hidden', borderRadius: 4, background: '#F3E8D2', boxShadow: '0 2px 4px rgba(58,42,30,.12),0 22px 54px rgba(58,42,30,.28),0 48px 110px rgba(58,42,30,.16)' }}>
            <img src={HERO_POSTER_URL} alt="Engagement invitation of Sai Vamsi and Sai Sahithi" fetchpriority="high" decoding="async" style={{ display: 'block', width: '100%', height: 'auto' }} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 18, ...kicker }}>The invitation, as it was printed</div>
        </div>

        {/* DETAILS */}
        <div style={{ padding: 'clamp(42px,10vw,64px) 0 0', textAlign: 'center' }}>
          <Reveal style={kicker}>With the blessings of our elders</Reveal>
          {flourish(200)}
          <Reveal style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 'clamp(40px,12vw,58px)', color: '#3A2A1E', lineHeight: 1.15 }}>{COUPLE.nameA}</Reveal>
          <Reveal style={{ fontSize: 'clamp(16px,4.3vw,19px)', color: '#4A3826', lineHeight: 1.85, margin: '14px 0 0' }}>{lines(COUPLE.aParents)}</Reveal>
          <Reveal style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 'clamp(26px,7vw,32px)', color: '#A9822F', margin: 'clamp(22px,6vw,32px) 0' }}>&amp;</Reveal>
          <Reveal style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 'clamp(40px,12vw,58px)', color: '#3A2A1E', lineHeight: 1.15 }}>{COUPLE.nameB}</Reveal>
          <Reveal style={{ fontSize: 'clamp(16px,4.3vw,19px)', color: '#4A3826', lineHeight: 1.85, margin: '14px 0 0' }}>{lines(COUPLE.bParents)}</Reveal>

          <Reveal style={{ margin: 'clamp(40px,10vw,58px) auto 0', paddingTop: 'clamp(26px,7vw,38px)', borderTop: '1px solid rgba(169,130,47,.35)' }}>
            <div style={kicker}>Date</div>
            <div style={{ fontFamily: "'Marcellus',serif", fontSize: 'clamp(26px,7.4vw,34px)', color: '#6E1B24', marginTop: 14, lineHeight: 1.3 }}>{COUPLE.dateLabel}</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 12, letterSpacing: '.26em', textTransform: 'uppercase', color: '#6E5527', marginTop: 10 }}>{COUPLE.dayLabel}</div>
          </Reveal>
          <Reveal style={{ margin: '46px auto 0' }}>
            <div style={kicker}>Time</div>
            <div style={{ fontFamily: "'Marcellus',serif", fontSize: 'clamp(26px,7.4vw,34px)', color: '#6E1B24', marginTop: 14, lineHeight: 1.3 }}>{COUPLE.timeLabel}</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 12, letterSpacing: '.26em', textTransform: 'uppercase', color: '#6E5527', marginTop: 10 }}>Onwards</div>
          </Reveal>
          <Reveal style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, margin: '48px auto 0', maxWidth: 280 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(169,130,47,0),#C9A75C)' }} />
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 'clamp(11px,3vw,13px)', letterSpacing: '.3em', textTransform: 'uppercase', color: '#2E4B2E', fontWeight: 500, whiteSpace: 'nowrap' }}>Lunch Follows</div>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#C9A75C,rgba(169,130,47,0))' }} />
          </Reveal>
        </div>

        {/* INVITED BY */}
        <div style={{ padding: 'clamp(42px,10vw,60px) 0 0', textAlign: 'center' }}>
          <Reveal style={kicker}>Invited by</Reveal>
          <Reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 'clamp(18px,5vw,30px)', marginTop: 28, justifyItems: 'center' }}>
            <div style={{ fontSize: 'clamp(16px,4.2vw,18px)', lineHeight: 2, color: '#4A3826' }}>{lines(COUPLE.invitedByLeft)}</div>
            <div style={{ fontSize: 'clamp(16px,4.2vw,18px)', lineHeight: 2, color: '#4A3826' }}>{lines(COUPLE.invitedByRight)}</div>
          </Reveal>
        </div>

        {/* COUNTDOWN */}
        <div style={{ padding: 'clamp(42px,10vw,58px) 0 8px', textAlign: 'center' }}>
          <Reveal style={{ ...kicker, letterSpacing: '.34em', fontSize: 'clamp(10px,2.8vw,12px)' }}>Live Countdown</Reveal>
          <Reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'clamp(6px,1.8vw,12px)', marginTop: 24 }}>
            {['Days', 'Hours', 'Minutes', 'Seconds'].map((u) => (
              <div key={u} style={{ padding: 'clamp(13px,3.8vw,20px) 2px', background: 'linear-gradient(180deg,rgba(255,252,244,.94),rgba(243,232,210,.7))', border: '1px solid rgba(169,130,47,.35)' }}>
                <div style={{ fontFamily: "'Marcellus',serif", fontSize: 'clamp(22px,6.4vw,30px)', color: '#6E1B24', lineHeight: 1 }}>{cd[u]}</div>
                <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 'clamp(9px,2.4vw,11px)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#75603F', marginTop: 8 }}>{u}</div>
              </div>
            ))}
          </Reveal>
        </div>

        {/* VENUE */}
        <div style={{ padding: 'clamp(42px,10vw,58px) 0 0' }}>
          <Reveal style={{ padding: 'clamp(26px,7vw,36px) clamp(18px,5.5vw,30px)', textAlign: 'center', ...card }}>
            <div style={kicker}>Venue Location</div>
            <div style={{ fontFamily: "'Marcellus',serif", fontSize: 'clamp(19px,5.4vw,24px)', color: '#6E1B24', marginTop: 14, lineHeight: 1.4 }}>{COUPLE.venue}</div>
            <div style={{ fontStyle: 'italic', fontSize: 15, color: '#55432D', marginTop: 6 }}>{COUPLE.venueSub}</div>
            <a className="eng-map" href={COUPLE.mapUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 26, padding: '22px 24px', minHeight: 72, justifyContent: 'center', fontFamily: "'Jost',sans-serif", fontSize: 14, letterSpacing: '.32em', textTransform: 'uppercase', color: '#F7EFDD', background: '#6E1B24', border: '1px solid #A9822F', boxShadow: '0 12px 30px rgba(110,27,36,.22)', transition: 'background .4s ease,transform .4s ease' }}>
              View Map<span style={{ fontStyle: 'italic', fontSize: 14, letterSpacing: '.04em', textTransform: 'none', color: 'rgba(247,239,221,.8)' }}>Opens directions in Google Maps</span>
            </a>
          </Reveal>
        </div>

        {/* QR + FACE MATCH */}
        <div style={{ padding: '14px 0 0' }}>
          <Reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 }}>
            <div style={{ padding: '26px 16px', textAlign: 'center', ...card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ ...kicker, fontSize: 11, letterSpacing: '.28em' }}>QR Code</div>
              <div style={{ fontStyle: 'italic', fontSize: 15, color: '#55432D', marginTop: 10, lineHeight: 1.5 }}>Scan to find and share your photos</div>
              <div style={{ position: 'relative', padding: 12, marginTop: 18, background: '#FFFCF4', border: '1px solid rgba(169,130,47,.5)' }}>
                <canvas ref={qrRef} width="140" height="140" style={{ display: 'block', width: 140, height: 140 }} />
              </div>
              <a className="eng-btn" href={qrTarget || '#'} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 18, padding: '12px 20px', minHeight: 44, fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', color: '#6E1B24', border: '1px solid #A9822F', transition: 'background .4s ease,color .4s ease' }}>Open Face Match</a>
            </div>
            <div style={{ padding: '26px 16px', textAlign: 'center', ...card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ ...kicker, fontSize: 11, letterSpacing: '.28em' }}>AI Face Match</div>
              <div style={{ fontStyle: 'italic', fontSize: 15, color: '#55432D', marginTop: 10, lineHeight: 1.5 }}>Upload a selfie and find your photos from our gallery.</div>
              <div style={{ width: 86, height: 86, marginTop: 18, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(169,130,47,.6)', background: 'repeating-linear-gradient(135deg,#EFE3CB 0 8px,#E7D9BD 8px 16px)' }} />
              <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: '#6E5527', marginTop: 12 }}>Selfie → your photos</div>
              <Link className="eng-btn" to={`/invite/${slug}/find-my-photos`} style={{ display: 'inline-block', marginTop: 14, padding: '12px 20px', minHeight: 44, fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', color: '#6E1B24', border: '1px solid #A9822F', textDecoration: 'none', transition: 'background .4s ease,color .4s ease' }}>Find My Photos</Link>
            </div>
          </Reveal>
        </div>

        {/* RSVP */}
        <div style={{ padding: '14px 0 0', textAlign: 'center' }}>
          <Reveal style={{ padding: '32px 22px', ...card }}>
            <div style={kicker}>RSVP</div>
            <div style={{ fontStyle: 'italic', fontSize: 16, color: '#55432D', marginTop: 10 }}>Let us know if you can join us</div>
            <div style={{ display: 'grid', gap: 8, margin: '18px auto 0', maxWidth: 340 }}>
              <input value={rsvp.name} onChange={(e) => setRsvp((s) => ({ ...s, name: e.target.value }))} placeholder="Your name" style={rsvpInput} />
              <input value={rsvp.phone} onChange={(e) => setRsvp((s) => ({ ...s, phone: e.target.value }))} placeholder="Phone" style={rsvpInput} />
            </div>
            <div style={{ display: 'grid', gap: 8, margin: '12px auto 0', maxWidth: 340 }}>
              {[['yes', "Yes, I'll be there"], ['maybe', 'Maybe'], ['no', "Sorry, can't attend"]].map(([val, label]) => (
                <div key={val} className="eng-rsvp" onClick={() => pickRsvp(val)} style={{ padding: '14px 16px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: rsvp.busy ? 'wait' : 'pointer', border: '1px solid rgba(169,130,47,.55)', fontFamily: "'Jost',sans-serif", fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', color: '#5C4A34', background: rsvp.status === val ? 'rgba(110,27,36,.10)' : 'transparent', transition: 'background .4s ease' }}>{label}</div>
              ))}
            </div>
            <div style={{ fontStyle: 'italic', fontSize: 15, color: '#6E1B24', marginTop: 16, minHeight: 22 }}>{rsvp.busy ? 'Saving…' : rsvp.msg}</div>
          </Reveal>
        </div>

        {/* WISHES */}
        <div style={{ padding: 'clamp(42px,10vw,58px) 0 0', textAlign: 'center' }}>
          <Reveal style={{ ...kicker, letterSpacing: '.34em', fontSize: 'clamp(10px,2.8vw,12px)' }}>Wishes for the Couple</Reveal>
          <Reveal style={{ fontStyle: 'italic', fontSize: 16, color: '#55432D', marginTop: 10 }}>Leave a blessing for {COUPLE.nameA} &amp; {COUPLE.nameB}</Reveal>

          <Reveal style={{ padding: '24px 20px', marginTop: 20, ...card }}>
            <div style={{ display: 'grid', gap: 8, maxWidth: 380, margin: '0 auto' }}>
              <input value={wishForm.name} onChange={(e) => setWishForm((s) => ({ ...s, name: e.target.value }))} placeholder="Your name" style={rsvpInput} />
              <textarea value={wishForm.message} onChange={(e) => setWishForm((s) => ({ ...s, message: e.target.value }))} placeholder="Write your wish…" rows={3} style={{ ...rsvpInput, minHeight: 78, resize: 'vertical', paddingTop: 12, lineHeight: 1.6 }} />
              <div className="eng-btn" onClick={submitWishForm} style={{ padding: '14px 16px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: wishForm.busy ? 'wait' : 'pointer', border: '1px solid #A9822F', background: '#6E1B24', color: '#F7EFDD', fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', transition: 'background .4s ease' }}>
                {wishForm.busy ? 'Sending…' : 'Add a Wish'}
              </div>
              <div style={{ fontStyle: 'italic', fontSize: 14, color: '#6E1B24', minHeight: 18 }}>{wishForm.status}</div>
            </div>
          </Reveal>

          {wishes.length > 0 && (
            <div style={{ display: 'grid', gap: 12, marginTop: 22 }}>
              {(showAllWishes ? wishes : wishes.slice(0, 3)).map((w) => (
                <div key={w.id} style={{ padding: '18px 20px', textAlign: 'left', ...card }}>
                  <div style={{ fontSize: 'clamp(15px,4vw,17px)', color: '#4A3826', lineHeight: 1.7, fontStyle: 'italic' }}>&ldquo;{w.message}&rdquo;</div>
                  <div style={{ fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: '#7A5A18', marginTop: 10 }}>&mdash; {w.guest_name}{w.relationship ? `, ${w.relationship}` : ''}</div>
                </div>
              ))}
              {wishes.length > 3 && (
                <div onClick={() => setShowAllWishes((v) => !v)} style={{ cursor: 'pointer', fontFamily: "'Jost',sans-serif", fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', color: '#6E1B24', marginTop: 4 }}>
                  {showAllWishes ? 'Show less' : `View all ${wishes.length} wishes`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* CLOSING — reveals are the shared bidirectional [data-reveal] rule
            (scroll-linked, reverses on scroll-up), not a one-shot observer. */}
        <div style={{ margin: 'clamp(44px,11vw,64px) 0 clamp(64px,16vw,96px)', padding: 'clamp(42px,10vw,60px) 0 40px', textAlign: 'center' }}>
          <Reveal style={{ fontStyle: 'italic', fontSize: 'clamp(17px,4.6vw,20px)', lineHeight: 1.9, color: '#4A3826', maxWidth: 'min(440px,100%)', margin: '0 auto' }}>With love, blessings and happiness, we invite you to celebrate this beautiful occasion with us.</Reveal>
          <Reveal>{flourish(240)}</Reveal>
          <Reveal style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 'clamp(40px,11.5vw,60px)', color: '#3A2A1E', lineHeight: 1.2 }}>{COUPLE.nameA}</Reveal>
          <Reveal style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 28, color: '#7A5A18', fontWeight: 500, margin: '10px 0' }}>&amp;</Reveal>
          <Reveal style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 'clamp(40px,11.5vw,60px)', color: '#3A2A1E', lineHeight: 1.2 }}>{COUPLE.nameB}</Reveal>
          <Reveal style={{ marginTop: 46, fontFamily: "'Marcellus',serif", fontSize: 'clamp(14px,3.9vw,17px)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#6E1B24', lineHeight: 1.8 }}>Your Presence Will<br />Make Our Day Complete</Reveal>
          <Reveal style={{ marginTop: 16, fontStyle: 'italic', fontSize: 'clamp(16px,4.3vw,19px)', color: '#4A3826', lineHeight: 1.8 }}>We look forward to celebrating<br />this special occasion with you</Reveal>
          <Reveal>{flourish(190)}</Reveal>
          <Reveal style={{ marginTop: 30, ...kicker, letterSpacing: '.34em', fontSize: 'clamp(10px,2.8vw,12px)' }}>MAJA Invites</Reveal>
        </div>
      </div>

      {/* WHATSAPP SHARE (bottom-left) */}
      <div className="eng-music" onClick={shareWhatsapp} title="Share on WhatsApp" style={{ position: 'fixed', left: 'clamp(14px,4vw,22px)', bottom: 'calc(clamp(14px,4vw,22px) + env(safe-area-inset-bottom,0px))', zIndex: 30, width: 56, height: 56, borderRadius: '50%', border: '1px solid #A9822F', background: 'radial-gradient(70% 70% at 50% 30%,rgba(255,252,244,.96),rgba(243,232,210,.92))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 20px rgba(58,42,30,.22)', transition: 'transform .4s ease' }}>
        <svg viewBox="0 0 24 24" width="27" height="27" fill="#25D366" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </div>

      {/* CURTAIN — opening sequence: tap → video → names reveal → lift.
          object-fit:contain keeps the video's exact 9:16 composition (no crop /
          stretch); the maroon backing matches so any letterbox is invisible. */}
      {curtain && (
        <div data-curtain style={{ position: 'fixed', inset: 0, zIndex: 60, overflow: 'hidden', background: '#8E4A3E' }}>
          {/* CLOSED + VIDEO — the seal video is shown paused on its first frame
              as the closed state; one tap plays it, then the names reveal runs.
              The video stays mounted through the names phase too (frozen on its
              last frame) so the names can crossfade OVER it — no hard cut. */}
          {/* video wrapper — always mounted while the curtain is up; frozen on
              its last frame during the names phase so the names crossfade over it */}
          <div onClick={phase === 'closed' && mediaReady ? startVideo : undefined}
               style={{ position: 'absolute', inset: 0, cursor: phase === 'closed' && mediaReady ? 'pointer' : 'default', pointerEvents: phase === 'closed' && mediaReady ? 'auto' : 'none' }}>
            <video
              ref={videoRef}
              src={SEAL_VIDEO_URL}
              muted
              playsInline
              preload="auto"
              onLoadedData={(e) => { if (phase === 'closed') { try { e.target.currentTime = 0.05; } catch { /* ignore */ } } }}
              onCanPlayThrough={() => setVideoReady(true)}
              onEnded={playNames}
              onError={() => { setVideoReady(true); if (phase !== 'closed') playNames(); }}
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#8E4A3E', border: 'none' }}
            />
            {/* Loader — holds the curtain until the seal video is fully buffered
                and the first-viewport art is decoded (no tap onto a blank/
                stuttering frame). Same "One moment" language as the app loader,
                in the seal's warm palette. */}
            {phase === 'closed' && !mediaReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#8E4A3E', pointerEvents: 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid rgba(240,223,180,.28)', borderTopColor: '#F0DFB4', animation: 'engSpin .9s linear infinite' }} />
                <div style={{ ...kicker, color: '#F0DFB4', letterSpacing: '.34em', fontSize: 'clamp(11px,3vw,13px)' }}>One moment</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: 'clamp(15px,4.4vw,18px)', color: 'rgba(247,239,221,.9)' }}>Preparing your invitation…</div>
              </div>
            )}
            {phase === 'closed' && mediaReady && (
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'clamp(38px,11vh,86px)', textAlign: 'center', ...kicker, color: '#F0DFB4', letterSpacing: '.34em', fontSize: 'clamp(11px,3vw,13px)', textShadow: '0 2px 16px rgba(74,34,24,.7)', animation: 'engTap 2.6s ease-in-out infinite', pointerEvents: 'none' }}>Tap to open the invitation</div>
            )}
          </div>

          {/* NAMES — the blessing + couple reveal, AFTER the video. The whole
              scene fades in (engFadeIn) OVER the frozen last video frame for a
              smooth crossfade — no hard cut — then the curtain lifts. */}
          {phase === 'names' && (
            <div style={{ position: 'absolute', inset: 0, animation: 'engFadeIn 850ms ease both' }}>
              <div style={{ position: 'absolute', inset: 0, background: `#EFE2C6 url('${ARCH_BG_URL}') center/cover no-repeat` }} />
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(58% 44% at 50% 46%,rgba(255,248,228,.92) 0%,rgba(247,239,221,.55) 42%,rgba(247,239,221,0) 74%)', animation: 'engGlowIn 2.6s ease-out both' }} />
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', animation: 'engFadeIn 1.4s ease-out both' }}>
                {PETALS.map(([left, w, h, bg], i) => (
                  <div key={i} style={{ position: 'absolute', left, top: 0, width: w, height: h, borderRadius: '60% 40% 55% 45%', background: bg, animation: `${['engFallA', 'engFallB', 'engFallC'][i % 3]} ${13 + i}s linear ${i * 0.3}s infinite` }} />
                ))}
              </div>
              <div data-names style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', textAlign: 'center', padding: 'clamp(22px,7vw,44px)' }}>
                <div style={{ fontFamily: "'Marcellus',serif", fontSize: 'clamp(52px,15vw,78px)', color: '#8E4A3E', lineHeight: 1, textShadow: '0 2px 20px rgba(232,199,120,.55)', animation: 'engOmIn 1s both' }}>ॐ</div>
                <div style={{ marginTop: 16, fontStyle: 'italic', fontSize: 'clamp(15px,4.4vw,19px)', color: '#5A4632', lineHeight: 1.8, animation: 'engNameIn 1.1s .4s cubic-bezier(.16,1,.3,1) both' }}>Shubham Bhavatu<br />Om Sri Ganeshaya Namaha</div>
                <div style={{ animation: 'engNameIn 1.1s .6s cubic-bezier(.16,1,.3,1) both' }}>{flourish('min(190px,58vw)')}</div>
                <div style={{ ...kicker, letterSpacing: '.38em', fontSize: 'clamp(10px,2.9vw,12px)', animation: 'engNameIn 1.1s .8s cubic-bezier(.16,1,.3,1) both' }}>Chinimilli&rsquo;s &amp; Pusala&rsquo;s</div>
                <div style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 'clamp(40px,12vw,64px)', color: '#3A2A1E', marginTop: 'clamp(12px,4vw,20px)', lineHeight: 1.2, animation: 'engNameIn 1.1s 1s cubic-bezier(.16,1,.3,1) both' }}>{COUPLE.nameA}</div>
                <div style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 26, color: '#8C6B2F', margin: '6px 0', animation: 'engNameIn 1.1s 1.3s cubic-bezier(.16,1,.3,1) both' }}>&amp;</div>
                <div style={{ fontFamily: "'Pinyon Script',cursive", fontSize: 'clamp(40px,12vw,64px)', color: '#3A2A1E', lineHeight: 1.2, animation: 'engNameIn 1.1s 1.45s cubic-bezier(.16,1,.3,1) both' }}>{COUPLE.nameB}</div>
                <div style={{ marginTop: 'clamp(20px,5.5vw,30px)', fontFamily: "'Marcellus',serif", fontSize: 'clamp(13px,3.7vw,16px)', letterSpacing: '.28em', color: '#6E1B24', animation: 'engNameIn 1.1s 1.8s cubic-bezier(.16,1,.3,1) both' }}>23 · 08 · 2026</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const rsvpInput = {
  padding: '12px 14px', minHeight: 44, border: '1px solid rgba(169,130,47,.5)', background: '#FFFCF4',
  fontFamily: "'Cormorant Garamond',serif", fontSize: 16, color: '#3A2A1E', outline: 'none', width: '100%', boxSizing: 'border-box',
};
