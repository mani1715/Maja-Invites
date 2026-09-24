/**
 * HelpTour — Floating step-by-step guide that overlays the live UI.
 *
 * Each step describes a stage in "How to create your link" and points to
 * (optionally) a real on-page element via a `target` CSS selector. The tour
 * fades in a dark overlay, highlights the target with a glowing outline,
 * and floats a card with explanation + Prev/Next/Done controls.
 *
 * Usage:
 *   <HelpTour open={isOpen} onClose={() => setOpen(false)} steps={MY_STEPS} />
 *
 * Steps schema:
 *   { title: string, body: string, target?: string, badge?: string }
 *
 * If `target` is omitted or no element matches, the card centers on screen
 * and the highlight is suppressed.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

const useTargetRect = (selector, openTick, enabled = true) => {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!enabled || !selector) { setRect(null); return; }
    let scrolled = false;
    const update = () => {
      const el = document.querySelector(selector);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
        height: r.height,
        viewportTop: r.top,
        viewportLeft: r.left,
      });
      // Scroll the target into view ONCE per step using an instant jump
      // (smooth scroll caused the card to drift for ~600 ms and felt slow).
      if (!scrolled && (r.top < 80 || r.bottom > window.innerHeight - 80)) {
        scrolled = true;
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    };
    // Snap immediately on the next frame so the highlight + card appear
    // together (was running synchronously while the modal was still
    // animating in, which made the first paint look broken).
    const raf = requestAnimationFrame(update);
    const onResize = () => update();
    const onScroll = () => update();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    // Light polling so layout shifts (image loading, font swap) still
    // realign the highlight, but at a slower cadence so we don't spam
    // getBoundingClientRect on every paint.
    const id = setInterval(update, 1200);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      clearInterval(id);
    };
  }, [selector, openTick, enabled]);
  return rect;
};

export default function HelpTour({ open, onClose, steps = [], title = 'How to create your wedding link' }) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => { if (open) setStepIdx(0); }, [open]);

  const total = steps.length;
  const step = steps[stepIdx];
  // CRITICAL: only run the target-resolver + interval polling when the
  // overlay is actually open. Otherwise the hook was scroll-locking the
  // host page (kept calling scrollIntoView on the first step's target).
  const rect = useTargetRect(step?.target, stepIdx + (open ? 1 : 0), open);

  const next = useCallback(() => setStepIdx((i) => Math.min(i + 1, total - 1)), [total]);
  const prev = useCallback(() => setStepIdx((i) => Math.max(i - 1, 0)), []);

  const finish = useCallback(() => { onClose?.(); }, [onClose]);

  // Compute card position — near the highlighted element if any, else center.
  // IMPORTANT: position with PIXEL left/top only, never `transform`. This card is a
  // framer-motion element whose open animation writes its own `transform`, which would
  // clobber a `translate(-50%,-50%)` centering trick and shove the card off-screen to
  // the right (badly visible on phones). And measure the card's REAL width — it is
  // min(420, 92vw), so on a 375px phone it is 345px, not 420 — or the clamp is wrong.
  const cardStyle = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const CARD_W = Math.min(420, vw * 0.92);   // must match the `width` below
    const CARD_H_EST = 320;                    // visual estimate, used for clamping only
    const base = {
      position: 'fixed',
      zIndex: 10001,
      maxWidth: 'min(420px, 92vw)',
      width: 'min(420px, 92vw)',
      maxHeight: 'min(80vh, 540px)',
      overflowY: 'auto',
    };
    const clampLeft = (x) => Math.max(12, Math.min(vw - CARD_W - 12, x));
    if (!rect) {
      // Centered — computed in pixels so framer-motion's transform can't move it.
      return { ...base, left: clampLeft((vw - CARD_W) / 2), top: Math.max(12, (vh - CARD_H_EST) / 2) };
    }
    // Try to place below; if no room, above; if neither, center.
    const room = {
      below: vh - (rect.viewportTop + rect.height),
      above: rect.viewportTop,
    };
    const left = clampLeft(rect.viewportLeft + rect.width / 2 - CARD_W / 2);
    const placeBelow = room.below > CARD_H_EST || room.below >= room.above;
    if (placeBelow) {
      const top = Math.max(12, Math.min(vh - CARD_H_EST - 12, rect.viewportTop + rect.height + 16));
      return { ...base, top, left };
    }
    const bottom = Math.max(12, Math.min(vh - CARD_H_EST - 12, vh - rect.viewportTop + 16));
    return { ...base, bottom, left };
  }, [rect]);

  if (!open || !step) return null;

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="help-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="fixed inset-0"
        style={{
          zIndex: 10000,
          background: 'radial-gradient(circle at center, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.85) 100%)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) finish(); }}
        data-testid="help-tour-overlay"
      >
        {/* Highlight ring around target */}
        {rect && (
          <motion.div
            key={`spot-${stepIdx}`}
            initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              // The overlay is position:fixed, so this absolutely-positioned ring
              // must use VIEWPORT coords (not document coords with scrollY) — using
              // rect.top/left made the ring drift downward by the scroll offset.
              position: 'fixed',
              top: rect.viewportTop - 10,
              left: rect.viewportLeft - 10,
              width: rect.width + 20,
              height: rect.height + 20,
              borderRadius: 16,
              pointerEvents: 'none',
              boxShadow: '0 0 0 9999px rgba(10,10,10,0.55), 0 0 0 3px rgba(212,175,55,0.95), 0 0 60px 8px rgba(212,175,55,0.5)',
            }}
            data-testid="help-tour-spotlight"
          />
        )}

        {/* Floating card */}
        <motion.div
          key={`card-${stepIdx}`}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{
            ...cardStyle,
            background: 'linear-gradient(135deg, #1A130B 0%, #261A0E 100%)',
            color: '#FFF8DC',
            border: '1px solid rgba(212,175,55,0.45)',
            borderRadius: 18,
            boxShadow: '0 25px 60px rgba(0,0,0,0.55)',
            padding: '20px 22px',
          }}
          data-testid="help-tour-card"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-semibold"
                style={{ background: 'linear-gradient(135deg,#D4AF37,#B8941F)', color: '#1A0F08' }}>
                {stepIdx + 1}
              </span>
              <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(212,175,55,0.85)' }}>
                Step {stepIdx + 1} of {total}
              </span>
              {step.badge && (
                <span className="text-[9px] px-2 py-0.5 rounded-full ml-2"
                  style={{ background: 'rgba(212,175,55,0.18)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.45)' }}>
                  {step.badge}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={finish}
              aria-label="Close help tour"
              className="w-7 h-7 rounded-full grid place-items-center transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#FFF8DC' }}
              data-testid="help-tour-close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: '#D4AF37' }}>
            {title}
          </div>
          <h3 className="font-display text-[1.4rem] leading-tight mb-2" style={{ color: '#FFF8DC' }} data-testid="help-tour-title">
            {step.title}
          </h3>
          <p className="text-[14px] leading-relaxed mb-4" style={{ color: 'rgba(245,236,215,0.82)' }} data-testid="help-tour-body">
            {step.body}
          </p>

          {/* Progress bar */}
          <div className="h-1 rounded-full mb-4" style={{ background: 'rgba(245,236,215,0.1)' }}>
            <div
              className="h-1 rounded-full transition-all"
              style={{
                width: `${((stepIdx + 1) / total) * 100}%`,
                background: 'linear-gradient(90deg,#D4AF37,#FFE38A)',
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={prev}
              disabled={stepIdx === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] tracking-[0.3em] uppercase disabled:opacity-40"
              style={{ background: 'rgba(245,236,215,0.07)', color: '#FFF8DC', border: '1px solid rgba(245,236,215,0.18)' }}
              data-testid="help-tour-prev"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Prev
            </button>

            {stepIdx < total - 1 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] tracking-[0.3em] uppercase font-medium"
                style={{ background: 'linear-gradient(135deg,#D4AF37,#B8941F)', color: '#1A0F08' }}
                data-testid="help-tour-next"
              >
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] tracking-[0.3em] uppercase font-medium"
                style={{ background: 'linear-gradient(135deg,#D4AF37,#B8941F)', color: '#1A0F08' }}
                data-testid="help-tour-done"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Got it
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(overlay, document.body);
}

/* Trigger button — render this anywhere to open a HelpTour. */
export const HelpTourTrigger = ({ onClick, label = 'How it works', testId = 'help-tour-trigger', className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    // On phones this is a compact icon-only FAB so it stays tucked in the corner
    // and never sprawls across the hero (it was overlapping the trust line on
    // mobile). The full label appears from the `sm` breakpoint up.
    className={`inline-flex items-center gap-2 p-2.5 sm:px-4 sm:py-2 rounded-full text-[10px] tracking-[0.3em] uppercase font-medium transition-transform hover:scale-[1.03] active:scale-95 ${className}`}
    style={{
      // Theme-aware via tokens in luxury.css: dark keeps the low-alpha gold
      // wash, light swaps to a solid ink-on-gold chip so the pill stays
      // readable on an ivory background (was near-invisible there).
      background: 'var(--help-pill-bg)',
      color: 'var(--help-pill-fg)',
      border: '1px solid var(--help-pill-border)',
      boxShadow: 'var(--help-pill-shadow)',
    }}
    data-testid={testId}
  >
    <Sparkles className="w-3.5 h-3.5 shrink-0" /> <span className="hidden sm:inline">{label}</span>
  </button>
);
