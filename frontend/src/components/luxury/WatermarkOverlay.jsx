import React from 'react';

/**
 * WatermarkOverlay — diagonal "MAHARANI" mark for FREE-plan invitations.
 * Non-blocking; pointer-events: none.
 */
const WatermarkOverlay = ({ text = 'MAJA Invites' }) => (
  <div
    aria-hidden="true"
    data-testid="watermark-overlay"
    className="fixed inset-0 pointer-events-none z-[40] overflow-hidden select-none"
    style={{ mixBlendMode: 'overlay', opacity: 0.18 }}
  >
    <div
      style={{
        position: 'absolute',
        top: '-20%',
        left: '-20%',
        right: '-20%',
        bottom: '-20%',
        transform: 'rotate(-30deg)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: '120px',
        fontFamily: 'DM Serif Display, serif',
        fontSize: '2.2rem',
        color: '#FFF8DC',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        letterSpacing: '0.4em',
      }}
    >
      {Array.from({ length: 80 }, (_, i) => (
        <span key={i} style={{ textAlign: 'center' }}>{text}</span>
      ))}
    </div>
  </div>
);

export default WatermarkOverlay;
