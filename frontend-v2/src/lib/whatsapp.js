// WhatsApp support line — deliberately NOT hard-coded anywhere. Set
// VITE_SUPPORT_WHATSAPP (bare digits, e.g. 91XXXXXXXXXX) at build time to a
// REAL, staffed WhatsApp Business number. Same convention as Landing.jsx:15-18.
//
// Returns null when unset so callers can hide the CTA rather than link to an
// unmonitored placeholder.
export function buildWhatsAppUrl(message) {
  const n = (import.meta.env.VITE_SUPPORT_WHATSAPP || '').trim();
  if (!n) return null;
  return `https://wa.me/${n}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
