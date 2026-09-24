/**
 * EventPublicInvitation.jsx — MAJA Dynamic Event Engine: the public invitation (/e/:slug).
 * ========================================================================================
 *
 * Renders a published event invitation EXACTLY like a wedding invitation (owner brief,
 * 2026-07): the approved artwork sits centred as the hero card, a zoomed + softly
 * blurred copy of that same artwork becomes the page background, and the details scroll
 * underneath on warm parchment panels. Same composition rules as DesignFullPreview on the
 * wedding side — only the artwork and the sections differ.
 *
 * The page body is exported as `EventInvitationView` so the browse / home / photographer
 * PREVIEW surfaces render the identical invitation with sample content (preview mode
 * swaps the live fetches for the sample data and hides guest write actions).
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MapPin, Send, Heart, Share2, Calendar, CheckCircle2, Loader2 } from 'lucide-react';
import { EventService } from '../services/eventApi';
import { EventInvitationCard } from '../components/builder/EventInvitationCard';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import LoadingFallback from '../components/LoadingFallback';
import { PhotoLightbox, openLightbox } from '../components/PhotoLightbox';

/* Warm, readable parchment ink palette — the artwork behind these panels can be light
   OR dark, so the sections carry their own guaranteed-legible colours (same trick the
   wedding preview uses). */
const INK = {
  ink: '#241A12',
  body: 'rgba(36,26,18,0.82)',
  label: '#8A6A1A',
  gold: '#B08D3F',
  surface: 'rgba(255,250,244,0.95)',
  border: 'rgba(36,26,18,0.14)',
  chip: 'rgba(36,26,18,0.06)',
};

// Site typography rule (index.css / luxury.css): ONE family sitewide — Cormorant
// Garamond — with the "script" accent expressed as italic, not a second webfont.
// Following that here keeps the event pages consistent AND avoids a cursive face
// that is never actually loaded (it would silently fall back to a system cursive).
const DISPLAY = '"Cormorant Garamond", Georgia, serif';
const SCRIPT = DISPLAY;

/** ◆ divider — the small ornament that closes a section on the wedding designs. */
function Ornament({ color = INK.gold }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-3" aria-hidden>
      <span style={{ height: 1, width: 52, background: `linear-gradient(90deg, transparent, ${color})` }} />
      <span style={{ color, fontSize: 12 }}>◆</span>
      <span style={{ height: 1, width: 52, background: `linear-gradient(90deg, ${color}, transparent)` }} />
    </div>
  );
}

/* The panel re-declares the shadcn design tokens locally, so every child control
   (inputs, buttons, muted text) reads correctly on parchment in BOTH light and dark
   site themes — instead of inheriting a pale-on-pale dark-mode palette. */
const PANEL_TOKENS = {
  '--background': '35 100% 98%',
  '--foreground': '27 33% 11%',
  '--card': '35 100% 98%',
  '--card-foreground': '27 33% 11%',
  '--popover': '35 100% 98%',
  '--popover-foreground': '27 33% 11%',
  '--primary': '43 69% 32%',
  '--primary-foreground': '35 100% 98%',
  '--muted': '36 30% 92%',
  '--muted-foreground': '27 25% 33%',
  '--accent': '36 30% 92%',
  '--accent-foreground': '27 33% 11%',
  '--border': '33 17% 82%',
  '--input': '33 17% 82%',
  '--ring': '43 69% 32%',
};

/**
 * A parchment section card.
 *   title   — the small gold eyebrow (always shown)
 *   heading — an optional BIG display-serif headline
 *   accent  — the last word of the heading, set in the gold script face
 *   ornament— close the card with the ◆ divider
 */
function Section({ title, heading, accent, ornament, children }) {
  return (
    <section className="rounded-2xl px-6 py-7 md:px-9 md:py-9"
      style={{
        ...PANEL_TOKENS,
        background: INK.surface, border: `1px solid ${INK.border}`,
        boxShadow: '0 18px 44px rgba(0,0,0,0.16)', color: INK.ink,
      }}>
      {title && (
        <p className="text-center text-[10px] uppercase tracking-[0.45em]" style={{ color: INK.gold }}>
          ◆ {title}
        </p>
      )}
      {heading && (
        <h2 className="mt-3 mb-5 text-center leading-tight"
          style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: 'clamp(1.7rem, 5.5vw, 2.4rem)' }}>
          {heading}{accent && (
            <> <em style={{ fontFamily: SCRIPT, color: INK.gold, fontStyle: 'italic', fontSize: '1.15em' }}>{accent}</em></>
          )}
        </h2>
      )}
      <div className={heading ? '' : 'mt-4'}>{children}</div>
      {ornament && <Ornament />}
    </section>
  );
}

