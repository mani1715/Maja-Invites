// PlanCapabilityBanner (Phase 2) — a non-invasive plan hint for the community.
// Fetches /api/pixora/capabilities and, ONLY for a plan-limited member, shows a
// dismissible banner naming what's locked + an Upgrade link. Grandfathered /
// existing members (every capability allowed) and users with gating disabled see
// nothing — their UI is unchanged. Fully self-contained: it renders nothing on
// error, so it can never break the surrounding page.
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Lock, Sparkles, ArrowRight, X } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Friendly labels for the capabilities worth advertising as upgrades.
const LABELS = {
  photo_post: 'Photo posts', multi_image_post: 'Multi-image posts',
  showcase_post: 'Showcase posts', critique_post: 'Critique posts',
  verification: 'Verification', analytics: 'Analytics', marketplace_sell: 'Marketplace selling',
  reels: 'Reels', stories: 'Stories', drafts: 'Drafts', scheduled_posts: 'Scheduled posts',
  crm: 'CRM', ai_review: 'AI Review', ai_assistant: 'AI Assistant',
  priority_discovery: 'Priority discovery', featured_placement: 'Featured placement',
  advanced_analytics: 'Advanced analytics',
};

export default function PlanCapabilityBanner() {
  const [caps, setCaps] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/capabilities`, { headers: authHeaders() })
      .then(({ data }) => setCaps(data)).catch(() => setCaps(false));
  }, []);

  if (!caps || dismissed) return null;
  // Grandfathered / gating-off members keep full access → no banner.
  if (caps.grandfathered || !caps.enforced) return null;

  const locked = Object.entries(caps.capabilities || {})
    .filter(([k, v]) => v === false && LABELS[k])
    .map(([k]) => LABELS[k]);
  if (locked.length === 0) return null;

  const tier = (caps.tier || 'free').replace(/^\w/, (c) => c.toUpperCase());
  const shown = locked.slice(0, 6);
  const more = locked.length - shown.length;

  return (
    <div className="lux-glass p-4 mb-5 flex items-start gap-3" data-testid="plan-capability-banner"
      style={{ border: '1px solid rgba(212,175,55,0.35)' }}>
      <Lock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#E8C97A' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles className="w-3.5 h-3.5" style={{ color: '#E8C97A' }} />
          <span className="lux-eyebrow">You're on the {tier} plan</span>
        </div>
        <p className="text-sm mb-2" style={{ color: 'var(--lux-text-muted)' }}>
          Upgrade to unlock {shown.join(', ')}{more > 0 ? ` +${more} more` : ''}.
        </p>
        <a href="/studio/plans" className="lux-btn inline-flex text-xs" data-testid="plan-banner-upgrade">
          Upgrade plan <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
      <button onClick={() => setDismissed(true)} className="shrink-0 opacity-70 hover:opacity-100"
        aria-label="Dismiss" data-testid="plan-banner-dismiss">
        <X className="w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
      </button>
    </div>
  );
}
