import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSaveTheDate } from '@/api/invitations';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { useCountdown } from '@/lib/useCountdown';
import { formatEventDate, formatVenueLine } from '@/lib/inviteFormat';
import '@/styles/inviteShared.css';
import './SaveTheDate.css';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

export default function SaveTheDate() {
  const { slug } = useParams();
  const [status, setStatus] = useState('loading'); // loading | ready | gone | error
  const [teaser, setTeaser] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setStatus('loading');
    getSaveTheDate(slug)
      .then(({ data }) => { setTeaser(data); setStatus('ready'); })
      .catch((err) => {
        const code = err.response?.status;
        setStatus(code === 404 || code === 410 ? 'gone' : 'error');
      });
  }, [slug]);

  const countdown = useCountdown(teaser?.event_date, 60000);
  const photoUrl = teaser?.couple_photo_url || teaser?.bride_photo_url || teaser?.groom_photo_url;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_e) { /* clipboard unavailable */ }
  };

  if (status === 'loading') {
    return (
      <div className="std-page">
        <div className="mj-invite-state" data-tone="night">
          <div className="mj-spin" aria-hidden="true" />
          <p className="mj-eyebrow">One moment</p>
          <h1>Loading the save-the-date&hellip;</h1>
        </div>
      </div>
    );
  }

  if (status === 'gone' || status === 'error') {
    return (
      <div className="std-page">
        <main id="main-content" className="std-empty-main">
          <div className="px-card-d std-empty-card">
            <div className="std-empty-icon" aria-hidden="true">&times;</div>
            <h1 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 400, fontSize: 'clamp(27px,2.8vw,32px)', lineHeight: 1.2, margin: '0 0 14px' }}>
              This page is unavailable.
            </h1>
            <p style={{ fontSize: 14.5, color: '#ddd6fe', lineHeight: 1.75, margin: '0 0 30px' }}>
              {status === 'error'
                ? "We couldn't load this page right now. Please try again shortly."
                : 'The link may have expired, or the couple has taken it down. If you were expecting an invitation, ask them for the new link.'}
            </p>
            <Link to="/" className="mj-btn-primary">Go to MAJA Invites</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="std-page">
      <main className="std-main">
        <div className="std-photo px-night">
          {photoUrl && <img src={resolveMediaUrl(photoUrl)} alt="" loading="lazy" decoding="async" />}
          <div className="std-photo-glow" aria-hidden="true" />
          {teaser.invitation_message && <p className="std-photo-caption">{teaser.invitation_message}</p>}
        </div>

        <div className="std-content">
          <div className="px-ripple" aria-hidden="true" />
          <p className="std-kicker">Save the date <span style={{ color: 'var(--mj-gold)' }}>&#10022;</span></p>
          <h1 className="std-title">
            <span>{teaser.groom_name}</span><br />
            <span className="accent">&amp; {teaser.bride_name}</span>
          </h1>
          <div className="std-rule" />
          {teaser.event_date && <p className="std-date">{formatEventDate(teaser.event_date)}</p>}
          {(teaser.venue || teaser.city) && (
            <p className="std-venue">{formatVenueLine(teaser.venue, teaser.city)}<br />An invitation follows.</p>
          )}

          {!countdown.elapsed && (
            <div className="px-glass-d std-countdown">
              {[['days', 'Days'], ['hours', 'Hours'], ['mins', 'Minutes']].map(([key, label], i) => (
                <div key={key} style={{ minWidth: 56, animation: `mjPop .6s var(--mj-easing-hero) ${(0.4 + i * 0.08).toFixed(2)}s both` }}>
                  <p className="std-cd-value">{countdown[key]}</p>
                  <p className="std-cd-label">{label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="std-actions">
            <a className="mj-btn-primary" href={`${API_URL}/api/invite/${slug}/calendar`}>Add to calendar</a>
            <button type="button" className="mj-btn-outline-d" onClick={copyLink} style={copied ? { borderColor: 'var(--mj-success)', color: '#a7f3d0' } : undefined}>
              {copied ? 'Link copied' : 'Copy the link'}
            </button>
          </div>
          <p className="std-link-line">{window.location.host}{window.location.pathname}</p>
        </div>
      </main>
    </div>
  );
}
