import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useInviteFull } from '@/lib/useInviteFull';
import { useEventInvitation } from '@/lib/useEventInvitation';
import { useRsvpSubmit } from '@/lib/useRsvpSubmit';
import { formatShortDate, formatTime12h } from '@/lib/inviteFormat';
import InviteStateScreen from '@/components/invite/InviteStateScreen';
import { resolveInviteTheme, themeVars, themeAttrs } from '@/lib/inviteThemes';
import '@/styles/inviteShared.css';
import './CeremonyInvitation.css';

const CEREMONY_LABELS = {
  engagement: 'Engagement', haldi: 'Haldi', mehendi: 'Mehendi',
  sangeet: 'Sangeet', marriage: 'Wedding Ceremony', reception: 'Reception',
};

export default function CeremonyInvitation() {
  const { slug, eventType } = useParams();
  const { status, data, message, retry } = useInviteFull(slug);
  // Per-event endpoint (what QR codes point at) — authoritative for this one
  // ceremony's design/deity override + its own enabled/expiry. /full stays
  // the source for shared sections (venues, wishes, shagun, etc). Called
  // unconditionally (hooks rule) even while /full is still loading.
  const eventInv = useEventInvitation(slug, eventType);

  if (status !== 'ready') {
    return <InviteStateScreen status={status} message={message} onRetry={retry} onPasscode={(pc) => retry(pc)} />;
  }
  // Brief second loading beat for the per-event check — avoids flashing the
  // wrong (profile-default) design/deity before the authoritative one lands.
  if (eventInv.status === 'loading' || eventInv.status === 'skip') {
    return <InviteStateScreen status="loading" />;
  }
  // This specific ceremony was explicitly disabled or its own expiry passed —
  // reuse the page's existing expired styling rather than falling back.
  if (eventInv.status === 'unavailable') {
    return <InviteStateScreen status="expired" />;
  }
  return (
    <CeremonyReady
      slug={slug}
      eventType={eventType}
      env={data}
      eventInvitation={eventInv.status === 'ready' ? eventInv.data : null}
    />
  );
}

