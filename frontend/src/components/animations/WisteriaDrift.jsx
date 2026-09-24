/**
 * WisteriaDrift — Mughal/Minimal wisteria florets drifting downward.
 *
 * Similar to PetalFall but smaller, slower, with a faint vertical streak.
 * Default palette is wisteria-purple but accepts any color array.
 *
 * Props identical to PetalFall.
 */
import React from 'react';
import PetalFall from './PetalFall';

const WisteriaDrift = ({
  colors = ['#B07AC0', '#9A5FB0', '#D4A6E2'],
  count = 14,
  minSize = 6,
  maxSize = 10,
  driftX = 14,
  speed = 0.6,
  zIndex = 1,
  className = '',
  testId = 'wisteria-drift',
}) => (
  <PetalFall
    colors={colors}
    count={count}
    minSize={minSize}
    maxSize={maxSize}
    driftX={driftX}
    speed={speed}
    shape="oval"
    zIndex={zIndex}
    className={className}
    testId={testId}
  />
);

export default WisteriaDrift;
