import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Music, Send, ExternalLink, Disc3 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const inputStyle = {
  width: '100%', padding: '0.85rem 1rem', background: 'transparent', color: '#FFF8DC',
  border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none',
  fontFamily: 'Manrope, sans-serif', fontSize: '0.92rem', caretColor: '#D4AF37',
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</span>
    {children}
  </label>
);

/**
 * SongRequestSection — guests submit songs they want at the wedding.
 * Hidden when `settings.enabled` is false.
 */
const SongRequestSection = ({ slug, settings }) => {
  const s = settings || {};
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ guest_name: '', song_title: '', artist: '', provider_url: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!slug || !s.enabled) return;
    axios.get(`${API_URL}/api/invite/${slug}/songs?limit=30`)
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]));
  }, [slug, s.enabled, done]);

  if (!s.enabled) return null;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const payload = {
        guest_name: form.guest_name.trim(),
        song_title: form.song_title.trim(),
        artist: form.artist.trim() || undefined,
        provider_url: form.provider_url.trim() || undefined,
      };
      await axios.post(`${API_URL}/api/invite/${slug}/song-requests`, payload);
      setForm({ guest_name: form.guest_name, song_title: '', artist: '', provider_url: '' });
      setDone(Date.now());
    } catch (e) {
      const d = e.response?.data?.detail;
      const msg = Array.isArray(d) ? d.map((x) => `${(x.loc || []).slice(-1)[0]}: ${x.msg}`).join(' · ') : (d || 'Could not submit song.');
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-6 md:px-16 py-20" data-testid="section-song-requests">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
        >
          <span className="lux-eyebrow inline-flex items-center gap-2 mb-5">
            <Disc3 className="w-3.5 h-3.5" /> Song Requests
          </span>
          <h2
            className="font-display text-[2rem] md:text-[2.8rem] leading-[1.05] mb-3"
            style={{ color: '#FFF8DC' }}
          >
            Set the <span className="text-gold italic font-script">soundtrack.</span>
          </h2>
          {s.intro_message && (
            <p className="text-[1rem] leading-relaxed mb-6 max-w-2xl" style={{ color: 'rgba(255,248,220,0.85)' }}>
              {s.intro_message}
            </p>
          )}
        </motion.div>

        <form onSubmit={submit} className="lux-glass p-6 md:p-7 space-y-4" data-testid="song-request-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Your Name">
              <input
                required
                type="text"
                value={form.guest_name}
                onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                style={inputStyle}
                data-testid="song-request-name"
              />
            </Field>
            <Field label="Song Title">
              <input
                required
                type="text"
                value={form.song_title}
                onChange={(e) => setForm({ ...form, song_title: e.target.value })}
                placeholder="e.g. Tum Hi Ho"
                style={inputStyle}
                data-testid="song-request-title"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Artist (optional)">
              <input
                type="text"
                value={form.artist}
                onChange={(e) => setForm({ ...form, artist: e.target.value })}
                placeholder="e.g. Arijit Singh"
                style={inputStyle}
                data-testid="song-request-artist"
              />
            </Field>
            <Field label="Spotify / YouTube link (optional)">
              <input
                type="url"
                value={form.provider_url}
                onChange={(e) => setForm({ ...form, provider_url: e.target.value })}
                placeholder="https://…"
                style={inputStyle}
                data-testid="song-request-url"
              />
            </Field>
          </div>
          {err && <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(139,0,0,0.18)', color: '#FFD7C9' }}>{err}</div>}
          {done && <div className="text-sm px-3 py-2 rounded-md" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C766' }}>Added to the playlist. Thank you!</div>}
          <button type="submit" disabled={busy} className="lux-btn inline-flex items-center gap-2" data-testid="song-request-submit">
            {busy ? 'Sending…' : 'Suggest Song'} <Send className="w-3.5 h-3.5" />
          </button>
        </form>

        {list.length > 0 && (
          <div className="mt-10">
            <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'rgba(255,248,220,0.7)' }}>
              Recent picks
            </div>
            <ul className="space-y-2" data-testid="song-request-list">
              {list.slice(0, 12).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-md"
                  style={{ border: '1px solid var(--lux-border)', background: 'rgba(255,248,220,0.02)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Music className="w-4 h-4 shrink-0" style={{ color: '#D4AF37' }} />
                    <div className="min-w-0">
                      <div className="text-sm truncate" style={{ color: '#FFF8DC' }}>
                        {r.song_title}
                        {r.artist ? <span style={{ color: 'rgba(255,248,220,0.78)' }}> · {r.artist}</span> : null}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'rgba(255,248,220,0.62)' }}>
                        by {r.guest_name}
                      </div>
                    </div>
                  </div>
                  {r.provider_url && (
                    <a
                      href={r.provider_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs"
                      style={{ color: '#E8C766' }}
                    >
                      Listen <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};

export default SongRequestSection;
