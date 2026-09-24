/**
 * invitations/kit.js — the ONLY surface a generated invitation should import.
 *
 * A hand-written invitation page that reimplements its own RSVP box or photo
 * grid silently loses everything the platform does around it: RSVP rows never
 * reach the database, the live gallery never fills, wishes are never moderated,
 * analytics never counts the view. Composing these pieces instead means the
 * design is bespoke per couple while the machinery stays shared and working.
 *
 * Design freely ABOVE these components — hero, story, art direction, layout.
 * Use these FOR anything that talks to the backend.
 *
 * See INVITATION_AUTHORING.md for the authoring contract.
 */

// ---- Interactive: these write to / read from the API. Always use them. -----
export {
  RSVPForm,          // <RSVPForm slug={data.slug} rsvpSettings={data.rsvp_settings} />
  WishForm,          // <WishForm slug={data.slug} />
  Countdown,         // <Countdown date={new Date(data.event_date)} />
  PhotoMarquee,      // <PhotoMarquee photos={[{url, caption}]} title="..." />
  TiltCard,          // <TiltCard><YourCard/></TiltCard>
  HeroCover,         // full-screen name hero (fluid type, landscape-safe)
  BrideGroomCoupleShowcase,
} from '@/pages/LuxuryPublicInvitation';

// ---- Platform sections (self-contained, already responsive) ----------------
export { default as GiftRegistrySection } from '@/components/luxury/GiftRegistrySection';
export { default as DigitalShagunSection } from '@/components/luxury/DigitalShagunSection';
export { default as VenuesSection } from '@/components/luxury/VenuesSection';
export { default as DressCodeSection } from '@/components/luxury/DressCodeSection';
export { default as FaqSection } from '@/components/luxury/FaqSection';
export { default as GuestUploadButton } from '@/components/luxury/GuestUploadButton';
export { default as WhatsAppShare } from '@/components/luxury/WhatsAppShare';
export { default as AmbientMusicPlayer } from '@/components/luxury/AmbientMusicPlayer';
export { default as AddToCalendarButton } from '@/components/luxury/AddToCalendarButton';
export { default as LivePhotoWallTeaser } from '@/components/luxury/LivePhotoWallTeaser';
export { default as ScrollSection } from '@/components/luxury/ScrollSection';

// ---- Motion + icons, so a generated page needs no extra dependencies -------
export { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * Design tokens. Prefer these over hardcoded hex so an invitation still looks
 * like MAJA, and so a future palette change reaches generated pages too.
 */
export const tokens = {
  gold: '#D4AF37',
  goldBright: '#E8C766',
  ivory: '#FFF8DC',
  crimson: '#8B0000',
  burgundy: '#4A0E2A',
  night: '#0E0A06',
  border: 'rgba(212,175,55,0.28)',
};

/**
 * mediaUrl — resolve a stored media path to something the browser can fetch.
 *
 * Uploads are served by the BACKEND, not the SPA, and behind the ingress only
 * /api/* reaches it — so a bare "/uploads/x.jpg" 404s against the frontend
 * origin. Every <img src> in a generated invitation must go through this.
 */
export const mediaUrl = (u) => {
  if (!u) return '';
  if (u.startsWith('data:')) return u;
  const API = process.env.REACT_APP_BACKEND_URL || '';
  if (u.startsWith('http')) {
    return u.replace(/(https?:\/\/[^/]+)\/uploads\//i, '$1/api/uploads/');
  }
  return `${API}${u.startsWith('/uploads/') ? `/api${u}` : u}`;
};

/**
 * Fluid type helper. A width-only breakpoint hands a landscape phone
 * desktop-sized text in a 390px-tall window; clamping on min(vw, vh) lets
 * whichever axis is scarce win. Use this for anything display-sized.
 */
export const fluid = (minRem, vw, vh, maxRem) =>
  `clamp(${minRem}rem, min(${vw}vw, ${vh}vh), ${maxRem}rem)`;

/** Standard page shell: applies the luxe theme + atmosphere layers. */
export { default as InvitationShell } from './InvitationShell';
