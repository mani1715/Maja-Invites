/**
 * UniversalDesignRenderer — One renderer for every theme's invitation designs.
 *
 * Composition (z-stacked):
 *   0. Base poster image (from /designs/all/<Theme>/<Event>/...)
 *   1. Theme-tinted dark gradient wash for text readability
 *   2. Animated overlays — driven by the design's `overlays` array
 *   3. Foreground text panel with theme-appropriate backdrop + accent
 *
 * Reads the design entry's `overlays` (vocabulary in `/themes/designOverlays.js`)
 * and `theme.tokens` (palette + fonts). One renderer, all 162 designs.
 */
import React, { useEffect, useRef, useState, memo } from 'react';
import { motion } from 'framer-motion';
import {
  WaterRipple, PetalFall, LeafSway, PendulumSwing,
  FlameAnimation, LanternGlow, GoldShimmer, FireflyParticle,
  SkyLanternFloat, CrystalSparkle, WisteriaDrift,
} from '@/components/animations';
import { OVERLAY } from './designOverlays';
import { isLight } from './textContrast';
import { pageBgForDesign } from './themeDesignResolver';
import ThemeBackgroundAmbient from './shared/ThemeBackgroundAmbient';
import DesignImage from '@/components/DesignImage';

const UniversalDesignRenderer = ({
  design,
  theme,                         // { tokens, motionKey }
  bride = '',
  groom = '',
  date  = '',
  venue = '',
  photo,                         // optional couple photo (URL or data: URL)
  coverText,                     // boolean — when true, opaque card covers
                                 //   the design (used for "blank canvas" mode
                                 //   on designs with baked-in text)
  showText = true,
  // Soft greyed placeholders shown when the corresponding field is empty —
  // makes the renderer act as a real "blank template" inside the admin
  // editor while still guiding the photographer with the field name.
  placeholders = {
    bride: 'Bride\u2019s Name',
    groom: 'Groom\u2019s Name',
    date:  'Wedding Date',
    venue: 'Venue',
  },
  className = '',
  style = {},
  testId,
  // When `eager` is false the base poster image is lazy-loaded and given
  // a low fetchPriority so the browser can de-prioritise it (used on the
  // landing-page theme grid where 10+ cards would otherwise contend for
  // network bandwidth).  Defaults to `true` to preserve current behaviour
  // for callers that render a single hero invitation.
  eager = true,
  // EVENT MODE (Dynamic Event Engine): when provided, the renderer draws event
  // invitation content over the artwork using a config-driven text zone instead of
  // the wedding couple overlay. Backward-compatible — wedding callers never pass it.
  //   eventMode = { layout, content }  (see event template catalog + EventOverlayText)
  eventMode = null,
}) => {
  // 2026-05 perf overhaul: only mount overlays + ambient layer when the
  // card is actually in (or close to) the viewport. Off-screen instances
  // pay zero animation cost — huge win on the 10-card landing grid.
  // (Hooks declared BEFORE any early return — rules-of-hooks.)
  const containerRef = useRef(null);
  const [overlaysActive, setOverlaysActive] = useState(eager);
  // PHASE 3 (perf): also gate overlays on the base image actually being
  // decoded. Until the artwork is on screen the card paints only the
  // dominant-colour + LQIP backdrop from <DesignImage>, which is UNIQUE
  // per design — so no two cards look identical even pre-load.
  const [imageReady, setImageReady] = useState(false);
  const [overlayDelayDone, setOverlayDelayDone] = useState(false);

  useEffect(() => {
    if (overlaysActive) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOverlaysActive(true);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setOverlaysActive(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: '200px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [overlaysActive]);

  // PHASE 3: once the image is decoded, wait ~400ms before mounting
  // overlays/particles. This guarantees the user sees the UNIQUE artwork
  // first, then the decorative motion layers come in on top.
  useEffect(() => {
    if (!imageReady) return;
    const id = setTimeout(() => setOverlayDelayDone(true), 400);
    return () => clearTimeout(id);
  }, [imageReady]);

  if (!design || !theme) return null;
  const t = theme.tokens;
  const rawOverlays = design.overlays || [];
  // Short-circuit the overlay vocabulary when off-screen OR image not yet
  // decoded so every `overlays.includes(...)` check below returns false
  // at zero cost during the critical first paint.
  const overlaysShouldMount = overlaysActive && overlayDelayDone;
  const overlays = overlaysShouldMount ? rawOverlays : [];

  // Default = false → the original poster shows through clearly with just a
  // small photo circle and an elegant text panel on top. Callers (or the
  // per-design `hasBakedText` flag) can opt-in to the opaque cover card.
  const useCoverCard = coverText ?? design.hasBakedText ?? false;

  // Most design source images are ~2:3 portrait (e.g. 2560×4018 ≈ 0.637).
  // Using `aspectRatio: 3/4` here cropped 15–18% off the top + bottom on
  // mobile, which is exactly where each theme's unique border art lives.
  // Result: every event card on mobile looked like it had the same backdrop.
  // 2/3 keeps the card legible and the artwork intact.
  const cardAspectRatio = '2 / 3';

  const placementStyle = {
    top:    { top: '5%',   bottom: 'auto', transform: 'translate(-50%,0)' },
    center: { top: '50%',  bottom: 'auto', transform: 'translate(-50%,-50%)' },
    bottom: { top: 'auto', bottom: '6%',   transform: 'translate(-50%,0)' },
  }[design.textPlacement || 'center'];

  return (
    <motion.div
      ref={containerRef}
      data-testid={testId || design.id}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: cardAspectRatio,
        overflow: 'hidden',
        borderRadius: 14,
        // Resolution independence: make the card a container so ALL inner
        // sizing (names/date/venue text, photo circle, dividers) can be
        // expressed in `cqw` (% of THIS card's width) instead of `vw`
        // (screen width). Result: the design renders proportionally
        // identical at every device AND every placement — landing-grid
        // thumbnail, full preview, and public invitation alike.
        containerType: 'inline-size',
        // Phase 3A: use a neutral dark so themes with cool-toned backgrounds
        // (Beach #005F69, Christian #161830, Muslim Nikah #0C2A3C) never
        // leak a blue/teal ghost behind the design image while it loads.
        // The image always covers this wrapper at runtime, so the colour
        // is invisible in finished state — but it removes the cold halo
        // during the load animation and on rounded-corner edges.
        background: '#0a0a0a',
        boxShadow: '0 30px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.30)',
        ...style,
      }}
    >
      {/* 0 — Base poster image. objectPosition tuned to keep the top header
             (where AI-printed text often lives) slightly out of frame while
             retaining the decorative border art on the sides.
             PHASE 3: onReady flips overlaysShouldMount so decorative layers
             only appear once the unique artwork is on screen. */}
      {design.image && (
        <DesignImage
          src={design.image}
          alt={design.title}
          eager={eager}
          fetchPriority={eager ? 'high' : 'low'}
          onReady={() => setImageReady(true)}
          pictureStyle={{ position: 'absolute', inset: 0, zIndex: 0 }}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            opacity: 1,
            filter: 'saturate(1.12) contrast(1.06)',
            imageRendering: 'auto',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            zIndex: 0,
          }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            // Don't block overlays forever if the image fails.
            setImageReady(true);
          }}
        />
      )}

      {/* 0b — Thematic ambient overlay — gated by in-view AND image-ready
             so we don't paint a generic theme layer before the unique
             artwork even arrives. Skipped in event mode: the approved artwork
             is self-contained and must not be altered. */}
      {!eventMode && overlaysShouldMount && (
        <ThemeBackgroundAmbient themeId={theme?.id || design.themeId} />
      )}

      {/* 1 — Very subtle theme-tinted wash so the artwork stays the hero.
             Gated to fade in only AFTER the image decodes — keeps the raw
             artwork pristine during first paint. Skipped in event mode so the
             approved artwork is shown exactly as designed. */}
      {!eventMode && (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.00) 18%, rgba(0,0,0,0.00) 82%, rgba(0,0,0,0.14) 100%)',
            opacity: imageReady ? 1 : 0,
            transition: 'opacity 350ms ease',
            zIndex: 1,
          }}
        />
      )}

      {/* 1b — Quiet-zone scrim removed (Feb 2026). Designs no longer have
             baked-in placeholder text, so the radial blur is unnecessary
             and was visible as a white halo on dark designs. */}

      {/* 2 — Overlays (gated by `overlaysActive` via short-circuit array) */}
      {overlays.includes(OVERLAY.WATER) && (
        <WaterRipple
          base="transparent"
          highlight={t.waterHighlight || '#0E6070'}
          shadow="#062B30"
          sparkles={6}
          zIndex={2}
          subtle  /* Phase 3A: never wash the design image in teal */
        />
      )}

      {overlays.includes(OVERLAY.SUNSET_GRADIENT) && <SunsetGradient t={t} />}
      {overlays.includes(OVERLAY.STAR_FIELD)      && <StarField count={40} />}
      {overlays.includes(OVERLAY.CRESCENT_MOON)   && <CrescentMoon color={t.accent} />}
      {overlays.includes(OVERLAY.CHURCH_DOVE)     && <ChurchDove color={t.text} />}
      {overlays.includes(OVERLAY.SUNBURST)        && <Sunburst color={t.accent} />}

      {overlays.includes(OVERLAY.LOTUS_BLOOM)     && <LotusOverlay accent={t.accent} pink={t.lotusPink || '#F4A6C0'} />}
      {overlays.includes(OVERLAY.LILY_PADS)       && <LilyPadsOverlay color={t.leaf || '#2F5D3A'} />}
      {overlays.includes(OVERLAY.BANANA_LEAF)     && <BananaLeafOverlay color={t.leaf || '#2F5D3A'} />}
      {overlays.includes(OVERLAY.PALM_FROND)      && <PalmFrondOverlay color={t.leaf || '#2F5D3A'} />}
      {overlays.includes(OVERLAY.EUCALYPTUS)      && <EucalyptusOverlay color={t.leaf || '#A1B89A'} />}
      {overlays.includes(OVERLAY.BOUGAINVILLEA)   && <BougainvilleaOverlay accent="#CC2288" />}
      {overlays.includes(OVERLAY.WISTERIA)        && <WisteriaDrift count={14} zIndex={6} />}

      {overlays.includes(OVERLAY.BRASS_BELLS)     && <BrassBellsOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.BRASS_LAMPS)     && <BrassLampsOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.MOROCCAN_LANTERN) && <MoroccanLanternOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.CHANDELIER)      && <ChandelierOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.CHURCH_CANDLES)  && <ChurchCandlesOverlay />}

      {overlays.includes(OVERLAY.PEACOCK)         && <PeacockShimmer />}
      {overlays.includes(OVERLAY.SACRED_FIRE)     && <SacredFireOverlay />}
      {overlays.includes(OVERLAY.GANESHA_GLOW)    && <GaneshaGlowOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.MIHRAB_GLOW)     && <MihrabGlowOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.MANDALA)         && <MandalaOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.HOUSEBOAT)       && <HouseboatOverlay />}
      {overlays.includes(OVERLAY.WATER_RIPPLE_RINGS) && <WaterRippleRings />}
      {overlays.includes(OVERLAY.TURMERIC_STEAM)  && <TurmericSteamOverlay />}
      {overlays.includes(OVERLAY.SWING)           && <SwingOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.SEASHELL)        && <SeashellOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.GLASS_BOTTLE)    && <GlassBottleOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.BUTTERFLY)       && <ButterflyOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.STAINED_GLASS)   && <StainedGlassOverlay />}
      {overlays.includes(OVERLAY.PHULKARI)        && <PhulkariBorder accent={t.accent} />}
      {overlays.includes(OVERLAY.SHANKHA)         && <ShankhaOverlay accent={t.accent} />}
      {overlays.includes(OVERLAY.SINDOOR_ARC)     && <SindoorArc />}

      {overlays.includes(OVERLAY.PETALS_LOTUS) && (
        <PetalFall colors={['#F4A6C0', '#CD3F75', '#FFE2EC']} count={14} zIndex={6} />
      )}
      {overlays.includes(OVERLAY.PETALS_WHITE) && (
        <PetalFall colors={['#FFFFFF', '#FFF6E9', '#FFE7D6']} count={12} zIndex={6} />
      )}
      {overlays.includes(OVERLAY.PETALS_MARIGOLD) && (
        <PetalFall colors={['#FF8C00', '#FFC000', '#FFD700']} count={16} zIndex={6} />
      )}
      {overlays.includes(OVERLAY.PETALS_ROSE) && (
        <PetalFall colors={['#F4C8C0', '#F8F4EC', '#E8A4A0']} count={12} zIndex={6} />
      )}
      {overlays.includes(OVERLAY.PETALS_BOUGAINVILLEA) && (
        <PetalFall colors={['#CC2288', '#FF66BB', '#A41866']} count={14} zIndex={6} />
      )}
      {overlays.includes(OVERLAY.PETALS_SAGE) && (
        <PetalFall colors={['#A1B89A', '#CDD9C5', '#E8F0E3']} count={10} zIndex={6} />
      )}
      {overlays.includes(OVERLAY.CONFETTI_GOLD) && (
        <PetalFall colors={['#FFD700', '#FFA500', '#FFF7CC']} count={20} shape="circle" minSize={4} maxSize={8} speed={1.3} zIndex={6} />
      )}

      {overlays.includes(OVERLAY.FIREFLY) && (
        <FireflyParticle count={14} color={t.particle || '#F8E1A8'} zIndex={8} />
      )}
      {overlays.includes(OVERLAY.SKY_LANTERN) && <SkyLanternFloat count={6} zIndex={7} />}
      {overlays.includes(OVERLAY.GOLD_DUST) && (
        <FireflyParticle count={20} color={t.accent || '#D4A24C'} size={1.5} zIndex={8} />
      )}

      {overlays.includes(OVERLAY.GOLD_SHIMMER) && <GoldFrameShimmer accent={t.accent || '#D4A24C'} />}

      {/* 3 — Text overlay.  Event mode uses the config-driven text zone; the
             wedding modes are untouched. */}
      {showText && eventMode ? (
        <EventOverlayText layout={eventMode.layout} content={eventMode.content} testId={testId} />
      ) : showText && (useCoverCard ? (
        <CoverCardText
          design={design}
          tokens={t}
          bride={bride}
          groom={groom}
          date={date}
          venue={venue}
          photo={photo}
          placeholders={placeholders}
          testId={testId}
        />
      ) : (
        <GlassOverlayText
          design={design}
          tokens={t}
          bride={bride}
          groom={groom}
          date={date}
          venue={venue}
          photo={photo}
          placeholders={placeholders}
          placementStyle={placementStyle}
          testId={testId}
        />
      ))}
    </motion.div>
  );
};

