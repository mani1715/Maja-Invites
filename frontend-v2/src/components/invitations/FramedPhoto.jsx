import React from 'react';

/**
 * FramedPhoto:
 * Renders an image applying frame_transforms consistently across both preview and public invitation views.
 * Supports desktop vs mobile overrides and responsive aspect-ratio containment.
 */
export default function FramedPhoto({
  src,
  alt = '',
  transform = null,
  isMobile = false,
  className = '',
  style = {},
}) {
  if (!src) return null;

  // Determine active transform values based on desktop / mobile overrides
  const effective = (isMobile && transform?.mobile) ? transform.mobile : (transform?.desktop || transform || {});
  const x = effective.x ?? 50;
  const y = effective.y ?? 50;
  const scale = effective.scale ?? 1;
  const rotate = effective.rotate ?? 0;
  const fit = effective.fit ?? 'cover';

  const imgStyle = {
    objectFit: fit,
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${scale}) rotate(${rotate}deg)`,
    transformOrigin: `${x}% ${y}%`,
    width: '100%',
    height: '100%',
    display: 'block',
    transition: 'transform 0.15s ease-out',
  };

  return (
    <div
      className={`framed-photo-wrapper ${className}`}
      style={{
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      <img src={src} alt={alt} style={imgStyle} />
    </div>
  );
}
