import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getGifts, submitWish, recordShagun, createShagunRazorpayOrder, verifyShagunRazorpay } from '@/api/invitations';
import { loadRazorpay } from '@/lib/razorpay';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { useInviteFull } from '@/lib/useInviteFull';
import { useCountdown } from '@/lib/useCountdown';
import { useRsvpSubmit } from '@/lib/useRsvpSubmit';
import { formatEventDate, formatVenueLine, formatShortDate, formatTime12h } from '@/lib/inviteFormat';
import InviteStateScreen from '@/components/invite/InviteStateScreen';
import InviteReferralCta from '@/components/invite/InviteReferralCta';
import { resolveInviteTheme, themeVars, themeAttrs } from '@/lib/inviteThemes';
import EngagementInvitation from '@/pages/EngagementInvitation';
import AboutFamilySection from '@/components/invitation/AboutFamilySection';
import CoupleBiosSection from '@/components/invitation/CoupleBiosSection';
import PreWeddingSection from '@/components/invitation/PreWeddingSection';
import WatchLiveSection from '@/components/invitation/WatchLiveSection';
import SongRequestsSection from '@/components/invitation/SongRequestsSection';
import CheckInSection from '@/components/invitation/CheckInSection';
import ContactParkingSection from '@/components/invitation/ContactParkingSection';
import FindMyRoomSection from '@/components/invitation/FindMyRoomSection';
import HoneymoonFundSection from '@/components/invitation/HoneymoonFundSection';
import TravelSection from '@/components/invitation/TravelSection';
import AmbientMusicPlayer from '@/components/invitation/AmbientMusicPlayer';
import AddToCalendarButton from '@/components/invitation/AddToCalendarButton';
import FoodDonationTeaser from '@/components/invitation/FoodDonationTeaser';
import '@/styles/inviteShared.css';
import './GuestInvitation.css';