/* ──────────────────────────────────────────────────────────────────────
 * Text rendering — two modes
 * ────────────────────────────────────────────────────────────────────── */

/** Elegant transparent overlay — small photo circle near the top of the
    design + a glass card with bride & groom names + date + venue, all with
    auto-contrast against the design's background. The original poster art
    remains fully visible. */
const GlassOverlayText = ({ design, tokens, bride, groom, date, venue, photo, placeholders, placementStyle, testId }) => {
  const t = tokens;
  // Auto-contrast against the design's own bg colour
  const bg = design.bg || t.background || '#0a0a0a';
  const light = isLight(bg);
  const txtColor = light ? '#1A0F08' : '#FFF8DC';
  const muted = light ? 'rgba(40, 26, 16, 0.78)' : 'rgba(255, 248, 220, 0.85)';
  const accent = t.accent || '#D4AF37';
  // Transparent text panel — no glass halo. Names rely on their own
  // multi-layer text-shadow for legibility, so the artwork shows
  // through cleanly. Designs with light backgrounds get a faint
  // ivory wash; dark backgrounds get nothing.
  const panelBg = 'transparent';
  const panelBorder = 'transparent';
  // Crisp, multi-layer text shadow so the names pop on any artwork colour —
  // including same-tone pitfalls like yellow text on a yellow background.
  const textShadow = light
    ? '0 1px 0 rgba(255,255,255,0.95), 0 0 1px rgba(255,255,255,0.9), 0 2px 18px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.18)'
    : '0 1px 0 rgba(0,0,0,0.7), 0 0 1px rgba(0,0,0,0.85), 0 2px 22px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.55)';

  // Resolve display values: real value when present, else greyed placeholder.
  const brideHas = !!(bride && String(bride).trim());
  const groomHas = !!(groom && String(groom).trim());
  const dateHas  = !!(date  && String(date).trim());
  const venueHas = !!(venue && String(venue).trim());
  const brideText = brideHas ? bride : (placeholders?.bride || '');
  const groomText = groomHas ? groom : (placeholders?.groom || '');
  const dateText  = dateHas  ? date  : (placeholders?.date  || '');
  const venueText = venueHas ? venue : (placeholders?.venue || '');
  const ghost = light ? 'rgba(40, 26, 16, 0.42)' : 'rgba(255,248,220,0.62)';

  return (
    <>
      {/* Ceremony headline — sits high on the design */}
      <div
        className="absolute left-0 right-0 text-center px-4"
        style={{
          top: '6%',
          zIndex: 30,
          color: accent,
          fontSize: 'clamp(7px, 2.5cqw, 13px)',
          letterSpacing: '0.45em',
          textTransform: 'uppercase',
          fontWeight: 700,
          textShadow,
        }}
        data-testid={`${testId || design.id}-headline`}
      >
        ◈ {design.headline || 'Wedding Invitation'} ◈
      </div>

      {/* Couple photo — small circle, top-centered, no opaque card */}
      {photo && (
        <div
          className="absolute left-1/2"
          style={{
            top: '13%',
            transform: 'translateX(-50%)',
            zIndex: 30,
          }}
        >
          <CouplePhotoCircle src={photo} cqw={20} accent={accent} />
        </div>
      )}

      {/* Names + date + venue — transparent panel (no glass halo) */}
      <div
        className="absolute left-1/2 px-3 md:px-5 py-3.5 rounded-xl text-center"
        style={{
          left: '50%',
          top: photo ? '52%' : '46%',
          transform: 'translate(-50%, -50%)',
          width: '92%',
          maxWidth: '94%',
          background: panelBg,
          border: panelBorder === 'transparent' ? 'none' : `1px solid ${panelBorder}`,
          zIndex: 30,
        }}
        data-testid={`${testId || design.id}-text`}
      >
        <div
          className="tracking-[0.4em] uppercase mb-1.5"
          style={{ color: muted, fontWeight: 500, fontSize: 'clamp(6.5px, 2.1cqw, 11px)' }}
        >
          Together with our families
        </div>
        <div
          style={{
            fontFamily: t.heading || '"Cormorant Garamond", serif',
            fontWeight: 600,
            color: txtColor,
            fontSize: 'clamp(0.95rem, 7.2cqw, 2rem)',
            lineHeight: 1.08,
            letterSpacing: '0.01em',
            textShadow,
            wordBreak: 'normal',
            overflowWrap: 'normal',
            hyphens: 'none',
            whiteSpace: 'normal',
          }}
        >
          <span style={brideHas ? undefined : { color: ghost, fontStyle: 'italic', fontWeight: 400 }}>
            {brideText}
          </span>
          <span
            style={{
              color: accent,
              fontFamily: '"Great Vibes", cursive',
              fontStyle: 'italic',
              margin: '0 0.35em',
              fontWeight: 400,
              textShadow,
            }}
          >&amp;</span>
          <span style={groomHas ? undefined : { color: ghost, fontStyle: 'italic', fontWeight: 400 }}>
            {groomText}
          </span>
        </div>
        <div
          aria-hidden
          style={{
            margin: '8px auto 0',
            width: 'clamp(32px, 12cqw, 60px)',
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${accent} 50%, transparent 100%)`,
          }}
        />
        <div
          className="tracking-[0.3em] uppercase mt-2"
          style={{
            color: dateHas ? txtColor : ghost,
            fontStyle: dateHas ? 'normal' : 'italic',
            fontWeight: 600,
            textShadow,
            fontSize: 'clamp(7px, 2.3cqw, 12px)',
          }}
        >
          {dateText}
        </div>
        <div
          className="tracking-[0.28em] uppercase mt-0.5"
          style={{
            color: venueHas ? muted : ghost,
            fontStyle: venueHas ? 'normal' : 'italic',
            textShadow,
            fontSize: 'clamp(6.5px, 2.1cqw, 11px)',
          }}
        >
          {venueText}
        </div>
      </div>
    </>
  );
};

/** Large opaque "blank canvas" card that fully covers baked-in text. */
const CoverCardText = ({ design, tokens, bride, groom, date, venue, photo, placeholders, testId }) => {
  const t = tokens;
  // Use design.bg as the card panel (it already matches the theme)
  const cardBg = design.bg || t.background || '#FFF8DC';
  const light = isLight(cardBg);
  const txtColor = light ? '#1A0F08' : '#FFF8DC';
  const muted = light ? 'rgba(40, 26, 16, 0.78)' : 'rgba(255, 248, 220, 0.85)';
  const ghost = light ? 'rgba(40, 26, 16, 0.40)' : 'rgba(255,248,220,0.62)';
  const accent = t.accent || '#D4AF37';
  const ornamentColor = `${accent}AA`;
  const shadowRing = light
    ? '0 1px 0 rgba(255,255,255,0.85), 0 8px 30px rgba(0,0,0,0.10)'
    : '0 1px 0 rgba(0,0,0,0.45),  0 8px 30px rgba(0,0,0,0.45)';

  const brideHas = !!(bride && String(bride).trim());
  const groomHas = !!(groom && String(groom).trim());
  const dateHas  = !!(date  && String(date).trim());
  const venueHas = !!(venue && String(venue).trim());
  const brideText = brideHas ? bride : (placeholders?.bride || '');
  const groomText = groomHas ? groom : (placeholders?.groom || '');
  const dateText  = dateHas  ? date  : (placeholders?.date  || '');
  const venueText = venueHas ? venue : (placeholders?.venue || '');

  return (
    <div
      className="absolute"
      style={{
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        width: '88%',
        height: '90%',
        background: cardBg,
        borderRadius: 12,
        border: `1.5px solid ${accent}88`,
        boxShadow: shadowRing,
        padding: 'clamp(14px, 4%, 28px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        textAlign: 'center',
        zIndex: 30,
        overflow: 'hidden',
      }}
      data-testid={`${testId || design.id}-cover`}
    >
      {/* Ornamental inner border */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 8,
          border: `1px dashed ${accent}44`,
          borderRadius: 8,
          pointerEvents: 'none',
        }}
      />
      {/* Top section: headline + photo */}
      <div className="relative w-full flex flex-col items-center" style={{ paddingTop: 8 }}>
        <div
          className="tracking-[0.45em] uppercase mb-3"
          style={{ color: accent, fontSize: 'clamp(7px, 2.5cqw, 12px)' }}
        >
          ◈ {design.headline || 'Wedding Invitation'} ◈
        </div>
        {photo ? (
          <CouplePhotoCircle src={photo} cqw={21} accent={accent} />
        ) : (
          <PhotoPlaceholder accent={accent} ornamentColor={ornamentColor} />
        )}
      </div>

      {/* Middle: bride & groom */}
      <div className="relative w-full px-1">
        <div
          className="tracking-[0.4em] uppercase opacity-80 mb-1"
          style={{ color: muted, fontSize: 'clamp(6.5px, 2.1cqw, 11px)' }}
        >
          Together with our families
        </div>
        <div
          style={{
            fontFamily: t.heading || '"Cormorant Garamond", serif',
            fontWeight: 500,
            color: txtColor,
            fontSize: 'clamp(0.95rem, 7.4cqw, 2rem)',
            lineHeight: 1.08,
            wordBreak: 'normal',
            overflowWrap: 'normal',
            hyphens: 'none',
          }}
        >
          <span style={brideHas ? undefined : { color: ghost, fontStyle: 'italic' }}>
            {brideText}
          </span>
          <span
            style={{
              color: accent,
              fontFamily: '"Great Vibes", cursive',
              fontStyle: 'italic',
              margin: '0 0.35em',
              display: 'inline-block',
            }}
          >&amp;</span>
          <span style={groomHas ? undefined : { color: ghost, fontStyle: 'italic' }}>
            {groomText}
          </span>
        </div>
        <div
          aria-hidden
          style={{
            margin: '10px auto 0',
            width: 'clamp(36px, 13cqw, 64px)',
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${accent} 50%, transparent 100%)`,
          }}
        />
      </div>

      {/* Bottom: date + venue */}
      <div className="relative w-full">
        <div
          className="tracking-[0.32em] uppercase"
          style={{
            color: dateHas ? txtColor : ghost,
            fontStyle: dateHas ? 'normal' : 'italic',
            fontWeight: 500,
            fontSize: 'clamp(7px, 2.3cqw, 12px)',
          }}
        >
          {dateText}
        </div>
        <div
          className="tracking-[0.28em] uppercase mt-1"
          style={{
            color: venueHas ? muted : ghost,
            fontStyle: venueHas ? 'normal' : 'italic',
            fontSize: 'clamp(6.5px, 2.1cqw, 11px)',
          }}
        >
          {venueText}
        </div>
      </div>
    </div>
  );
};

