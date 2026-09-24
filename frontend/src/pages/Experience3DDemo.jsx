// Experience3DDemo — standalone check + showcase for the Phase 9 WebGL invite backdrop.
// Gated by the Phase 11 `experience_3d` feature flag (super-admin kill-switch).
import React from 'react';
import Invitation3DScene from '@/components/luxury/Invitation3DScene';
import useFeatureFlags from '@/hooks/useFeatureFlags';
import '@/styles/luxury.css';

export default function Experience3DDemo() {
  const { flag, ready } = useFeatureFlags();
  const on = !ready || flag('experience_3d'); // default-on until flags load
  return (
    <div className="luxe min-h-screen relative overflow-hidden grid place-items-center" data-testid="experience-3d-demo">
      {on && <Invitation3DScene accent="#D4AF37" density={1} />}
      <div className="relative text-center px-6" style={{ zIndex: 1 }}>
        <div className="lux-eyebrow mb-4">◆ Cinematic 3D</div>
        <h1 className="font-display text-5xl md:text-7xl" style={{ color: 'var(--lux-text)' }}>
          A &amp; <span className="font-script italic text-gold">R</span>
        </h1>
        <p className="mt-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>Move your cursor — the halo follows.</p>
      </div>
    </div>
  );
}
