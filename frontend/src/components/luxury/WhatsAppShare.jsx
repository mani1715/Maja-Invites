import React from 'react';
import { Share2 } from 'lucide-react';

/**
 * One-tap WhatsApp share for the published invitation — India's #1 invite
 * channel. Opens WhatsApp (or the native share sheet) pre-filled with a warm
 * message + the invite link, so guests forward it to family groups in a tap.
 */
const WhatsAppShare = ({ bride = '', groom = '', label = 'Share' }) => {
  const couple = [bride, groom].filter(Boolean).join(' & ') || 'our';
  const url = typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
  const message = `You're invited to ${couple}'s wedding! 💍\nOpen the invitation: ${url}`;

  const share = async () => {
    // Prefer the native share sheet on mobile (offers WhatsApp + everything).
    if (navigator.share) {
      try {
        await navigator.share({ title: `${couple} — Wedding Invitation`, text: message, url });
        return;
      } catch (_e) { /* user cancelled → fall through to WhatsApp */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  return (
    <button
      onClick={share}
      data-testid="whatsapp-share"
      aria-label="Share on WhatsApp"
      className="fixed z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full"
      style={{
        // Third slot in the bottom-left pill column. GlobalHomeButton owns the
        // base position and GlobalBackButton sits at +3.1rem; `bottom-5 left-5`
        // put this button directly underneath the Home pill, which covers it
        // (Home is z-90, this is z-40). Same rhythm keeps the column aligned.
        left: 'max(0.9rem, env(safe-area-inset-left))',
        bottom: 'calc(max(1.1rem, env(safe-area-inset-bottom)) + 6.2rem)',
        background: 'linear-gradient(135deg, #25D366, #128C7E)',
        color: '#fff', boxShadow: '0 8px 24px rgba(18,140,126,0.45)', fontWeight: 600,
      }}
    >
      <Share2 className="w-4 h-4" />
      <span className="text-sm hidden sm:inline">{label} on WhatsApp</span>
      <span className="text-sm sm:hidden">{label}</span>
    </button>
  );
};

export default WhatsAppShare;