/** EventOverlayText — the Dynamic Event Engine's config-driven text renderer.
 *  Draws event invitation content INSIDE the artwork's empty parchment zone using
 *  the template's `layout` config (position/size/align/font-scale/line-spacing/
 *  max-lines/overflow). Fonts are in container-query units (cqw) so they scale with
 *  the card at every device — the same responsive philosophy as the wedding overlay.
 *  The artwork itself is never modified; only text is drawn on top.
 */
const EventOverlayText = ({ layout, content, testId }) => {
  const tz = (layout && layout.text_zone) || {};
  const pal = (layout && layout.palette) || {};
  const fs = (layout && layout.font_scale) || 1;
  const lh = (layout && layout.line_spacing) || 1.16;
  const maxLines = (layout && layout.max_lines) || {};
  const ink = pal.text || '#3A2A18';
  const accent = pal.accent || '#9A7B3F';
  const muted = pal.muted || '#6B5844';
  // scale a base cqw value by the template's font_scale
  const cq = (n) => `${(n * fs).toFixed(2)}cqw`;
  const clamp = (min, n, max) => `clamp(${min}, ${cq(n)}, ${max})`;
  const clampBox = (lines) => (lines ? {
    display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  } : {});

  return (
    <div
      className="absolute"
      data-testid={`${testId || 'event'}-text`}
      style={{
        top: tz.top || '33%', left: tz.left || '50%',
        width: tz.width || '76%', height: tz.height,
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: tz.valign === 'center' ? 'center' : 'flex-start',
        textAlign: tz.align || 'center', padding: tz.padding || '1.5%',
        zIndex: 30, overflow: 'hidden',
      }}
    >
      {content.headline && (
        <div style={{ color: accent, letterSpacing: '0.4em', textTransform: 'uppercase',
                      fontWeight: 700, fontSize: clamp('7px', 2.4, '13px'), marginBottom: '0.6em' }}>
          ◈ {content.headline} ◈
        </div>
      )}
      {content.eyebrow && (
        <div style={{ color: muted, letterSpacing: '0.3em', textTransform: 'uppercase',
                      fontSize: clamp('6.5px', 2.0, '11px'), marginBottom: '0.4em' }}>
          {content.eyebrow}
        </div>
      )}
      {content.title && (
        <div style={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 600, color: ink,
                      lineHeight: lh, fontSize: clamp('1rem', 7.0, '2.1rem'), letterSpacing: '0.01em',
                      ...clampBox(maxLines.title || 2) }}>
          {content.title}
        </div>
      )}
      <div aria-hidden style={{ margin: '0.55em auto', width: 'clamp(32px, 12cqw, 64px)', height: 1,
                                background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      {content.date && (
        <div style={{ color: ink, letterSpacing: '0.26em', textTransform: 'uppercase', fontWeight: 600,
                      fontSize: clamp('7px', 2.3, '12px') }}>
          {content.date}
        </div>
      )}
      {content.venue && (
        <div style={{ color: muted, letterSpacing: '0.22em', textTransform: 'uppercase',
                      fontSize: clamp('6.5px', 2.0, '11px'), marginTop: '0.3em' }}>
          {content.venue}
        </div>
      )}
      {content.message && (
        <div style={{ color: muted, fontFamily: '"Cormorant Garamond", serif', fontStyle: 'italic',
                      fontSize: clamp('8px', 2.6, '14px'), lineHeight: lh, marginTop: '0.7em',
                      ...clampBox(maxLines.message || 4) }}>
          {content.message}
        </div>
      )}
    </div>
  );
};

/* CouplePhotoCircle — wrapped in a CONSISTENT decorative ornate frame
   (double-ring + 4 corner gold sparks) that ships with every theme so
   the central photo never looks unframed on minimalist designs. The
   ornaments use the theme's own accent colour so the frame still
   "belongs" to each design. */
const CouplePhotoCircle = ({ src, size = 80, accent = '#D4AF37', cqw }) => {
  // When `cqw` is passed the circle scales with the CARD (container units)
  // so it stays proportional at every device + placement. Legacy callers
  // without `cqw` keep the fixed-px `size` behaviour.
  const inner = cqw ? `clamp(44px, ${cqw}cqw, 128px)` : size;
  const ring = cqw ? `clamp(58px, ${cqw + 4.5}cqw, 148px)` : size + 18; // outer decorative ring diameter
  const sparkOffset = 4;             // distance of corner sparks from ring
  return (
    <div
      style={{
        position: 'relative',
        width: ring,
        height: ring,
        margin: '0 auto 12px',
      }}
      data-testid="couple-photo-frame"
    >
      {/* Outer decorative ring (scalloped) — gives every theme a consistent ornament */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `1px dashed ${accent}AA`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.15), inset 0 0 0 1px rgba(255,255,255,0.18)`,
        }}
      />
      {/* 4-point gold sparks at cardinal compass points */}
      {[
        { top: -sparkOffset, left: '50%', transform: 'translateX(-50%) rotate(45deg)' },
        { bottom: -sparkOffset, left: '50%', transform: 'translateX(-50%) rotate(45deg)' },
        { top: '50%', left: -sparkOffset, transform: 'translateY(-50%) rotate(45deg)' },
        { top: '50%', right: -sparkOffset, transform: 'translateY(-50%) rotate(45deg)' },
      ].map((pos, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            position: 'absolute',
            width: 8, height: 8,
            background: accent,
            boxShadow: `0 0 6px ${accent}`,
            ...pos,
          }}
        />
      ))}
      {/* Inner photo well */}
      <div
        style={{
          position: 'absolute',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          width: inner, height: inner,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `2px solid ${accent}`,
          boxShadow: `0 0 0 3px rgba(255,255,255,0.55), 0 6px 20px rgba(0,0,0,0.30)`,
          background: '#1A0F08',
        }}
      >
        <img
          src={src}
          alt="Couple"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </div>
    </div>
  );
};

const PhotoPlaceholder = ({ accent }) => (
  <div
    aria-hidden
    style={{
      width: 'clamp(48px, 21cqw, 128px)', height: 'clamp(48px, 21cqw, 128px)',
      borderRadius: '50%',
      border: `1.5px dashed ${accent}99`,
      display: 'grid',
      placeItems: 'center',
      margin: '0 auto 12px',
      background: 'rgba(255,255,255,0.25)',
    }}
  >
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.4">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  </div>
);

/* ──────────────────────────────────────────────────────────────────────
 * Overlay primitives — small SVG/CSS compositions
 * ────────────────────────────────────────────────────────────────────── */

const LotusSVG = ({ size = 70, color = '#F4A6C0', core = '#D4A24C' }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
    {[...Array(8)].map((_, i) => (
      <ellipse
        key={i} cx="40" cy="22" rx="7" ry="18"
        fill={color}
        opacity={0.85 - (i % 2) * 0.2}
        transform={`rotate(${i * 22.5} 40 40)`}
      />
    ))}
    <circle cx="40" cy="40" r="5" fill={core} />
  </svg>
);

const LotusOverlay = ({ accent, pink }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
    {[
      { left: '6%',  top: '70%', size: 68, color: pink },
      { right: '8%', top: '78%', size: 52, color: '#CD3F75' },
      { left: '46%', top: '85%', size: 44, color: pink },
    ].map((p, i) => (
      <div key={i} style={{ position: 'absolute', ...p }}>
        <LeafSway amplitude={2} duration={6 + i} delay={i * 0.4} intensity="subtle">
          <LotusSVG size={p.size} color={p.color} core={accent} />
        </LeafSway>
      </div>
    ))}
  </div>
);

const LilyPadsOverlay = ({ color }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}>
    {[
      { left: '15%', top: '82%', size: 70 },
      { left: '62%', top: '88%', size: 56 },
      { left: '38%', top: '92%', size: 84 },
    ].map((p, i) => (
      <div key={i} style={{ position: 'absolute', ...p }}>
        <LeafSway amplitude={2} duration={6 + i} delay={i * 0.4} intensity="subtle">
          <svg width={p.size} height={p.size} viewBox="0 0 80 80" fill="none">
            <path d="M40 8 A30 30 0 1 1 8 40 L40 40 Z" fill={color} opacity={0.72} />
          </svg>
        </LeafSway>
      </div>
    ))}
  </div>
);

const BananaLeafOverlay = ({ color }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: '-4%', top: '4%' }}>
      <LeafSway amplitude={5} duration={6} origin="bottom left">
        <svg width="170" height="200" viewBox="0 0 170 200" fill="none">
          <path d="M10 200 Q60 60 160 20 Q120 110 80 200 Z" fill={color} opacity="0.82" />
        </svg>
      </LeafSway>
    </div>
    <div style={{ position: 'absolute', right: '-4%', top: '8%', transform: 'scaleX(-1)' }}>
      <LeafSway amplitude={5} duration={7} delay={0.6} origin="bottom right">
        <svg width="150" height="180" viewBox="0 0 170 200" fill="none">
          <path d="M10 200 Q60 60 160 20 Q120 110 80 200 Z" fill={color} opacity="0.78" />
        </svg>
      </LeafSway>
    </div>
  </div>
);

const PalmFrondOverlay = ({ color }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: '-8%', top: '-4%' }}>
      <LeafSway amplitude={6} duration={5.5} origin="bottom left">
        <svg width="220" height="220" viewBox="0 0 220 220" fill="none">
          {[...Array(12)].map((_, i) => (
            <ellipse
              key={i} cx="40" cy="120"
              rx="78" ry="10"
              fill={color} opacity={0.7}
              transform={`rotate(${i * 15 - 60} 40 120)`}
            />
          ))}
        </svg>
      </LeafSway>
    </div>
    <div style={{ position: 'absolute', right: '-8%', top: '-4%', transform: 'scaleX(-1)' }}>
      <LeafSway amplitude={5} duration={6.5} delay={0.4} origin="bottom right">
        <svg width="200" height="200" viewBox="0 0 220 220" fill="none">
          {[...Array(12)].map((_, i) => (
            <ellipse
              key={i} cx="40" cy="120"
              rx="78" ry="10"
              fill={color} opacity={0.7}
              transform={`rotate(${i * 15 - 60} 40 120)`}
            />
          ))}
        </svg>
      </LeafSway>
    </div>
  </div>
);

const EucalyptusOverlay = ({ color }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: '-2%', bottom: '-2%' }}>
      <LeafSway amplitude={3} duration={8} origin="bottom left" intensity="subtle">
        <svg width="200" height="200" viewBox="0 0 200 200" fill="none">
          <path d="M0 200 Q60 120 180 30" stroke={color} strokeWidth="1.5" fill="none" />
          {[...Array(10)].map((_, i) => (
            <ellipse
              key={i}
              cx={20 + i * 16} cy={180 - i * 14}
              rx="11" ry="6"
              fill={color} opacity={0.75}
              transform={`rotate(${-30 + i * 5} ${20 + i * 16} ${180 - i * 14})`}
            />
          ))}
        </svg>
      </LeafSway>
    </div>
  </div>
);

const BougainvilleaOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
    {[
      { left: '4%',  top: '6%', size: 80 },
      { right: '6%', bottom: '6%', size: 70 },
    ].map((p, i) => (
      <div key={i} style={{ position: 'absolute', ...p }}>
        <LeafSway amplitude={3} duration={6 + i} delay={i * 0.5} intensity="subtle">
          <svg width={p.size} height={p.size} viewBox="0 0 80 80" fill="none">
            {[...Array(5)].map((_, k) => (
              <circle
                key={k}
                cx={20 + (k % 3) * 22}
                cy={20 + Math.floor(k / 3) * 22}
                r="8"
                fill={accent}
                opacity={0.8}
              />
            ))}
          </svg>
        </LeafSway>
      </div>
    ))}
  </div>
);

const BrassBellsOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', top: '3%', left: 0, right: 0, zIndex: 7, display: 'flex', justifyContent: 'space-around', pointerEvents: 'none' }}>
    {[0, 1, 2].map((i) => (
      <PendulumSwing key={i} amplitude={4} duration={2.6 + i * 0.4} delay={i * 0.3}>
        <svg width="28" height="48" viewBox="0 0 28 48" fill="none">
          <line x1="14" y1="0" x2="14" y2="14" stroke="#7A4E2C" strokeWidth="1.4" />
          <path d="M4 14 L24 14 L20 38 Q14 44 8 38 Z" fill={accent} />
          <circle cx="14" cy="42" r="2.5" fill="#9B6F2C" />
        </svg>
      </PendulumSwing>
    ))}
  </div>
);

const BrassLampsOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none' }}>
    {[
      { left: '8%',  top: '6%' },
      { right: '8%', top: '6%' },
    ].map((pos, i) => (
      <div key={i} style={{ position: 'absolute', ...pos }}>
        <LanternGlow swingAmp={3} swingDur={3.4 + i * 0.4} delay={i * 0.3} glowSize={90}>
          <svg width="34" height="58" viewBox="0 0 34 58" fill="none">
            <line x1="17" y1="0" x2="17" y2="10" stroke="#7A4E2C" strokeWidth="1.4" />
            <path d="M6 10 L28 10 L24 36 Q17 44 10 36 Z" fill={accent} />
          </svg>
          <div style={{ position: 'absolute', left: '50%', top: '60%', transform: 'translate(-50%,-50%)' }}>
            <FlameAnimation size={10} color="gold" glow={false} />
          </div>
        </LanternGlow>
      </div>
    ))}
  </div>
);

const MoroccanLanternOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none' }}>
    {[
      { left: '10%', top: '4%', size: 1.0 },
      { right: '12%', top: '8%', size: 0.85 },
    ].map((pos, i) => (
      <div key={i} style={{ position: 'absolute', ...pos, transform: `scale(${pos.size})` }}>
        <LanternGlow swingAmp={4} swingDur={3.6 + i * 0.4} delay={i * 0.3} glowSize={110}>
          <svg width="40" height="68" viewBox="0 0 40 68" fill="none">
            <line x1="20" y1="0" x2="20" y2="10" stroke="#7A4E2C" strokeWidth="1.5" />
            <path d="M10 12 L30 12 L36 24 L30 50 L24 60 L16 60 L10 50 L4 24 Z" fill={accent} />
            <path d="M14 22 L26 22 L28 36 L20 46 L12 36 Z" fill="rgba(255,80,40,0.7)" />
          </svg>
        </LanternGlow>
      </div>
    ))}
  </div>
);

const ChandelierOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', top: '2%', left: '50%', transform: 'translateX(-50%)', zIndex: 7, pointerEvents: 'none' }}>
    <PendulumSwing amplitude={2} duration={5} origin="top center">
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <line x1="60" y1="0" x2="60" y2="20" stroke={accent} strokeWidth="1.5" />
        <ellipse cx="60" cy="30" rx="40" ry="6" fill={accent} opacity={0.85} />
        {[...Array(7)].map((_, i) => (
          <g key={i}>
            <line x1={20 + i * 13} y1="30" x2={20 + i * 13} y2={60 + (i % 2) * 10} stroke={accent} strokeWidth="0.8" />
            <CrystalSparkle swingAmp={2} swingDur={3 + i * 0.3} delay={i * 0.2} flareSize={18}>
              <svg width="10" height="14" viewBox="0 0 10 14">
                <polygon points="5,0 10,7 5,14 0,7" fill="#FFFFFF" opacity="0.9" />
              </svg>
            </CrystalSparkle>
          </g>
        ))}
      </svg>
    </PendulumSwing>
  </div>
);

const ChurchCandlesOverlay = () => (
  <div style={{ position: 'absolute', bottom: '8%', left: 0, right: 0, zIndex: 8, display: 'flex', justifyContent: 'space-evenly', pointerEvents: 'none' }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ position: 'relative' }}>
        <svg width="14" height="46" viewBox="0 0 14 46">
          <rect x="5" y="10" width="4" height="36" fill="#F4E5C5" />
          <rect x="3" y="40" width="8" height="6" fill="#C8A45D" />
        </svg>
        <div style={{ position: 'absolute', left: '50%', top: -10, transform: 'translateX(-50%)' }}>
          <FlameAnimation size={10} color="gold" intensity={1.1 + i * 0.1} />
        </div>
      </div>
    ))}
  </div>
);

const PeacockShimmer = () => (
  <div
    aria-hidden
    style={{
      position: 'absolute', inset: 0,
      mixBlendMode: 'screen',
      pointerEvents: 'none',
      zIndex: 6,
      background:
        'radial-gradient(circle at 80% 70%, rgba(80,200,180,0.20) 0%, transparent 30%), ' +
        'radial-gradient(circle at 20% 80%, rgba(255,180,80,0.16) 0%, transparent 30%)',
      animation: 'peacock-shimmer 8s ease-in-out infinite',
    }}
  >
    <style>{`@keyframes peacock-shimmer{0%,100%{filter:hue-rotate(0deg) brightness(1);}50%{filter:hue-rotate(30deg) brightness(1.18);}}`}</style>
  </div>
);

const SacredFireOverlay = () => (
  <div style={{ position: 'absolute', left: '50%', bottom: '14%', transform: 'translateX(-50%)', zIndex: 9, pointerEvents: 'none' }}>
    <FlameAnimation size={42} color="amber" intensity={1.2} />
  </div>
);

const GaneshaGlowOverlay = ({ accent }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', left: '50%', top: '8%',
      transform: 'translateX(-50%)',
      width: 120, height: 120,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${accent}88 0%, transparent 65%)`,
      filter: 'blur(6px)',
      animation: 'ganesha-pulse 4s ease-in-out infinite',
      pointerEvents: 'none', zIndex: 6,
    }}
  >
    <style>{`@keyframes ganesha-pulse{0%,100%{opacity:.45;transform:translateX(-50%) scale(1);}50%{opacity:.85;transform:translateX(-50%) scale(1.18);}}`}</style>
  </div>
);

const MihrabGlowOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', inset: '8% 12% 18% 12%', zIndex: 3, pointerEvents: 'none' }}>
    <svg viewBox="0 0 100 140" preserveAspectRatio="none" width="100%" height="100%">
      <path d="M50 6 Q90 6 90 50 L90 134 L10 134 L10 50 Q10 6 50 6 Z" stroke={accent} strokeWidth="0.5" fill="none" opacity="0.7" />
    </svg>
    <div
      style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 50% 20%, ${accent}55 0%, transparent 60%)`,
        animation: 'mihrab-pulse 6s ease-in-out infinite',
      }}
    />
    <style>{`@keyframes mihrab-pulse{0%,100%{opacity:.45;}50%{opacity:.80;}}`}</style>
  </div>
);

const MandalaOverlay = ({ accent }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', left: '50%', top: '50%',
      transform: 'translate(-50%,-50%)',
      width: '90%', height: '90%',
      pointerEvents: 'none', zIndex: 2, opacity: 0.18,
      animation: 'mandala-rotate 60s linear infinite',
    }}
  >
    <svg viewBox="0 0 200 200" width="100%" height="100%">
      {[...Array(16)].map((_, i) => (
        <ellipse
          key={i} cx="100" cy="40"
          rx="6" ry="50"
          fill={accent}
          transform={`rotate(${i * 22.5} 100 100)`}
        />
      ))}
      <circle cx="100" cy="100" r="20" fill={accent} />
    </svg>
    <style>{`@keyframes mandala-rotate{0%{transform:translate(-50%,-50%) rotate(0deg);}100%{transform:translate(-50%,-50%) rotate(360deg);}}`}</style>
  </div>
);

const HouseboatOverlay = () => (
  <div
    style={{
      position: 'absolute', bottom: '22%',
      width: 200, height: 70,
      zIndex: 4, pointerEvents: 'none',
      animation: 'houseboat-drift 30s linear infinite',
    }}
  >
    <style>{`@keyframes houseboat-drift{0%{transform:translateX(-30%);}100%{transform:translateX(130%);}}`}</style>
    <svg viewBox="0 0 240 100" fill="none" width="100%" height="100%">
      <path d="M28 50 Q120 8 212 50 L212 60 L28 60 Z" fill="#3A2418" />
      <path d="M12 60 L228 60 L210 86 L30 86 Z" fill="#1F1108" />
    </svg>
  </div>
);

const WaterRippleRings = () => (
  <div style={{ position: 'absolute', left: '50%', top: '70%', transform: 'translate(-50%,-50%)', zIndex: 3, pointerEvents: 'none' }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          position: 'absolute', left: 0, top: 0,
          width: 80, height: 80,
          border: '1px solid rgba(255,255,255,0.45)',
          borderRadius: '50%',
          transform: 'translate(-50%,-50%)',
          animation: `ripple-ring 3.2s ease-out ${i}s infinite`,
        }}
      />
    ))}
    <style>{`@keyframes ripple-ring{0%{opacity:.55;transform:translate(-50%,-50%) scale(0.4);}100%{opacity:0;transform:translate(-50%,-50%) scale(2.2);}}`}</style>
  </div>
);

const TurmericSteamOverlay = () => (
  <div style={{ position: 'absolute', left: '50%', bottom: '14%', transform: 'translateX(-50%)', zIndex: 6, pointerEvents: 'none' }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          position: 'absolute', left: i * 14 - 14, bottom: 0,
          width: 8, height: 20, borderRadius: 4,
          background: 'rgba(255,255,255,0.45)',
          filter: 'blur(3px)',
          animation: `turmeric-steam 3.4s ease-out ${i * 0.5}s infinite`,
        }}
      />
    ))}
    <style>{`@keyframes turmeric-steam{0%{opacity:.55;transform:translateY(0) scale(1);}100%{opacity:0;transform:translateY(-50px) scale(1.6);}}`}</style>
  </div>
);

const SwingOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', left: '50%', top: '14%', transform: 'translateX(-50%)', zIndex: 5, pointerEvents: 'none' }}>
    <PendulumSwing amplitude={7} duration={4.2} origin="top center">
      <div style={{ position: 'relative', width: 110, height: 130 }}>
        <span style={{ position: 'absolute', left: 0,  top: 0, width: 1.5, height: 100, background: '#7A4E2C', display: 'block' }} />
        <span style={{ position: 'absolute', right: 0, top: 0, width: 1.5, height: 100, background: '#7A4E2C', display: 'block' }} />
        <div style={{ position: 'absolute', bottom: 18, left: -8, right: -8, height: 14, background: '#8B5E3A', borderRadius: 4 }} />
        <div style={{ position: 'absolute', bottom: 0,  left: -8, right: -8, height: 8,  background: accent, borderRadius: 8 }} />
      </div>
    </PendulumSwing>
  </div>
);

const GoldFrameShimmer = ({ accent }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', inset: 8,
      border: `1.5px solid ${accent}88`,
      borderRadius: 12,
      pointerEvents: 'none', zIndex: 9,
    }}
  >
    <GoldShimmer duration={6} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <span style={{ display: 'block', width: '100%', height: '100%' }} />
    </GoldShimmer>
  </div>
);

const SunsetGradient = ({ t }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
      background: 'linear-gradient(180deg, rgba(255,170,80,0.20) 0%, transparent 40%, rgba(255,110,90,0.18) 80%, rgba(80,40,60,0.45) 100%)',
      animation: 'sunset-pulse 10s ease-in-out infinite',
    }}
  >
    <style>{`@keyframes sunset-pulse{0%,100%{filter:hue-rotate(0deg) brightness(1);}50%{filter:hue-rotate(-8deg) brightness(1.06);}}`}</style>
  </div>
);

const StarField = ({ count = 30 }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
    {[...Array(count)].map((_, i) => {
      const x = Math.random() * 100;
      const y = Math.random() * 60;
      const sz = 1 + Math.random() * 2;
      const dur = 2 + Math.random() * 3;
      const delay = Math.random() * 3;
      return (
        <span key={i}
          style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`,
            width: sz, height: sz, borderRadius: '50%', background: '#FFFFFF',
            opacity: 0.6, animation: `star-twinkle ${dur}s ease-in-out ${delay}s infinite`,
          }}
        />
      );
    })}
    <style>{`@keyframes star-twinkle{0%,100%{opacity:.2;}50%{opacity:.95;}}`}</style>
  </div>
);

