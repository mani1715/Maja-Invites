import React from 'react';

/**
 * MandalaLoader — slow rotating gold ring with optional label.
 */
const MandalaLoader = ({ label = 'Loading…', size = 56 }) => (
  <div className="flex flex-col items-center gap-3" data-testid="mandala-loader">
    <div className="lux-mandala" style={{ width: size, height: size }} />
    {label && (
      <div className="text-[10px] tracking-[0.35em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</div>
    )}
  </div>
);

export default MandalaLoader;
