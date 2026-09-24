import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  MoreHorizontal, Edit3, Copy, Archive, Trash2, Link2, QrCode,
  MessageCircle as WhatsApp, Eye, Heart, Camera, Gift, Users,
} from 'lucide-react';

/**
 * CardMenu — 3-dot dropdown that collects secondary actions so the card chip
 * row stays clean. Closes on outside click or Esc.
 */
const CardMenu = ({
  profile,
  onQuickEdit,
  onDuplicate,
  onArchive,
  onUnarchive,
  onDelete,
  onCopyLink,
  onDownloadQR,
  onWhatsApp,
  onViewAsGuest,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const archived = !!profile.archived_at;

  const items = [
    { icon: Edit3,    label: 'Quick edit',        action: () => onQuickEdit?.(profile), testid: 'menu-quick-edit' },
    { icon: Copy,     label: 'Duplicate',         action: () => onDuplicate?.(profile), testid: 'menu-duplicate' },
    { icon: Link2,    label: 'Copy invite link',  action: () => onCopyLink?.(profile),  testid: 'menu-copy-link' },
    { icon: QrCode,   label: 'Download QR',       action: () => onDownloadQR?.(profile),testid: 'menu-download-qr' },
    { icon: WhatsApp, label: 'Share via WhatsApp',action: () => onWhatsApp?.(profile),  testid: 'menu-whatsapp' },
    { icon: Eye,      label: 'View as guest',     action: () => onViewAsGuest?.(profile),testid: 'menu-view-as-guest' },
    { divider: true },
    { icon: Heart,    label: 'Wishes',            action: () => navigate(`/studio/profile/${profile.id}/wishes`),       testid: 'menu-wishes' },
    { icon: Gift,     label: 'Shagun / Gifts',    action: () => navigate(`/studio/profile/${profile.id}/shagun`),       testid: 'menu-shagun' },
    { icon: Camera,   label: 'Photo Gallery',     action: () => navigate(`/studio/profile/${profile.id}/gallery`),      testid: 'menu-gallery' },
    { icon: Camera,   label: 'Live Wall',         action: () => navigate(`/studio/profile/${profile.id}/live-gallery`), testid: 'menu-live-wall' },
    { icon: Users,    label: 'Guest list',        action: () => navigate(`/studio/profile/${profile.id}/guests`),       testid: 'menu-guests' },
    { icon: WhatsApp, label: 'WhatsApp manager',  action: () => navigate(`/studio/profile/${profile.id}/whatsapp`),     testid: 'menu-whatsapp-mgr' },
    { divider: true },
    archived
      ? { icon: Archive, label: 'Unarchive',     action: () => onUnarchive?.(profile), testid: 'menu-unarchive' }
      : { icon: Archive, label: 'Archive',       action: () => onArchive?.(profile),   testid: 'menu-archive' },
    { icon: Trash2,   label: 'Move to Trash',     action: () => onDelete?.(profile),    testid: 'menu-delete', destructive: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-8 h-8 rounded-full inline-flex items-center justify-center"
        style={{ background: 'rgba(255,248,220,0.05)', border: '1px solid var(--lux-border)' }}
        data-testid={`card-menu-trigger-${profile.id}`}
        aria-label="More actions"
      >
        <MoreHorizontal className="w-4 h-4" style={{ color: 'rgba(255,248,220,0.8)' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-10 z-30 min-w-[240px] py-2 rounded-xl"
            style={{
              background: 'rgba(14,10,6,0.96)',
              border: '1px solid var(--lux-border-strong)',
              boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
            }}
            data-testid={`card-menu-${profile.id}`}
          >
            {items.map((it, i) =>
              it.divider ? (
                <div key={`d-${i}`} className="my-1.5 mx-3 lux-hairline" />
              ) : (
                <button
                  key={it.testid}
                  onClick={() => { setOpen(false); it.action(); }}
                  data-testid={it.testid}
                  className="w-full px-4 py-2 flex items-center gap-3 text-left text-xs transition-colors hover:bg-white/5"
                  style={{ color: it.destructive ? '#EF6E6E' : 'rgba(255,248,220,0.85)' }}
                >
                  <it.icon className="w-3.5 h-3.5" /> {it.label}
                </button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CardMenu;
