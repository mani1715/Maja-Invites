# MAJA Invites — Animation Manifest

Full audit of every animation/interaction shipping in `frontend/src`, as of the
Task B3 motion pass. "Reduced-motion behavior" describes what actually happens
today — where a component has no explicit guard, that's called out rather than
assumed.

Two motion systems coexist in this codebase:

- **framer-motion `useReducedMotion()`** (from `src/hooks/useMotionDefaults.js`,
  or imported directly from `framer-motion`) — an explicit per-component JS
  check. Used by most of `src/motion/*` and by some page-level components.
- **Global CSS fallback** — `.luxe * { animation-duration: 0.001s !important;
  transition-duration: 0.001s !important; }` under
  `@media (prefers-reduced-motion: reduce)` in `styles/luxury.css`. This only
  affects CSS `animation`/`transition` properties — it does **not** touch
  framer-motion's JS-driven (inline-style) animations, since framer-motion
  doesn't use CSS transitions/animations under the hood. Rows below that rely
  on it are CSS-only animations; rows using framer-motion need their own
  explicit check to truly respect the setting.

| # | Animation | Where | Tech | Reduced-motion behavior |
|---|---|---|---|---|
| 1 | AnimationController (GPU-tier + motion gate) | Global — gates every canvas particle system below | React context, `detect-gpu`, `matchMedia('(prefers-reduced-motion: reduce)')` | **Is** the reduced-motion detector — returns `REDUCED` level, consumers early-return `null` |
| 2 | PetalFall | Theme decorations (marigold/rose/bougainvillea/jasmine petals) | Canvas 2D + `requestAnimationFrame`, `useCanvasVisibility` IntersectionObserver | Skipped entirely (`canvasParticles: false`) under `REDUCED` |
| 3 | WisteriaDrift | Mughal/Minimal theme decorations | Thin wrapper over PetalFall (oval shape, purple palette, slower speed) | Inherits PetalFall's skip |
| 4 | FireflyParticle | Night/garden theme scenes | Canvas 2D + RAF, `useAnimationLevel` gated | Skipped under `REDUCED` |
| 5 | SkyLanternFloat | Festive theme scenes | Canvas 2D + RAF, `useAnimationLevel` gated | Skipped under `REDUCED` |
| 6 | WaterRipple | Backwaters/beach theme scenes | Canvas 2D + RAF, `useAnimationLevel` gated | Skipped under `REDUCED` |
| 7 | GoldShimmer | Wraps gold borders/badges/chips app-wide | CSS `::after` gradient sweep, keyframe injected via inline `<style>` | Not self-gated; relies on global `.luxe *` CSS override |
| 8 | LeafSway | Plant/leaf/garland decorations | CSS keyframe rotate, `transform-origin` sway | Global `.luxe *` override |
| 9 | CrystalSparkle | Hanging crystal/chandelier decorations | CSS keyframe opacity/scale twinkle | Global `.luxe *` override |
| 10 | FlameAnimation | Diya/candle/havan decorations | 3-layer CSS keyframe flicker (scale + opacity, core/mid/outer) | Global `.luxe *` override |
| 11 | LanternGlow | Lantern decorations | CSS keyframe glow pulse | Global `.luxe *` override |
| 12 | PendulumSwing | Swing/bell/hanging-crystal decorations | CSS keyframe rotate, physics-style ease | Global `.luxe *` override |
| 13 | HeroMandala3D | Landing Hero backdrop | CSS/SVG rotation + dust particles, `IntersectionObserver` pauses when scrolled out | No explicit reduced-motion check — hidden on mobile viewport only; desktop relies on global `.luxe *` override |
| 14 | Invitation3DScene | Published invitation hero backdrop | Three.js WebGL (rotating torus + dust field), pointer/device-orientation parallax | Explicit — reads `prefers-reduced-motion` inside the effect and skips motion; falls back to empty div if WebGL is unavailable |
| 15 | WaxSealOpening — crack/unfold | Published invitation intro overlay | framer-motion `AnimatePresence`, 3D envelope unfold | Explicit `useReducedMotion()` — open delay collapses 1700ms → 200ms |
| 16 | WaxSealOpening — reveal/close | Published invitation intro overlay | framer-motion `AnimatePresence` exit fade | Same component/guard as above |
| 17 | MandalaLoader | Loading spinners across dashboards | CSS `.lux-mandala` conic-gradient spin, radial mask | Relies on global `.luxe *` override |
| 18 | PetalConfetti | RSVP-submitted celebration burst | framer-motion `AnimatePresence`, per-petal randomized fall/rotate | **No explicit guard** — flagged gap, not covered by CSS fallback either |
| 19 | ScrollSection | Published invitation section reveals (single source of truth) | framer-motion `whileInView`, `useReducedMotion()` | Explicit — collapses to a plain fast opacity fade (no `y`/blur) |
| 20 | Theme cross-fade | Any element under `.theme-transition` during a light/dark toggle | CSS `transition` on background/color/border/box-shadow (350ms), toggled by `ThemeToggle.jsx` | Covered by the global `.luxe *` transition-duration collapse |
| 21 | Theme toggle icon swap | `ThemeToggle` sun/moon button | Plain conditional render (no animation on the icon itself) | N/A — static swap |
| 22 | Ambient vignette drift (light theme) | `.luxe-vignette::after`, light theme only | CSS keyframe `lux-ambient-drift` on `background-position` | Explicitly wrapped in `@media (prefers-reduced-motion: no-preference)` |
| 23 | Grain texture overlay | `.luxe-grain::before` | Static SVG turbulence, blend-mode only | N/A — no animation |
| 24 | Lux-glass hover | `.lux-glass:hover` cards throughout | CSS transition on border-color/background/transform | Global `.luxe *` override |
| 25 | Lux-btn hover lift | Every `.lux-btn` | CSS `transform: translateY` + box-shadow transition | Global `.luxe *` override |
| 26 | Lux-btn / lux-btn-ghost active press | Every `.lux-btn` / `.lux-btn-ghost` on `:active` | CSS `transform: scale(0.97)`, 120ms | Global `.luxe *` override |
| 27 | Legacy `.lux-reveal` fade-up utility | `lux-fade-up` / `lux-fade-in` / `lux-shimmer-line` keyframes | CSS keyframe opacity/transform/blur | Global `.luxe *` override |
| 28 | TextReveal | Word/char reveal headings sitewide | framer-motion `whileInView`, per-item stagger (`wordStagger`/`charStagger`) | Explicit `useReducedMotion()` — renders plain unsplit text |
| 29 | MagneticButton | Hero CTA buttons ("Enter Studio", "Explore Themes") | framer-motion `useSpring` cursor-follow nudge (`SPRING.magnetic`) | Explicit — static passthrough when reduced motion OR pointer isn't `fine` (touch) |
| 30 | TiltCard | BrowseRoots occasion cards | framer-motion 3D pointer-tilt + cursor-tracked sheen, GPU-tier gated | Explicit — static passthrough when reduced motion, touch, or GPU tier < 2 |
| 31 | Marquee | CelebrationMarquee ticker ("Weddings · Haldi · Mehndi…") | Pure CSS `translateX` keyframe, duplicated track for seamless loop | Explicit — renders a static horizontally-scrollable row |
| 32 | ScrollProgress | Fixed top-of-viewport gold progress bar | framer-motion `useScroll` + `useSpring` → `scaleX` | Explicit — renders `null` |
| 33 | RouteTransition | Route-level page-enter animation (app shell) | framer-motion opacity/y fade, keyed by `pathname`, enter-only | Explicit — returns children unanimated |
| 34 | ScrollProgressBar (ScrollFX) | Published invitation pages | framer-motion `useScroll`/`useSpring` scaleX | Explicit — renders `null` |
| 35 | ScrollReveal (ScrollFX) | Published invitation pages | framer-motion 3D `whileInView` (rotateX/scale/blur) | Explicit — collapses to plain opacity fade |
| 36 | ScrollCue (ScrollFX) | Published invitation hero "scroll down" cue | framer-motion infinite y-bob | Explicit — `animate={{}}` no-op under reduced motion |
| 37 | Nav entry fade | `Nav` bar on mount (LandingPage) | framer-motion `initial`/`animate` y + opacity | **No explicit guard** — flagged gap |
| 38 | Mobile menu drawer | Hamburger menu open (LandingPage `Nav`) | framer-motion `initial`/`animate` y + opacity | **No explicit guard** — flagged gap |
| 39 | FloatingHeroMandala ×3 + pointer parallax | Hero decorative mandalas | CSS keyframe float + framer-motion `useSpring` pointer-parallax transforms | Explicit — entire block is skipped (`{!reduce && (...)}`) under reduced motion or non-fine pointer |
| 40 | Hero heading line-reveal | H1 "Cinematic invitations / for every celebration" | framer-motion `y: '110%' → 0` under an `overflow:hidden` clip mask | Explicit — `initial={reduce ? false : {...}}` |
| 41 | Hero copy stagger (eyebrow/paragraph/CTA row/rating/scroll cue) | Hero body content | framer-motion `fadeUp` custom-indexed variants | Partial — parent wrapper honors `reduce`, but the inner `fadeUp` variants animate unconditionally (flagged) |
| 42 | SectionHeader 3D reveal | Every section heading (`◆ eyebrow` / `h2` / kicker) sitewide | framer-motion `rotateX` 3D stagger (`sectionHeader3D`) | **No explicit guard** — flagged gap |
| 43 | BrowseRoots / Themes / InvitationCategories grid stagger | Occasion & theme card grids | framer-motion `stagger` + `fadeUp` variants, `whileInView` | **No explicit guard** — flagged gap |
| 44 | Theme card hover lift + image scale | Theme/category cards | framer-motion `whileHover` scale + CSS `group-hover:scale` on the preview image | **No explicit guard** — flagged gap |
| 45 | Story panel 3D tilt-in | Story section testimonial card | framer-motion `rotateY`/scale entrance | **No explicit guard** — flagged gap |
| 46 | FAQItem accordion | FAQ open/close chevron rotate + content reveal | CSS `transform: rotate()` transition (chevron) | Global `.luxe *` override |
| 47 | **CountUp** *(new — Task 1)* | Stats section numbers (50+ / 10+ / 2000+ / 99%+) | framer-motion `animate()` on a motion value → `useTransform` → rounded text, triggered once via `useInView` | Explicit — renders the final value immediately, no count animation |
| 48 | **Footer reveal** *(new — Task 2)* | Landing page Footer | framer-motion `motion.footer`, `y:60→0` + opacity, `whileInView` once | Explicit — `initial={reduce ? false : {...}}` |
| 49 | **Nav link underline-grow** *(new — Task 3)* | Desktop nav links (Home/Themes/Features/Plans/FAQ/Story/Community/Portfolio) | CSS `.nav-link::after`, 1px gold rule `scaleX(0→1)` on hover/focus-visible | Hover/focus-triggered only (no ambient loop); also covered by the global `.luxe *` transition collapse |
| 50 | **CTA shine sweep** *(new — Task 4)* | Every `.lux-btn` (all primary CTAs sitewide) | CSS `::after` diagonal white-gold gradient, `translateX(-150%→150%)` on hover | Explicit — entire effect wrapped in `@media (prefers-reduced-motion: no-preference) and (hover: hover)` |
| 51 | **Logo shimmer** *(new — Task 5)* | Nav "MAJA Invites" wordmark | CSS `::after` masked gradient sweep (skewed, `mix-blend-mode: screen`/`multiply`), 7s loop | Explicit — `@media (prefers-reduced-motion: reduce)` removes the animation and hides the overlay |
| 52 | **FAQ spring** *(upgraded — Task 6)* | FAQItem accordion open/close body | framer-motion `AnimatePresence`, `height: 0↔auto` + opacity, now `SPRING.gentle` (was a fixed 0.4s duration/ease) | Unchanged by this task — same as row 46's gap, the accordion body still has no explicit guard |
| 53 | **Morphing gold blob** *(new — Task 7)* | Behind the Hero text block | CSS `border-radius` 4-state morph (18s) + independent `rotate` keyframe (36s) on a blurred radial-gradient div | Explicit — `.lux-morph-blob--static` strips the animation via `useReducedMotion()`, backed by a `prefers-reduced-motion` media query |
| 54 | **Cursor glow** *(new — Task 8)* | Mounted once in `LandingPage`, follows the cursor sitewide | framer-motion `useSpring` lag on `x`/`y` motion values, 300px radial gold halo | Explicit — component renders `null` under reduced motion or when the pointer isn't `fine` (touch is excluded by the same check) |
| 55 | **Form focus glow** *(new — Task D)* | Every text input / textarea / select sitewide (incl. portaled auth modal + studio login) | CSS `:focus` gold ring `box-shadow 0 0 0 3px rgba(212,175,55,.18)` + gold border | Explicit — the `transition` is wrapped in `@media (prefers-reduced-motion: no-preference)`, so reduced-motion users still get the ring, just no ease |
| 56 | **Form error slide-in** *(new — Task D)* | Inline validation messages using `.lux-field-error` | CSS `@keyframes lux-field-error-in` (opacity + `translateY(-4px→0)`, 200ms) | Explicit — `@media (prefers-reduced-motion: reduce)` sets `animation: none` |
| 57 | **Pinned story panel** *(new — Task D)* | `/story` page testimonial column | Native CSS `position: sticky; top: 96px` (desktop `lg:` only), pins while philosophy text scrolls | Not motion — sticky is layout, no animation; disengages to `relative` below `lg` (mobile untouched) |

**Total: 57 animations/interactions** (exceeds the 35 minimum).

## Reduced-motion gaps — status

Fixed in **Task D** (now render statically under `prefers-reduced-motion`):
Nav entry fade (#37), Mobile menu drawer (#38), SectionHeader 3D reveal (#42),
InvitationCategories grid stagger (#43), and the inner Hero copy stagger (#41)
— all gated via `useReducedMotion()` (`initial={reduce ? … : …}`).

Still open (pre-existing, framer-motion driven, no explicit guard; not a
regression): PetalConfetti (#18), theme card hover lift (#44), Story panel
tilt-in (#45), FAQItem accordion body (#46/#52).
