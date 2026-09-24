import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, ExternalLink, X, Film, Link as LinkIcon } from 'lucide-react';
import ScrollSection from './ScrollSection';

/**
 * Pre-wedding shoot section — displays Google Drive / YouTube / Vimeo links.
 *
 * - Video links → embedded preview iframe inline + thumbnail card opens modal
 * - Plain links → styled "Open Link" button cards
 */

const DRIVE_RE = /drive\.google\.com\/file\/d\/([^/]+)/i;
const DRIVE_OPEN_RE = /drive\.google\.com\/open\?id=([^&]+)/i;
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d+)/i;

const toEmbedUrl = (url) => {
  if (!url) return null;
  let m = url.match(DRIVE_RE) || url.match(DRIVE_OPEN_RE);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  m = url.match(YT_RE);
  if (m) return `https://www.youtube.com/embed/${m[1]}?rel=0`;
  m = url.match(VIMEO_RE);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null; // not a known video host
};

const isVideoUrl = (link) => {
  if (!link) return false;
  if (link.kind === 'video') return true;
  if (link.kind === 'link') return false;
  // kind === 'auto' or undefined → detect
  return toEmbedUrl(link.url) !== null;
};

const PreWeddingSection = ({ preWeddingLinks }) => {
  const links = (preWeddingLinks || []).filter((l) => l && l.url);
  const [modalLink, setModalLink] = useState(null);

  if (links.length === 0) return null;

  const videos = links.filter(isVideoUrl);
  const otherLinks = links.filter((l) => !isVideoUrl(l));

  // Pick the first video for the inline embed; others become thumbnail cards
  const heroVideo = videos[0];
  const additional = videos.slice(1);

  const heroEmbed = heroVideo ? toEmbedUrl(heroVideo.url) : null;

  return (
    <ScrollSection className="px-6 md:px-16 py-24 max-w-5xl mx-auto" testid="section-pre-wedding">
      <span className="lux-eyebrow block mb-5">◆ The chapter before the vows</span>
      <h2 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-3" style={{ color: '#FFF8DC' }}>
        Our <span className="text-gold italic font-script">pre-wedding</span> film.
      </h2>
      <p className="text-sm md:text-base mb-10" style={{ color: 'rgba(255,248,220,0.85)' }}>
        A glimpse of the days that led us here — quiet moments, golden light, the slow becoming of "us".
      </p>

      {/* Inline embedded video */}
      {heroEmbed && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.8 }}
          className="relative overflow-hidden rounded-xl mb-8"
          style={{ border: '1px solid rgba(212,175,55,0.35)', background: '#0c0908' }}
          data-testid="pre-wedding-hero-embed"
        >
          <div style={{ position: 'relative', paddingBottom: '56.25%' }}>
            <iframe
              title={heroVideo.label || 'Pre-wedding video'}
              src={heroEmbed}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
            />
          </div>
          {heroVideo.label && (
            <div
              className="px-5 py-3 text-xs tracking-[0.25em] uppercase flex items-center gap-2"
              style={{ borderTop: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.85)' }}
            >
              <Film className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
              {heroVideo.label}
            </div>
          )}
        </motion.div>
      )}

      {/* Additional videos as thumbnail cards (open modal) */}
      {additional.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6" data-testid="pre-wedding-extra-videos">
          {additional.map((link, idx) => (
            <VideoThumb key={link.id || idx} link={link} onPlay={() => setModalLink(link)} index={idx} />
          ))}
        </div>
      )}

      {/* Plain links (non-video) — button cards */}
      {otherLinks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="pre-wedding-link-cards">
          {otherLinks.map((link, idx) => (
            <a
              key={link.id || idx}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="lux-glass px-5 py-4 flex items-center justify-between gap-3 hover:opacity-90 transition-opacity"
              data-testid={`pre-wedding-link-${idx}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <LinkIcon className="w-4 h-4 shrink-0" style={{ color: '#D4AF37' }} />
                <span className="text-sm truncate" style={{ color: '#FFF8DC' }}>{link.label || link.url}</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(255,248,220,0.78)' }} />
            </a>
          ))}
        </div>
      )}

      {/* Modal player for additional videos */}
      <AnimatePresence>
        {modalLink && (
          <VideoModal link={modalLink} onClose={() => setModalLink(null)} />
        )}
      </AnimatePresence>
    </ScrollSection>
  );
};

const VideoThumb = ({ link, onPlay, index }) => (
  <motion.button
    type="button"
    onClick={onPlay}
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.1 }}
    transition={{ duration: 0.5, delay: index * 0.06 }}
    className="group relative overflow-hidden rounded-lg text-left"
    style={{ border: '1px solid var(--lux-border)', background: '#0c0908', aspectRatio: '16 / 10' }}
    data-testid={`pre-wedding-video-thumb-${index}`}
  >
    <div className="absolute inset-0 grid place-items-center"
      style={{ background: 'radial-gradient(circle at center, rgba(212,175,55,0.18), transparent 70%)' }}
    >
      <div
        className="w-14 h-14 rounded-full grid place-items-center transition-transform group-hover:scale-110"
        style={{ background: 'linear-gradient(135deg,#D4AF37,#B8941F)', boxShadow: '0 8px 24px rgba(212,175,55,0.35)' }}
      >
        <Play className="w-6 h-6" style={{ color: '#16110C', marginLeft: 2 }} fill="#16110C" />
      </div>
    </div>
    <div className="absolute bottom-0 left-0 right-0 px-4 py-3 text-xs tracking-[0.2em] uppercase"
      style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.7))', color: '#FFF8DC' }}
    >
      <Film className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" style={{ color: '#D4AF37' }} />
      {link.label || 'Pre-wedding clip'}
    </div>
  </motion.button>
);

const VideoModal = ({ link, onClose }) => {
  const embed = toEmbedUrl(link.url);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[120] grid place-items-center px-4"
      style={{ background: 'rgba(8,5,3,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      data-testid="pre-wedding-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 w-9 h-9 rounded-full grid place-items-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#FFF8DC', border: '1px solid var(--lux-border)' }}
          data-testid="pre-wedding-modal-close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(212,175,55,0.35)', background: '#0c0908' }}>
          {embed ? (
            <div style={{ position: 'relative', paddingBottom: '56.25%' }}>
              <iframe
                title={link.label || 'Pre-wedding video'}
                src={embed}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
              />
            </div>
          ) : (
            <div className="p-8 text-center text-sm" style={{ color: '#FFF8DC' }}>
              Couldn't preview this link. <a href={link.url} target="_blank" rel="noreferrer" className="text-gold underline">Open in a new tab</a>.
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PreWeddingSection;
