import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Shirt, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * DressCodeSection — carousel of dress code cards (per event or general).
 * Swipe / arrow to scroll horizontally. Each card shows label, color swatch, and notes.
 */
const DressCodeSection = ({ settings }) => {
  const s = settings || {};
  const scrollerRef = useRef(null);

  if (!s.enabled || !Array.isArray(s.items) || s.items.length === 0) return null;

  const scroll = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const dx = el.clientWidth * 0.78;
    el.scrollBy({ left: dir === 'next' ? dx : -dx, behavior: 'smooth' });
  };

  return (
    <section className="py-20" data-testid="section-dress-code">
      <div className="px-6 md:px-16 max-w-5xl mx-auto mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
        >
          <span className="lux-eyebrow inline-flex items-center gap-2 mb-5">
            <Shirt className="w-3.5 h-3.5" /> {s.title || 'Dress Code'}
          </span>
          <div className="flex items-end justify-between flex-wrap gap-3">
            <h2 className="font-display text-[2rem] md:text-[2.8rem] leading-[1.05]" style={{ color: '#FFF8DC' }}>
              What to <span className="text-gold italic font-script">wear.</span>
            </h2>
            {s.items.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scroll('prev')}
                  className="w-10 h-10 inline-flex items-center justify-center rounded-full"
                  style={{ border: '1px solid var(--lux-border)', color: '#FFF8DC' }}
                  aria-label="Previous"
                  data-testid="dress-code-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => scroll('next')}
                  className="w-10 h-10 inline-flex items-center justify-center rounded-full"
                  style={{ border: '1px solid var(--lux-border)', color: '#FFF8DC' }}
                  aria-label="Next"
                  data-testid="dress-code-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-5 overflow-x-auto px-6 md:px-16 snap-x snap-mandatory pb-2"
        style={{ scrollbarWidth: 'thin' }}
        data-testid="dress-code-scroller"
      >
        {s.items.map((it, idx) => (
          <article
            key={it.id || idx}
            className="snap-start shrink-0 rounded-md overflow-hidden"
            style={{
              width: 'min(78%, 320px)',
              border: '1px solid var(--lux-border)',
              background: 'rgba(255,248,220,0.03)',
            }}
            data-testid={`dress-code-card-${idx}`}
          >
            <div
              className="w-full"
              style={{
                aspectRatio: '4 / 5',
                background: it.image_url
                  ? `center/cover no-repeat url("${it.image_url}")`
                  : `linear-gradient(135deg, ${it.color || '#3a2a18'} 0%, rgba(0,0,0,0.5) 100%)`,
              }}
            />
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                {it.color && (
                  <span
                    className="inline-block w-3.5 h-3.5 rounded-full"
                    style={{ background: it.color, border: '1px solid rgba(255,255,255,0.25)' }}
                  />
                )}
                <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>
                  {it.event_type || 'For all events'}
                </span>
              </div>
              <h3 className="font-display text-lg mb-1.5" style={{ color: '#FFF8DC' }}>{it.label}</h3>
              {it.notes && (
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,248,220,0.85)' }}>
                  {it.notes}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default DressCodeSection;
