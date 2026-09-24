import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, Plus, Minus } from 'lucide-react';

/**
 * FaqSection — guest-facing FAQ accordion on the invitation.
 * settings = { enabled, title?, items: [{ q, a }] }. Renders null if disabled/empty.
 * Studio builds `faq_settings` into the profile from the buyer's order info (extra.faq).
 */
const FaqSection = ({ settings }) => {
  const s = settings || {};
  const items = Array.isArray(s.items) ? s.items.filter((i) => i && i.q) : [];
  const [open, setOpen] = useState(0);

  if (!s.enabled || items.length === 0) return null;

  return (
    <section className="py-20 px-6 md:px-16" data-testid="section-faq">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7 }}
          className="mb-8"
        >
          <span className="lux-eyebrow inline-flex items-center gap-2 mb-5">
            <HelpCircle className="w-3.5 h-3.5" /> {s.title || 'Good to know'}
          </span>
          <h2 className="font-display text-[2rem] md:text-[2.8rem] leading-[1.05]" style={{ color: '#FFF8DC' }}>
            Questions, <span className="text-gold italic font-script">answered.</span>
          </h2>
        </motion.div>

        <div className="space-y-3">
          {items.map((it, idx) => {
            const isOpen = open === idx;
            const Icon = isOpen ? Minus : Plus;
            return (
              <div
                key={idx}
                className="rounded-md overflow-hidden"
                style={{ border: '1px solid var(--lux-border)', background: 'rgba(255,248,220,0.03)' }}
                data-testid={`faq-item-${idx}`}
              >
                <button
                  onClick={() => setOpen(isOpen ? -1 : idx)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                  data-testid={`faq-q-${idx}`}
                >
                  <span className="font-display text-base md:text-lg" style={{ color: '#FFF8DC' }}>{it.q}</span>
                  <Icon className="w-4 h-4 shrink-0" style={{ color: '#E8C97A' }} />
                </button>
                {isOpen && it.a && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="px-5 pb-4 text-sm leading-relaxed"
                    style={{ color: 'rgba(255,248,220,0.85)' }}
                  >
                    {it.a}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