// Local time (no explicit TZ in the payload — same assumption the legacy
// timeline used) from a "yyyy-mm-dd" date + "hh:mm" time. Returns null on any
// bad/missing input so callers can no-op cleanly.
function eventDateTime(dateStr, timeStr, fallbackHours = 0) {
  if (!dateStr) return null;
  const [hh, mm] = String(timeStr || '').split(':');
  const h = Number.isFinite(parseInt(hh, 10)) ? hh.padStart(2, '0') : String(fallbackHours).padStart(2, '0');
  const m = Number.isFinite(parseInt(mm, 10)) ? mm.padStart(2, '0') : '00';
  const d = new Date(`${dateStr}T${h}:${m}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const RSVP_STATUS_OPTIONS = [
  { label: 'Yes, with joy', status: 'yes', plusOne: false },
  { label: 'Regretfully no', status: 'no', plusOne: false },
  { label: 'Trying my best', status: 'maybe', plusOne: false },
];

export default function GuestInvitation({ identifier }) {
  // `identifier` is passed by the numeric dispatcher (/invite/00001/<name>);
  // otherwise it's the URL :slug. useInviteFull resolves a number → the real
  // profile on the backend, so this works for both.
  const { slug: routeSlug } = useParams();
  const slug = identifier ?? routeSlug;
  const { status, data, message, retry } = useInviteFull(slug);

  // decorative "tap the seal to open" ritual — local UI only, not an auth gate
  // (recon confirms /invite/{slug}/full carries no passcode check today).
  const [gateOpen, setGateOpen] = useState(true);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [decorPasscode, setDecorPasscode] = useState('');
  const [decorError, setDecorError] = useState(false);

  if (status !== 'ready') {
    return (
      <InviteStateScreen
        status={status}
        message={message}
        onRetry={retry}
        onPasscode={(pc) => retry(pc)}
      />
    );
  }

  // Every downstream call (wishes, RSVP, gallery) uses the RESOLVED slug — the
  // backend maps a numeric code to the real slug and returns it in the payload,
  // so a /invite/00001 URL never leaks the number into child endpoints.
  const realSlug = (data.invite && data.invite.slug) || slug;

  // One-off bespoke invitation designs render their own full-page layout instead
  // of the generic token-themed template. Keyed on the design the couple bought.
  if ((data.invite || {}).design_id === 'engagement_saivamsi') {
    return <EngagementInvitation slug={realSlug} invite={data.invite} />;
  }

  return (
    <GuestInvitationReady
      slug={realSlug}
      env={data}
      gateOpen={gateOpen}
      needsPasscode={needsPasscode}
      decorPasscode={decorPasscode}
      decorError={decorError}
      onBreakSeal={() => setNeedsPasscode(true)}
      onPasscodeChange={(v) => { setDecorPasscode(v); setDecorError(false); }}
      onUnlock={() => {
        if (decorPasscode.trim().length >= 4) setGateOpen(false);
        else setDecorError(true);
      }}
    />
  );
}

export function GuestInvitationReady({ slug, env, preview = false, gateOpen, needsPasscode, decorPasscode, decorError, onBreakSeal, onPasscodeChange, onUnlock }) {
  const invite = env.invite || {};
  const sections = invite.sections_enabled || {};
  const effects = invite.decorative_effects !== false;
  // A wedding has two names; a baby birthday, half saree, Manjal Neerattu or
  // Vetti Kattum Vizha has ONE, carried on `celebrant_info`. Building the
  // headline as "<groom> & <bride>" unconditionally printed a dangling
  // ampersand ("Kiaan &") on every celebration invitation, in the hero and in
  // the shagun copy. Derive the names, then let the count decide the shape.
  const celebrant = (invite.celebrant_info || {}).celebrant_name || '';
  const names = [invite.groom_name || celebrant, invite.bride_name].map((n) => (n || '').trim()).filter(Boolean);
  const coupleStr = names.join(' & ');

  const [gifts, setGifts] = useState(undefined);
  useEffect(() => {
    if (preview) { setGifts(env.gifts ?? null); return undefined; }
    let mounted = true;
    getGifts(slug).then(({ data: d }) => { if (mounted) setGifts(d); }).catch(() => { if (mounted) setGifts(null); });
    return () => { mounted = false; };
  }, [slug, preview, env.gifts]);

  const countdown = useCountdown(sections.countdown ? invite.event_date : null);

  const enabledEvents = useMemo(
    () => (invite.events || []).filter((e) => e.enabled !== false),
    [invite.events],
  );
  const eventVenue = (eventId) => (env.venues?.events || []).find((v) => v.event_id === eventId);

  // Live NOW/HAPPENING/DONE timeline badges — restored from the legacy
  // LiveTimelineSection.jsx. Gated on its own flag (sections.live_timeline)
  // separate from the base events list (sections.events): the card list
  // still shows without it, just without the live status. Only ticks while
  // that flag is on, so idle profiles don't pay for a 60s interval.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!sections.live_timeline) return undefined;
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [sections.live_timeline]);

  const photos = useMemo(
    () => (invite.media || []).filter((m) => m.media_type === 'photo'),
    [invite.media],
  );

  const shagun = env.shagun || {};
  const shagunEnabled = !!env.shagun_enabled;
  const showShagunSection = shagunEnabled || gifts !== undefined;

  // The design the couple actually bought. The backend has always sent it as
  // `design_id` on /invite/{slug}/full; this page never read it, so all 188
  // designs across ten themes rendered in the same house palette. Every token
  // has a CSS fallback, so an unknown or absent design is the old look, not a
  // broken one.
  const theme = resolveInviteTheme(invite);

  return (
    <div className="gi-page" style={themeVars(theme)} {...themeAttrs(theme)}>
      {gateOpen && (
        <div className="px-night gi-gate">
          {!needsPasscode ? (
            <>
              <button type="button" className="gi-seal" onClick={onBreakSeal} aria-label="Open the invitation">
                <span className="gi-seal-mark">M</span>
              </button>
              <p className="gi-gate-hint">Tap the seal to open</p>
            </>
          ) : (
            <>
              <p className="gi-gate-eyebrow">Opening your invitation</p>
              <p className="gi-gate-copy">A short passcode to confirm you&rsquo;re ready — any 4+ characters will do.</p>
              <input
                className="gi-gate-input"
                value={decorPasscode}
                onChange={(e) => onPasscodeChange(e.target.value)}
                placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
              />
              {decorError && <p className="gi-gate-error">Just a few more characters.</p>}
              <button type="button" className="mj-btn-primary gi-gate-unlock" onClick={onUnlock}>Unlock</button>
            </>
          )}
        </div>
      )}

      {/* HERO */}
      <header className="px-night gi-hero">
        {effects && <span className="gi-hero-glow gi-hero-glow--a" aria-hidden="true" />}
        {effects && <span className="gi-hero-glow gi-hero-glow--b" aria-hidden="true" />}
        {effects && ['9%', '31%', '66%', '88%'].map((left, i) => (
          <span key={left} aria-hidden="true" className="px-petal" style={{ left, animationDelay: `-${2 + i * 3}s` }} />
        ))}
        <p className="gi-hero-kicker">You are invited <span style={{ color: 'var(--mj-gold)' }}>&#10022;</span></p>
        <h1 className="gi-hero-title">
          {names.length > 1 ? (
            <>
              <span>{names[0]} &amp;</span><br />
              <span className="accent">{names[1]}</span>
            </>
          ) : (
            <span className="accent">{names[0] || 'You are invited'}</span>
          )}
        </h1>
        {invite.event_date && <p className="gi-hero-line">{formatEventDate(invite.event_date)}</p>}
        {(invite.venue || invite.city) && (
          <p className="gi-hero-line gi-hero-venue">{formatVenueLine(invite.venue, invite.city)}</p>
        )}
        {env.venues?.main_venue?.links && (
          <p className="gi-hero-links">
            <a href={env.venues.main_venue.links.google_maps} target="_blank" rel="noreferrer" data-mj-link>Directions</a>
            <a href={env.venues.main_venue.links.whatsapp_share} target="_blank" rel="noreferrer" data-mj-link>Share</a>
          </p>
        )}
        {sections.countdown && invite.event_date && !countdown.elapsed && (
          <div className="px-glass-d gi-countdown">
            {[['days', 'Days'], ['hours', 'Hours'], ['mins', 'Mins'], ['secs', 'Secs']].map(([key, label], i) => (
              <div key={key} className="gi-countdown-item" style={{ animationDelay: `${(0.4 + i * 0.08).toFixed(2)}s` }}>
                <p className="gi-countdown-value">{String(countdown[key]).padStart(2, '0')}</p>
                <p className="gi-countdown-label">{label}</p>
              </div>
            ))}
          </div>
        )}
        {sections.rsvp && (
          <a href="#rsvp" className="mj-btn-primary">RSVP now</a>
        )}
        {sections.calendar && invite.event_date && (
          <div style={{ marginTop: sections.rsvp ? 16 : 0, position: 'relative', zIndex: 1 }}>
            <AddToCalendarButton
              title={coupleStr ? `${coupleStr}'s celebration` : 'The celebration'}
              location={formatVenueLine(invite.venue, invite.city)}
              start={new Date(invite.event_date)}
              small
            />
          </div>
        )}
        <p className="gi-scroll-hint">Scroll down &darr;</p>
      </header>

      {/* STORY */}
      {sections.love_story !== false && (invite.love_story || invite.invitation_message) && (
        <section className="gi-section" data-reveal style={{ position: 'relative' }}>
          <div className="px-ripple" aria-hidden="true" />
          <p className="gi-eyebrow">Our story</p>
          <p className="gi-quote" data-reveal="blur">&ldquo;{invite.love_story || invite.invitation_message}&rdquo;</p>
        </section>
      )}

      {/* ABOUT / FAMILY */}
      <AboutFamilySection invite={invite} sections={sections} />

      {/* BRIDE / GROOM BIOS */}
      <CoupleBiosSection invite={invite} sections={sections} />

      {/* LIVE TIMELINE */}
      {sections.events !== false && enabledEvents.length > 0 && (
        <section className="gi-timeline-wrap gi-section--wide">
          <div className="gi-timeline-grid" data-mj-stagger>
            {enabledEvents.map((ev) => {
              const links = eventVenue(ev.event_id)?.links;
              const timeLabel = [formatShortDate(ev.date), formatTime12h(ev.start_time)].filter(Boolean).join(' · ');
              const start = eventDateTime(ev.date, ev.start_time);
              const end = ev.end_time ? eventDateTime(ev.date, ev.end_time) : (start ? new Date(start.getTime() + 2 * 60 * 60 * 1000) : null);
              let badge = null;
              if (sections.live_timeline && start) {
                if (end && now > end) badge = { text: 'Done', cls: 'gi-timeline-badge--done' };
                else if (now >= start && (!end || now <= end)) badge = { text: 'Happening now', cls: 'gi-timeline-badge--now' };
                else badge = { text: 'Upcoming', cls: 'gi-timeline-badge--next' };
              }
              return (
                <div key={ev.event_id} className="gi-timeline-card" data-mj-lift data-reveal>
                  {badge && <span className={`gi-timeline-badge ${badge.cls}`}>{badge.text}</span>}
                  {timeLabel && <p className="gi-timeline-time">{timeLabel}</p>}
                  <h3 className="gi-timeline-name">{ev.name}</h3>
                  <p className="gi-timeline-venue">{ev.venue_name}</p>
                  {links && (
                    <p className="gi-timeline-links">
                      <a href={links.google_maps} target="_blank" rel="noreferrer" data-mj-link style={{ color: 'var(--mj-primary)' }}>Directions</a>
                      {' '}
                      <a href={links.whatsapp_share} target="_blank" rel="noreferrer" data-mj-link style={{ color: 'var(--mj-primary)' }}>Share</a>
                    </p>
                  )}
                  {sections.calendar && start && (!badge || badge.text !== 'Done') && (
                    <div style={{ marginTop: 12 }}>
                      <AddToCalendarButton title={ev.name} location={ev.venue_name} start={start} end={end} small />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* DRESS CODE + FAQ */}
      {(sections.dress_code || invite.faq_settings?.enabled) && (
        <section className="px-aurora gi-split-section">
          <div className="gi-split">
            {sections.dress_code && (
              <div className="gi-split-col" data-reveal="l">
                <p className="gi-split-label">Dress code</p>
                <h2 className="gi-split-title">{invite.dress_code_settings?.title || 'What to wear'}</h2>
                {invite.dress_code_settings?.items?.length ? (
                  <p className="gi-split-body">
                    {invite.dress_code_settings.items.map((it) => `${it.label}${it.notes ? ` — ${it.notes}` : ''}`).join('\n')}
                  </p>
                ) : (
                  <p className="mj-empty-note" style={{ textAlign: 'left', padding: 0 }}>The couple hasn&rsquo;t shared a dress code yet.</p>
                )}
              </div>
            )}
            {invite.faq_settings?.enabled && (
              <div className="gi-split-col" data-reveal="r">
                <p className="gi-split-label">Good to know</p>
                <div className="gi-faq-list">
                  {(invite.faq_settings.items || []).length ? (
                    invite.faq_settings.items.map((item, i) => (
                      <div key={i} className="px-glass gi-faq-card" data-mj-lift>
                        <h4 className="gi-faq-q">{item.q}</h4>
                        <p className="gi-faq-a">{item.a}</p>
                      </div>
                    ))
                  ) : (
                    <p className="mj-empty-note">No questions answered yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* PRE-WEDDING SHOOT */}
      <PreWeddingSection preWeddingLinks={invite.pre_wedding_links} sections={sections} />

      {/* SAVE-THE-DATE VIDEO + LIVE STREAM */}
      <WatchLiveSection invite={invite} sections={sections} />

      {/* GALLERY */}
      {sections.photos !== false && (
        <section className="gi-section gi-section--gallery">
          <div className="gi-gallery-head" data-reveal>
            <h2 data-mj-ink className="gi-gallery-title">The wall is awake</h2>
            {env.gallery_info?.enabled && (
              <a href={`/invite/${slug}/live-gallery`} className="gi-gallery-link">Add your photos &rarr;</a>
            )}
          </div>
          <div className="gi-gallery-grid" data-mj-stagger>
            {photos.length ? (
              photos.slice(0, 12).map((m) => (
                <div key={m.id} className="gi-gallery-tile" data-mj-lift data-reveal="scale">
                  <img src={resolveMediaUrl(m.media_url)} alt={m.caption || ''} loading="lazy" decoding="async" />
                </div>
              ))
            ) : (
              new Array(6).fill(0).map((_, i) => <div key={i} className="gi-gallery-tile gi-gallery-tile--empty" data-reveal="scale" />)
            )}
          </div>
        </section>
      )}

      {/* FIND MY ROOM */}
      <FindMyRoomSection slug={slug} sections={sections} hasRooms={(invite.guest_rooms || []).length > 0} />

      {/* GETTING THERE */}
      <TravelSection travel={env.travel} />

      {/* CONTACT / PARKING */}
      <ContactParkingSection invite={invite} sections={sections} mapLink={env.venues?.main_venue?.links?.google_maps} />

      {/* GIFTS / SHAGUN */}
      {showShagunSection && (
        <ShagunGiftsSection preview={preview} slug={slug} shagun={shagun} shagunEnabled={shagunEnabled} gifts={gifts} coupleStr={coupleStr} effects={effects} />
      )}

      {/* HONEYMOON FUND */}
      <HoneymoonFundSection fund={invite.honeymoon_fund} couple={coupleStr} />

      {/* RSVP */}
      {sections.rsvp && <RsvpSection preview={preview} slug={slug} rsvpSettings={invite.rsvp_settings} effects={effects} />}

      {/* GUEST CHECK-IN */}
      <CheckInSection slug={slug} enabled={!!sections.check_in} events={enabledEvents} preview={preview} />

      {/* SONG REQUESTS */}
      <SongRequestsSection slug={slug} settings={invite.song_requests_settings} preview={preview} />

      {/* WISHES WALL */}
      {sections.greetings !== false && (
        <WishesSection preview={preview} slug={slug} initialWishes={env.wishes || []} />
      )}

      {/* FOOD DONATION TEASER */}
      <FoodDonationTeaser />

      {/* A sample has no slug and no referral code to offer, and rendering it
          anyway fired GET /api/public/referral-code-by-slug/null on every
          preview. */}
      {!preview && <InviteReferralCta slug={slug} code={env.referral_code} />}

      <footer className="gi-footer">
        <p className="gi-footer-signoff">With love,</p>
        <p className="gi-footer-names">{coupleStr}</p>
        <div className="gi-footer-links">
          <a href={`/save-the-date/${slug}`}>Save the date</a>
          <a href={`/invite/${slug}/live-gallery`}>Live photo wall</a>
          {showShagunSection && <a href="#gifts">Digital shagun</a>}
        </div>
        <p className="gi-footer-credit">Invitation by MAJA</p>
      </footer>

      {/* AMBIENT MUSIC — user-initiated only, never autoplay-with-sound. */}
      <AmbientMusicPlayer music={invite.background_music} />
    </div>
  );
}

function ShagunGiftsSection({ slug, shagun, shagunEnabled, gifts, coupleStr, effects, preview }) {
  const [open, setOpen] = useState(false);
  const [previewNote, setPreviewNote] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(shagun.suggested?.[1]?.amount || shagun.suggested?.[0]?.amount || 0);

  const title = gifts?.enabled ? gifts.headline : 'Your blessings mean more than any gift.';
  const body = shagun.blessing_message || gifts?.message || "If you'd still like to send something our way, a digital shagun is warmly welcomed.";

  return (
    <section id="gifts" className="px-night gi-shagun-section">
      {effects && <div className="gi-shagun-glow" aria-hidden="true" />}
      <div className="px-glass-d gi-shagun-card" data-reveal>
        <p className="gi-shagun-eyebrow">With love, not gifts <span style={{ color: 'var(--mj-gold)' }}>&#10022;</span></p>
        <h2 className="gi-shagun-title">{title}</h2>
        <p className="gi-shagun-body">{body}</p>

        {shagunEnabled && (
          <>
            <div className="gi-amt-row">
              {(shagun.suggested || []).map((s) => (
                <button
                  key={s.amount}
                  type="button"
                  className="gi-amt-pill"
                  style={selectedAmount === s.amount ? { background: 'var(--mj-primary)', borderColor: 'var(--mj-primary)', color: '#fff' } : undefined}
                  onClick={() => setSelectedAmount(s.amount)}
                >
                  &#8377;{s.amount.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
            <button type="button" className="mj-btn-primary" onClick={() => (preview ? setPreviewNote(true) : setOpen(true))}>Send shagun</button>
            {previewNote && <p className="gi-preview-note">This is a sample invitation — nothing you send here is recorded.</p>}
          </>
        )}

        {gifts?.enabled && <GiftBlock gifts={gifts} />}
        {!shagunEnabled && gifts && !gifts.enabled && !gifts.suggestions?.length && (
          <p className="mj-body" style={{ margin: 0 }}>{gifts.message}</p>
        )}
      </div>

      {open && !preview && (
        <ShagunModal
          slug={slug}
          shagun={shagun}
          coupleStr={coupleStr}
          initialAmount={selectedAmount}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function GiftBlock({ gifts }) {
  const [copied, setCopied] = useState('');
  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600); } catch (_e) { /* clipboard unavailable */ }
  };
  return (
    <div className="gi-gift-block">
      {gifts.accept_upi && gifts.upi_id && (
        <div className="gi-gift-row">
          <span>UPI &mdash; {gifts.upi_id}</span>
          <button type="button" className="mj-btn-outline-d" onClick={() => copy(gifts.upi_id, 'upi')}>{copied === 'upi' ? 'Copied' : 'Copy'}</button>
        </div>
      )}
      {gifts.accept_bank && gifts.bank_account_number_masked && (
        <div className="gi-gift-row">
          <span>{gifts.bank_account_name} &mdash; {gifts.bank_account_number_masked}{gifts.bank_ifsc ? ` (${gifts.bank_ifsc})` : ''}</span>
        </div>
      )}
      {gifts.accept_external_registry && gifts.external_registry_url && (
        <div className="gi-gift-row">
          <a href={gifts.external_registry_url} target="_blank" rel="noreferrer" className="mj-btn-outline-d">{gifts.external_registry_label || 'View our wishlist'}</a>
        </div>
      )}
      {gifts.suggestions?.length > 0 && (
        <div className="gi-gift-chips">
          {gifts.suggestions.map((s) => (
            s.link
              ? <a key={s.id} href={s.link} target="_blank" rel="noreferrer" className="gi-gift-chip">{s.icon} {s.title}</a>
              : <span key={s.id} className="gi-gift-chip">{s.icon} {s.title}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ShagunModal({ slug, shagun, coupleStr, initialAmount, onClose }) {
  const [amount, setAmount] = useState(initialAmount || 501);
  const [customAmount, setCustomAmount] = useState('');
  const [guestName, setGuestName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const finalAmount = customAmount ? parseInt(customAmount, 10) : amount;

  const payViaUpi = async () => {
    setError('');
    if (!guestName.trim()) { setError('Please share your name first.'); return; }
    if (!finalAmount || finalAmount < 1) { setError('Pick or enter an amount.'); return; }
    setBusy(true);
    try {
      await recordShagun(slug, { guest_name: guestName, amount: finalAmount, message });
      setDone(true);
    } catch (_e) { /* still let them pay */ }
    setBusy(false);
    const upiLink = `upi://pay?pa=${encodeURIComponent(shagun.upi_id)}&pn=${encodeURIComponent(shagun.payee_name || coupleStr)}&am=${finalAmount}&cu=INR&tn=${encodeURIComponent('Shagun for ' + coupleStr)}`;
    window.location.href = upiLink;
  };

  const payViaRazorpay = async () => {
    setError('');
    if (!guestName.trim()) { setError('Please share your name first.'); return; }
    if (!finalAmount || finalAmount < 1) { setError('Pick or enter an amount.'); return; }
    setBusy(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Could not load secure checkout.');
      const { data: order } = await createShagunRazorpayOrder(slug, { amount: finalAmount, guest_name: guestName, message });
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount * 100,
        currency: order.currency,
        order_id: order.order_id,
        name: order.payee_name || coupleStr || 'Wedding Shagun',
        description: `Shagun of ₹${finalAmount.toLocaleString('en-IN')}`,
        theme: { color: '#6d28d9' },
        prefill: { name: guestName },
        handler: async (resp) => {
          try {
            await verifyShagunRazorpay(slug, {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              amount: finalAmount, guest_name: guestName, message,
            });
            setDone(true);
          } catch (e) {
            setError(e.response?.data?.detail || 'Payment went through but verification failed. We will follow up.');
          } finally { setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Could not start payment.');
      setBusy(false);
    }
  };

  return (
    <div className="gi-modal-backdrop" onClick={onClose}>
      <div className="px-glass-d gi-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="gi-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        <p className="gi-shagun-eyebrow" style={{ marginBottom: 12 }}>Digital shagun</p>
        <h3 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 400, fontSize: 22, margin: '0 0 16px', color: '#f2eefb' }}>
          For {coupleStr || 'the couple'}
        </h3>
        <input className="gi-modal-field" placeholder="Your name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        <input className="gi-modal-field" type="number" placeholder={`Amount (suggested ₹${amount})`} value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} />
        <textarea className="gi-modal-field" rows={2} placeholder="A short blessing (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
        {error && <p className="gi-modal-error">{error}</p>}
        {done ? (
          <p className="gi-modal-success">Blessing received with love.</p>
        ) : (
          <>
            {shagun.razorpay_enabled && (
              <button type="button" className="mj-btn-primary" style={{ width: '100%', marginBottom: 8 }} disabled={busy} onClick={payViaRazorpay}>
                {busy ? 'Opening secure checkout…' : `Bless ₹${finalAmount || 0} (UPI · Card · Wallet)`}
              </button>
            )}
            {shagun.upi_id && (
              <button type="button" className="mj-btn-outline-d" style={{ width: '100%' }} disabled={busy} onClick={payViaUpi}>
                Direct UPI: {shagun.upi_id}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RsvpSection({ slug, rsvpSettings, effects, preview }) {
  const settings = rsvpSettings || {};
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [allergies, setAllergies] = useState('');
  const [choice, setChoice] = useState(null); // { status, plusOne, label }
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const { status, error, captcha, submit, answerCaptcha } = useRsvpSubmit(slug);

  const options = settings.plus_one_enabled
    ? [...RSVP_STATUS_OPTIONS, { label: 'Yes, with my partner', status: 'yes', plusOne: true }]
    : RSVP_STATUS_OPTIONS;

  const [previewNote, setPreviewNote] = useState(false);

  const doSubmit = (e) => {
    e.preventDefault();
    // A sample invitation is a real render of this page, not a mock — so the
    // forms are live UI. What they must never do is post a stranger's RSVP or
    // blessing against a slug that belongs to nobody.
    if (preview) { setPreviewNote(true); return; }
    if (!choice || !name.trim() || !phone.trim()) return;
    const payload = { guest_name: name.trim(), guest_phone: phone.trim(), status: choice.status, guest_count: 1 };
    if (choice.plusOne) payload.plus_one = true;
    if (settings.allergies_enabled && allergies.trim()) payload.allergies = allergies.trim();
    submit(payload);
  };

  return (
    <section id="rsvp" className="px-aurora gi-rsvp-section">
      {effects && <span aria-hidden="true" className="px-petal" style={{ left: '14%', width: 10, height: 14, opacity: .45, animationDuration: '17s', animationDelay: '-4s' }} />}
      {effects && <span aria-hidden="true" className="px-petal" style={{ left: '81%', width: 13, height: 17, opacity: .4, animationDuration: '15s', animationDelay: '-10s' }} />}
      <div className="px-glass gi-rsvp-card" data-reveal="scale">
        {status === 'done' ? (
          <div className="gi-rsvp-success">
            <h3>Thank you.</h3>
            <p>Your response has been received with love.</p>
          </div>
        ) : (
          <form onSubmit={doSubmit}>
            <h2 className="gi-rsvp-title">Will you be joining us?</h2>
            <p className="gi-rsvp-sub">We&rsquo;d love to know if you can make it.</p>
            <input className="gi-rsvp-field" placeholder="Your full name" required value={name} onChange={(e) => setName(e.target.value)} />
            <input className="gi-rsvp-field" placeholder="+919876543210" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            {settings.allergies_enabled && (
              <input className="gi-rsvp-field" placeholder="Allergies (optional)" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
            )}
            <div className="gi-rsvp-options">
              {options.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className="gi-rsvp-opt"
                  style={choice?.label === opt.label
                    ? { border: '1px solid var(--mj-accent-soft)', background: 'var(--mj-accent-soft)', color: 'var(--mj-ink-deep)' }
                    : { border: '1px solid var(--mj-border)', background: '#fff', color: 'var(--mj-muted)' }}
                  onClick={() => setChoice(opt)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {status === 'captcha' && captcha && (
              <div className="gi-captcha-row">
                <span className="gi-captcha-chip">{captcha.challenge} =</span>
                <input className="gi-rsvp-field" style={{ margin: 0 }} value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} placeholder="Your answer" />
              </div>
            )}
            {error && <p className="gi-rsvp-error">{error}</p>}
            {previewNote && <p className="gi-preview-note">This is a sample invitation — nothing you send here is recorded.</p>}
            {status === 'captcha' ? (
              <button type="button" className="mj-btn-primary" style={{ width: '100%' }} onClick={() => answerCaptcha(captchaAnswer)}>Verify &amp; send RSVP</button>
            ) : (
              <button type="submit" className="mj-btn-primary" style={{ width: '100%' }} disabled={!choice || status === 'submitting' || status === 'rate_limited'}>
                {status === 'submitting' ? 'Sending…' : 'Send RSVP'}
              </button>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

function WishesSection({ slug, initialWishes, preview }) {
  const [wishes, setWishes] = useState(initialWishes);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'pending'|'error', text }

  const [previewNote, setPreviewNote] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    // A sample invitation is a real render of this page, not a mock — so the
    // forms are live UI. What they must never do is post a stranger's RSVP or
    // blessing against a slug that belongs to nobody.
    if (preview) { setPreviewNote(true); return; }
    if (!name.trim() || !message.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const { data } = await submitWish(slug, { guest_name: name.trim(), message: message.trim() });
      if (data.status === 'approved') {
        setWishes((w) => [{ id: `local-${Date.now()}`, guest_name: name.trim(), message: message.trim(), is_featured: false }, ...w]);
        setName(''); setMessage('');
      } else {
        setNote({ kind: 'pending', text: 'Thank you — your blessing is awaiting a quick review before it appears here.' });
        setName(''); setMessage('');
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setNote({ kind: 'error', text: typeof detail === 'string' ? detail : 'Could not send your blessing. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gi-section gi-section--wishes">
      <h2 className="gi-wishes-title" data-reveal="blur">Blessings for the couple</h2>
      <div className="gi-wishes-list" data-mj-stagger>
        {wishes.length ? wishes.map((w) => (
          <div key={w.id} className="gi-wish-card" data-mj-lift data-reveal>
            <p className="gi-wish-text">&ldquo;{w.message}&rdquo;</p>
            <p className="gi-wish-by">&mdash; {w.guest_name}{w.relationship ? `, ${w.relationship}` : ''}</p>
          </div>
        )) : (
          <p className="mj-empty-note">Be the first to leave a blessing.</p>
        )}
      </div>
      <form onSubmit={submit}>
        <input className="gi-wish-name" placeholder="Your name" required value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="gi-wish-textarea" placeholder="A blessing for the couple&hellip;" required value={message} onChange={(e) => setMessage(e.target.value)} />
        {note && <p className={`gi-wish-note gi-wish-note--${note.kind}`}>{note.text}</p>}
        {previewNote && <p className="gi-preview-note">This is a sample invitation — nothing you send here is recorded.</p>}
        <button type="submit" className="gi-wish-submit" disabled={busy}>{busy ? 'Sending…' : 'Send blessing'}</button>
      </form>
    </section>
  );
}
