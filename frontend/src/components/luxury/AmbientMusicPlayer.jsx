import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music2, Pause, Play, Volume2, VolumeX } from 'lucide-react';

/**
 * AmbientMusicPlayer — small floating glass pill that plays a looping
 * background track for an invitation. User can mute/unmute and the player
 * starts paused (browser autoplay policy). Visual is luxe.
 *
 * Props:
 *   src           — audio URL (.mp3 recommended)
 *   autoPlay      — attempt to play on mount (best-effort; muted by default)
 *   defaultVolume — 0..1
 *   position      — 'bottom-right' | 'bottom-left'
 */
const AmbientMusicPlayer = ({
  src,
  autoPlay = false,
  defaultVolume = 0.4,
  position = 'bottom-right',
}) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = defaultVolume;
    if (autoPlay) {
      // start muted to satisfy browser autoplay policy
      audioRef.current.muted = true;
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [autoPlay, defaultVolume]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.muted = false;
      setMuted(false);
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !audioRef.current.muted;
    setMuted(audioRef.current.muted);
  };

  if (!src) return null;

  const positionClass = position === 'bottom-left' ? 'left-5' : 'right-5';

  return (
    <div
      className={`fixed bottom-5 ${positionClass} z-[55] flex items-center`}
      style={{ filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.4))' }}
      data-testid="ambient-music-player"
    >
      <audio ref={audioRef} src={src} loop preload="metadata" />

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, x: 12, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mr-2 px-4 py-2.5 rounded-full flex items-center gap-3"
            style={{
              background: 'rgba(14,10,6,0.85)',
              border: '1px solid rgba(212,175,55,0.35)',
              backdropFilter: 'blur(14px)',
              color: '#FFF8DC',
              fontFamily: 'Manrope, sans-serif',
              fontSize: '0.78rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} data-testid="music-mute-toggle">
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <span>{playing ? 'Now playing' : 'Paused'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={toggle}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="w-12 h-12 rounded-full grid place-items-center"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)',
          border: '1px solid rgba(212,175,55,0.6)',
          color: '#16110C',
        }}
        aria-label={playing ? 'Pause background music' : 'Play background music'}
        data-testid="music-play-toggle"
      >
        {playing ? <Pause className="w-4 h-4" strokeWidth={2.4} /> : <Play className="w-4 h-4 ml-0.5" strokeWidth={2.4} />}
        {playing && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ border: '1px solid rgba(212,175,55,0.45)' }}
            animate={{ scale: [1, 1.4], opacity: [0.7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <Music2 className="w-2 h-2 absolute -top-0.5 -right-0.5 opacity-0" />
      </motion.button>
    </div>
  );
};

export default AmbientMusicPlayer;
