import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import PanelTabs from '@/components/PanelTabs';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Image as ImageIcon, Video, Star, Plus, Trash2, Save, FolderPlus, Award,
  Instagram, Facebook, Youtube, Globe, MapPin, ExternalLink, Loader2,
  Upload, Check, Share2, Copy, Download, MessageCircle, Mail, Linkedin,
  X as CloseIcon, AlertTriangle, Eye, Lock,
} from 'lucide-react';
import '@/styles/luxury.css';
import { PORTFOLIO_DESIGNS, designsForTier, getDesign, FREE_PORTFOLIO_FEATURES } from '@/data/portfolioDesigns';
// Canonical taxonomy — same lists the public directory filters by, so a studio's
// selections here are exactly what couples can filter on.
import {
  PHOTOGRAPHY_TYPES, SERVICE_OPTIONS, AVAILABILITY_OPTIONS,
  TRAVEL_POLICY_OPTIONS, PAYMENT_MODE_OPTIONS, SHOOT_TYPE_OPTIONS,
  RELIGION_OPTIONS, ADD_ON_OPTIONS,
} from '@/data/photographyOptions';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.5 } }),
};

const SECTIONS = ['Profile', 'Past Works', 'Testimonials'];
const MAX_PAST_WORKS = 5;

/**
 * DiscoveryChecklist — "which couple-facing filters will actually find you?"
 *
 * Every field below is a filter on the public Find-Photographers page. They have
 * always been editable here, but nothing told a studio that leaving one blank means
 * dropping out of that filter entirely — so profiles sat half-empty and couples
 * filtered them away. This makes the consequence visible while they fill the form.
 */
