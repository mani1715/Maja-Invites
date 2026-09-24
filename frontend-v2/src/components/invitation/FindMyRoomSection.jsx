import { useState } from 'react';
import { roomLookup } from '@/api/invitations';

// FindMyRoomSection — guest types >=2 chars of their name, backend does a
// case-insensitive partial match against guest_rooms (phone stripped).
// GET /api/invite/{slug}/room-lookup?name=...
export default function FindMyRoomSection({ slug, sections, hasRooms }) {
  const [name, setName] = useState('');
  const [matches, setMatches] = useState(null); // null = not searched yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!sections.guest_rooms || !hasRooms) return null;

  const onSearch = async (e) => {
    e.preventDefault();
    const q = name.trim();
    setError('');
    if (q.length < 2) { setError('Please enter at least 2 characters of your name.'); return; }
    setLoading(true);
    try {
      const { data } = await roomLookup(slug, q);
      setMatches(data?.matches || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Lookup failed. Please try again.');
      setMatches(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="gi-section" data-reveal>
      <p className="gi-eyebrow">Where you&rsquo;ll stay</p>
      <h2 className="gi-split-title gi-room-title">Find your room</h2>
      <p className="gi-split-body gi-room-sub">Type your name (or part of it) to see your assigned accommodation.</p>

      <form onSubmit={onSearch} className="gi-room-form">
        <input
          className="gi-rsvp-field"
          style={{ margin: 0, flex: 1 }}
          placeholder="Type your full name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="mj-btn-primary" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>
      {error && <p className="gi-rsvp-error">{error}</p>}

      {matches !== null && (
        <div className="gi-room-results">
          {matches.length === 0 ? (
            <p className="mj-empty-note">No matching room found for &ldquo;{name}&rdquo;. Try a shorter name, or check with the family.</p>
          ) : (
            matches.map((r, i) => (
              <div key={r.id || i} className="gi-room-card" data-mj-lift>
                <div className="gi-room-card-head">
                  <span className="gi-room-guest">{r.guest_name}</span>
                  {r.room_number && <span className="gi-room-number">Room {r.room_number}</span>}
                </div>
                <div className="gi-room-details">
                  {r.building && <span>{r.building}</span>}
                  {r.floor && <span>{r.floor}</span>}
                  {r.check_in && <span>Check-in · {r.check_in}</span>}
                  {r.check_out && <span>Check-out · {r.check_out}</span>}
                </div>
                {r.address && <p className="gi-room-address">{r.address}</p>}
                {r.notes && <p className="gi-room-notes">{r.notes}</p>}
                {(r.map_link || r.address) && (
                  <a
                    href={r.map_link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.building, r.address].filter(Boolean).join(', '))}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mj-btn-outline-d"
                    style={{ marginTop: 12 }}
                  >
                    Open in maps
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
