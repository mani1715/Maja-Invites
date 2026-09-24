// NotFound — catch-all 404. Keeps unknown URLs from rendering a blank screen.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Compass } from 'lucide-react';
import '@/styles/luxury.css';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="luxe min-h-screen grid place-items-center px-6" data-testid="not-found">
      <div className="lux-glass p-10 text-center max-w-md">
        <div className="font-display text-6xl text-gold mb-2">404</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>
          This page drifted <span className="font-script italic text-gold">away.</span>
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>
          The link may be old or mistyped. Let's get you back.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate('/')} className="lux-btn" data-testid="nf-home"><Home className="w-4 h-4" /> Home</button>
          <button onClick={() => navigate('/designs')} className="lux-btn lux-btn-ghost" data-testid="nf-browse"><Compass className="w-4 h-4" /> Browse designs</button>
        </div>
      </div>
    </div>
  );
}