function DiscoveryChecklist({ profile }) {
  const p = profile || {};
  const loc = p.location || {};
  const items = [
    { label: 'Profile photo / logo', ok: !!p.avatar, why: 'shown next to your name on posts and search results' },
    { label: 'City', ok: !!loc.city, why: 'the “All Cities” filter' },
    { label: 'State', ok: !!loc.state, why: 'the “All States” filter' },
    { label: 'Services offered', ok: (p.services || []).length > 0, why: 'the “All services” filter' },
    { label: 'Photography types', ok: (p.styles || []).length > 0, why: 'the “All skills” filter' },
    { label: 'Years of experience', ok: Number(p.experience_years) > 0, why: 'the “Any experience” filter' },
    { label: 'Starting price', ok: Number(p.starting_price) > 0, why: 'the “Any budget” filter' },
    { label: 'Studio or individual', ok: !!p.portfolio_type, why: 'the “Studio & Freelance” filter' },
    { label: 'Availability status', ok: !!p.availability_status, why: 'the “Any availability” filter' },
    { label: 'Cities you cover', ok: (p.coverage_areas || []).length > 0, why: 'city searches beyond your home city' },
    // Not filters — these are the questions couples phone to ask. Blank ones cost
    // enquiries rather than search visibility, so they are listed separately below.
    { label: 'Delivery time', ok: Number(p.delivery_days) > 0, why: '“how long until we get our photos?”', soft: true },
    { label: 'Booking advance', ok: Number(p.advance_percent) > 0, why: '“how much do we pay to hold the date?”', soft: true },
    { label: 'Travel policy', ok: !!p.travel_policy, why: '“will you travel to our venue?”', soft: true },
    { label: 'Cancellation policy', ok: !!p.cancellation_policy, why: '“what if the date changes?”', soft: true },
  ];
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  const missing = items.filter((i) => !i.ok);

  return (
    <div className="lux-glass p-5" data-testid="discovery-checklist">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="lux-eyebrow block">◆ How couples find you</span>
        <span className="text-sm" style={{ color: pct === 100 ? '#7BD88F' : '#E8C97A' }}>
          {done}/{items.length} complete
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
      </div>
      {missing.length === 0 ? (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>
          Every search filter on the public directory can find you. Keep your availability current.
        </p>
      ) : (
        <>
          {missing.some((i) => !i.soft) && (
            <>
              <p className="mt-3 text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>
                Each blank field below removes you from that filter on the public
                “Find Photographers” page — couples using it will never see you.
              </p>
              <ul className="mt-2 space-y-1">
                {missing.filter((i) => !i.soft).map((i) => (
                  <li key={i.label} className="text-[12px]" style={{ color: 'var(--lux-text-faint)' }}>
                    <span style={{ color: '#E8A87A' }}>○</span> <span style={{ color: 'var(--lux-text)' }}>{i.label}</span> — {i.why}
                  </li>
                ))}
              </ul>
            </>
          )}
          {missing.some((i) => i.soft) && (
            <>
              <p className="mt-3 text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>
                These don’t affect search, but couples ask them before enquiring:
              </p>
              <ul className="mt-2 space-y-1">
                {missing.filter((i) => i.soft).map((i) => (
                  <li key={i.label} className="text-[12px]" style={{ color: 'var(--lux-text-faint)' }}>
                    <span style={{ color: '#8AA9C8' }}>○</span> <span style={{ color: 'var(--lux-text)' }}>{i.label}</span> — {i.why}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Gold pill toggle — the pattern already used for services/styles. */
function Chip({ on, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full px-3 py-1.5 text-xs"
      style={{
        background: on ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'var(--lux-panel)',
        color: on ? '#0E0A06' : 'var(--lux-text-muted)',
      }}>
      {label}
    </button>
  );
}

/** A labelled multi-select row of chips backed by a string[] field. */
function ChipList({ label, options, value, onChange }) {
  const cur = value || [];
  const toggle = (o) => onChange(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
  return (
    <div>
      <span className="lux-eyebrow mb-2 block">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => <Chip key={o} on={cur.includes(o)} label={o} onClick={() => toggle(o)} />)}
      </div>
    </div>
  );
}

/** Integer field that stores null (not 0) when cleared, so "unset" stays unset. */
function NumField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="lux-eyebrow mb-1.5 block">{label}</span>
      <input type="number" min="0" value={value ?? ''} placeholder={placeholder}
        onChange={(e) => { const t = e.target.value; onChange(t === '' ? null : Math.max(0, parseInt(t, 10) || 0)); }}
        className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
        style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
    </label>
  );
}

function Field({ label, value, onChange, textarea, placeholder, type = 'text', hint }) {
  return (
    <label className="block">
      <span className="lux-eyebrow block mb-2">{label}</span>
      {textarea ? (
        <textarea rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className="lux-input w-full" />
      ) : (
        <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className="lux-input w-full" />
      )}
      {hint && <span className="block mt-1 text-[11px]" style={{ color: 'var(--lux-text-faint, rgba(255,248,220,0.45))' }}>{hint}</span>}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="lux-eyebrow block mb-2">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="lux-input w-full">
        {options.map((o) => (
          <option key={o} value={o}>{o ? o.charAt(0).toUpperCase() + o.slice(1) : 'Select…'}</option>
        ))}
      </select>
    </label>
  );
}

// FAQ editor — add/remove question+answer rows, capped by the backend at 15.
function FaqEditor({ value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const set = (i, k, v) => onChange(items.map((f, idx) => idx === i ? { ...f, [k]: v } : f));
  const add = () => onChange([...items, { q: '', a: '' }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3" data-testid="faq-editor">
      {items.map((f, i) => (
        <div key={i} className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--lux-border)' }} data-testid={`faq-row-${i}`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>Question {i + 1}</span>
            <button type="button" onClick={() => remove(i)} data-testid={`faq-remove-${i}`}>
              <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--lux-text-faint)' }} />
            </button>
          </div>
          {/* Full-width row: question and answer sit side by side on wide screens
              so a long FAQ list stays scannable instead of a tall stack. */}
          <div className="grid md:grid-cols-2 gap-2">
            <input value={f.q ?? ''} onChange={(e) => set(i, 'q', e.target.value)}
              placeholder="Question — e.g. Do you travel outside the city?" className="lux-input w-full" />
            <textarea rows={2} value={f.a ?? ''} onChange={(e) => set(i, 'a', e.target.value)}
              placeholder="Answer" className="lux-input w-full" />
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="lux-btn lux-btn-ghost text-xs" data-testid="faq-add">
        <Plus className="w-4 h-4" /> Add question
      </button>
    </div>
  );
}

// Studio photos — up to 12 images with an optional caption each.
function StudioPhotosEditor({ value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const MAX = 12;
  const setItem = (i, patch) => onChange(items.map((w, idx) => idx === i ? { ...w, ...patch } : w));
  const add = () => { if (items.length < MAX) onChange([...items, { image: '', caption: '' }]); };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3" data-testid="studio-photos-editor">
      {/* Full-width row, so more columns on wide screens. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((w, i) => (
          <div key={i} className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--lux-border)' }} data-testid={`studio-photo-${i}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>Photo {i + 1}</span>
              <button type="button" onClick={() => remove(i)} data-testid={`studio-photo-remove-${i}`}>
                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--lux-text-faint)' }} />
              </button>
            </div>
            <MediaDrop label="Image" value={w.image} accept="image/*"
              onUploaded={(d) => setItem(i, { image: d.url })} onClear={() => setItem(i, { image: '' })} />
            <input value={w.caption ?? ''} onChange={(e) => setItem(i, { caption: e.target.value })}
              placeholder="Caption (optional)" className="lux-input w-full" />
          </div>
        ))}
      </div>
      {items.length < MAX && (
        <button type="button" onClick={add} className="lux-btn lux-btn-ghost text-xs" data-testid="studio-photo-add">
          <Plus className="w-4 h-4" /> Add studio photo ({items.length}/{MAX})
        </button>
      )}
    </div>
  );
}

// Extract a YouTube video id from any common link shape.
const ytId = (u) => {
  const m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};

// Drag-and-drop (or click) uploader for a single image — used for logo & cover.
function MediaDrop({ label, value, accept = 'image/*', onUploaded, onClear, hint }) {
  const inputRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const [err, setErr] = React.useState('');

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await axios.post(`${API_URL}/api/portfolio/upload`, fd);
      onUploaded(data);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Upload failed');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <span className="lux-eyebrow block mb-2">{label}</span>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl p-4 text-center cursor-pointer transition-colors"
        style={{ border: `1px dashed ${drag ? 'var(--lux-gold)' : 'var(--lux-border)'}`,
                 background: drag ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)' }}
        data-testid={`drop-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {busy ? (
          <span className="text-xs flex items-center justify-center gap-2" style={{ color: '#E8C97A' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
          </span>
        ) : value ? (
          <img src={value} alt={label} className="mx-auto max-h-28 rounded-lg object-cover" />
        ) : (
          <span className="text-xs flex items-center justify-center gap-2" style={{ color: 'var(--lux-text-muted)' }}>
            <Upload className="w-4 h-4" /> Drag &amp; drop or click
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {value && <button type="button" onClick={onClear} className="text-[11px] text-gold underline">Remove</button>}
        {hint && <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{hint}</span>}
      </div>
      {err && <div className="text-[11px] mt-1" style={{ color: '#FFB4A2' }}>{err}</div>}
      <input ref={inputRef} type="file" accept={accept} hidden
        onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

// Past Works — the studio's best up-to-5 finished works, each a photo with an
// optional title + caption. A curated highlight reel, separate from the full
// album gallery, shown near the top of the public portfolio.
function PastWorksPanel({ works, onChange, onSave, saving }) {
  const items = Array.isArray(works) ? works : [];
  const setItem = (i, patch) => onChange(items.map((w, idx) => idx === i ? { ...w, ...patch } : w));
  const addSlot = () => { if (items.length < MAX_PAST_WORKS) onChange([...items, { image: '', title: '', caption: '' }]); };
  const removeSlot = (i) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5" data-testid="past-works-panel">
      <div className="lux-glass p-5">
        <span className="lux-eyebrow block mb-1">◆ Past Works · your best {MAX_PAST_WORKS}</span>
        <p className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
          Pick your {MAX_PAST_WORKS} finest finished works. These sit near the top of your public
          portfolio as a highlight reel — the first thing a couple sees. Add a photo, and optionally
          a title and a line about it.
        </p>
      </div>

      {items.length === 0 && (
        <div className="lux-glass p-10 text-center" style={{ color: 'var(--lux-text-muted)' }} data-testid="past-works-empty">
          No past works yet. Add up to {MAX_PAST_WORKS}.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {items.map((w, i) => (
          <div key={i} className="lux-glass p-5 space-y-3" data-testid={`past-work-${i}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Work {i + 1}</span>
              <button type="button" onClick={() => removeSlot(i)} data-testid={`past-work-remove-${i}`}>
                <Trash2 className="w-4 h-4" style={{ color: 'var(--lux-text-faint)' }} />
              </button>
            </div>
            <MediaDrop label="Photo" value={w.image} accept="image/*"
              onUploaded={(d) => setItem(i, { image: d.url })}
              onClear={() => setItem(i, { image: '' })} />
            <Field label="Title" value={w.title} onChange={(v) => setItem(i, { title: v })}
              placeholder="e.g. Anita & Rahul — Beach Wedding" />
            <Field label="Caption" value={w.caption} onChange={(v) => setItem(i, { caption: v })}
              placeholder="One line about this work (optional)" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {items.length < MAX_PAST_WORKS && (
          <button type="button" onClick={addSlot} className="lux-btn lux-btn-ghost" data-testid="past-work-add">
            <Plus className="w-4 h-4" /> Add work ({items.length}/{MAX_PAST_WORKS})
          </button>
        )}
        <button type="button" onClick={onSave} disabled={saving} className="lux-btn" data-testid="past-works-save">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save past works
        </button>
      </div>
    </div>
  );
}

// Comma-separated list → string[]. Keeps its own raw text so the cursor never
// jumps while typing (we only split into an array as the value changes).
function CsvField({ label, value, onChange, placeholder, hint }) {
  const [raw, setRaw] = React.useState(() => (Array.isArray(value) ? value.join(', ') : ''));
  const lastArr = React.useRef(Array.isArray(value) ? value.join(', ') : '');
  // keep in sync when the profile loads/changes from outside (not on our own edits)
  React.useEffect(() => {
    const joined = Array.isArray(value) ? value.join(', ') : '';
    if (joined !== lastArr.current) { setRaw(joined); lastArr.current = joined; }
  }, [value]);
  const handle = (t) => {
    setRaw(t);
    const arr = t.split(',').map((s) => s.trim()).filter(Boolean);
    lastArr.current = arr.join(', ');
    onChange(arr);
  };
  return (
    <label className="block">
      <span className="lux-eyebrow block mb-2">{label}</span>
      <input value={raw} onChange={(e) => handle(e.target.value)} placeholder={placeholder} className="lux-input w-full" />
      {hint && <span className="block mt-1 text-[11px]" style={{ color: 'var(--lux-text-faint, rgba(255,248,220,0.45))' }}>{hint}</span>}
    </label>
  );
}

function Chips({ items, onRemove }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {(items || []).map((it, i) => (
        <span key={i} className="px-3 py-1 rounded-full text-xs flex items-center gap-2"
          style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>
          {it}
          <button onClick={() => onRemove(i)} className="opacity-70 hover:opacity-100">×</button>
        </span>
      ))}
    </div>
  );
}

// Is a #rrggbb colour dark? (used to pick readable ink on a design's real bg)
function isDarkHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5;
}

/**
 * DesignPreview — a true miniature of the design (its real background colour,
 * accent, heading font and a mock hero + gallery) so the studio sees what the
 * template actually looks like before selecting. `size="lg"` renders the big
 * live preview of the currently-chosen design.
 */
function DesignPreview({ design, size = 'sm' }) {
  if (!design) return null;
  const ink = isDarkHex(design.bg) ? '#FFF8DC' : '#1a140c';
  const inkSoft = isDarkHex(design.bg) ? 'rgba(255,248,220,0.6)' : 'rgba(26,20,12,0.55)';
  const lg = size === 'lg';
  return (
    <div className="w-full overflow-hidden" style={{ background: design.bg, height: lg ? 220 : 96 }}>
      {/* hero band */}
      <div style={{ height: lg ? 96 : 44, background: `radial-gradient(120% 140% at 50% -30%, ${design.accent}44, transparent), ${design.bg}` }}
        className="flex flex-col items-center justify-center gap-1 px-2">
        <div style={{ fontFamily: design.heading, color: ink, fontSize: lg ? 20 : 11, fontWeight: 600, lineHeight: 1 }}>
          {design.name}
        </div>
        <div style={{ width: lg ? 48 : 24, height: 2, background: design.accent, borderRadius: 2 }} />
        {lg && <div style={{ color: inkSoft, fontSize: 10, marginTop: 2, textAlign: 'center', maxWidth: 260 }}>{design.vibe}</div>}
      </div>
      {/* mock gallery */}
      <div className="grid grid-cols-4 gap-1 px-2 pt-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: '1', borderRadius: 3,
            background: i % 2 ? `${design.accent}30` : (isDarkHex(design.bg) ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') }} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Share your portfolio ───────────────────────────
 * One sheet the studio can act from: copy the link, post it to WhatsApp /
 * Instagram / Facebook, mail it to a client, or print the QR for a stall.
 * If the portfolio isn't published yet the link is dead to the public, so we
 * say so up front and let them publish right here instead of sending a 404.
 * ------------------------------------------------------------------------- */
function SharePortfolio({ open, onClose, url, studioName, tagline, city, published, onPublish, publishing }) {
  const [copied, setCopied] = useState('');       // which chip was copied
  const qrRef = useRef(null);

  const caption = [
    `${studioName || 'Our studio'} — ${tagline || 'wedding photography that stays with you'}.`,
    city ? `Based in ${city}.` : '',
    'See the full portfolio:',
    url,
  ].filter(Boolean).join('\n');

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API needs https/permission — fall back to a temp textarea
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1800);
  };

  const downloadQR = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${(studioName || 'portfolio').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const nativeShare = async () => {
    if (!navigator.share) return;
    try { await navigator.share({ title: studioName || 'My portfolio', text: caption, url }); }
    catch { /* user dismissed the sheet — not an error */ }
  };

  const enc = encodeURIComponent;
  const targets = [
    { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, tint: '#25D366',
      href: `https://wa.me/?text=${enc(caption)}` },
    { key: 'facebook', label: 'Facebook', Icon: Facebook, tint: '#1877F2',
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin, tint: '#0A66C2',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { key: 'email', label: 'Email', Icon: Mail, tint: '#E8C97A',
      href: `mailto:?subject=${enc(`${studioName || 'Portfolio'} — portfolio`)}&body=${enc(caption)}` },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: 'rgba(6,4,2,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={onClose} data-testid="share-portfolio-modal">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="lux-glass w-full max-w-[640px] max-h-[90vh] overflow-y-auto p-6 md:p-8 relative"
        style={{ border: '1px solid rgba(212,175,55,0.35)' }}>

        <button onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 p-2 rounded-full"
          style={{ background: 'var(--lux-panel)', color: 'var(--lux-text-muted)' }}>
          <CloseIcon className="w-4 h-4" />
        </button>

        <span className="lux-eyebrow block mb-2">◆ Share</span>
        <h2 className="font-display text-[1.6rem] md:text-[2rem] leading-tight mb-1" style={{ color: 'var(--lux-text)' }}>
          Send clients to your <span className="text-gold italic font-script">portfolio.</span>
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>
          One link, everywhere you talk to clients.
        </p>

        {!published && (
          <div className="flex flex-wrap items-center gap-3 p-4 mb-6 rounded-lg"
            style={{ background: 'rgba(212,120,55,0.10)', border: '1px solid rgba(212,120,55,0.35)' }}
            data-testid="share-unpublished-warning">
            <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: '#E8A34A' }} />
            <span className="text-sm flex-1 min-w-[220px]" style={{ color: 'var(--lux-text)' }}>
              Your portfolio isn’t published yet — anyone opening this link will see nothing.
            </span>
            <button onClick={onPublish} disabled={publishing} className="lux-btn" data-testid="share-publish-now">
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Publish now
            </button>
          </div>
        )}

        {/* The link itself */}
        <div className="flex items-stretch gap-2 mb-3">
          <input readOnly value={url} onFocus={(e) => e.target.select()}
            className="lux-input flex-1 text-sm" data-testid="share-url" />
          <button onClick={() => copy(url, 'url')} className="lux-btn shrink-0" data-testid="share-copy-link">
            {copied === 'url' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-8">
          <a href={url} target="_blank" rel="noreferrer" className="lux-btn lux-btn-ghost text-xs">
            <ExternalLink className="w-3.5 h-3.5" /> Open
          </a>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button onClick={nativeShare} className="lux-btn lux-btn-ghost text-xs" data-testid="share-native">
              <Share2 className="w-3.5 h-3.5" /> Share…
            </button>
          )}
        </div>

        {/* Channels */}
        <span className="lux-eyebrow block mb-3">Share to</span>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          {targets.map(({ key, label, Icon, tint, href }) => (
            <a key={key} href={href} target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-2 p-3 rounded-lg transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}
              data-testid={`share-${key}`}>
              <Icon className="w-5 h-5" style={{ color: tint }} />
              <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
            </a>
          ))}
          {/* Instagram has no web share endpoint — the only real path is copy-then-paste. */}
          <button onClick={() => copy(caption, 'instagram')}
            className="flex flex-col items-center gap-2 p-3 rounded-lg transition-transform hover:-translate-y-0.5"
            style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}
            data-testid="share-instagram">
            <Instagram className="w-5 h-5" style={{ color: '#E1306C' }} />
            <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
              {copied === 'instagram' ? 'Copied!' : 'Instagram'}
            </span>
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* QR — for stalls, albums, visiting cards */}
          <div>
            <span className="lux-eyebrow block mb-3">QR code</span>
            <div className="flex items-center gap-4">
              <div ref={qrRef} className="p-3 rounded-lg shrink-0" style={{ background: '#FFFFFF' }}>
                <QRCodeCanvas value={url} size={132} level="M" includeMargin={false} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] mb-3" style={{ color: 'var(--lux-text-muted)' }}>
                  Print it on visiting cards, albums or your expo stall — it opens your portfolio.
                </p>
                <button onClick={downloadQR} className="lux-btn lux-btn-ghost text-xs" data-testid="share-download-qr">
                  <Download className="w-3.5 h-3.5" /> Download PNG
                </button>
              </div>
            </div>
          </div>

          {/* A caption they can paste straight into a post */}
          <div>
            <span className="lux-eyebrow block mb-3">Ready-to-post caption</span>
            <textarea readOnly rows={5} value={caption} onFocus={(e) => e.target.select()}
              className="lux-input w-full text-xs leading-relaxed" data-testid="share-caption" />
            <button onClick={() => copy(caption, 'caption')} className="lux-btn lux-btn-ghost text-xs mt-2"
              data-testid="share-copy-caption">
              {copied === 'caption' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === 'caption' ? 'Copied' : 'Copy caption'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Centered, on-brand modal for short forms (new album, YouTube link). Replaces
// window.prompt, which the browser pins to the top of the screen with no styling.
// Driven by a `modal` object: { title, fields:[{key,label,placeholder,type?,options?,required?,default?}],
// submitLabel, validate?(vals)->errorString|null, onSubmit(vals)->Promise }.
function CenterModal({ modal, onClose }) {
  const [vals, setVals] = useState(() => {
    const init = {};
    (modal.fields || []).forEach((f) => { init[f.key] = f.default || ''; });
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    for (const f of modal.fields || []) {
      if (f.required && !String(vals[f.key] || '').trim()) { setErr(`${f.label} is required.`); return; }
    }
    if (modal.validate) { const v = modal.validate(vals); if (v) { setErr(v); return; } }
    setBusy(true); setErr('');
    try { await modal.onSubmit(vals); onClose(); }
    catch (e) { setErr(e?.response?.data?.detail || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(6,4,2,0.78)', backdropFilter: 'blur(4px)' }}
      onClick={onClose} data-testid="portfolio-modal">
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="lux-glass w-full max-w-md p-6 rounded-2xl" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') submit(); if (e.key === 'Escape') onClose(); }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{modal.title}</h3>
          <button onClick={onClose} data-testid="modal-close"><CloseIcon className="w-5 h-5" style={{ color: 'var(--lux-text-muted)' }} /></button>
        </div>
        <div className="space-y-3">
          {(modal.fields || []).map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--lux-text-muted)' }}>{f.label}</span>
              {f.type === 'select' ? (
                <select value={vals[f.key]} onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full mt-1 px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
                  style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                  data-testid={`modal-field-${f.key}`}>
                  {(f.options || []).map((o) => <option key={o} value={o} style={{ background: '#16110C' }}>{o || (f.placeholder || 'Choose…')}</option>)}
                </select>
              ) : (
                <input autoFocus={f.required} type="text" value={vals[f.key]} placeholder={f.placeholder}
                  onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full mt-1 px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
                  style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                  data-testid={`modal-field-${f.key}`} />
              )}
            </label>
          ))}
          {err && <div className="text-[12px]" style={{ color: '#ff9a9a' }} data-testid="modal-error">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="lux-btn lux-btn-ghost text-sm" disabled={busy}>Cancel</button>
          <button onClick={submit} className="lux-btn text-sm" disabled={busy} data-testid="modal-submit">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {modal.submitLabel || 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function PhotographerPortfolio() {
  const { admin } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState('Profile');
  const [meta, setMeta] = useState({ event_categories: [], styles: [] });
  const [profile, setProfile] = useState({});
  const [albums, setAlbums] = useState([]);
  const [works, setWorks] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [tier, setTier] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingDesign, setPendingDesign] = useState(null); // selected, not yet saved
  const [designSaving, setDesignSaving] = useState(false);
  const [designSaved, setDesignSaved] = useState(false);
  const [uploadAlbum, setUploadAlbum] = useState(null);     // album id being uploaded into
  const [uploading, setUploading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const workFileInput = useRef(null);
  // Centered modal (replaces window.prompt, which the browser renders at the
  // very top of the screen). Holds { title, fields, submitLabel, onSubmit }.
  const [modal, setModal] = useState(null);

  // Studio vs individual freelancer layout — same plan, different sections.
  const isIndividual = (profile.portfolio_type || 'studio') === 'individual';

  // The one public address for this studio. The slug is issued (and kept stable)
  // by the backend; id is the fallback for a profile that has never been saved.
  const publicKey = profile?.slug || profile?.id || admin?.id;
  const publicPath = publicKey ? `/photographer/${publicKey}/portfolio` : '';
  const publicUrl = publicPath
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${publicPath}`
    : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p, a, w, t, tr] = await Promise.all([
        axios.get(`${API_URL}/api/portfolio/meta`),
        axios.get(`${API_URL}/api/portfolio/profile`),
        axios.get(`${API_URL}/api/portfolio/albums`),
        axios.get(`${API_URL}/api/portfolio/works`),
        axios.get(`${API_URL}/api/portfolio/testimonials`),
        axios.get(`${API_URL}/api/portfolio/tier`),
      ]);
      setMeta(m.data);
      setProfile(p.data.profile || {});
      setAlbums(a.data.albums || []);
      setWorks(w.data.works || []);
      setTestimonials(t.data.testimonials || []);
      setTier(tr.data);
    } catch (e) { /* handled by empty states */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setP = (k, v) => setProfile((s) => ({ ...s, [k]: v }));
  const setSocial = (k, v) => setProfile((s) => ({ ...s, social: { ...(s.social || {}), [k]: v } }));
  const setContact = (k, v) => setProfile((s) => ({ ...s, contact: { ...(s.contact || {}), [k]: v } }));
  const setLoc = (k, v) => setProfile((s) => ({ ...s, location: { ...(s.location || {}), [k]: v } }));
  const setAddr = (k, v) => setProfile((s) => ({ ...s, address: { ...(s.address || {}), [k]: v } }));
  const toggleService = (svc) => setProfile((s) => {
    const cur = new Set(s.services || []);
    cur.has(svc) ? cur.delete(svc) : cur.add(svc);
    return { ...s, services: [...cur] };
  });

  // One-tap design flow: clicking a design applies AND saves it immediately, so
  // the public portfolio actually adopts it. (The old two-step "pick then Save"
  // meant a missed Save left design_id null → every design showed the default.)
  // Switch bug fix: clicking design A then B fired two saves; whichever POST
  // resolved LAST won, so a slow first response could snap the selection back
  // to A. A monotonic request token makes only the MOST RECENT pick apply — the
  // design always changes to whatever you clicked last.
  const designReqRef = useRef(0);
  const persistDesign = async (id) => {
    if (!id) return;
    const token = ++designReqRef.current;
    setDesignSaving(true); setDesignSaved(false);
    try {
      await axios.post(`${API_URL}/api/portfolio/design`, { design_id: id });
      if (token !== designReqRef.current) return;   // superseded by a newer pick
      setTier((t) => ({ ...t, design_id: id }));
      setPendingDesign(null);
      setDesignSaved(true);
      setTimeout(() => { if (token === designReqRef.current) setDesignSaved(false); }, 2500);
    } catch (e) {
      if (token === designReqRef.current) {
        window.alert(e?.response?.data?.detail || 'Could not save the design. Please re-login and try again.');
        setPendingDesign(null);   // don't leave a stuck "unsaved" preview
      }
    } finally { if (token === designReqRef.current) setDesignSaving(false); }
  };
  const chooseDesign = (designId) => { setPendingDesign(designId); persistDesign(designId); };
  const activeDesignId = pendingDesign || tier?.design_id;

  const saveProfile = async () => {
    setSaving(true);
    try { await axios.put(`${API_URL}/api/portfolio/profile`, profile); } finally { setSaving(false); }
  };

  // Publish straight from the share sheet — sharing a dead link is the one
  // mistake this screen should make impossible.
  const publishNow = async () => {
    setPublishing(true);
    try {
      const next = { ...profile, is_published: true };
      const { data } = await axios.put(`${API_URL}/api/portfolio/profile`, next);
      setProfile(data.profile || next);
    } catch (e) {
      window.alert(e?.response?.data?.detail || 'Could not publish. Save your profile first, then try again.');
    } finally { setPublishing(false); }
  };

  const toggleStyle = (style) => setProfile((s) => {
    const cur = new Set(s.styles || []);
    cur.has(style) ? cur.delete(style) : cur.add(style);
    return { ...s, styles: [...cur] };
  });

  const addAlbum = () => {
    setModal({
      title: 'New album',
      fields: [
        { key: 'title', label: 'Album title', placeholder: 'e.g. Anita & Rahul — Wedding', required: true },
        { key: 'event_category', label: 'Event category', type: 'select',
          options: ['', ...(meta.event_categories || [])], placeholder: 'Choose a category' },
      ],
      submitLabel: 'Create album',
      onSubmit: async (vals) => {
        const { data } = await axios.post(`${API_URL}/api/portfolio/albums`,
          { title: vals.title, event_category: vals.event_category || '' });
        setAlbums((s) => [data.album, ...s]);
      },
    });
  };
  const delAlbum = async (id) => {
    if (!window.confirm('Delete album and its works?')) return;
    await axios.delete(`${API_URL}/api/portfolio/albums/${id}`);
    setAlbums((s) => s.filter((a) => a.id !== id));
    setWorks((s) => s.filter((w) => w.album_id !== id));
  };
  // Real photo upload (replaces the old "paste a URL" prompt). Opens the OS
  // file picker; every picked image is uploaded to the object store and saved
  // as a work in the chosen album.
  const pickWorkPhotos = (albumId, eventCategory) => {
    setUploadAlbum({ id: albumId, category: eventCategory, accept: 'image/*' });
    setTimeout(() => workFileInput.current?.click(), 0);
  };
  // Videos get their own picker so photographers can post films, not just stills.
  const pickWorkVideos = (albumId, eventCategory) => {
    setUploadAlbum({ id: albumId, category: eventCategory, accept: 'video/*' });
    setTimeout(() => workFileInput.current?.click(), 0);
  };
  // Pre-wedding films usually live on YouTube — link them instead of re-uploading.
  const addYoutube = (albumId, eventCategory) => {
    setModal({
      title: 'Add a YouTube film',
      fields: [
        { key: 'url', label: 'YouTube link', placeholder: 'https://youtu.be/… or youtube.com/watch?v=…', required: true },
        { key: 'title', label: 'Title', placeholder: 'Pre-wedding film', default: 'Pre-wedding film' },
      ],
      submitLabel: 'Add film',
      // Field-level validation surfaced inside the modal (no top-of-screen alert).
      validate: (vals) => (ytId(vals.url) ? null : "That doesn't look like a YouTube link."),
      onSubmit: async (vals) => {
        const vid = ytId(vals.url);
        const { data } = await axios.post(`${API_URL}/api/portfolio/works`, {
          title: vals.title || 'Film', album_id: albumId, event_category: eventCategory,
          video_url: vals.url, thumbnail_url: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
          size_bytes: 0,   // linked, not stored — costs no quota
        });
        setWorks((s) => [data.work, ...s]);
      },
    });
  };
  const onWorkFilesPicked = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !uploadAlbum) { setUploadAlbum(null); return; }
    setUploading(true);
    for (const f of files) {
      try {
        const fd = new FormData();
        fd.append('file', f);
        const up = await axios.post(`${API_URL}/api/portfolio/upload`, fd);
        const { url, kind, size_bytes } = up.data || {};
        const title = f.name.replace(/\.[^.]+$/, '');
        const body = {
          title, album_id: uploadAlbum.id, event_category: uploadAlbum.category,
          size_bytes: size_bytes || f.size || 0,
        };
        if (kind === 'video') body.video_url = url; else body.image_url = url;
        const { data } = await axios.post(`${API_URL}/api/portfolio/works`, body);
        setWorks((s) => [data.work, ...s]);
      } catch (err) {
        window.alert(err?.response?.data?.detail || `Could not upload ${f.name}`);
      }
    }
    setUploading(false);
    setUploadAlbum(null);
  };
  const delWork = async (id) => {
    await axios.delete(`${API_URL}/api/portfolio/works/${id}`);
    setWorks((s) => s.filter((w) => w.id !== id));
  };
  const toggleFeatured = async (w) => {
    await axios.put(`${API_URL}/api/portfolio/works/${w.id}`, { ...w, featured: !w.featured });
    setWorks((s) => s.map((x) => (x.id === w.id ? { ...x, featured: !x.featured } : x)));
  };
  const addTestimonial = async () => {
    const author = window.prompt('Client name'); if (!author) return;
    const text = window.prompt('Review text') || '';
    const rating = parseInt(window.prompt('Rating 1-5', '5') || '5', 10);
    const { data } = await axios.post(`${API_URL}/api/portfolio/testimonials`, { author, text, rating });
    setTestimonials((s) => [data.testimonial, ...s]);
  };
  const delTestimonial = async (id) => {
    await axios.delete(`${API_URL}/api/portfolio/testimonials/${id}`);
    setTestimonials((s) => s.filter((t) => t.id !== id));
  };

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8 md:py-12 max-w-[1400px] mx-auto relative z-10">
        <PanelTabs active="/studio/portfolio" />

        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="lux-eyebrow block mb-3">◆ Portfolio</span>
            <h1 className="font-display text-[2rem] md:text-[3rem] leading-tight" style={{ color: 'var(--lux-text)' }}>
              Showcase your <span className="text-gold italic font-script">craft.</span>
            </h1>
          </div>
          {publicUrl && (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setShareOpen(true)} className="lux-btn" data-testid="share-portfolio">
                <Share2 className="w-4 h-4" /> Share portfolio
              </button>
              <a href={publicPath} target="_blank" rel="noreferrer"
                className="lux-btn lux-btn-ghost" data-testid="view-public-portfolio">
                View public page <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </motion.div>

        {modal && <CenterModal modal={modal} onClose={() => setModal(null)} />}

        <SharePortfolio
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          url={publicUrl}
          studioName={profile?.studio_name || admin?.studio_name || admin?.name}
          tagline={profile?.tagline}
          city={profile?.location?.city}
          published={!!profile?.is_published}
          onPublish={publishNow}
          publishing={publishing}
        />

        {/* Tier banner — three tiers: Normal (500 MB) / Basic (5 GB) / Premium (20 GB) */}
        {tier && (() => {
          const t = (tier.tier || 'normal').toLowerCase();
          const isTop = t === 'premium';
          const label = t.toUpperCase();
          const blurb = t === 'premium'
            ? 'Premium portfolio — all 15 sections live, studio-built details, 20 GB storage.'
            : t === 'basic'
              ? 'Basic portfolio — premium sections unlocked, 5 GB storage. Upgrade to Premium for studio-built details & 20 GB.'
              : 'Normal portfolio is live (basic sections, 500 MB storage). Upgrade to Basic to unlock Journey, Stats, Testimonials, Equipment, Awards & more.';
          return (
          <div className="lux-glass p-4 mb-6 flex flex-wrap items-center justify-between gap-3"
            style={{ border: isTop ? '1px solid rgba(212,175,55,0.4)' : '1px solid var(--lux-border)' }}
            data-testid="portfolio-tier-banner">
            <div className="flex items-center gap-3">
              <span className="text-[10px] px-2 py-1 rounded-full font-bold tracking-wide"
                style={{ background: isTop ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'var(--lux-panel)',
                         color: isTop ? '#0E0A06' : 'var(--lux-text-muted)' }}>
                {label}
              </span>
              <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{blurb}</span>
            </div>
            {isTop ? (
              <button onClick={() => navigate('/studio/portfolio/premium')} className="lux-btn" data-testid="portfolio-build-request">
                Have us build it for you
              </button>
            ) : (
              // Non-premium studios get BOTH doors. "Have us build it" used to be
              // premium-only, so the studios most likely to need help filling the
              // portfolio in were the ones who couldn't ask for it.
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => navigate('/studio/portfolio/premium')} className="lux-btn lux-btn-ghost"
                  data-testid="portfolio-build-request">
                  Can’t fill it in? We’ll build it — ₹100
                </button>
                <button onClick={() => navigate('/studio/plans')} className="lux-btn" data-testid="portfolio-upgrade">
                  {t === 'normal' ? 'Upgrade to Basic' : 'Upgrade to Premium'}
                </button>
              </div>
            )}
          </div>
          );
        })()}

        {/* Portfolio storage meter — Normal 500 MB / Basic 5 GB / Premium 20 GB */}
        {tier?.storage && (() => {
          const capBytes = tier.storage.cap_bytes || 0;
          const usedBytes = tier.storage.used_bytes || 0;
          // Show MB when the allowance is under 1 GB (e.g. the free 500 MB tier).
          const small = capBytes < (1024 ** 3);
          const fmt = (b) => small ? `${(b / (1024 ** 2)).toFixed(1)} MB` : `${(b / (1024 ** 3)).toFixed(2)} GB`;
          const freeBytes = Math.max(0, capBytes - usedBytes);
          const pct = capBytes ? Math.min(100, (usedBytes / capBytes) * 100) : 0;
          return (
          <div className="lux-glass p-4 mb-6" data-testid="portfolio-storage-meter">
            <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--lux-text)' }}>
              <span>Photo storage · {fmt(usedBytes)} of {fmt(capBytes)}</span>
              <span style={{ color: tier.storage.full ? '#ff8a8a' : 'var(--lux-text-muted)' }}>{tier.storage.full ? 'Full' : `${fmt(freeBytes)} free`}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--lux-panel)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: tier.storage.full ? '#ff6b6b' : 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
            </div>
            {tier.storage.full && (tier.tier || 'normal').toLowerCase() !== 'premium' && (
              <div className="text-[11px] mt-2" style={{ color: '#ff9a9a' }}>Your storage limit is full. Upgrade your Portfolio plan to upload more photos.</div>
            )}
          </div>
          );
        })()}

        {/* Plan + design picker (owner spec): Free/Basic/Premium features +
            tier-gated portfolio design templates (free→5, basic→10, premium→15). */}
        {tier && (
          <div className="lux-glass p-5 mb-8" data-testid="portfolio-plan-design">
            <div className="lux-eyebrow mb-3">◆ Your portfolio plan</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              {[
                { key: 'normal', label: 'Free', note: '500 MB · starter sections', feats: FREE_PORTFOLIO_FEATURES },
                { key: 'basic', label: 'Basic', note: '5 GB · more sections + designs', feats: ['Everything in Free', 'More portfolio sections', 'Basic + Free design templates', 'Testimonials, Equipment, Awards'] },
                { key: 'premium', label: 'Premium', note: '20 GB · royal luxury', feats: ['Everything in Basic', 'All premium designs', 'Royal white-&-gold + 3D scroll', 'Gear, certifications, before/after'] },
              ].map((pl) => {
                // Redirect-loop fix: the whole card used to navigate to /studio/plans
                // for ANY non-current tier. A Premium studio clicking the (lower)
                // Free/Basic cards was therefore bounced to plans every time — the
                // "click Free/Basic → plans" loop. Cards are now INFORMATIONAL;
                // only a genuine UPGRADE (a higher tier than the current one) offers
                // navigation, via an explicit button — never a downgrade or current.
                const TIER_RANK = { normal: 0, free: 0, basic: 1, premium: 2 };
                const curRank = TIER_RANK[(tier.tier || 'normal')] ?? 0;
                const rank = TIER_RANK[pl.key] ?? 0;
                const cur = rank === curRank;
                const isUpgrade = rank > curRank;
                return (
                  <div key={pl.key} className="rounded-xl p-4 transition-transform" data-testid={`plan-card-${pl.key}`}
                    style={{ border: cur ? '1px solid rgba(212,175,55,0.5)' : '1px solid var(--lux-border)', background: cur ? 'rgba(212,175,55,0.06)' : 'transparent' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{pl.label}</span>
                      {cur ? <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#16110C' }}>CURRENT</span>
                           : isUpgrade
                             ? <button onClick={() => navigate('/studio/plans')} data-testid={`plan-upgrade-${pl.key}`} className="text-[10px] text-gold underline cursor-pointer">Upgrade →</button>
                             : <span className="text-[10px]" style={{ color: 'var(--lux-text-faint)' }}>Included</span>}
                    </div>
                    <div className="text-[11px] mb-2" style={{ color: 'var(--lux-text-muted)' }}>{pl.note}</div>
                    <ul className="space-y-1">
                      {pl.feats.map((f, i) => (
                        <li key={i} className="text-[11px] flex gap-1.5" style={{ color: 'var(--lux-text-muted)' }}>
                          <span className="text-gold">✓</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div className="lux-eyebrow">◆ Choose your portfolio design</div>
              <div className="flex items-center gap-2">
                {designSaving
                  ? <span className="text-[11px] flex items-center gap-1" style={{ color: '#E8C97A' }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying…</span>
                  : designSaved
                    ? <span className="text-[11px] flex items-center gap-1" style={{ color: '#7fe0a3' }}><Check className="w-3.5 h-3.5" /> Applied to your public page</span>
                    : <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>Click any design to apply it instantly</span>}
              </div>
            </div>

            {/* Big live preview of the currently-selected (or pending) design */}
            {activeDesignId && getDesign(activeDesignId) && (
              <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid var(--lux-border)' }} data-testid="portfolio-design-live-preview">
                <DesignPreview design={getDesign(activeDesignId)} size="lg" />
                <div className="px-3 py-2 flex items-center justify-between text-[11px]" style={{ background: 'var(--lux-panel)', color: 'var(--lux-text-muted)' }}>
                  <span>Preview · {getDesign(activeDesignId).name}</span>
                  {pendingDesign
                    ? <span style={{ color: '#E8C97A' }}>Unsaved — click “Save design” to apply</span>
                    : <span style={{ color: '#7fe0a3' }}>Currently live on your public page</span>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="portfolio-design-grid">
              {/* EVERY design is shown, not just the ones this tier unlocks.
                  A photographer cannot want what they cannot see - the locked
                  ones carry a live sample link and an upgrade hint instead of
                  being hidden. `unlocked` still governs what can be applied. */}
              {PORTFOLIO_DESIGNS.map((d) => {
                const sel = activeDesignId === d.id;
                const unlocked = designsForTier(tier.tier).some((x) => x.id === d.id);
                // WAS `/p/sample-${id}` — and that never worked. `/p/:username`
                // is the PIXORA community profile route; the public portfolio
                // lives at `/photographer/:id/portfolio`. So every "See it live"
                // opened the wrong component, which is why the samples appeared
                // broken. The seeded sample portfolios have since been removed
                // too, so there is nothing per-design to link to — the tier
                // demos on /portfolio-samples are the live examples now.
                return (
                  <div key={d.id} className="rounded-xl overflow-hidden flex flex-col"
                    style={{ border: sel ? '2px solid #D4AF37' : '1px solid var(--lux-border)',
                             opacity: unlocked ? 1 : 0.82 }}
                    data-testid={`design-card-${d.id}`}>
                    <button
                      onClick={() => (unlocked ? chooseDesign(d.id) : navigate('/studio/plans'))}
                      data-testid={`design-${d.id}`}
                      className="text-left transition-transform hover:scale-[1.02]"
                      title={unlocked ? 'Use this design' : `Unlock with the ${d.tier} plan`}>
                      <DesignPreview design={d} />
                      <div className="p-2.5" style={{ background: 'var(--lux-panel)' }}>
                        <div className="text-xs font-semibold flex items-center justify-between gap-1" style={{ color: 'var(--lux-text)' }}>
                          {d.name} {sel && <span className="text-gold text-[10px]">● selected</span>}
                          {!unlocked && <Lock className="w-3 h-3" style={{ color: '#E8C97A' }} />}
                        </div>
                        <div className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--lux-text-faint)' }}>{d.vibe}</div>
                        <div className="text-[9px] mt-1 uppercase tracking-wide" style={{ color: 'var(--lux-text-faint)' }}>
                          {unlocked ? `${d.tier} design` : `${d.tier} plan — tap to unlock`}
                        </div>
                      </div>
                    </button>
                    {/* One link that always resolves, rather than ten that
                        depended on seeded data staying in the database. */}
                    <a href="/portfolio-samples" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-center py-2 no-underline min-h-[36px] flex items-center justify-center gap-1"
                      style={{ background: 'rgba(212,175,55,0.10)', color: '#E8C97A',
                               borderTop: '1px solid var(--lux-border)' }}
                      data-testid={`design-sample-${d.id}`}>
                      See live examples <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                );
              })}
            </div>
            <a href="/portfolio-samples" target="_blank" rel="noopener noreferrer"
              className="lux-btn lux-btn-ghost !text-xs mt-4 inline-flex no-underline"
              data-testid="portfolio-see-all-samples">
              <Eye className="w-3.5 h-3.5" /> Browse all 9 designs as live pages
            </a>
            <div className="text-[11px] mt-3" style={{ color: 'var(--lux-text-faint)' }}>
              Free gets 1 clean design, Basic unlocks 3 genre-tuned designs, Premium unlocks all 5 bespoke designs (Gallery Wall, Film Strip, Liquid Glass, Contact Sheet, Aurora) with signature backgrounds &amp; 3D scroll. Pick a design, then press <b>Save design</b> to apply it to your public portfolio.
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-8 flex-wrap">
          {SECTIONS.map((s) => (
            <button key={s} onClick={() => setSection(s)}
              className={`px-4 py-2 rounded-xl text-xs tracking-[0.12em] uppercase ${section === s ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`}
              data-testid={`portfolio-section-${s}`}>{s}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-3 opacity-70" style={{ color: 'var(--lux-text)' }}>
            <Loader2 className="w-5 h-5 animate-spin" /> Loading portfolio…
          </div>
        ) : section === 'Profile' ? (
          <div data-testid="portfolio-profile">
            {/* ---- Portfolio type: Studio vs Individual freelancer ---- */}
            <div className="lux-glass p-5 mb-5" data-testid="portfolio-type-picker">
              <span className="lux-eyebrow block mb-3">◆ Portfolio type</span>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { key: 'studio', title: 'Studio Portfolio', Icon: Award,
                    blurb: 'For studios, wedding teams & multi-person crews offering many services.' },
                  { key: 'individual', title: 'Individual Photographer', Icon: Star,
                    blurb: 'For freelance, candid, pre-wedding, travel & solo photographers building a personal brand.' },
                ].map(({ key, title, Icon, blurb }) => {
                  const on = (profile.portfolio_type || 'studio') === key;
                  return (
                    <button key={key} type="button" onClick={() => setP('portfolio_type', key)}
                      data-testid={`ptype-${key}`}
                      className="text-left p-4 rounded-xl transition-transform hover:-translate-y-0.5"
                      style={{ background: on ? 'linear-gradient(135deg,rgba(232,201,122,0.16),rgba(212,175,55,0.06))' : 'var(--lux-panel)',
                               border: on ? '2px solid #D4AF37' : '1px solid var(--lux-border)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4" style={{ color: '#E8C97A' }} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--lux-text)' }}>{title}</span>
                        {on && <Check className="w-4 h-4 ml-auto" style={{ color: '#7fe0a3' }} />}
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{blurb}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] mt-3" style={{ color: 'var(--lux-text-faint)' }}>
                Same plan, storage &amp; designs — this only changes which sections appear on your public page. Press <b>Save profile</b> to apply.
              </p>
            </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* ---------------- LEFT COLUMN ---------------- */}
            <div className="space-y-5">
              <DiscoveryChecklist profile={profile} />
              <div className="lux-glass p-6 space-y-4">
                <span className="lux-eyebrow block">{isIndividual ? 'Your identity' : 'Studio identity'}</span>
                <Field label={isIndividual ? 'Your name' : 'Studio name'} value={profile.studio_name} onChange={(v) => setP('studio_name', v)}
                  placeholder={isIndividual ? 'e.g. Aarav Mehta' : 'e.g. Lens & Lotus Studio'} />
                {isIndividual && (
                  <Field label="Professional title" value={profile.professional_title} onChange={(v) => setP('professional_title', v)}
                    placeholder="e.g. Candid Wedding Photographer" hint="Shown under your name on the hero." />
                )}
                <Field label="Tagline" value={profile.tagline} onChange={(v) => setP('tagline', v)} placeholder="Capturing emotions, creating timeless memories" />
                <div className="grid grid-cols-2 gap-3">
                  <MediaDrop label={isIndividual ? 'Profile photo' : 'Studio logo'} value={profile.avatar} accept="image/*"
                    onUploaded={(d) => setP('avatar', d.url)} onClear={() => setP('avatar', '')} />
                  <MediaDrop label="Cover image" value={profile.hero_image} accept="image/*"
                    onUploaded={(d) => setP('hero_image', d.url)} onClear={() => setP('hero_image', '')} />
                </div>
                <Field label="Cover description" textarea value={profile.cover_description}
                  onChange={(v) => setP('cover_description', v)}
                  placeholder="Short hero blurb shown on your public portfolio cover." />
                <Field label={isIndividual ? 'About me' : 'About your studio'} textarea value={profile.about} onChange={(v) => setP('about', v)}
                  placeholder={isIndividual ? 'Who you are, your style, and what makes your work special.' : 'Tell couples who you are, your style and what makes your work special.'} />
                {isIndividual && (
                  <Field label="My photography journey" textarea value={profile.journey} onChange={(v) => setP('journey', v)}
                    placeholder="How you started, milestones, the moments that shaped your craft." />
                )}
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="lux-eyebrow block mb-2">Experience (years)</span>
                    <input type="number" min="0" value={profile.experience_years ?? ''}
                      onChange={(e) => { const t = e.target.value; setP('experience_years', t === '' ? null : Math.max(0, parseInt(t, 10) || 0)); }}
                      placeholder="e.g. 8" className="lux-input w-full" />
                  </label>
                  <label className="block">
                    <span className="lux-eyebrow block mb-2">Starting price (₹)</span>
                    <input type="number" min="0" step="1000" value={profile.starting_price ?? ''}
                      onChange={(e) => { const t = e.target.value; setP('starting_price', t === '' ? null : Math.max(0, parseInt(t, 10) || 0)); }}
                      placeholder="e.g. 45000" className="lux-input w-full" />
                    <span className="block mt-1 text-[11px]" style={{ color: 'var(--lux-text-faint, rgba(255,248,220,0.45))' }}>
                      Powers the “Budget” filter couples use to find you.
                    </span>
                  </label>
                </div>
              </div>

              <div className="lux-glass p-6 space-y-4">
                <span className="lux-eyebrow block">Services &amp; expertise</span>
                <div>
                  <span className="lux-eyebrow block mb-2">Services offered</span>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_OPTIONS.map((svc) => {
                      const on = (profile.services || []).includes(svc);
                      return (
                        <button key={svc} type="button" onClick={() => toggleService(svc)}
                          className="px-3 py-1.5 rounded-full text-xs"
                          style={{ background: on ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'var(--lux-panel)',
                                   color: on ? '#0E0A06' : 'var(--lux-text-muted)' }}>{svc}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <span className="lux-eyebrow block mb-2">Photography type <span className="normal-case tracking-normal" style={{ color: 'var(--lux-text-faint)' }}>(couples filter by these)</span></span>
                  <div className="flex flex-wrap gap-2">
                    {PHOTOGRAPHY_TYPES.map((st) => {
                      const on = (profile.styles || []).includes(st);
                      return (
                        <button key={st} type="button" onClick={() => toggleStyle(st)}
                          className="px-3 py-1.5 rounded-full text-xs"
                          style={{ background: on ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'var(--lux-panel)',
                                   color: on ? '#0E0A06' : 'var(--lux-text-muted)' }}>{st}</button>
                      );
                    })}
                  </div>
                </div>
                {!isIndividual && (
                  <CsvField label="Equipment" value={profile.equipment} onChange={(v) => setP('equipment', v)}
                    placeholder="Sony A7 IV, DJI drone, Godox lighting" hint="Comma-separated." />
                )}
                <CsvField label={isIndividual ? 'Awards & achievements' : 'Awards & features'} value={profile.awards} onChange={(v) => setP('awards', v)}
                  placeholder="WeddingSutra Editor's Choice 2024, …" hint="Comma-separated." />
              </div>

              {/* Individual-only: skills, gear & travel (premium plans render gear) */}
              {isIndividual && (
                <div className="lux-glass p-6 space-y-4" data-testid="individual-fields">
                  <span className="lux-eyebrow block">Freelancer profile</span>
                  <CsvField label="Skills & expertise" value={profile.skills} onChange={(v) => setP('skills', v)}
                    placeholder="Candid moments, Low-light, Colour grading" hint="Comma-separated tags." />
                  <CsvField label="Certifications" value={profile.certifications} onChange={(v) => setP('certifications', v)}
                    placeholder="Certified Professional Photographer, …" hint="Comma-separated." />
                  <div className="grid grid-cols-2 gap-3">
                    <CsvField label="Camera collection" value={profile.camera_gear} onChange={(v) => setP('camera_gear', v)}
                      placeholder="Sony A7 IV, Canon R6" hint="Comma-separated." />
                    <CsvField label="Lens collection" value={profile.lens_gear} onChange={(v) => setP('lens_gear', v)}
                      placeholder="35mm f/1.4, 85mm f/1.8" hint="Comma-separated." />
                    <CsvField label="Drone equipment" value={profile.drone_gear} onChange={(v) => setP('drone_gear', v)}
                      placeholder="DJI Mavic 3" hint="Comma-separated." />
                    <CsvField label="Editing software" value={profile.editing_software} onChange={(v) => setP('editing_software', v)}
                      placeholder="Lightroom, Photoshop" hint="Comma-separated." />
                  </div>
                  <div>
                    <span className="lux-eyebrow block mb-2">Travel availability</span>
                    <div className="flex flex-wrap gap-2">
                      {['Local', 'Statewide', 'Nationwide'].map((t) => {
                        const on = profile.travel_availability === t;
                        return (
                          <button key={t} type="button" onClick={() => setP('travel_availability', t)}
                            className="px-3 py-1.5 rounded-full text-xs"
                            style={{ background: on ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'var(--lux-panel)',
                                     color: on ? '#0E0A06' : 'var(--lux-text-muted)' }}>{t}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ---------------- RIGHT COLUMN ---------------- */}
            <div className="space-y-5">
              <div className="lux-glass p-6 space-y-4">
                <span className="lux-eyebrow block">Location &amp; reach</span>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" value={profile.location?.city} onChange={(v) => setLoc('city', v)} placeholder="Hyderabad" />
                  <Field label="State" value={profile.location?.state} onChange={(v) => setLoc('state', v)} placeholder="Telangana" />
                </div>
                <Field label="Country" value={profile.location?.country} onChange={(v) => setLoc('country', v)} placeholder="India" />
                <CsvField label="Cities you cover" value={profile.coverage_areas} onChange={(v) => setP('coverage_areas', v)}
                  placeholder="Hyderabad, Vijayawada, Bengaluru" hint="Where you travel for shoots. Comma-separated." />
                <CsvField label="Languages" value={profile.languages} onChange={(v) => setP('languages', v)}
                  placeholder="Telugu, Hindi, English" hint="Comma-separated." />
              </div>

              {/* Studio identity extras — owner, business type, founded, hours. */}
              <div className="lux-glass p-6 space-y-4" data-testid="portfolio-studio-info">
                <span className="lux-eyebrow block">Studio information</span>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Owner / lead name" value={profile.owner_name} onChange={(v) => setP('owner_name', v)}
                    placeholder="Mani Kumar" />
                  <SelectField label="Business type" value={profile.business_type} onChange={(v) => setP('business_type', v)}
                    options={['', 'studio', 'freelancer', 'agency']} />
                  <NumField label="Founded year" value={profile.founded_year || profile.working_since}
                    onChange={(v) => setP('founded_year', v)} placeholder="2018" />
                  <Field label="GST number (optional)" value={profile.gst_number} onChange={(v) => setP('gst_number', v)}
                    placeholder="Shown only if you enter it" />
                </div>
                <Field label="Working hours" value={profile.business_hours} onChange={(v) => setP('business_hours', v)}
                  placeholder="Mon–Sun · 9 AM – 9 PM" hint="How your business hours read to a visitor." />
                <CsvField label="Weekly holidays" value={profile.weekly_holidays} onChange={(v) => setP('weekly_holidays', v)}
                  placeholder="Tuesday" hint="Comma-separated. Leave blank if open every day." />
              </div>

              {/* Booking facts — the questions couples otherwise have to phone for.
                  Answering them here is what turns a profile view into an enquiry. */}
              <div className="lux-glass p-6 space-y-4" data-testid="portfolio-booking">
                <span className="lux-eyebrow block">Booking details</span>
                <p className="text-[12px] -mt-2" style={{ color: 'var(--lux-text-faint)' }}>
                  Couples ask these before they enquire. Filling them in means fewer calls
                  and more confident bookings.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="Team size on a shoot" value={profile.team_size}
                    onChange={(v) => setP('team_size', v)} placeholder="4" />
                  <NumField label="Delivery time (days)" value={profile.delivery_days}
                    onChange={(v) => setP('delivery_days', v)} placeholder="30" />
                  <NumField label="Booking advance (%)" value={profile.advance_percent}
                    onChange={(v) => setP('advance_percent', v)} placeholder="30" />
                  <NumField label="Working since (year)" value={profile.working_since}
                    onChange={(v) => setP('working_since', v)} placeholder="2016" />
                </div>
                <div>
                  <span className="lux-eyebrow mb-2 block">Travel policy</span>
                  <div className="flex flex-wrap gap-2">
                    {TRAVEL_POLICY_OPTIONS.map((t) => (
                      <Chip key={t} on={profile.travel_policy === t} label={t}
                        onClick={() => setP('travel_policy', profile.travel_policy === t ? '' : t)} />
                    ))}
                  </div>
                </div>
                <ChipList label="Shoot types" options={SHOOT_TYPE_OPTIONS}
                  value={profile.shoot_types} onChange={(v) => setP('shoot_types', v)} />
                <ChipList label="Ceremonies you cover" options={RELIGION_OPTIONS}
                  value={profile.religions_covered} onChange={(v) => setP('religions_covered', v)} />
                <ChipList label="Add-ons you offer" options={ADD_ON_OPTIONS}
                  value={profile.add_ons} onChange={(v) => setP('add_ons', v)} />
                <ChipList label="Payments you accept" options={PAYMENT_MODE_OPTIONS}
                  value={profile.payment_modes} onChange={(v) => setP('payment_modes', v)} />
                <div className="flex items-center gap-2">
                  <Chip on={!!profile.gst_registered} label="GST registered (can invoice)"
                    onClick={() => setP('gst_registered', !profile.gst_registered)} />
                </div>
                <Field label="Cancellation / reschedule policy" textarea
                  value={profile.cancellation_policy} onChange={(v) => setP('cancellation_policy', v)}
                  placeholder="e.g. Advance is adjustable to a new date within 6 months. Cancellations within 30 days of the event forfeit the advance."
                  hint="Shown on your public profile — being upfront avoids disputes later." />
              </div>

              <div className="lux-glass p-6 space-y-4">
                <span className="lux-eyebrow block">Social &amp; contact</span>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone" value={profile.contact?.phone} onChange={(v) => setContact('phone', v)} placeholder="+91 98765 43210" />
                  <Field label="WhatsApp" value={profile.social?.whatsapp} onChange={(v) => setSocial('whatsapp', v)} placeholder="+91 98765 43210" />
                </div>
                <Field label="Email" type="email" value={profile.contact?.email} onChange={(v) => setContact('email', v)} placeholder="studio@example.com" />
                <div>
                  <span className="lux-eyebrow block mb-2">Availability status</span>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABILITY_OPTIONS.map((a) => {
                      const on = (profile.availability_status || 'Available') === a;
                      return (
                        <button key={a} type="button" onClick={() => setP('availability_status', a)}
                          className="px-3 py-1.5 rounded-full text-xs"
                          style={{ background: on ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'var(--lux-panel)',
                                   color: on ? '#0E0A06' : 'var(--lux-text-muted)' }}>{a}</button>
                      );
                    })}
                  </div>
                </div>
                <Field label="Instagram" value={profile.social?.instagram} onChange={(v) => setSocial('instagram', v)} placeholder="https://instagram.com/…" />
                <Field label="Facebook" value={profile.social?.facebook} onChange={(v) => setSocial('facebook', v)} placeholder="https://facebook.com/…" />
                <Field label="YouTube" value={profile.social?.youtube} onChange={(v) => setSocial('youtube', v)} placeholder="https://youtube.com/@…" />
                <Field label="Website" value={profile.social?.website} onChange={(v) => setSocial('website', v)} placeholder="https://…" />
              </div>

              <div className="lux-glass p-6 space-y-4">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={!!profile.is_published}
                    onChange={(e) => setP('is_published', e.target.checked)} data-testid="portfolio-publish" />
                  <span className="text-sm" style={{ color: 'var(--lux-text)' }}>Publish public portfolio</span>
                </label>
                <p className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
                  When published, your studio appears on your public portfolio page and in the Find Photographers directory.
                </p>
                <button onClick={saveProfile} disabled={saving} className="lux-btn w-full justify-center" data-testid="save-profile">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save profile
                </button>
              </div>
            </div>
          </div>

          {/* ---- FULL-WIDTH rows ----------------------------------------
              These four need horizontal room (a 6-part address, a long SEO
              description, Q+A pairs, a photo grid). Kept OUT of the two-column
              grid above: stacking them in the right column made that column
              roughly twice the height of the left one, which is the misalignment
              the owner reported. Full width also gives the "perfect clarity"
              while typing that they asked for. */}
          <div className="mt-5 space-y-5">

            {/* Address — a 6-part address reads far better across the page. */}
            <div className="lux-glass p-6 space-y-4" data-testid="portfolio-address">
              <span className="lux-eyebrow block">Address &amp; directions</span>
              <p className="text-[12px] -mt-2" style={{ color: 'var(--lux-text-faint)' }}>
                Wedding clients search nearby photographers. A full address + a Google Maps
                link gives your page a “Get Directions” button and helps you show up locally.
              </p>
              <Field label="Full address" value={profile.address?.full_address}
                onChange={(v) => setAddr('full_address', v)} placeholder="5-12 Brodipet" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Field label="Landmark" value={profile.address?.landmark} onChange={(v) => setAddr('landmark', v)} placeholder="Near Clock Tower" />
                <Field label="City" value={profile.address?.city} onChange={(v) => setAddr('city', v)} placeholder="Guntur" />
                <Field label="District" value={profile.address?.district} onChange={(v) => setAddr('district', v)} placeholder="Guntur" />
                <Field label="State" value={profile.address?.state} onChange={(v) => setAddr('state', v)} placeholder="Andhra Pradesh" />
                <Field label="Pincode" value={profile.address?.pincode} onChange={(v) => setAddr('pincode', v)} placeholder="522002" />
              </div>
              <Field label="Google Maps link" value={profile.address?.maps_url} onChange={(v) => setAddr('maps_url', v)}
                placeholder="https://maps.app.goo.gl/…" hint="Paste your studio's Google Maps link — powers the Get Directions button." />
            </div>

            {/* SEO — title/keywords side by side, description full width. */}
            <div className="lux-glass p-6 space-y-4" data-testid="portfolio-seo">
              <span className="lux-eyebrow block">Search engine (Google)</span>
              <p className="text-[12px] -mt-2" style={{ color: 'var(--lux-text-faint)' }}>
                Premium: how your studio appears in Google search. Leave blank and we write
                sensible defaults from your name, city and services. Getting listed on Google
                also needs your portfolio published and takes time to index.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="SEO title" value={profile.seo_title} onChange={(v) => setP('seo_title', v)}
                  placeholder="Mani Studio | Wedding Photographer in Guntur" />
                <CsvField label="SEO keywords" value={profile.seo_keywords} onChange={(v) => setP('seo_keywords', v)}
                  placeholder="Wedding Photographer Guntur, Candid Photographer Guntur" hint="Comma-separated search phrases." />
              </div>
              <Field label="SEO description" textarea value={profile.seo_description} onChange={(v) => setP('seo_description', v)}
                placeholder="Professional wedding, candid and pre-wedding photography in Guntur." />
            </div>

            {/* FAQ — Q+A pairs need the width. */}
            <div className="lux-glass p-6 space-y-4" data-testid="portfolio-faqs">
              <span className="lux-eyebrow block">FAQ</span>
              <p className="text-[12px] -mt-2" style={{ color: 'var(--lux-text-faint)' }}>
                Answer what couples ask most. Suggestions: “Do you travel outside the city?”,
                “Do you provide drone coverage?”, “How many days for delivery?”, “Do you provide albums?”
              </p>
              <FaqEditor value={profile.faqs || []} onChange={(v) => setP('faqs', v)} />
            </div>

            {/* Studio photos — a photo grid, so full width. */}
            <div className="lux-glass p-6 space-y-4" data-testid="portfolio-studio-photos">
              <span className="lux-eyebrow block">Studio photos</span>
              <p className="text-[12px] -mt-2" style={{ color: 'var(--lux-text-faint)' }}>
                Show your studio space or team at work. These appear in an “Our Studio” section
                on your public page.
              </p>
              <StudioPhotosEditor value={profile.studio_photos || []} onChange={(v) => setP('studio_photos', v)} />
            </div>

            <button onClick={saveProfile} disabled={saving}
              className="lux-btn w-full justify-center" data-testid="save-profile-wide">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save profile
            </button>
          </div>

          {/* Photos & Videos — moved here from the old "Albums & Works" tab */}
          <div className="space-y-6 mt-10 pt-8" style={{ borderTop: '1px solid var(--lux-border)' }}>
            <div>
              <span className="lux-eyebrow block mb-1">◆ Photos &amp; Videos</span>
              <p className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
                Group your work into albums, then upload photos, videos or paste a YouTube film link into each album.
              </p>
            </div>
            {/* Hidden picker — accept flips between photos and videos */}
            <input ref={workFileInput} type="file" accept={uploadAlbum?.accept || 'image/*'} multiple hidden
              onChange={onWorkFilesPicked} data-testid="work-file-input" />
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={addAlbum} className="lux-btn" data-testid="add-album"><FolderPlus className="w-4 h-4" /> New album</button>
              {uploading && <span className="text-xs flex items-center gap-2" style={{ color: '#E8C97A' }}><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</span>}
              <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>Photos up to 25 MB · videos up to 200 MB · YouTube links are free (no storage used).</span>
            </div>
            {albums.length === 0 && (
              <div className="lux-glass p-10 text-center" data-testid="albums-empty">
                <ImageIcon className="w-10 h-10 mx-auto mb-3" style={{ color: '#E8C97A', opacity: 0.8 }} />
                <h3 className="font-heading text-lg mb-1" style={{ color: 'var(--lux-text)' }}>Add your photos &amp; videos</h3>
                <p className="text-sm mb-5 max-w-md mx-auto" style={{ color: 'var(--lux-text-muted)' }}>
                  Group your work into albums (e.g. “Weddings”, “Pre-Wedding”), then upload
                  photos, videos, or paste a YouTube film link into each album.
                </p>
                <button onClick={addAlbum} className="lux-btn" data-testid="add-album-empty">
                  <FolderPlus className="w-4 h-4" /> Create your first album
                </button>
              </div>
            )}
            {albums.map((alb) => {
              const albWorks = works.filter((w) => w.album_id === alb.id);
              return (
                <motion.div key={alb.id} variants={fadeUp} initial="hidden" animate="visible" className="lux-glass p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-heading text-lg" style={{ color: 'var(--lux-text)' }}>{alb.title}</h3>
                      <span className="text-xs" style={{ color: '#E8C97A' }}>{alb.event_category || 'Uncategorised'} · {albWorks.length} works</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => pickWorkPhotos(alb.id, alb.event_category)} disabled={uploading} className="lux-btn lux-btn-ghost text-xs disabled:opacity-50" data-testid={`upload-work-${alb.id}`}><Upload className="w-3.5 h-3.5" /> Photos</button>
                      <button onClick={() => pickWorkVideos(alb.id, alb.event_category)} disabled={uploading} className="lux-btn lux-btn-ghost text-xs disabled:opacity-50" data-testid={`upload-video-${alb.id}`}><Video className="w-3.5 h-3.5" /> Videos</button>
                      <button onClick={() => addYoutube(alb.id, alb.event_category)} className="lux-btn lux-btn-ghost text-xs" data-testid={`add-youtube-${alb.id}`}><Youtube className="w-3.5 h-3.5" /> YouTube link</button>
                      <button onClick={() => delAlbum(alb.id)} className="lux-btn lux-btn-ghost text-xs"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {albWorks.map((w) => (
                      <div key={w.id} className="relative rounded-xl overflow-hidden group" style={{ aspectRatio: '3/4', background: 'var(--lux-panel)' }}>
                        {w.image_url ? (
                          <img src={w.image_url} alt={w.title} loading="lazy" className="w-full h-full object-cover" />
                        ) : w.video_url ? (
                          <>
                            {w.thumbnail_url
                              ? <img src={w.thumbnail_url} alt={w.title} loading="lazy" className="w-full h-full object-cover" />
                              : <video src={w.video_url} muted className="w-full h-full object-cover" />}
                            <span className="absolute inset-0 grid place-items-center pointer-events-none">
                              <Video className="w-7 h-7" style={{ color: '#FFF8DC', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                            </span>
                          </>
                        ) : (
                          <div className="w-full h-full grid place-items-center"><ImageIcon className="w-6 h-6 opacity-40" /></div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-2 text-[11px]" style={{ background: 'linear-gradient(transparent,rgba(0,0,0,0.7))', color: '#FFF8DC' }}>{w.title}</div>
                        <button onClick={() => toggleFeatured(w)} className="absolute top-2 left-2" title="Featured">
                          <Star className="w-4 h-4" fill={w.featured ? '#E8C97A' : 'none'} style={{ color: '#E8C97A' }} />
                        </button>
                        <button onClick={() => delWork(w.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-4 h-4" style={{ color: '#fff' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
          </div>
        ) : section === 'Past Works' ? (
          <PastWorksPanel
            works={profile.past_works || []}
            onChange={(pw) => setP('past_works', pw)}
            onSave={saveProfile}
            saving={saving}
          />
        ) : (
          <div className="space-y-4">
            <button onClick={addTestimonial} className="lux-btn" data-testid="add-testimonial"><Plus className="w-4 h-4" /> Add client review</button>
            {testimonials.length === 0 && (
              <div className="lux-glass p-10 text-center" style={{ color: 'var(--lux-text-muted)' }}>No reviews yet.</div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              {testimonials.map((t) => (
                <div key={t.id} className="lux-glass p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5" fill={i < (t.rating || 0) ? '#E8C97A' : 'none'} style={{ color: '#E8C97A' }} />
                      ))}
                    </div>
                    <button onClick={() => delTestimonial(t.id)}><Trash2 className="w-4 h-4" style={{ color: 'var(--lux-text-faint)' }} /></button>
                  </div>
                  <p className="mt-3 text-sm" style={{ color: 'var(--lux-text)' }}>“{t.text}”</p>
                  <p className="mt-2 text-xs" style={{ color: '#E8C97A' }}>— {t.author}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
