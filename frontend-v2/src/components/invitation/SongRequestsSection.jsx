import { useEffect, useState } from 'react';
import { listSongRequests, submitSongRequest } from '@/api/invitations';

// SongRequestsSection — guests suggest songs for the playlist. Live API:
// GET/POST /api/invite/{slug}/song-requests (list also aliased at /songs).
export default function SongRequestsSection({ slug, settings, preview }) {
  const s = settings || {};
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ guest_name: '', song_title: '', artist: '', provider_url: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [previewNote, setPreviewNote] = useState(false);

  useEffect(() => {
    if (!slug || !s.enabled || preview) return;
    let mounted = true;
    listSongRequests(slug, 30)
      .then(({ data }) => { if (mounted) setList(Array.isArray(data) ? data : []); })
      .catch(() => { if (mounted) setList([]); });
    return () => { mounted = false; };
  }, [slug, s.enabled, preview, done]);

  if (!s.enabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (preview) { setPreviewNote(true); return; }
    setErr('');
    setBusy(true);
    try {
      await submitSongRequest(slug, {
        guest_name: form.guest_name.trim(),
        song_title: form.song_title.trim(),
        artist: form.artist.trim() || undefined,
        provider_url: form.provider_url.trim() || undefined,
      });
      setForm((f) => ({ ...f, song_title: '', artist: '', provider_url: '' }));
      setDone(true);
    } catch (e2) {
      setErr(e2.response?.data?.detail || 'Could not submit your song. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gi-section" data-reveal>
      <p className="gi-eyebrow">Song requests</p>
      <h2 className="gi-split-title gi-song-title">Help set the soundtrack</h2>
      {s.intro_message && <p className="gi-split-body gi-song-intro">{s.intro_message}</p>}

      <form onSubmit={submit} className="gi-song-form">
        <div className="gi-song-form-grid">
          <input className="gi-rsvp-field" placeholder="Your name" required value={form.guest_name}
            onChange={(e) => setForm({ ...form, guest_name: e.target.value })} />
          <input className="gi-rsvp-field" placeholder="Song title" required value={form.song_title}
            onChange={(e) => setForm({ ...form, song_title: e.target.value })} />
        </div>
        <div className="gi-song-form-grid">
          <input className="gi-rsvp-field" placeholder="Artist (optional)" value={form.artist}
            onChange={(e) => setForm({ ...form, artist: e.target.value })} />
          <input className="gi-rsvp-field" type="url" placeholder="Spotify / YouTube link (optional)" value={form.provider_url}
            onChange={(e) => setForm({ ...form, provider_url: e.target.value })} />
        </div>
        {err && <p className="gi-rsvp-error">{err}</p>}
        {done && !preview && <p className="gi-wish-note gi-wish-note--pending">Added to the playlist. Thank you!</p>}
        {previewNote && <p className="gi-preview-note">This is a sample invitation — nothing you send here is recorded.</p>}
        <button type="submit" className="mj-btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Suggest song'}</button>
      </form>

      {list.length > 0 && (
        <ul className="gi-song-list">
          {list.slice(0, 12).map((r) => (
            <li key={r.id} className="gi-song-list-item">
              <span className="gi-song-list-text">
                {r.song_title}{r.artist ? ` · ${r.artist}` : ''}
                <span className="gi-song-list-by"> — {r.guest_name}</span>
              </span>
              {r.provider_url && (
                <a href={r.provider_url} target="_blank" rel="noreferrer" className="gi-song-list-link">Listen</a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
