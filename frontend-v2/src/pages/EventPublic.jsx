import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useSeo from '@/lib/useSeo';
import * as api from '@/api/events';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { rupees } from '@/components/AdminModule';
import EventInvitationCard from '@/components/events/EventInvitationCard';
import EventDonate from '@/components/events/EventDonate';
import './EventPublic.css';

// Public page for a Dynamic Event Engine event: /e/:slug and /e/:slug/money.
//
// Contract verified against event_lifecycle_service.public_get and
// event_money_service:
//   GET /api/public/events/{slug}            -> the event doc itself, with
//        venue, organizer, schedule[], gallery[], sponsors[], journey[],
//        highlights[], prasadam[], template, granted_features
//   GET /api/public/events/{slug}/leaderboard-> {donors[], top[], upi_id,
//        qr_image_url, causes[], spending?}
//   GET /api/public/events/{slug}/blessings  -> guest blessings
// A 404 means: not found, not published, suspended/hidden, OR the whole event
// module is disabled. All four read the same to a guest, so the copy covers
// them without guessing which one it was.
//
// `granted_features` is plan gating: null means show everything.

function allowed(features, key) {
  if (!features) return true;
  if (Array.isArray(features)) return features.includes(key);
  return features[key] !== false;
}

export default function EventPublic({ view = 'event' }) {
  const { slug } = useParams();
  const [event, setEvent] = useState(null);
  const [board, setBoard] = useState(null);
  const [blessings, setBlessings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.publicEvent(slug).then((r) => r.data),
      // Money and blessings are optional per event; never fail the page on them.
      api.publicLeaderboard(slug).then((r) => r.data).catch(() => null),
      api.publicBlessings(slug).then((r) => r.data).catch(() => null),
    ])
      .then(([ev, lb, bl]) => {
        setEvent(ev);
        setBoard(lb);
        setBlessings(bl?.blessings || bl?.items || (Array.isArray(bl) ? bl : []));
      })
      .catch((e) => setError(
        e?.response?.status === 404
          ? 'This page is not available. The link may be wrong, or the organisers have taken it down.'
          : 'Could not load this event. Please try again in a moment.',
      ))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  // After a contribution, refresh the totals ONLY. Re-running load() would
  // remount the form and throw away the thank-you the guest is reading.
  const reloadBoard = useCallback(() => {
    api.publicLeaderboard(slug).then((r) => setBoard(r.data)).catch(() => {});
  }, [slug]);

  useSeo({
    title: event?.title || 'Event',
    description: event?.description
      ? String(event.description).slice(0, 155)
      : 'A community celebration on MAJA.',
    type: 'article',
  });

  if (loading) return <div className="evp-loading">Loading…</div>;

  if (error) {
    return (
      <div className="evp-page">
        <main id="main-content" className="evp-error" role="alert">
          <h1 className="evp-error-title">Nothing here</h1>
          <p className="evp-error-body">{error}</p>
          <Link className="evp-btn evp-btn--ghost" to="/">Go to MAJA</Link>
        </main>
      </div>
    );
  }

  const gf = event?.granted_features;
  const collected = Number(board?.total ?? board?.total_collected ?? 0);
  const spending = board?.spending;
  const cover = event?.gallery?.[0]?.image_url || event?.gallery?.[0]?.url;

  // ---------------------------------------------------------------- money
  if (view === 'money') {
    return (
      <div className="evp-page">
        <header className="px-aurora evp-hero evp-hero--slim">
          <div className="evp-hero-inner">
            <Link to={`/e/${slug}`} className="evp-back" data-mj-link>&larr; {event?.title || 'Back to the event'}</Link>
            <h1 className="evp-h1">Where the money went</h1>
            <p className="evp-sub">
              Published by the organising committee. Donor names appear only if
              they chose to be listed.
            </p>
          </div>
        </header>

        <main id="main-content" className="evp-body">
          {!board ? (
            <p className="evp-empty">The committee has not published an account for this event.</p>
          ) : (
            <>
              <div className="evp-totals">
                <Total label="Collected" value={rupees.format(collected)} />
                {spending && <Total label="Spent" value={rupees.format(spending.total ?? 0)} />}
                {spending && <Total label="In hand" value={rupees.format(collected - Number(spending.total ?? 0))} />}
              </div>

              {Array.isArray(board.causes) && board.causes.length > 0 && (
                <section className="evp-section">
                  <h2 className="evp-h2">What it is for</h2>
                  <div className="evp-chips">
                    {board.causes.map((c) => <span className="evp-chip" key={c}>{c}</span>)}
                  </div>
                </section>
              )}

              {spending?.categories?.length > 0 && (
                <section className="evp-section">
                  <h2 className="evp-h2">Spending by category</h2>
                  <div className="evp-tablewrap">
                    <table className="evp-table">
                      <thead><tr><th>Category</th><th>Amount</th></tr></thead>
                      <tbody>
                        {spending.categories.map((c, i) => (
                          <tr key={c.category || i}>
                            <td style={{ textTransform: 'capitalize' }}>{String(c.category || 'Other').replace(/_/g, ' ')}</td>
                            <td>{rupees.format(c.amount || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {Array.isArray(board.top) && board.top.length > 0 && (
                <section className="evp-section">
                  <h2 className="evp-h2">With thanks to</h2>
                  <div className="evp-tablewrap">
                    <table className="evp-table">
                      <thead><tr><th>Donor</th><th>Amount</th></tr></thead>
                      <tbody>
                        {board.top.map((d, i) => (
                          <tr key={d.id || i}>
                            <td>{d.donor_name || d.name || 'Anonymous'}</td>
                            <td>{rupees.format(d.amount || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          <p className="evp-note">
            Figures are entered by the committee. MAJA hosts this page but does
            not audit it — if something looks wrong, speak to the organisers.
          </p>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------- event
  return (
    <div className="evp-page">
      <header className="px-aurora evp-hero">
        {cover && <img className="evp-cover" src={resolveMediaUrl(cover)} alt="" />}
        <div className="evp-hero-inner">
          <p className="evp-eyebrow" style={{ textTransform: 'capitalize' }}>
            {String(event?.event_type || 'Celebration').replace(/_/g, ' ')}
          </p>
          <h1 className="evp-h1">{event?.title || 'A celebration'}</h1>
          {(event?.start_date || event?.venue) && (
            <p className="evp-meta">
              {event.start_date && new Date(event.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              {event.start_date && event.venue?.name ? ' · ' : ''}
              {[event.venue?.name, event.venue?.city].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      </header>

      <main id="main-content" className="evp-body">
        {/* The invitation itself. The backend resolves `template` onto the doc
            on read (event_lifecycle_service.public_get), so the artwork and its
            text-zone geometry arrive with the event — the guest never waits on
            a second request, and this cannot disagree with the builder preview. */}
        {event?.template && (
          <section className="evp-invite">
            <EventInvitationCard
              template={event.template}
              content={event.content || {}}
              variant="preview"
              alt={`${event.title || 'Event'} invitation`}
            />
          </section>
        )}

        {event?.description && <p className="evp-lead">{event.description}</p>}

        {allowed(gf, 'schedule') && event?.schedule?.length > 0 && (
          <section className="evp-section">
            <h2 className="evp-h2">Programme</h2>
            <div className="evp-tablewrap">
              <table className="evp-table">
                <thead><tr><th>Day</th><th>What</th><th>Time</th></tr></thead>
                <tbody>
                  {event.schedule.map((s, i) => (
                    <tr key={s.id || i}>
                      <td>{s.day_label || s.date || `Day ${i + 1}`}</td>
                      <td>{s.title || s.name || '—'}</td>
                      <td>{[s.start_time, s.end_time].filter(Boolean).join(' – ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {event?.venue && (
          <section className="evp-section">
            <h2 className="evp-h2">Where</h2>
            <p className="evp-plain">
              <strong>{event.venue.name}</strong>
              {event.venue.address && <><br />{event.venue.address}</>}
              {event.venue.city && <><br />{event.venue.city}</>}
            </p>
            {event.venue.map_link && (
              <a className="evp-btn evp-btn--ghost" href={event.venue.map_link} target="_blank" rel="noreferrer">Open in Maps</a>
            )}
          </section>
        )}

        {event?.organizer && (
          <section className="evp-section">
            <h2 className="evp-h2">Organised by</h2>
            <p className="evp-plain">
              <strong>{event.organizer.name || event.organizer.org_name}</strong>
              {event.organizer.phone && <><br />{event.organizer.phone}</>}
            </p>
          </section>
        )}

        {allowed(gf, 'prasadam') && event?.prasadam?.length > 0 && (
          <section className="evp-section">
            <h2 className="evp-h2">Prasadam</h2>
            <div className="evp-chips">
              {event.prasadam.map((p, i) => <span className="evp-chip" key={p.id || i}>{p.item || p.name}</span>)}
            </div>
          </section>
        )}

        {allowed(gf, 'sponsors') && event?.sponsors?.length > 0 && (
          <section className="evp-section">
            <h2 className="evp-h2">Supported by</h2>
            <div className="evp-chips">
              {event.sponsors.map((s, i) => <span className="evp-chip" key={s.id || i}>{s.name}</span>)}
            </div>
          </section>
        )}

        {board && (
          <section className="evp-section">
            <h2 className="evp-h2">Contributions</h2>
            <div className="evp-totals">
              <Total label="Collected so far" value={rupees.format(collected)} />
              {board.donors?.length > 0 && <Total label="Donors" value={String(board.donors.length)} />}
            </div>
            {board.upi_id && (
              <p className="evp-plain">
                To contribute, use UPI: <strong>{board.upi_id}</strong>
              </p>
            )}
            {board.qr_image_url && (
              <img className="evp-qr" src={resolveMediaUrl(board.qr_image_url)} alt="UPI QR code for donations" loading="lazy" decoding="async" />
            )}
            {/* The QR and the UPI id above tell a guest how to pay. Without this
                form there was no way to tell the organisers that they HAD —
                the money arrived with no name against it. `donations` is a
                priced plan feature (event_pricing.py), so it is gated. */}
            {allowed(gf, 'donations') && (
              <EventDonate slug={slug} causes={board.causes || []} onDone={reloadBoard} />
            )}
            <Link className="evp-btn evp-btn--primary" to={`/e/${slug}/money`}>See the full account</Link>
          </section>
        )}

        {blessings.length > 0 && (
          <section className="evp-section">
            <h2 className="evp-h2">Blessings</h2>
            <div className="evp-blessings">
              {blessings.slice(0, 30).map((b, i) => (
                <blockquote className="evp-blessing" key={b.id || i}>
                  <p>{b.message}</p>
                  <cite>{b.guest_name || 'A well-wisher'}</cite>
                </blockquote>
              ))}
            </div>
          </section>
        )}

        <p className="evp-note">
          Hosted on MAJA. <Link to="/" data-mj-link>Make one for your own celebration</Link>.
        </p>
      </main>
    </div>
  );
}

function Total({ label, value }) {
  return (
    <div className="evp-total">
      <span className="evp-total-label">{label}</span>
      <span className="evp-total-value">{value}</span>
    </div>
  );
}
