import { useRef, useState } from 'react';

// AmbientMusicPlayer — small fixed play/pause pill. User-initiated only:
// browsers block autoplay-with-sound anyway, and starting audio on a stranger
// unasked is hostile even where it isn't blocked. Loops while playing.
export default function AmbientMusicPlayer({ music }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  if (!music?.enabled || !music?.file_url) return null;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  return (
    <div className="gi-music-player">
      <audio ref={audioRef} src={music.file_url} loop preload="none" />
      <button
        type="button"
        className="gi-music-toggle"
        onClick={toggle}
        aria-label={playing ? 'Pause background music' : 'Play background music'}
        aria-pressed={playing}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="4" height="12" rx="1" /><rect x="9" y="2" width="4" height="12" rx="1" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5-9-5.5z" /></svg>
        )}
      </button>
    </div>
  );
}
