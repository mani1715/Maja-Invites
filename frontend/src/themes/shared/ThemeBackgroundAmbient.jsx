/* ThemeBackgroundAmbient
 *
 * A tiny, performant CSS/SVG layer that sits behind / atop the design card's
 * art and adds a subtle, thematic motion — drifting petals on temple,
 * floating lanterns on punjabi, fireflies on nature, water ripples on
 * beach/kerala, etc.
 *
 * Purpose: every design feels "alive" even at rest in the preview grid.
 * Pure CSS keyframes — no JS animation loop — so it costs almost nothing
 * even when 50+ cards are visible.
 *
 * Used inside `UniversalDesignRenderer.jsx` as a sibling of the artwork.
 */
import React, { useMemo } from 'react';

const styleId = 'tba-styles';

const STYLES = `
  @keyframes tba-float { 0% { transform: translateY(0) translateX(0) rotate(0); }
    50% { transform: translateY(-8px) translateX(6px) rotate(8deg); }
    100% { transform: translateY(0) translateX(0) rotate(0); } }
  @keyframes tba-fall { 0% { transform: translateY(-10%) translateX(0) rotate(0); opacity: 0; }
    20% { opacity: 0.85; }
    100% { transform: translateY(110%) translateX(30px) rotate(360deg); opacity: 0; } }
  @keyframes tba-firefly { 0%,100% { opacity: 0.18; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.15); } }
  @keyframes tba-ripple { 0% { transform: scale(0.3); opacity: 0.65; }
    100% { transform: scale(2.6); opacity: 0; } }
  @keyframes tba-sway { 0% { transform: rotate(-2deg) translateY(0); }
    50% { transform: rotate(2deg) translateY(-3px); }
    100% { transform: rotate(-2deg) translateY(0); } }
  @keyframes tba-shimmer { 0% { background-position: -200% 0; }
    100% { background-position: 200% 0; } }
  @keyframes tba-flicker { 0% { opacity: 0.7; transform: scale(1); }
    100% { opacity: 1; transform: scale(1.04); } }
`;

const ensureStyles = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById(styleId)) return;
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = STYLES;
  document.head.appendChild(el);
};

const PARTICLE_SET = {
  temple: { color: '#F8C75A', count: 8, anim: 'tba-fall', size: [4, 8], dur: [6, 11], type: 'circle' },
  mughal: { color: '#C8A45D', count: 14, anim: 'tba-float', size: [2, 4], dur: [4, 8], type: 'dot' },
  punjabi: { color: '#FFAA33', count: 6, anim: 'tba-flicker', size: [5, 9], dur: [1.4, 2.0], type: 'lantern' },
  bengali: { color: '#F5ECC2', count: 10, anim: 'tba-firefly', size: [3, 5], dur: [2, 4], type: 'dot' },
  muslim: { color: '#FFF8DC', count: 18, anim: 'tba-firefly', size: [1, 3], dur: [2, 5], type: 'star' },
  kerala: { color: '#7BC0B8', count: 4, anim: 'tba-ripple', size: [40, 80], dur: [4, 7], type: 'ripple' },
  beach: { color: 'rgba(255,255,255,0.55)', count: 8, anim: 'tba-float', size: [4, 8], dur: [4, 9], type: 'foam' },
  nature: { color: '#FFE49A', count: 12, anim: 'tba-firefly', size: [2, 4], dur: [2, 5], type: 'dot' },
  christian: { color: '#FFF8DC', count: 8, anim: 'tba-fall', size: [4, 7], dur: [8, 13], type: 'petal' },
  modern: { color: '#B89B72', count: 4, anim: 'tba-float', size: [2, 3], dur: [5, 8], type: 'dot' },
  minimal: { color: '#B89B72', count: 4, anim: 'tba-float', size: [2, 3], dur: [5, 8], type: 'dot' },
};

const THEME_ALIAS = {
  south_indian_temple: 'temple', royal_mughal: 'mughal',
  punjabi_sangeet: 'punjabi', bengali_traditional: 'bengali',
  muslim_nikah: 'muslim', kerala_backwaters: 'kerala',
  beach_destination: 'beach', nature_eco_wedding: 'nature',
  christian_elegant: 'christian', modern_minimal: 'minimal',
};

export default function ThemeBackgroundAmbient({ themeId }) {
  ensureStyles();
  // Phase 3A: fix operator precedence — was `(ALIAS || SET) ? (ALIAS || id) : 'minimal'`
  // which evaluated the ternary off the truthiness of the union, picking the wrong branch.
  const aliased = THEME_ALIAS[themeId];
  const key = aliased || (PARTICLE_SET[themeId] ? themeId : 'minimal');
  const cfg = PARTICLE_SET[key] || PARTICLE_SET.minimal;

  // Deterministic particle positions so they don't reshuffle on every re-render
  const particles = useMemo(() => Array.from({ length: cfg.count }, (_, i) => {
    const rnd = (seed) => ((Math.sin(seed * 9301 + 49297) * 233280) % 1 + 1) % 1;
    return {
      left: `${rnd(i + 1) * 92 + 4}%`,
      top: `${rnd(i + 4) * 80 + 8}%`,
      size: cfg.size[0] + rnd(i + 7) * (cfg.size[1] - cfg.size[0]),
      delay: rnd(i + 11) * 4,
      dur: cfg.dur[0] + rnd(i + 13) * (cfg.dur[1] - cfg.dur[0]),
    };
  }), [cfg]);

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 5 }}>
      {particles.map((p, i) => {
        const common = {
          position: 'absolute',
          left: p.left, top: p.top,
          width: p.size, height: p.size,
          animation: `${cfg.anim} ${p.dur}s ease-in-out ${p.delay}s infinite ${cfg.anim === 'tba-flicker' ? 'alternate' : ''}`,
        };
        switch (cfg.type) {
          case 'star':
            return <div key={i} style={{ ...common, borderRadius: '50%', background: cfg.color, boxShadow: `0 0 ${p.size * 2}px ${cfg.color}` }} />;
          case 'dot':
            return <div key={i} style={{ ...common, borderRadius: '50%', background: cfg.color, boxShadow: `0 0 ${p.size}px ${cfg.color}` }} />;
          case 'petal':
            return <div key={i} style={{ ...common, height: p.size * 0.55, borderRadius: '50%', background: cfg.color, transform: 'rotate(30deg)' }} />;
          case 'foam':
            return <div key={i} style={{ ...common, borderRadius: '50%', background: cfg.color }} />;
          case 'ripple':
            return <div key={i} style={{ ...common, borderRadius: '50%', border: `1px solid ${cfg.color}`, background: 'transparent' }} />;
          case 'lantern':
            return (
              <div key={i} style={{ ...common, transformOrigin: 'top center', background: 'transparent' }}>
                <div style={{ width: 1, height: 18, margin: '0 auto', background: 'rgba(212,175,55,0.4)' }} />
                <div style={{
                  width: p.size, height: p.size * 1.3, marginTop: -2,
                  background: `radial-gradient(circle, ${cfg.color} 0%, #b8500e 90%)`,
                  borderRadius: '50% 50% 40% 40% / 60% 60% 40% 40%',
                  boxShadow: `0 0 ${p.size}px ${cfg.color}`,
                }} />
              </div>
            );
          case 'circle':
          default:
            return <div key={i} style={{ ...common, borderRadius: '50%',
              background: `radial-gradient(circle, ${cfg.color}, transparent)` }} />;
        }
      })}
    </div>
  );
}