/* ── The design artwork as the page background: zoomed, softly blurred, fixed —
   so the invitation extends edge-to-edge instead of floating on a flat colour. ── */
function EventBackdrop({ image }) {
  if (!image) {
    return (
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(160deg, #F6ECD8 0%, #EADFC8 60%, #E3D3B4 100%)',
      }} />
    );
  }
  return (
    <>
      <img aria-hidden src={image} alt="" draggable={false} loading="eager" decoding="async"
        style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          width: '100%', height: '100%', objectFit: 'cover',
          filter: 'blur(4px) saturate(1.05)', transform: 'scale(1.06)',
          transformOrigin: 'center center', willChange: 'transform',
        }}
        data-testid="event-page-background" />
      {/* a whisper of warmth so text panels never fight a busy centre */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(255,250,240,0.10) 0%, rgba(30,20,10,0.22) 100%)',
      }} />
    </>
  );
}

function RsvpForm({ slug }) {
  const [f, setF] = useState({ guest_name: '', phone: '', attendance_status: 'yes', guests_count: 1, message: '' });
  const [state, setState] = useState('idle'); // idle | saving | done | error
  const submit = async () => {
    if (!f.guest_name.trim()) { setState('error'); return; }
    setState('saving');
    try { await EventService.publicRsvp(slug, f); setState('done'); }
    catch (_) { setState('error'); }
  };
  if (state === 'done') {
    return <p className="flex items-center justify-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Thank you! Your RSVP is recorded.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="rsvp-name">Your Name *</Label>
        <Input id="rsvp-name" value={f.guest_name} onChange={(e) => setF({ ...f, guest_name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rsvp-phone">Phone</Label>
          <Input id="rsvp-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rsvp-count">Guests</Label>
          <Input id="rsvp-count" type="number" min="1" value={f.guests_count}
                 onChange={(e) => setF({ ...f, guests_count: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Will you attend?</Label>
        <div className="flex gap-2">
          {['yes', 'maybe', 'no'].map((v) => (
            <button key={v} type="button" onClick={() => setF({ ...f, attendance_status: v })}
              className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize transition
                ${f.attendance_status === v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      {state === 'error' && <p className="text-xs text-red-600">Please enter your name and try again.</p>}
      <Button onClick={submit} disabled={state === 'saving'} className="w-full">
        {state === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send RSVP
      </Button>
    </div>
  );
}

const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve(true);
  s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

function DonateForm({ slug, eventTitle }) {
  const [f, setF] = useState({ donor_name: '', amount: '', phone: '', message: '', is_anonymous: false });
  const [state, setState] = useState('idle');
  const [msg, setMsg] = useState('');
  const submit = async () => {
    if (!Number(f.amount)) { setState('error'); return; }
    setState('saving');
    const body = { ...f, amount: Number(f.amount) };
    try {
      // Try the online flow first. The backend records a pending donation and, when
      // Razorpay is configured, returns an order to complete; otherwise it's an
      // offline pledge the organizers confirm (graceful).
      const order = await EventService.publicDonateOrder(slug, body);
      if (!order.configured) {
        setMsg(order.message || 'Thank you! Your donation is recorded.'); setState('done'); return;
      }
      const ok = await loadRazorpay();
      if (!ok) throw new Error('checkout');
      const rzp = new window.Razorpay({
        key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency || 'INR',
        name: eventTitle || 'Ganesh Chaturthi', description: `Donation of ₹${Number(f.amount).toLocaleString('en-IN')}`,
        theme: { color: '#C6A15B' }, prefill: { name: f.donor_name, contact: f.phone },
        handler: async (resp) => {
          try {
            const v = await EventService.publicDonateVerify({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            setMsg(`Thank you! Receipt ${v.receipt_number}.`); setState('done');
          } catch (_) { setState('error'); }
        },
        modal: { ondismiss: () => setState('idle') },
      });
      rzp.open();
    } catch (_) { setState('error'); }
  };
  if (state === 'done') {
    return <p className="flex items-center justify-center gap-2 text-center text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {msg}</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[101, 251, 501, 1001].map((a) => (
          <button key={a} type="button" onClick={() => setF({ ...f, amount: a })}
            className={`flex-1 rounded-md border px-2 py-1.5 text-sm transition ${Number(f.amount) === a ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
            ₹{a}
          </button>
        ))}
      </div>
      <Input type="number" min="1" placeholder="Amount (₹)" value={f.amount}
             onChange={(e) => setF({ ...f, amount: e.target.value })} />
      {!f.is_anonymous && (
        <Input placeholder="Your name" value={f.donor_name} onChange={(e) => setF({ ...f, donor_name: e.target.value })} />
      )}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={f.is_anonymous} onChange={(e) => setF({ ...f, is_anonymous: e.target.checked })} />
        Donate anonymously
      </label>
      {state === 'error' && <p className="text-xs text-red-600">Enter a valid amount (and your name, or choose anonymous).</p>}
      <Button onClick={submit} disabled={state === 'saving'} className="w-full">
        {state === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Contribute
      </Button>
    </div>
  );
}

/* ── v2 feature gate — mirrors backend event_plan_gating (permissive when the
   payload has no granted_features, i.e. flag OFF / legacy / base sections). ── */
const GANESH_PACKABLE = new Set([
  'journey', 'per_day_schedule', 'per_day_photos', 'blessings_wall', 'donations',
  'money_portal', 'spending_folders', 'extra_languages', 'countdown', 'prasadam_menu',
  'previous_year_gallery', 'pdf_download', 'money_report', 'whatsapp_share',
]);
function eventCan(event, key) {
  const g = event && event.granted_features != null ? event.granted_features : null;
  if (g == null || !Array.isArray(g)) return true;
  if (!GANESH_PACKABLE.has(key)) return true;
  return g.includes(key);
}

/* ── Countdown to the first day / Sthapana ── */
function Countdown({ targetDate, label }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!targetDate) return null;
  const target = new Date(`${targetDate}T08:00:00`).getTime();
  const diff = Math.max(0, target - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const cell = (v, u) => (
    <div key={u} className="min-w-[4.5rem] rounded-xl px-3 py-3 text-center"
      style={{ background: INK.chip, border: `1px solid ${INK.border}` }}>
      <div className="tabular-nums leading-none"
        style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: 'clamp(1.9rem, 7vw, 2.6rem)' }}>
        {String(v).padStart(2, '0')}
      </div>
      <div className="mt-1.5 text-[9px] uppercase tracking-[0.3em]" style={{ color: INK.gold }}>{u}</div>
    </div>
  );
  return (
    <Section title={label || 'Countdown'} heading="The day is" accent="near.">
      <div className="flex items-center justify-center gap-2.5">
        {[cell(d, 'Days'), cell(h, 'Hours'), cell(m, 'Min'), cell(s, 'Sec')]}
      </div>
    </Section>
  );
}

/* ── Per-day schedule (items list + special-day highlight) ── */
function DaySchedule({ days }) {
  if (!days || days.length === 0) return null;
  return (
    <Section title="Festival Schedule" heading="Every day, a" accent="ritual." ornament>
      <div className="space-y-4">
        {days.map((day) => (
          <div key={day.id} className="rounded-xl p-4 md:p-5"
            style={{
              background: day.is_special ? 'rgba(176,141,63,0.10)' : 'transparent',
              border: `1px solid ${day.is_special ? 'rgba(176,141,63,0.45)' : INK.border}`,
            }}>
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
              <p style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: '1.3rem', lineHeight: 1.2 }}>
                {day.day_label || `Day ${day.festival_day}`}
              </p>
              {day.is_special && (
                <span className="rounded-full px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em]"
                  style={{ background: INK.gold, color: '#FFF8EC' }}>
                  {day.special_kind === 'annadanam' ? 'Annadanam' : day.special_kind === 'last' ? 'Final Day' : 'Special Day'}
                </span>
              )}
            </div>
            {day.date && (
              <p className="mb-2 text-[11px] uppercase tracking-[0.22em]" style={{ color: INK.gold }}>{day.date}</p>
            )}
            {day.special_note && <p className="mb-3 text-[13px] italic" style={{ color: INK.body }}>{day.special_note}</p>}
            <ul className="space-y-2">
              {(day.items || []).map((it, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className="w-[5.5rem] shrink-0 text-[11px] uppercase tracking-[0.14em] tabular-nums"
                    style={{ color: INK.gold }}>{it.time || ''}</span>
                  <span className="flex-1">
                    <span className="text-[15px] font-medium">{it.title}</span>
                    {it.note && <span className="text-[13px]" style={{ color: INK.body }}> — {it.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── Donor leaderboard (top donors + QR + causes) ── */
function DonorLeaderboard({ slug, sample }) {
  const [board, setBoard] = useState(sample || null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (sample) return undefined;            // preview — never hits the API
    let alive = true;
    EventService.publicLeaderboard(slug).then((b) => { if (alive) setBoard(b); }).catch(() => {});
    return () => { alive = false; };
  }, [slug, sample]);
  if (!board || (board.count === 0 && !board.upi_id && !board.qr_image_url)) return null;
  const list = showAll ? board.donors : (board.top || board.donors.slice(0, 3));
  return (
    <Section title="Contributions" heading="With everyone's" accent="generosity.">
      {board.count > 0 && (
        <>
          <p className="mb-5 text-center" style={{ color: INK.body }}>
            <span style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: '1.7rem' }}>
              ₹{Number(board.total || 0).toLocaleString('en-IN')}
            </span>
            <span className="ml-2 text-[13px]">raised from {board.count} contributions</span>
          </p>
          <ul className="mb-3 space-y-2">
            {list.map((d, i) => (
              <li key={d.id || i} className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5"
                style={{
                  background: i === 0 && !showAll ? 'rgba(176,141,63,0.12)' : INK.chip,
                  border: `1px solid ${i === 0 && !showAll ? 'rgba(176,141,63,0.4)' : INK.border}`,
                }}>
                <span className="text-[15px]">{i === 0 && !showAll ? '🏆 ' : ''}{d.name}</span>
                <span className="shrink-0 tabular-nums"
                  style={{ fontFamily: DISPLAY, color: INK.gold, fontSize: '1.15rem' }}>
                  {d.amount != null ? `₹${Number(d.amount).toLocaleString('en-IN')}` : '—'}
                </span>
              </li>
            ))}
          </ul>
          {board.donors.length > list.length && (
            <button type="button" onClick={() => setShowAll(true)}
              className="mb-3 w-full text-[11px] uppercase tracking-[0.25em] underline"
              style={{ color: INK.gold }}>
              View all contributors
            </button>
          )}
        </>
      )}
      {(board.upi_id || board.qr_image_url) && (
        <div className="rounded-xl p-4 text-center" style={{ background: INK.chip, border: `1px solid ${INK.border}` }}>
          <p className="mb-3 text-[10px] uppercase tracking-[0.35em]" style={{ color: INK.gold }}>Contribute</p>
          {board.qr_image_url && (
            <img src={board.qr_image_url} alt="Payment QR" onClick={() => openLightbox(board.qr_image_url)}
              className="mx-auto mb-3 h-40 w-40 object-contain" style={{ cursor: 'zoom-in' }}
              title="Tap to enlarge" />
          )}
          {board.upi_id && <p className="text-[15px]">UPI: <span className="font-medium">{board.upi_id}</span></p>}
          {board.causes && board.causes.length > 0 && (
            <p className="mt-1.5 text-[13px]" style={{ color: INK.body }}>For: {board.causes.join(' · ')}</p>
          )}
        </div>
      )}

      {/* "Where the money went" — the committee's spending folders, amounts only.
          Shown when the host turns on `show_spending`; this is the transparency the
          whole money portal exists for, so it belongs on the invitation itself. */}
      {board.spending && (board.spending.folders || []).length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-center text-[10px] uppercase tracking-[0.35em]" style={{ color: INK.gold }}>
            ◆ Where it went
          </p>
          <ul className="space-y-2">
            {board.spending.folders.map((f) => {
              const pct = board.spending.spent_total
                ? Math.round((f.amount / board.spending.spent_total) * 100) : 0;
              return (
                <li key={f.category} className="rounded-xl px-4 py-2.5"
                  style={{ background: INK.chip, border: `1px solid ${INK.border}` }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px]">{f.category}</span>
                    <span className="shrink-0 tabular-nums"
                      style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: '1.1rem' }}>
                      ₹{Number(f.amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(36,26,18,0.10)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: INK.gold }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-center text-[13px]" style={{ color: INK.body }}>
            ₹{Number(board.spending.spent_total || 0).toLocaleString('en-IN')} spent across
            {' '}{board.spending.folders.length} {board.spending.folders.length === 1 ? 'head' : 'heads'}
            {board.count > 0 && board.total >= board.spending.spent_total && (
              <> · ₹{Number(board.total - board.spending.spent_total).toLocaleString('en-IN')} in hand</>
            )}
          </p>
        </div>
      )}
    </Section>
  );
}

/* ── Blessings wall (list + submit) ── */
function BlessingsWall({ slug, sample, readOnly }) {
  const [items, setItems] = useState(sample || []);
  const [f, setF] = useState({ guest_name: '', message: '' });
  const [state, setState] = useState('idle');
  const load = () => EventService.publicBlessings(slug).then((r) => setItems(r.blessings || [])).catch(() => {});
  useEffect(() => { if (!sample) load(); /* eslint-disable-next-line */ }, [slug, sample]);
  const submit = async () => {
    if (!f.guest_name.trim() || !f.message.trim()) { setState('error'); return; }
    setState('saving');
    try { const r = await EventService.publicSubmitBlessing(slug, f); setState(r.moderated ? 'moderated' : 'done'); setF({ guest_name: '', message: '' }); load(); }
    catch (_) { setState('error'); }
  };
  return (
    <Section title="Blessings" heading="Words of" accent="grace." ornament={readOnly}>
      {items.length > 0 && (
        <ul className="mb-5 space-y-3">
          {items.map((b, i) => (
            <li key={i} className="rounded-xl p-4"
              style={{
                background: b.is_featured ? 'rgba(176,141,63,0.10)' : INK.chip,
                border: `1px solid ${b.is_featured ? 'rgba(176,141,63,0.4)' : INK.border}`,
              }}>
              <Heart className="mb-2 h-3.5 w-3.5" style={{ color: INK.gold }} />
              <p className="text-[15px] italic leading-relaxed">“{b.message}”</p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.25em]" style={{ color: INK.gold }}>— {b.guest_name}</p>
            </li>
          ))}
        </ul>
      )}
      {state === 'done' && <p className="mb-2 text-sm text-emerald-700">🙏 Your blessing is posted.</p>}
      {state === 'moderated' && <p className="mb-2 text-sm text-emerald-700">🙏 Thank you! Your blessing will appear after approval.</p>}
      {readOnly ? (
        <p className="text-center text-xs" style={{ color: INK.body }}>Guests write their blessings here.</p>
      ) : (
      <div className="space-y-2">
        <Input placeholder="Your name" value={f.guest_name} onChange={(e) => setF({ ...f, guest_name: e.target.value })} />
        <textarea placeholder="Ganapathi Bappa Morya! Write a blessing…" value={f.message}
          onChange={(e) => setF({ ...f, message: e.target.value })}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} />
        {state === 'error' && <p className="text-xs text-red-600">Please add your name and a message.</p>}
        <Button onClick={submit} disabled={state === 'saving'} size="sm" className="w-full">
          <Heart className="mr-1.5 h-4 w-4" /> Post Blessing
        </Button>
      </div>
      )}
    </Section>
  );
}

/**
 * EventInvitationView — the invitation itself. Used by BOTH the live route (/e/:slug)
 * and every preview surface (browse gallery, home page, photographer panel), so what a
 * customer previews is literally what a guest will receive.
 *
 * @param event    the public event payload (or a sample of the same shape)
 * @param slug     publish slug — live guest actions post to it
 * @param template artwork override (preview passes the design being browsed)
 * @param preview  true → sample social proof, no guest writes, no money-login link
 */
export function EventInvitationView({ event, slug, template, preview = false }) {
  const [panel, setPanel] = useState(null); // 'rsvp' | 'donate' | null
  const tpl = template || event.template;

  const ven = event.venue || {};
  const content = event.content || {};
  const schedule = event.schedule || [];
  const gallery = event.gallery || [];
  const sponsors = event.sponsors || [];
  const mapUrl = ven.google_map_url;
  // v2 sections
  const about = event.about || {};
  const journey = event.journey || [];
  const highlights = event.highlights || [];
  const prasadam = event.prasadam || [];
  const dress = event.dress_code || {};
  const countdownCfg = event.countdown || {};
  const can = (k) => eventCan(event, k);
  const dressOn = !!(dress.enabled && (dress.attire || dress.colors));
  const prasadamOn = !!(can('prasadam_menu') && prasadam.length > 0);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else await navigator.clipboard.writeText(url);
    } catch (_) { /* cancelled */ }
  };

  return (
    <div className="relative min-h-screen" data-testid="event-invitation-view">
      {!preview && (
        <Helmet>
          <title>{event.title || 'Invitation'} · MAJA</title>
          {content.subheading && <meta name="description" content={content.subheading} />}
        </Helmet>
      )}

      {/* the design artwork, zoomed + softly blurred, as the page background */}
      <EventBackdrop image={tpl && tpl.preview_url} />

      <div className="relative" style={{ zIndex: 2 }}>
      <div className="mx-auto flex max-w-md items-center justify-between px-4 pt-4">
        {/* language switcher (shows only if more than one language is enabled) */}
        {(() => {
          const langs = (event.languages && event.languages.enabled_languages) || [];
          const names = { en: 'EN', te: 'తె', hi: 'हि' };
          return langs.length > 1 ? (
            <div className="flex gap-1">
              {langs.map((l) => (
                <button key={l} className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: INK.surface, border: `1px solid ${INK.border}`, color: INK.body }}>
                  {names[l] || l}
                </button>
              ))}
            </div>
          ) : <span />;
        })()}
        {/* money-collection member login (owner-created credentials) */}
        {!preview && (
          <a href={`/e/${slug}/money`} className="rounded-full px-2.5 py-0.5 text-[11px] uppercase tracking-wide"
            style={{ background: INK.surface, border: `1px solid ${INK.border}`, color: INK.body }}>
            Money login
          </a>
        )}
      </div>

      <div className="mx-auto max-w-md px-4 pt-4">
        <div style={{ filter: 'drop-shadow(0 34px 64px rgba(0,0,0,0.38)) drop-shadow(0 10px 24px rgba(0,0,0,0.22))' }}>
          <EventInvitationCard event={event} template={tpl} />
        </div>

        {/* the title again, large, on the artwork — the wedding previews do the same
            so the page reads as a poster, not a card floating on a background */}
        <div className="mt-7 text-center">
          <p className="text-[10px] uppercase tracking-[0.45em]" style={{ color: '#F3D79A' }}>
            ◆ {content.subheading || 'You are cordially invited'} ◆
          </p>
          <h1 className="mt-2 leading-tight"
            style={{
              fontFamily: DISPLAY, color: '#FFF6E2',
              fontSize: 'clamp(2rem, 8vw, 3rem)',
              textShadow: '0 2px 18px rgba(0,0,0,0.55)',
            }}>
            {event.title || event.event_name}
          </h1>
          {(ven.venue_name || event.start_date) && (
            <p className="mt-2 text-[12px] uppercase tracking-[0.3em]"
              style={{ color: 'rgba(255,246,226,0.9)', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
              {event.start_date}{ven.venue_name ? ` · ${ven.venue_name}` : ''}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button onClick={() => setPanel(panel === 'rsvp' ? null : 'rsvp')}
            className="rounded-full px-6 py-5 text-[11px] uppercase tracking-[0.25em]"
            style={{ background: '#D4AF37', color: '#241A12' }}>
            <Send className="mr-2 h-4 w-4" /> RSVP
          </Button>
          <Button onClick={() => setPanel(panel === 'donate' ? null : 'donate')}
            className="rounded-full px-6 py-5 text-[11px] uppercase tracking-[0.25em]"
            style={{ background: 'rgba(255,248,220,0.12)', color: '#FFF6E2', border: '1px solid rgba(255,248,220,0.45)' }}>
            <Heart className="mr-2 h-4 w-4" /> Donate
          </Button>
          {!preview && (
            <Button onClick={share}
              className="rounded-full px-6 py-5 text-[11px] uppercase tracking-[0.25em]"
              style={{ background: 'rgba(255,248,220,0.12)', color: '#FFF6E2', border: '1px solid rgba(255,248,220,0.45)' }}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
          )}
        </div>
      </div>

      {/* tap any photo to open it full-screen */}
      <PhotoLightbox />

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-10 text-[15px] leading-relaxed">
        {panel === 'rsvp' && (
          <Section title="RSVP" heading="Kindly" accent="respond.">
            {preview
              ? <p className="text-center" style={{ color: INK.body }}>Your guests RSVP right here — names, headcount and a message land in your dashboard.</p>
              : <RsvpForm slug={slug} />}
          </Section>
        )}
        {panel === 'donate' && (
          <Section title="Contribute" heading="Offer your" accent="seva.">
            {preview
              ? <p className="text-center" style={{ color: INK.body }}>Guests contribute by UPI/QR or card — every rupee is tracked in your money portal.</p>
              : <DonateForm slug={slug} eventTitle={event.title} />}
          </Section>
        )}

        {content.welcome_message && (
          <Section title="Our Invitation" heading="You are warmly" accent="invited." ornament>
            <p className="text-center text-[16px] leading-loose">{content.welcome_message}</p>
          </Section>
        )}

        {(about.about_text || about.meaning_text) && (
          <Section title="About & Meaning" heading="Why we" accent="celebrate.">
            {about.about_text && <p className="mb-4 leading-loose">{about.about_text}</p>}
            {about.meaning_text && (
              <p className="border-l-2 pl-4 text-[15px] italic leading-loose"
                style={{ color: INK.body, borderColor: INK.gold }}>{about.meaning_text}</p>
            )}
          </Section>
        )}

        {can('journey') && journey.length > 0 && (
          <Section title="Our Celebration Journey" heading="Year after" accent="year." ornament>
            <ul className="space-y-4">
              {journey.map((j) => (
                <li key={j.id} className="flex items-baseline gap-4">
                  <span className="shrink-0 tabular-nums"
                    style={{ fontFamily: DISPLAY, color: INK.gold, fontSize: '1.6rem', minWidth: '3.4rem' }}>
                    {j.year}
                  </span>
                  <span className="leading-relaxed">{j.label}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {can('countdown') && countdownCfg.enabled !== false && (
          <Countdown targetDate={event.start_date} label={countdownCfg.label || 'Countdown'} />
        )}

        {schedule.length > 0 && <DaySchedule days={schedule} />}

        {highlights.length > 0 && (
          <Section title="Special Highlights" heading="What makes it" accent="special.">
            <div className="flex flex-wrap justify-center gap-2.5">
              {highlights.map((h) => (
                <span key={h.id} className="rounded-full px-4 py-1.5 text-[14px]"
                  style={{ background: 'rgba(176,141,63,0.12)', border: '1px solid rgba(176,141,63,0.4)', color: INK.ink }}>
                  {h.title}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* short sections pair up on desktop so the page never reads as one thin
            ribbon of cards (owner: "it was looking like a line") */}
        {(dressOn || prasadamOn) && (
          <div className={`grid gap-5 ${dressOn && prasadamOn ? 'md:grid-cols-2' : ''}`}>
            {dressOn && (
              <Section title="Dress Code" heading="Dressed for the" accent="occasion.">
                <div className="text-center">
                  {dress.attire && (
                    <p style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: '1.6rem' }}>{dress.attire}</p>
                  )}
                  {dress.colors && (
                    <p className="mt-2 text-[11px] uppercase tracking-[0.3em]" style={{ color: INK.gold }}>{dress.colors}</p>
                  )}
                </div>
              </Section>
            )}
            {prasadamOn && (
              <Section title="Prasadam" heading="Lovingly" accent="shared.">
                <div className="flex flex-wrap justify-center gap-2.5">
                  {prasadam.map((p) => (
                    <span key={p.id} className="rounded-full px-4 py-1.5"
                      style={{ background: INK.chip, border: `1px solid ${INK.border}`, fontFamily: DISPLAY, fontSize: '1.15rem' }}>
                      {p.item}
                    </span>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {gallery.length > 0 && (
          <Section title="Gallery" heading="Moments from the" accent="celebration." ornament>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {gallery.map((m) => (
                <button key={m.id} type="button"
                  onClick={() => openLightbox(m.url || m.webp_url || m.thumbnail_url)}
                  className="overflow-hidden rounded-xl"
                  style={{ border: `1px solid ${INK.border}`, cursor: 'zoom-in' }}
                  title="Tap to view full photo">
                  <img src={m.thumbnail_url || m.webp_url || m.url} alt={m.caption || 'Photo'} loading="lazy"
                       className="aspect-square w-full object-cover transition hover:scale-105" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[12px]" style={{ color: INK.body }}>Tap a photo to open it full-screen.</p>
          </Section>
        )}

        {/* preview only — a filled-looking gallery so the customer sees the finished
            shape of the page. Uses our own festival artwork, captioned as samples. */}
        {preview && (event._sample_gallery || []).length > 0 && (
          <Section title="Photos, Day by Day" heading="Your festival, day by" accent="day." ornament>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {event._sample_gallery.map((g) => (
                <figure key={g.label} className="overflow-hidden rounded-xl"
                  style={{ border: `1px solid ${INK.border}`, background: INK.chip }}>
                  <button type="button" onClick={() => openLightbox(g.src)}
                    className="relative block aspect-square w-full" style={{ cursor: 'zoom-in' }}
                    title="Tap to view full photo">
                    <img src={g.src} alt="" loading="lazy" decoding="async"
                      className="h-full w-full object-cover transition hover:scale-105"
                      style={{ objectPosition: g.pos || 'center' }} />
                  </button>
                  <figcaption className="px-2 py-1.5 text-[9px] uppercase tracking-[0.15em]"
                    style={{ color: INK.gold }}>{g.label}</figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-4 text-center text-[13px]" style={{ color: INK.body }}>
              Sample images — tap any to open it full-screen. You upload up to
              {' '}<strong>5 photos and 1 video</strong> for each day, unlocked once that day ends.
            </p>
          </Section>
        )}

        <Section title="When & Where" heading="Join us at the" accent="mandap." ornament>
          <div className="text-center">
            <p className="flex items-center justify-center gap-2"
              style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: '1.35rem' }}>
              <Calendar className="h-4 w-4" style={{ color: INK.gold }} />
              {event.start_date}{event.end_date && event.end_date !== event.start_date ? ` – ${event.end_date}` : ''}
            </p>
            {(ven.venue_name || ven.address) && (
              <>
                <p className="mt-3" style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: '1.5rem' }}>
                  {ven.venue_name}
                </p>
                {ven.address && <p className="mt-1 text-[14px]" style={{ color: INK.body }}>{ven.address}</p>}
              </>
            )}
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                 className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2 text-[11px] uppercase tracking-[0.25em]"
                 style={{ color: INK.ink, background: INK.chip, border: `1px solid ${INK.gold}` }}>
                <MapPin className="h-4 w-4" style={{ color: INK.gold }} /> Open in Google Maps
              </a>
            )}
            {ven.parking_available && (
              <p className="mt-4 text-[13px]" style={{ color: INK.body }}>
                🅿️ Parking available{ven.entry_gate ? ` · ${ven.entry_gate}` : ''}
                {ven.parking_map_url && (
                  <> · <a href={ven.parking_map_url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: INK.gold }}>Parking map</a></>
                )}
              </p>
            )}
          </div>
        </Section>

        {can('donations') && <DonorLeaderboard slug={slug} sample={preview ? event._sample_donors : null} />}

        {can('blessings_wall') && (
          <BlessingsWall slug={slug} sample={preview ? event._sample_blessings : null} readOnly={preview} />
        )}

        {content.invitation_note && (
          <Section title="With Blessings" ornament>
            <p className="text-center leading-loose"
              style={{ fontFamily: DISPLAY, color: INK.ink, fontSize: 'clamp(1.15rem, 4vw, 1.5rem)' }}>
              {content.invitation_note}
            </p>
          </Section>
        )}

        {sponsors.length > 0 && (
          <Section title="With Gratitude to Our Sponsors" heading="Made possible by our" accent="patrons.">
            <div className="flex flex-wrap justify-center gap-4">
              {sponsors.map((s) => (
                <div key={s.id} className="text-center">
                  {s.logo_url
                    ? <img src={s.logo_url} alt={s.name} className="mx-auto h-12 w-auto object-contain" />
                    : <div className="flex h-12 items-center px-3 text-sm font-medium">{s.name}</div>}
                  {s.tier && <p className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: INK.body }}>{s.tier}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        <div className="pt-4 text-center">
          <span className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[10px] uppercase tracking-[0.3em]"
            style={{ color: INK.body, background: INK.surface, border: `1px solid ${INK.border}` }}>
            Crafted by
            <span style={{ fontFamily: SCRIPT, fontSize: '1.4em', textTransform: 'none', letterSpacing: 0, color: INK.ink }}>
              MAJA Invites
            </span>
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ── The live route: fetch by slug, then render the shared view. ── */
export default function EventPublicInvitation() {
  const { slug } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    EventService.publicBySlug(slug)
      .then((e) => { if (alive) setEvent(e); })
      .catch(() => { if (alive) setNotFound(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  if (loading) return <LoadingFallback variant="page" />;
  if (notFound || !event) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="text-lg font-medium">Invitation not found</p>
        <p className="mt-2 text-sm text-muted-foreground">This invitation may have been unpublished or moved.</p>
      </div>
    );
  }
  return <EventInvitationView event={event} slug={slug} />;
}