const CrescentMoon = ({ color }) => (
  <div style={{ position: 'absolute', top: '8%', right: '12%', zIndex: 3, pointerEvents: 'none' }}>
    <svg width="60" height="60" viewBox="0 0 60 60">
      <defs>
        <mask id="moonMask">
          <rect width="60" height="60" fill="white" />
          <circle cx="38" cy="26" r="22" fill="black" />
        </mask>
      </defs>
      <circle cx="30" cy="30" r="22" fill={color} mask="url(#moonMask)" opacity="0.92" />
    </svg>
  </div>
);

const ChurchDove = ({ color = '#FFFFFF' }) => (
  <div
    style={{
      position: 'absolute', top: '8%', left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 6, pointerEvents: 'none',
      animation: 'dove-flap 1.2s ease-in-out infinite',
    }}
  >
    <style>{`@keyframes dove-flap{0%,100%{transform:translateX(-50%) scaleY(1);}50%{transform:translateX(-50%) scaleY(0.85);}}`}</style>
    <svg width="56" height="40" viewBox="0 0 56 40" fill="none">
      <path d="M28 20 Q10 8 4 18 Q14 22 22 22 Q14 28 6 30 Q18 34 28 28 Q38 34 50 30 Q42 28 34 22 Q42 22 52 18 Q46 8 28 20 Z" fill={color} opacity="0.92" />
    </svg>
  </div>
);

