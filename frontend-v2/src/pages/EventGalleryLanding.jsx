import { useParams, useNavigate } from 'react-router-dom';
import './LivePhotoWall.css';

// Chooser landing for the event's single face-match QR. Guests scan one code
// and pick between the full event wall (PIN-gated, whoever wants to browse
// everything) or AI face match (selfie search — only their own photos).
// Both destinations do their own access/PIN gating; this page is just the fork.
export default function EventGalleryLanding() {
  const { slug } = useParams();
  const navigate = useNavigate();

  return (
    <div className="lpw-page lpw-shell">
      <div className="mj-aurora lpw-gate">
        <div className="mj-glass lpw-gate-card">
          <p style={{ fontSize: 12, letterSpacing: '.28em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 18px', fontWeight: 600 }}>Find your photos</p>
          <h1 className="lpw-gate-title">Event photos</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', marginTop: 8 }}>
            <button
              type="button"
              className="lpw-solid-btn"
              style={{ width: '100%', minHeight: 48, padding: '14px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, whiteSpace: 'normal' }}
              onClick={() => navigate(`/invite/${slug}/live-gallery`)}
            >
              <span>Whole album</span>
              <span style={{ fontSize: 12, fontWeight: 400, opacity: .85 }}>View the complete event gallery</span>
            </button>
            <button
              type="button"
              className="lpw-ghost-btn"
              style={{ width: '100%', minHeight: 48, padding: '14px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, whiteSpace: 'normal' }}
              onClick={() => navigate(`/invite/${slug}/find-my-photos`)}
            >
              <span>Find my photos</span>
              <span style={{ fontSize: 12, fontWeight: 400, opacity: .85 }}>Take a selfie — see only the photos you&rsquo;re in</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
