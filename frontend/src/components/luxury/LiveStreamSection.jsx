import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Video, ExternalLink, Radio } from 'lucide-react';

const youtubeId = (url) => {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
};

const formatWhen = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
};

const platformLabel = (p) => {
  if (!p) return 'Live';
  return p.charAt(0).toUpperCase() + p.slice(1);
};

/**
 * LiveStreamSection — surfaces the couple's live stream link with optional inline embed.
 * - YouTube URLs auto-embed (if `embed_enabled` is true)
 * - All other platforms render a "Watch Live" pill linking out
 */
const LiveStreamSection = ({ liveStream }) => {
  const ls = liveStream || {};
  const ytId = useMemo(
    () => ((ls.enabled && ls.url && ls.embed_enabled) ? youtubeId(ls.url) : null),
    [ls.enabled, ls.url, ls.embed_enabled]
  );
  if (!ls.enabled || !ls.url) return null;

  const whenText = formatWhen(ls.scheduled_at);

  return (
    <section className="px-6 md:px-16 py-20" data-testid="section-live-stream">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
        >
          <span className="lux-eyebrow inline-flex items-center gap-2 mb-5">
            <Radio className="w-3.5 h-3.5" /> Live Stream
          </span>
          <h2
            className="font-display text-[2.2rem] md:text-[3rem] leading-[1.05] mb-4"
            style={{ color: '#FFF8DC' }}
          >
            Can't be there?{' '}
            <span className="text-gold italic font-script">Join us live.</span>
          </h2>
          {ls.message && (
            <p className="text-[1rem] leading-relaxed mb-6 max-w-2xl" style={{ color: 'rgba(255,248,220,0.88)' }}>
              {ls.message}
            </p>
          )}

          {whenText && (
            <div
              className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full text-xs tracking-[0.18em] uppercase"
              style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C766', border: '1px solid rgba(212,175,55,0.3)' }}
              data-testid="live-stream-when"
            >
              Starts {whenText}
            </div>
          )}

          {ytId ? (
            <div
              className="relative w-full overflow-hidden rounded-lg"
              style={{ aspectRatio: '16/9', background: '#000', border: '1px solid var(--lux-border)' }}
              data-testid="live-stream-embed"
            >
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?modestbranding=1&rel=0`}
                title="Wedding Live Stream"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              />
            </div>
          ) : (
            <a
              href={ls.url}
              target="_blank"
              rel="noreferrer"
              className="lux-btn inline-flex items-center gap-2"
              data-testid="live-stream-link"
              style={{ borderRadius: '999px' }}
            >
              <Video className="w-4 h-4" />
              Watch on {platformLabel(ls.platform)}
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          )}
        </motion.div>
      </div>
    </section>
  );
};

export default LiveStreamSection;