const Sunburst = ({ color }) => (
  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 1, pointerEvents: 'none', opacity: 0.25 }}>
    <svg width="320" height="320" viewBox="0 0 320 320">
      {[...Array(24)].map((_, i) => (
        <rect key={i} x="158" y="40" width="4" height="120" fill={color} transform={`rotate(${i * 15} 160 160)`} />
      ))}
    </svg>
  </div>
);

const SeashellOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
    {[
      { left: '6%',  bottom: '10%', size: 40 },
      { right: '8%', bottom: '14%', size: 30 },
      { left: '40%', bottom: '6%',  size: 26 },
    ].map((p, i) => (
      <div key={i} style={{ position: 'absolute', ...p }}>
        <LeafSway amplitude={2} duration={5 + i} intensity="subtle">
          <svg width={p.size} height={p.size} viewBox="0 0 40 40">
            <path d="M20 4 Q34 14 32 34 L20 28 L8 34 Q6 14 20 4 Z" fill={accent} opacity="0.85" />
            <path d="M14 32 L20 12 L26 32" stroke="#FFFFFF" strokeWidth="0.7" fill="none" opacity="0.7" />
          </svg>
        </LeafSway>
      </div>
    ))}
  </div>
);

const GlassBottleOverlay = ({ accent }) => (
  <div
    style={{
      position: 'absolute', left: '50%', bottom: '24%',
      transform: 'translateX(-50%)', zIndex: 5, pointerEvents: 'none',
      animation: 'bottle-bob 4s ease-in-out infinite',
    }}
  >
    <style>{`@keyframes bottle-bob{0%,100%{transform:translateX(-50%) rotate(-3deg);}50%{transform:translateX(-50%) rotate(3deg);}}`}</style>
    <svg width="40" height="100" viewBox="0 0 40 100" fill="none">
      <rect x="16" y="0" width="8" height="12" fill="#6B4423" />
      <path d="M14 12 L26 12 L30 30 L30 96 L10 96 L10 30 Z" fill="rgba(255,255,255,0.30)" stroke={accent} strokeWidth="1" />
      <rect x="14" y="50" width="12" height="30" fill={`${accent}33`} />
    </svg>
  </div>
);