function CeremonyReady({ slug, eventType, env, eventInvitation }) {
  const invite = env.invite || {};
  // One celebrant (baby birthday, half saree, Manjal Neerattu, Vetti Kattum)
  // must not render as "<name> &" with nothing after it.
  const celebrant = (invite.celebrant_info || {}).celebrant_name || '';
  const names = [invite.groom_name || celebrant, invite.bride_name]
    .map((n) => (n || '').trim()).filter(Boolean);
  const coupleStr = names.join(' & ');
  // Nav pills always list every ceremony from the /full envelope, unfiltered.
  const enabledEvents = useMemo(() => (invite.events || []).filter((e) => e.enabled !== false), [invite.events]);
  const norm = (eventType || '').toLowerCase();
  const legacyActive = enabledEvents.find((e) => (e.event_type || '').toLowerCase() === norm || e.slug === eventType);
  // When the per-event endpoint succeeded (status 'ready' upstream), its
  // resolved design_id/deity_id are per-ceremony-authoritative — merge them
  // onto the matched event without disturbing anything else about it.
  const active = legacyActive && eventInvitation
    ? { ...legacyActive, design_id: eventInvitation.design_id, deity_id: eventInvitation.deity_id }
    : legacyActive;

  // Each ceremony can carry its own design (the per-event endpoint resolves one
  // above), so theme from the active ceremony first and fall back to the
  // invitation's. Without this the ci-* stylesheet's --inv-* tokens are never
  // set and every ceremony page renders in the house palette.
  const theme = resolveInviteTheme(active?.design_id || invite);

  return (
    <div className="ci-page" style={themeVars(theme)} {...themeAttrs(theme)}>
      <nav className="px-glass-d ci-nav">
        {enabledEvents.map((e) => {
          const isActive = !!active && e.event_id === active.event_id;
          return (
            <Link
              key={e.event_id}
              to={`/invite/${slug}/${e.event_type}`}
              className="mj-pill-toggle"
              style={isActive
                ? { border: '1px solid var(--mj-primary)', background: 'var(--mj-primary)', color: '#fff', textDecoration: 'none' }
                : { border: '1px solid rgba(196,181,253,.28)', background: 'transparent', color: '#ddd6fe', textDecoration: 'none' }}
            >
              {e.name || CEREMONY_LABELS[e.event_type] || e.event_type}
            </Link>
          );
        })}
        <Link to={`/invite/${slug}`} className="mj-btn-outline-d ci-nav-spacer">Full invitation</Link>
      </nav>

      {active ? (
        <CeremonyDetail slug={slug} event={active} venues={env.venues} coupleStr={coupleStr} rsvpEnabled={!!invite.sections_enabled?.rsvp} />
      ) : (
        <main id="main-content" className="ci-fallback">
          <div className="px-card-d ci-fallback-card">
            <p className="ci-eyebrow" style={{ textAlign: 'center' }}>Template preview</p>
            <h1 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 400, fontSize: 'clamp(23px,6.4vw,27px)', lineHeight: 1.2, margin: '0 0 14px' }}>
              This ceremony hasn&rsquo;t been set up yet.
            </h1>
            <p style={{ fontSize: 14.5, color: '#ddd6fe', lineHeight: 1.75, margin: '0 0 30px' }}>
              {coupleStr ? `${coupleStr} haven't` : "The couple hasn't"} added timings or a venue for &ldquo;{eventType}&rdquo; yet. Try the full invitation instead.
            </p>
            <div className="ci-fallback-actions">
              <Link to={`/invite/${slug}`} className="mj-btn-primary">Open the main invitation</Link>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function CeremonyDetail({ slug, event, venues, coupleStr, rsvpEnabled }) {
  const label = event.name || CEREMONY_LABELS[event.event_type] || event.event_type;
  const timeLabel = [formatShortDate(event.date), formatTime12h(event.start_time)].filter(Boolean).join(' · ');
  const venueLine = [event.venue_name, event.venue_address].filter(Boolean).join(', ');
  const eventVenue = (venues?.events || []).find((v) => v.event_id === event.event_id) || venues?.main_venue;

  return (
    <div>
      <header className="px-night ci-hero">
        <span className="ci-hero-glow ci-hero-glow--a" aria-hidden="true" />
        <span className="ci-hero-glow ci-hero-glow--b" aria-hidden="true" />
        <p className="ci-kicker">You are invited to the <span style={{ color: 'var(--mj-gold)' }}>&#10022;</span></p>
        <h1 className="ci-title">{label}</h1>
        <p className="ci-names"><span>{coupleStr.split('&')[0]}&amp;</span> <span className="accent">{coupleStr.split('&')[1]}</span></p>
        <div className="ci-rule" />
        {timeLabel && <p className="ci-line">{timeLabel}{event.muhurtham_time ? ` · Muhurtham ${formatTime12h(event.muhurtham_time)}` : ''}</p>}
        {venueLine && <p className="ci-line ci-line--venue">{venueLine.toUpperCase()}</p>}
        {rsvpEnabled && <a href="#rsvp" className="mj-btn-primary">Tell them you&rsquo;re coming</a>}
      </header>

      {event.description && (
        <section className="ci-section" data-reveal style={{ position: 'relative' }}>
          <p className="ci-eyebrow">What happens</p>
          <p className="ci-quote" data-reveal="blur">{event.description}</p>
        </section>
      )}

      <section className="ci-section ci-section--wide">
        <p className="ci-order-label" data-reveal>Ceremony details</p>
        <div className="px-card-d ci-order-card" data-mj-lift data-reveal>
          {timeLabel && <p className="ci-order-time">{timeLabel}</p>}
          <h3 className="ci-order-name">{label}</h3>
          {venueLine && <p className="ci-order-note">{venueLine}</p>}
        </div>
      </section>

      {(event.dress_code || eventVenue) && (
        <section className="ci-split-section">
          <div className="ci-split">
            {event.dress_code && (
              <div className="ci-split-col" data-reveal="l">
                <p className="ci-split-label">What to wear</p>
                <h2 className="ci-split-title">Dress code</h2>
                <p className="ci-split-body">{event.dress_code}</p>
              </div>
            )}
            {eventVenue && (
              <div className="ci-split-col" data-reveal="r">
                <p className="ci-split-label">Getting there</p>
                <div className="ci-logistics">
                  <div className="px-card-d ci-logi-card" data-mj-lift>
                    <p className="ci-logi-q">Venue</p>
                    <p className="ci-logi-a">{eventVenue.address || eventVenue.name}</p>
                    {eventVenue.parking_info && <p className="ci-logi-a">Parking: {eventVenue.parking_info}</p>}
                    {eventVenue.links && (
                      <p className="ci-logi-links">
                        <a href={eventVenue.links.google_maps} target="_blank" rel="noreferrer">Directions</a>
                        <a href={eventVenue.links.whatsapp_share} target="_blank" rel="noreferrer">Share</a>
                      </p>
                    )}
                  </div>
                  <div className="px-card-d ci-logi-card" data-mj-lift>
                    <p className="ci-logi-q">Children</p>
                    <p className="ci-logi-a">Very welcome — let us know how many when you RSVP.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {rsvpEnabled && <CeremonyRsvp slug={slug} shortName={label} />}

      <footer className="ci-footer">
        <Link to="/" style={{ fontSize: 12.5, color: '#c4b5fd', textDecoration: 'none' }}>Made with MAJA Invites</Link>
      </footer>
    </div>
  );
}

function CeremonyRsvp({ slug, shortName }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [choice, setChoice] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const { status, error, captcha, submit, answerCaptcha } = useRsvpSubmit(slug);

  const OPTIONS = [
    { label: 'Yes, with joy', status: 'yes' },
    { label: 'Regretfully no', status: 'no' },
    { label: 'Trying my best', status: 'maybe' },
  ];

  const pick = (opt) => {
    setChoice(opt);
    if (name.trim() && phone.trim()) {
      submit({ guest_name: name.trim(), guest_phone: phone.trim(), status: opt.status, guest_count: 1 });
    }
  };

  return (
    <section id="rsvp" className="ci-section ci-section--rsvp" data-reveal>
      <span aria-hidden="true" className="px-petal" style={{ left: '6%', width: 10, height: 14, opacity: .4, animationDuration: '17s', animationDelay: '-4s' }} />
      <span aria-hidden="true" className="px-petal" style={{ left: '92%', width: 13, height: 17, opacity: .35, animationDuration: '15s', animationDelay: '-10s' }} />
      <p className="ci-eyebrow" style={{ position: 'relative', zIndex: 1 }}>RSVP</p>
      <h2 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 400, fontSize: 'clamp(26px,2.8vw,31px)', lineHeight: 1.2, margin: '0 0 12px', position: 'relative', zIndex: 1 }}>
        Will we see you at the {shortName}?
      </h2>
      <p style={{ fontSize: 14.5, color: '#ddd6fe', lineHeight: 1.7, margin: '0 0 30px', position: 'relative', zIndex: 1 }}>
        One RSVP covers every ceremony you&rsquo;re invited to.
      </p>

      {status === 'done' ? (
        <p className="ci-rsvp-success">Wonderful — you&rsquo;re on the list. Thank you for letting us know.</p>
      ) : (
        <>
          <div className="ci-rsvp-name-row">
            <input className="ci-rsvp-field" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="ci-rsvp-field" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="ci-rsvp-options">
            {OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="ci-rsvp-opt"
                disabled={!name.trim() || !phone.trim() || status === 'submitting'}
                style={choice?.label === opt.label
                  ? { border: '1px solid var(--mj-primary)', background: 'var(--mj-primary)', color: '#fff' }
                  : { border: '1px solid rgba(196,181,253,.28)', background: 'transparent', color: '#f2eefb' }}
                onClick={() => pick(opt)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {status === 'captcha' && captcha && (
            <div className="ci-captcha-row">
              <span className="ci-captcha-chip">{captcha.challenge} =</span>
              <input className="ci-rsvp-field" style={{ margin: 0 }} value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} placeholder="Your answer" />
              <button type="button" className="mj-btn-primary" onClick={() => answerCaptcha(captchaAnswer)}>Verify</button>
            </div>
          )}
          {error && <p className="ci-rsvp-error">{error}</p>}
          {!name.trim() || !phone.trim() ? (
            <p style={{ fontSize: 12.5, color: '#a78bfa', position: 'relative', zIndex: 1 }}>Add your name and phone, then pick a reply.</p>
          ) : null}
        </>
      )}

      <div className="ci-back-link">
        <Link to={`/invite/${slug}`} data-mj-link style={{ fontSize: 13.5, fontWeight: 600, textDecoration: 'none', color: '#c4b5fd' }}>
          See the full wedding invitation &rarr;
        </Link>
      </div>
    </section>
  );
}
