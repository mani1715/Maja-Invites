/**
 * ThemeDesignWizard — three-stage cascading picker.
 *
 * NEW ORDER (Feb 2026 per user spec):
 *   Stage 1: 6 events (Engagement, Haldi, Mehandi, Marriage, Reception, Sangeeth)
 *   Stage 2: 10 themes
 *   Stage 3: 3 designs for the picked (event, theme)
 *
 * Each card is now a TOGGLE — clicking the same card again de-selects it
 * and walks the wizard back one stage. "Preview" opens the rich preview
 * (`/themes/{themeId}/events/{event}/design/{idx}`) in a NEW BROWSER TAB
 * so the photographer can scroll the full invitation without losing
 * their wizard progress.
 *
 * Credit cost & "all-pack" cost are surfaced in the header so the
 * photographer knows what they will spend BEFORE they commit.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Check, Coins } from 'lucide-react';
import { getAllThemes, getThemeById } from '@/themes/masterThemes';
import { useThemeDesigns, EVENTS, useAllDesigns } from '@/themes/allDesigns';
import { usePricing } from '@/hooks/usePricing';

const EVENT_LABELS = {
  Engagement: 'Engagement',
  Haldi: 'Haldi',
  Mehandi: 'Mehandi',
  Marriage: 'Marriage / Wedding',
  Reception: 'Reception',
  Sangeeth: 'Sangeet',
};

const EVENT_HINTS = {
  Engagement: 'Ring ceremony, family blessings.',
  Haldi:      'Single-person ceremony. Auto-hides couple/groom photos.',
  Mehandi:    'Single-person ceremony. Auto-hides couple/groom photos.',
  Marriage:   'The main wedding. All photos enabled by default.',
  Reception:  'Post-wedding celebration. Couple + family.',
  Sangeeth:   'Music & dance night. Bride/groom solo + couple.',
};

const ThemeDesignWizard = ({ value, onChange, coupleData = {}, creditPricing = {} }) => {
  // value: { theme_id, event, design_id }
  //
  // The OUTER form already collects the event (`primary_event`) in step 1.
  // So inside this wizard we SKIP the event sub-step entirely whenever
  // `value.event` is already present and walk straight to the 10-theme
  // grid. The event sub-step only renders if the parent somehow didn't
  // set it (defensive fallback, unreachable in normal photographer flow).
  const hasCompletedPick = !!value?.design_id;
  const hasEvent = !!value?.event;
  let initialStage;
  if (hasCompletedPick) initialStage = 'design';
  else if (hasEvent)    initialStage = 'theme';
  else                  initialStage = 'event';
  const [stage, setStage] = useState(initialStage);
  const [pickedEvent, setPickedEvent] = useState(hasEvent ? value.event : null);
  const [pickedTheme, setPickedTheme] = useState(hasCompletedPick ? (value?.theme_id || null) : null);
  const pricing = usePricing('photographer');

  // Preload all themes for snappier switching.
  useAllDesigns();
  const themeDesigns = useThemeDesigns(pickedTheme);

  const themes = getAllThemes();
  const themeObj = pickedTheme ? getThemeById(pickedTheme) : null;
  const designs = (pickedTheme && pickedEvent && themeDesigns?.events?.[pickedEvent]) || [];

  // Credit calc — dynamic via /api/public/pricing/effective with fallback to masterThemes.
  const themeCost = pricing.themeCost(pickedTheme, themeObj?.creditCost || 0);
  const allPackCost = creditPricing.all_pack ?? (themeCost * 6);
  const designCost = creditPricing.design ?? Math.max(1, Math.ceil(themeCost / 2));

  /* Each picker is now a TOGGLE — re-clicking the same card de-selects it
     and walks the wizard one stage back. */
  const pickEvent = (ev) => {
    if (pickedEvent === ev) {
      setPickedEvent(null);
      setPickedTheme(null);
      setStage('event');
      onChange?.({ ...value, event: null, theme_id: null, design_id: null });
      return;
    }
    setPickedEvent(ev);
    setStage('theme');
    onChange?.({ ...value, event: ev, theme_id: null, design_id: null });
  };

  const pickTheme = (t) => {
    if (pickedTheme === t.id) {
      setPickedTheme(null);
      setStage('theme');
      onChange?.({ ...value, theme_id: null, design_id: null });
      return;
    }
    setPickedTheme(t.id);
    setStage('design');
    onChange?.({ ...value, event: pickedEvent, theme_id: t.id, design_id: null });
  };

  const pickDesign = (d) => {
    const willDeselect = value?.design_id === d.id;
    onChange?.({
      ...value,
      event: pickedEvent,
      theme_id: pickedTheme,
      design_id: willDeselect ? null : d.id,
      event_type: pickedEvent,
    });
  };

  const back = () => {
    if (stage === 'design') {
      setStage('theme');
      setPickedTheme(null);
    } else if (stage === 'theme') {
      setStage('event');
      setPickedEvent(null);
    }
  };

  /* Live-demo / new-tab preview was removed (Jul 2025 per user request).
     The wizard already renders the full design inside each card so users
     can see the design without leaving the form. */

  return (
    <div data-testid="theme-design-wizard" data-stage={stage}>
      {/* Credit summary header */}
      <div className="lux-glass p-4 mb-5 flex flex-wrap items-center justify-between gap-3"
           data-testid="theme-wizard-credit-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full grid place-items-center shrink-0"
               style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)' }}>
            <Coins className="w-4 h-4" style={{ color: '#D4AF37' }} />
          </div>
          <div>
            <div className="lux-eyebrow text-[9px] mb-0.5">◆ Credits</div>
            <div className="text-sm" style={{ color: '#FFF8DC' }}>
              {pickedTheme ? (
                <>
                  <span className="text-gold font-display">All-pack: {allPackCost} credits</span>
                  <span className="mx-2 opacity-50">·</span>
                  <span>This design: <span className="text-gold font-display">{designCost} credits</span></span>
                </>
              ) : (
                <span>Pick an event + theme to see exact credit costs.</span>
              )}
            </div>
          </div>
        </div>
        {stage !== 'event' && (
          <button type="button" onClick={back}
            className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5"
            data-testid="theme-wizard-back">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
      </div>

      {/* Breadcrumb — Event picked outside, this wizard handles 2. Theme → 3. Design */}
      <div className="flex items-center gap-2 mb-5 text-[11px] tracking-[0.25em] uppercase"
           style={{ color: 'rgba(255,248,220,0.78)' }}
           data-testid="theme-wizard-breadcrumb">
        <span style={{ color: '#86EFAC' }}>
          1. Event {pickedEvent ? `· ${EVENT_LABELS[pickedEvent] || pickedEvent}` : ''} ✓
        </span>
        <span>›</span>
        <span style={{ color: stage === 'theme' ? '#D4AF37' : 'inherit' }}>
          2. Theme
        </span>
        <span>›</span>
        <span style={{ color: stage === 'design' ? '#D4AF37' : 'inherit', opacity: pickedTheme ? 1 : 0.4 }}>
          3. Design
        </span>
      </div>

      <AnimatePresence mode="wait">
        {/* Stage 1: pick event */}
        {stage === 'event' && (
          <motion.div key="stage-event"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            data-testid="wizard-event-grid">
            {EVENTS.map((ev) => {
              const selected = pickedEvent === ev;
              return (
                <button key={ev} type="button"
                  onClick={() => pickEvent(ev)}
                  className="lux-glass p-6 text-left transition-all hover:scale-[1.02] relative"
                  style={selected ? { borderColor: 'var(--lux-gold)', background: 'rgba(212,175,55,0.07)' } : {}}
                  data-testid={`wizard-event-${ev}`}>
                  {selected && (
                    <span className="absolute top-3 right-3 w-6 h-6 rounded-full grid place-items-center"
                      style={{ background: '#D4AF37', color: '#16110C' }}>
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <div className="lux-eyebrow text-[9px] mb-2">◆ Event</div>
                  <h4 className="font-display text-xl mb-1" style={{ color: '#FFF8DC' }}>
                    {EVENT_LABELS[ev] || ev}
                  </h4>
                  <p className="text-xs" style={{ color: 'rgba(255,248,220,0.78)' }}>
                    {EVENT_HINTS[ev] || ''}
                  </p>
                </button>
              );
            })}
          </motion.div>
        )}

        {/* Stage 2: pick theme */}
        {stage === 'theme' && pickedEvent && (
          <motion.div key="stage-theme"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            data-testid="wizard-theme-grid">
            <div className="mb-4">
              <h3 className="font-display text-2xl" style={{ color: '#FFF8DC' }}>
                {EVENT_LABELS[pickedEvent] || pickedEvent} · <span className="text-gold italic font-script">choose a theme</span>
              </h3>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,248,220,0.8)' }}>
                10 cinematic themes — same ceremony, ten cultures. Click a card to pick it; click it again to un-pick.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {themes.map((t) => {
                const selected = pickedTheme === t.id;
                return (
                  <div key={t.id} className="lux-glass p-5 transition-all cursor-pointer relative"
                    onClick={() => pickTheme(t)}
                    style={selected ? { borderColor: 'var(--lux-gold)', background: 'rgba(212,175,55,0.07)' } : {}}
                    data-testid={`wizard-theme-${t.id}`}>
                    {selected && (
                      <span className="absolute top-3 right-3 w-6 h-6 rounded-full grid place-items-center"
                        style={{ background: '#D4AF37', color: '#16110C' }}>
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs tracking-[0.25em] uppercase" style={{ color: 'rgba(255,248,220,0.7)' }}>
                        {String(t.order).padStart(2, '0')}
                      </span>
                      <div className="flex -space-x-1.5">
                        {t.paletteSwatch.map((c, idx) => (
                          <span key={idx} className="w-4 h-4 rounded-full border"
                            style={{ background: c, borderColor: 'rgba(255,248,220,0.2)' }} />
                        ))}
                      </div>
                    </div>
                    <h3 className="font-display text-xl mb-1" style={{ color: '#FFF8DC' }}>{t.name}</h3>
                    <p className="text-xs mb-3" style={{ color: 'rgba(255,248,220,0.78)' }}>{t.culture}</p>
                    <div className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase mb-2"
                      style={{ color: 'rgba(255,248,220,0.78)' }}>
                      <span>All-pack</span>
                      <span className="text-gold" data-testid={`wizard-theme-allpack-${t.id}`}>
                        {pricing.themeCost(t.id, t.creditCost || 1) * 6} credits
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase"
                      style={{ color: 'rgba(255,248,220,0.78)' }}>
                      <span>Per design</span>
                      <span className="text-gold" data-testid={`wizard-theme-perdesign-${t.id}`}>
                        {Math.max(1, Math.ceil(pricing.themeCost(t.id, t.creditCost || 1) / 2))} credits
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Stage 3: pick design */}
        {stage === 'design' && themeObj && pickedEvent && (
          <motion.div key="stage-design"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            data-testid="wizard-design-grid">
            <div className="mb-4">
              <h3 className="font-display text-2xl" style={{ color: '#FFF8DC' }}>
                {EVENT_LABELS[pickedEvent] || pickedEvent} · {themeObj.name}
              </h3>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,248,220,0.8)' }}>
                Click <strong>Preview</strong> — opens the full invitation in a new browser tab so you can scroll through animations, music and photos without losing your draft.
              </p>
            </div>
            {!themeDesigns && (
              <div className="lux-glass p-10 text-center" style={{ color: 'rgba(255,248,220,0.8)' }}>
                Loading designs…
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {designs.map((d, i) => {
                const selected = value?.design_id === d.id;
                return (
                  <div key={d.id}
                    className="lux-glass p-3 transition-all overflow-hidden relative"
                    style={selected
                      ? { borderColor: 'var(--lux-gold)', background: 'rgba(212,175,55,0.07)' }
                      : {}}
                    data-testid={`wizard-design-${d.id}`}>
                    {selected && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full grid place-items-center z-10"
                        style={{ background: '#D4AF37', color: '#16110C' }}>
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <div className="relative w-full overflow-hidden rounded-md mb-3"
                         style={{ aspectRatio: '3/4', background: d.bg || themeDesigns?.tokens?.background || '#FDF2D6' }}>
                      {d.image && (
                        <img src={d.image} alt={d.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          style={{ opacity: 0.92 }} />
                      )}
                      <div className="absolute inset-0 flex flex-col justify-end p-3"
                           style={{
                             background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7) 100%)',
                             color: '#FFF8DC',
                           }}>
                        <div className="font-display text-sm">{d.headline || d.title}</div>
                      </div>
                    </div>
                    <h4 className="text-xs tracking-[0.18em] uppercase mb-1" style={{ color: '#FFF8DC' }}>
                      Design {i + 1}
                    </h4>
                    <p className="text-[11px] mb-3" style={{ color: 'rgba(255,248,220,0.78)' }}>
                      {d.title}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => pickDesign(d)}
                        className="lux-btn text-[10px] w-full justify-center"
                        style={selected ? { background: '#D4AF37', color: '#16110C' } : {}}
                        data-testid={`wizard-design-pick-${d.id}`}>
                        {selected ? <><Check className="w-3 h-3" /> Picked</> : 'Use this'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ThemeDesignWizard;