const ButterflyOverlay = ({ accent }) => (
  <div
    style={{
      position: 'absolute', top: '14%', right: '18%',
      zIndex: 7, pointerEvents: 'none',
      animation: 'butterfly-flutter 0.5s ease-in-out infinite, butterfly-drift 12s ease-in-out infinite',
    }}
  >
    <style>{`
      @keyframes butterfly-flutter{0%,100%{transform:scaleY(1);}50%{transform:scaleY(0.7);}}
      @keyframes butterfly-drift{0%,100%{translate:0 0;}25%{translate:-20px 10px;}50%{translate:10px 20px;}75%{translate:20px -10px;}}
    `}</style>
    <svg width="34" height="26" viewBox="0 0 34 26" fill="none">
      <ellipse cx="10" cy="8"  rx="9" ry="8"  fill={accent} opacity="0.9" />
      <ellipse cx="10" cy="18" rx="7" ry="6"  fill={accent} opacity="0.7" />
      <ellipse cx="24" cy="8"  rx="9" ry="8"  fill={accent} opacity="0.9" />
      <ellipse cx="24" cy="18" rx="7" ry="6"  fill={accent} opacity="0.7" />
      <rect x="16" y="6" width="2" height="14" fill="#2A1A0A" />
    </svg>
  </div>
);

