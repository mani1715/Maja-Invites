import React, { useEffect, useRef, useState, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Check, Loader2, Music } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const WEDDING_MOODS = ['all', 'devotional', 'classical', 'pleasant', 'cinematic', 'romantic'];
const CELEBRATION_MOODS = ['all', 'lullaby', 'joyful', 'devotional', 'pleasant', 'cinematic'];

/**
 * 20-track curated preset picker with inline preview audio.
 * - value: currently selected URL (string)
 * - onChange(url): emit selected URL
 * - allowCustom: also show a "paste your own URL" field
 * - category: 'wedding' (default) or 'celebration' — switches the curated
 *   library and the mood filter list.
 */
const MusicPresetPicker = ({ value, onChange, allowCustom = true, category = 'wedding' }) => {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [mood, setMood] = useState('all');
  const [customUrl, setCustomUrl] = useState(
    presets.find((p) => p.url === value) ? '' : (value || '')
  );
  const [playError, setPlayError] = useState('');
  const audioRef = useRef(null);

  const MOODS = useMemo(
    () => (category === 'celebration' ? CELEBRATION_MOODS : WEDDING_MOODS),
    [category]
  );

  useEffect(() => {
    (async () => {
      try {
        const url = category === 'celebration'
          ? `${API_URL}/api/music/presets?category=celebration`
          : `${API_URL}/api/music/presets`;
        const res = await axios.get(url);
        // Normalise — backend may return either {title,id,…} or
        // {name,preset_id,…}; we want a single shape here.
        const raw = res.data?.presets || [];
        const normalised = raw.map((p) => ({
          id: p.id || p.preset_id,
          title: p.title || p.name,
          url: p.url,
          mood: p.mood || p.category,
          duration_sec: p.duration_sec || 180,
        }));
        setPresets(normalised);
      } catch (e) { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [category]);

  useEffect(() => {
    if (presets.find((p) => p.url === value)) setCustomUrl('');
  }, [presets, value]);

  const toggle = (preset) => {
    setPlayError('');
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (_) {}
      audioRef.current = null;
    }
    if (playingId === preset.id) {
      setPlayingId(null);
      return;
    }
    const a = new Audio(preset.url);
    a.volume = 0.7;
    // BUGFIX: assign audioRef.current IMMEDIATELY (not inside .then()).
    // Previously the ref was only set after play() resolved, so a user
    // clicking Pause before load completed had nothing to pause — and the
    // audio would keep playing forever. Assign now so the next click can
    // always cancel.
    audioRef.current = a;
    setPlayingId(preset.id);
    a.onended = () => {
      setPlayingId(null);
      if (audioRef.current === a) audioRef.current = null;
    };
    a.onerror = () => {
      setPlayError(`Couldn't play "${preset.title}". The audio source may be unavailable.`);
      setPlayingId(null);
      if (audioRef.current === a) audioRef.current = null;
    };
    a.play().catch((err) => {
      setPlayError(`Playback blocked: ${err?.message || 'browser autoplay policy'}. Click play again to retry.`);
      setPlayingId(null);
      if (audioRef.current === a) audioRef.current = null;
    });
  };

  useEffect(() => () => {
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch (_) {}
      audioRef.current = null;
    }
  }, []);

  const filtered = mood === 'all' ? presets : presets.filter((p) => p.mood === mood);

  return (
    <div data-testid="music-preset-picker">
      {/* Mood filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {MOODS.map((m) => (
          <button
            key={m} type="button" onClick={() => setMood(m)}
            className="px-3 py-1.5 rounded-full text-[10px] tracking-[0.25em] uppercase transition-all"
            style={mood === m
              ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
              : { background: 'transparent', color: 'rgba(255,248,220,0.82)', border: '1px solid var(--lux-border)' }
            }
            data-testid={`mood-${m}`}
          >
            {m}
          </button>
        ))}
      </div>

      {playError && (
        <div
          className="mb-3 px-3 py-2 rounded-md text-xs"
          style={{ background: 'rgba(232,168,99,0.08)', border: '1px solid rgba(232,168,99,0.3)', color: '#F5D88B' }}
          data-testid="music-play-error"
        >
          {playError}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#D4AF37' }} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1" data-testid="music-preset-grid">          <AnimatePresence initial={false}>
            {filtered.map((p) => {
              const selected = value === p.url;
              const playing = playingId === p.id;
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="lux-glass p-3.5 flex items-center gap-3"
                  style={selected ? { borderColor: 'rgba(212,175,55,0.6)', background: 'rgba(212,175,55,0.05)' } : {}}
                  data-testid={`preset-${p.id}`}
                >
                  <button
                    type="button" onClick={() => toggle(p)}
                    className="w-9 h-9 rounded-full grid place-items-center shrink-0"
                    style={{ background: playing ? '#D4AF37' : 'rgba(212,175,55,0.16)', color: playing ? '#16110C' : '#D4AF37' }}
                    data-testid={`preset-play-${p.id}`}
                  >
                    {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-sm truncate" style={{ color: '#FFF8DC' }}>{p.title}</div>
                    <div className="text-[10px] tracking-widest uppercase mt-0.5" style={{ color: 'rgba(255,248,220,0.62)' }}>
                      {p.mood} · {Math.floor(p.duration_sec / 60)}:{String(p.duration_sec % 60).padStart(2, '0')}
                    </div>
                  </div>
                  <button
                    type="button" onClick={() => onChange(selected ? '' : p.url)}
                    className="px-3 py-1.5 rounded-full text-[10px] tracking-[0.25em] uppercase shrink-0"
                    style={selected
                      ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                      : { background: 'transparent', color: 'rgba(255,248,220,0.85)', border: '1px solid var(--lux-border)' }
                    }
                    data-testid={`preset-pick-${p.id}`}
                  >
                    {selected ? <><Check className="inline w-3 h-3 mr-1" />Picked</> : 'Pick'}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {allowCustom && (
        <div className="mt-5 pt-5 border-t" style={{ borderColor: 'rgba(212,175,55,0.12)' }}>
          <div className="mb-3 px-3 py-2.5 rounded-md text-[11px] leading-relaxed" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)', color: '#F5D88B' }}>
            <strong>Tip:</strong> Library tracks are royalty-free <em>instrumental beds</em>. For a specific Indian-wedding song (Shehnai, Bhajan, Bollywood track) paste a direct <code className="text-gold">.mp3</code> URL or a <code className="text-gold">"Anyone with the link · Viewer"</code> Google Drive link below — it overrides any preset.
          </div>
          <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>
            Paste your own song URL
          </span>
          <div className="flex gap-2">
            <input
              type="url" value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://your-cdn.com/song.mp3"
              className="flex-1"
              style={{
                padding: '0.75rem 0.9rem', background: 'transparent', color: '#FFF8DC',
                border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none',
                fontFamily: 'Manrope, sans-serif', fontSize: '0.88rem',
              }}
              data-testid="custom-music-url"
            />
            <button
              type="button"
              onClick={() => onChange(customUrl)}
              disabled={!customUrl}
              className="lux-btn lux-btn-ghost text-xs disabled:opacity-40"
              data-testid="custom-music-pick"
            >
              <Music className="w-3.5 h-3.5" /> Use this
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicPresetPicker;
