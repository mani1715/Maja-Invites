import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import * as api from '@/api/events';
import EventInvitationCard from '@/components/events/EventInvitationCard';
import './EventDesignPreview.css';

// Public preview for one approved event design: /events/preview/:eventType/:templateId
//
// This route used to be `<Navigate to="/events" replace />`. The URL resolved,
// nothing 404'd, and there was simply no preview — the exact failure mode
// SESSION_CONTEXT calls out: a redirect to a different screen is not coverage.
//
// The wording below is SAMPLE wording, and says so on the page. A design
// preview with an empty centre tells a buyer nothing about how their words
// will sit in the artwork, and inventing a specific mandal's details would be
// worse than generic ones.

const SAMPLE = {
  heading: 'Ganesh Chaturthi',
  subheading: 'You are warmly invited',
  welcome_message:
    'Join us for the sthapana, the morning aarti and the evening cultural programme. '
    + 'Prasadam will be served on all days.',
};

const TYPE_LABEL = { ganesh_chaturthi: 'Ganesh Chaturthi' };

function label(t) {
  return TYPE_LABEL[t] || String(t || '').replace(/_/g, ' ');
}

export default function EventDesignPreview() {
  const { eventType, templateId } = useParams();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.templates(eventType)
      .then(({ data }) => setTemplates(data?.templates || []))
      .catch((e) => setError(
        e?.response?.status === 404
          ? 'These designs are not available right now.'
          : e?.response?.data?.detail || 'Could not load the designs.',
      ))
      .finally(() => setLoading(false));
  }, [eventType]);

  useEffect(() => { load(); }, [load]);

  const current = templates?.find((t) => t.template_id === templateId) || null;

  useSeo({
    title: current ? `${current.name} — ${label(eventType)} invitation design` : `${label(eventType)} invitation designs`,
    description: current
      ? `${current.name}: ${current.palette}. See the full ${label(eventType)} invitation design before you order.`
      : `Browse every approved ${label(eventType)} invitation design.`,
  });

  return (
    <div className="edp-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <main id="main-content" className="edp-body">
        <p className="edp-eyebrow">{label(eventType)}</p>

        {loading && <div className="edp-skel" />}

        {!loading && error && (
          <>
            <h1 className="edp-h1">Designs unavailable</h1>
            <p className="edp-lead">{error}</p>
            <Link className="edp-btn" to="/browse">Browse wedding designs instead</Link>
          </>
        )}

        {!loading && !error && templates && templates.length === 0 && (
          <>
            <h1 className="edp-h1">No designs published yet</h1>
            <p className="edp-lead">Approved artwork for this celebration has not been published.</p>
            <Link className="edp-btn" to="/browse">Browse wedding designs</Link>
          </>
        )}

        {!loading && !error && templates && templates.length > 0 && !current && (
          <>
            <h1 className="edp-h1">{label(eventType)} invitation designs</h1>
            <p className="edp-lead">
              {templates.length} approved designs. Pick one to see it full size.
            </p>
          </>
        )}

        {current && (
          <>
            <h1 className="edp-h1">{current.name}</h1>
            <p className="edp-lead">{current.palette}</p>

            <div className="edp-stage">
              <div className="edp-stage-card">
                <EventInvitationCard template={current} content={SAMPLE} variant="preview" />
              </div>
              <div className="edp-stage-side">
                <p className="edp-note">
                  The wording shown is an example, so you can see how text sits in
                  the artwork. Your own details replace it.
                </p>
                <Link className="edp-btn" to="/events">Use this design</Link>
                <p className="edp-fine">
                  You will be asked to sign in as a studio to build the invitation.
                </p>
              </div>
            </div>
          </>
        )}

        {!loading && !error && templates && templates.length > 0 && (
          <section className="edp-more">
            <h2 className="edp-h2">{current ? 'Other designs' : 'All designs'}</h2>
            <div className="edp-grid">
              {templates
                .filter((t) => t.template_id !== templateId)
                .map((t) => (
                  <button
                    key={t.template_id}
                    type="button"
                    className="edp-tile"
                    onClick={() => navigate(`/events/preview/${eventType}/${t.template_id}`)}
                  >
                    <EventInvitationCard template={t} variant="thumb" />
                    <span className="edp-tile-name">{t.name}</span>
                    <span className="edp-tile-palette">{t.palette}</span>
                  </button>
                ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