/* Christian-Elegant stained glass — kept on the warm palette so we never
   bleed an unintended cool/blue cast onto the design preview grid.
   The previous deep-blue radial gradient (rgba(60,100,200)) read as a
   stray blue overlay on the homepage and was the #1 visual bug
   reported. Replaced with mocha + champagne + rose. */
const StainedGlassOverlay = () => (
  <div
    aria-hidden
    style={{
      position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
      background:
        'radial-gradient(ellipse at 22% 28%, rgba(220,80,40,0.20) 0%, transparent 22%), ' +
        'radial-gradient(ellipse at 78% 32%, rgba(232,199,102,0.22) 0%, transparent 22%), ' +
        'radial-gradient(ellipse at 50% 70%, rgba(212,160,90,0.18) 0%, transparent 24%)',
      mixBlendMode: 'screen',
      animation: 'stained-pulse 12s ease-in-out infinite',
    }}
  >
    <style>{`@keyframes stained-pulse{0%,100%{opacity:.6;}50%{opacity:.95;}}`}</style>
  </div>
);

const PhulkariBorder = ({ accent }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', inset: 4, zIndex: 9, pointerEvents: 'none',
      border: `3px dashed ${accent}`,
      borderRadius: 10,
      filter: 'drop-shadow(0 0 6px rgba(255,180,80,0.4))',
      animation: 'phulkari-shift 6s linear infinite',
    }}
  >
    <style>{`@keyframes phulkari-shift{0%{background-position:0 0;}100%{background-position:40px 40px;}}`}</style>
  </div>
);

const ShankhaOverlay = ({ accent }) => (
  <div style={{ position: 'absolute', left: '50%', top: '8%', transform: 'translateX(-50%)', zIndex: 6, pointerEvents: 'none', animation: 'shankha-glow 4s ease-in-out infinite' }}>
    <style>{`@keyframes shankha-glow{0%,100%{filter:drop-shadow(0 0 6px ${accent}88);}50%{filter:drop-shadow(0 0 14px ${accent});}}`}</style>
    <svg width="48" height="48" viewBox="0 0 48 48">
      <path d="M10 30 Q14 12 28 8 Q40 14 38 28 Q40 38 32 40 Q22 40 18 36 Q12 34 10 30 Z" fill="#FFF6E9" stroke={accent} strokeWidth="1" />
      <path d="M16 28 Q20 18 28 16" stroke={accent} strokeWidth="1" fill="none" opacity="0.7" />
    </svg>
  </div>
);

const SindoorArc = () => (
  <div
    aria-hidden
    style={{
      position: 'absolute', left: '15%', right: '15%', top: '20%',
      height: 6, zIndex: 4, pointerEvents: 'none',
      background: 'linear-gradient(90deg, transparent 0%, #CC0000 30%, #CC0000 70%, transparent 100%)',
      borderRadius: 6,
      filter: 'blur(1px)',
      animation: 'sindoor-pulse 5s ease-in-out infinite',
    }}
  >
    <style>{`@keyframes sindoor-pulse{0%,100%{opacity:.7;}50%{opacity:1;}}`}</style>
  </div>
);

export default memo(UniversalDesignRenderer);
