import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';

/**
 * Theme preview modal — embeds /preview/luxe?theme=<id> in an iframe so the
 * photographer can see the actual rendered design before committing credits.
 *
 * Props:
 *  - open: boolean
 *  - theme: { id, name, culture, paletteSwatch, planRequired, creditCost }
 *  - onClose, onUse(theme.id)
 */
const ThemePreviewModal = ({ open, theme, onClose, onUse }) => {
  if (!theme) return null;
  const previewUrl = `/preview/luxe?theme=${encodeURIComponent(theme.id)}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 luxe luxe-grain"
          style={{ background: 'rgba(8,5,3,0.82)', backdropFilter: 'blur(10px)' }}
          onClick={onClose}
          data-testid="theme-preview-modal"
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="lux-glass relative w-full max-w-[1200px] h-[88vh] flex flex-col overflow-hidden"
            style={{ background: 'rgba(14,10,6,0.96)', border: '1px solid rgba(212,175,55,0.35)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'rgba(212,175,55,0.15)' }}>
              <div className="min-w-0">
                <span className="lux-eyebrow text-[9px] block mb-1">◆ Theme Preview</span>
                <div className="flex items-center gap-3">
                  <h3 className="font-display text-xl md:text-2xl truncate" style={{ color: '#FFF8DC' }}>{theme.name}</h3>
                  <div className="flex -space-x-1.5 shrink-0">
                    {(theme.paletteSwatch || []).slice(0, 5).map((c, idx) => (
                      <span key={idx} className="w-4 h-4 rounded-full border" style={{ background: c, borderColor: 'rgba(255,248,220,0.2)' }} />
                    ))}
                  </div>
                  <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>
                    {theme.culture} · {theme.creditCost} credit{theme.creditCost > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button" onClick={() => { onUse(theme.id); onClose(); }}
                  className="lux-btn text-xs inline-flex items-center gap-1.5"
                  data-testid="theme-preview-use"
                >
                  <Check className="w-3.5 h-3.5" /> Use this theme
                </button>
                <button
                  type="button" onClick={onClose}
                  className="w-9 h-9 rounded-full grid place-items-center"
                  style={{ color: 'rgba(255,248,220,0.8)', border: '1px solid var(--lux-border)' }}
                  data-testid="theme-preview-close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Iframe */}
            <div className="flex-1 bg-black">
              <iframe
                src={previewUrl}
                title={`${theme.name} preview`}
                className="w-full h-full"
                style={{ border: 0 }}
                data-testid="theme-preview-iframe"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ThemePreviewModal;
