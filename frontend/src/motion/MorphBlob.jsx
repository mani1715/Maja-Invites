import React from 'react';
import { useReducedMotion } from '../hooks/useMotionDefaults';

/**
 * MorphBlob — a soft, blurred gold/blush blob that slowly morphs through
 * organic border-radius states and rotates, sitting behind hero content as
 * ambient depth. Pure CSS (see .lux-morph-blob in luxury.css).
 *
 * ponytail: border-radius isn't a compositor-only property like transform/
 * opacity, but the blob is a single blurred, off-interaction-path element —
 * negligible cost next to the canvas/WebGL work elsewhere on this page.
 *
 * `style` positions the outer wrapper (top/left/width/height/zIndex) so the
 * inner element's own `animation` (which sets `transform`) never collides
 * with a caller-supplied transform.
 */
const MorphBlob = ({ className = '', style = {} }) => {
  const reduced = useReducedMotion();
  return (
    <div aria-hidden="true" className={`lux-morph-blob-wrap ${className}`} style={style}>
      <div className={`lux-morph-blob${reduced ? ' lux-morph-blob--static' : ''}`} />
    </div>
  );
};

MorphBlob.displayName = 'MorphBlob';

export default MorphBlob;
