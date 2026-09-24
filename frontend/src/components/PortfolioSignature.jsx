import React from 'react';

/**
 * PortfolioSignature — the per-design "signature move" rendered as a fixed,
 * full-viewport background layer BEHIND all portfolio content (pointer-events
 * none, low z-index). One motif per design in the Background Design System.
 *
 * Everything is CSS/SVG so it's cheap and dependency-free. Heavy/continuous
 * motion is dropped when `lite` (phones) or the user prefers reduced motion.
 */

// tiny helper: #rrggbb + alpha → rgba()
const rgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Reusable film-grain as a data-URI (feTurbulence). Sits at low opacity.
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

export default function PortfolioSignature({ signature = 'none', accent = '#C0982F', dark = false, lite = false }) {
  const still = lite; // freeze continuous motion on phones
  const layer = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 };

  if (signature === 'none') return null;

  if (signature === 'sunlight') {
    // late-afternoon glow, warm, upper-right
    return (
      <div aria-hidden style={{ ...layer, background: `radial-gradient(900px 620px at 78% 8%, ${rgba(accent, 0.22)}, transparent 62%)` }} />
    );
  }

  if (signature === 'grain' || signature === 'contactsheet') {
    // darkroom / contact-sheet atmosphere: fine grain + soft vignette
    return (
      <div aria-hidden style={layer}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN, backgroundSize: '140px 140px', opacity: dark ? 0.06 : 0.05, mixBlendMode: dark ? 'screen' : 'multiply' }} />
        <div style={{ position: 'absolute', inset: 0, background: dark
          ? 'radial-gradient(1200px 800px at 50% 40%, transparent 55%, rgba(0,0,0,0.5))'
          : `radial-gradient(1200px 800px at 50% 40%, transparent 60%, ${rgba(accent, 0.06)})` }} />
      </div>
    );
  }

  if (signature === 'horizon') {
    // a single 1px "horizon" line echoing a landscape, plus airy wash
    return (
      <div aria-hidden style={layer}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '55vh', height: 1, background: rgba(accent, 0.55) }} />
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(1100px 480px at 50% 0%, ${rgba(accent, 0.10)}, transparent 60%)` }} />
      </div>
    );
  }

  if (signature === 'gallery') {
    // museum dust-motes drifting very slowly + soft top wash
    return (
      <div aria-hidden style={layer}>
        <style>{`@keyframes pf-mote{0%{transform:translateY(0) translateX(0)}50%{transform:translateY(-26px) translateX(14px)}100%{transform:translateY(0) translateX(0)}}`}</style>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(1000px 500px at 50% -6%, ${rgba(accent, 0.12)}, transparent 60%)` }} />
        {!still && Array.from({ length: 14 }).map((_, i) => {
          const size = 3 + (i % 4);
          return (
            <span key={i} style={{
              position: 'absolute', top: `${(i * 67) % 100}%`, left: `${(i * 37) % 100}%`,
              width: size, height: size, borderRadius: '50%', background: rgba(accent, 0.5),
              filter: 'blur(1.5px)', opacity: 0.5,
              animation: `pf-mote ${16 + (i % 7) * 3}s ease-in-out ${i * 0.7}s infinite`,
            }} />
          );
        })}
      </div>
    );
  }

  if (signature === 'filmstrip') {
    // 35mm sprocket-hole rails down both edges + subtle red vignette
    const holes = `repeating-linear-gradient(to bottom, transparent 0 14px, ${rgba('#E8E4DA', 0.16)} 14px 26px)`;
    return (
      <div aria-hidden style={layer}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 22, background: rgba('#000000', 0.5) }}>
          <div style={{ position: 'absolute', inset: '0 5px', background: holes, borderRadius: 3 }} />
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 22, background: rgba('#000000', 0.5) }}>
          <div style={{ position: 'absolute', inset: '0 5px', background: holes, borderRadius: 3 }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(900px 700px at 50% 30%, ${rgba(accent, 0.08)}, transparent 55%)` }} />
      </div>
    );
  }

  if (signature === 'glass') {
    // editorial: soft mauve + steel-blue tinted washes for glass to pick up
    return (
      <div aria-hidden style={layer}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(760px 560px at 12% 10%, ${rgba(accent, 0.16)}, transparent 60%), radial-gradient(760px 560px at 88% 82%, ${rgba('#A9C1C9', 0.18)}, transparent 60%)` }} />
      </div>
    );
  }

  if (signature === 'aurora') {
    // living generative gradient-mesh: three large blobs drifting slowly
    return (
      <div aria-hidden style={{ ...layer, background: '#0B0B10' }}>
        <style>{`
          @keyframes pf-aur1{0%{transform:translate(-8%,-6%) scale(1)}50%{transform:translate(10%,8%) scale(1.25)}100%{transform:translate(-8%,-6%) scale(1)}}
          @keyframes pf-aur2{0%{transform:translate(12%,10%) scale(1.1)}50%{transform:translate(-10%,-8%) scale(1.35)}100%{transform:translate(12%,10%) scale(1.1)}}
          @keyframes pf-aur3{0%{transform:translate(6%,-10%) scale(1.05)}50%{transform:translate(-6%,12%) scale(1.3)}100%{transform:translate(6%,-10%) scale(1.05)}}
        `}</style>
        <div style={{ position: 'absolute', width: '70vw', height: '70vw', top: '-15%', left: '-10%', borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle, rgba(91,75,138,0.55), transparent 66%)', animation: still ? 'none' : 'pf-aur1 64s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: '66vw', height: '66vw', bottom: '-18%', right: '-12%', borderRadius: '50%', filter: 'blur(84px)', background: 'radial-gradient(circle, rgba(46,125,107,0.5), transparent 66%)', animation: still ? 'none' : 'pf-aur2 78s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: '58vw', height: '58vw', top: '25%', left: '30%', borderRadius: '50%', filter: 'blur(90px)', background: 'radial-gradient(circle, rgba(184,92,138,0.42), transparent 66%)', animation: still ? 'none' : 'pf-aur3 70s ease-in-out infinite' }} />
      </div>
    );
  }

  return null;
}
