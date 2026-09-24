import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import * as portfolioApi from '@/api/portfolio';
import {
  PORTFOLIO_DESIGNS, designsForTier, getDesign, FREE_PORTFOLIO_FEATURES,
} from '@/lib/portfolioDesigns';
import MediaDrop from '@/components/studio/MediaDrop';
import PortfolioGallery from '@/components/studio/PortfolioGallery';
import './StudioPortfolio.css';

// Ported from "MAJA Photographer Portfolio Editor.dc.html" (left-rail section
// stepper on desktop / step chips on mobile) -- content collapsed to the real
// backend shape per the route contract: tabs Profile / Past Works /
// Testimonials + a Design picker + a Plan strip. Business logic ported from
// frontend/src/pages/PhotographerPortfolio.jsx (legacy source of truth).
//
// Curl-verified against the live backend 2026-08-11. Notes for the reader:
//  - GET /api/portfolio/meta returns { event_categories, styles } only -- no
//    "services" vocabulary. `styles` matches legacy's PHOTOGRAPHY_TYPES list
//    exactly (photographyOptions.js), but SERVICE_OPTIONS below has no meta
//    equivalent and is kept as the same static list the public directory
//    filters by (frontend/src/data/photographyOptions.js), for parity.
//  - "Past Works" (profile.past_works, cap 5) saves through
//    PUT /api/portfolio/profile, NOT POST /api/portfolio/works -- verified by
//    curl. POST /api/portfolio/works is the separate full "Photos & Videos"
//    album/work gallery (WorkIn model) that the legacy page's PastWorksPanel
//    does not use either (its onSave prop is the profile saver). Album/work
//    management itself is out of scope for this route (not one of the
//    requested tabs) -- fetched on load per the contract and summarised
//    read-only in the Profile tab, not fully rebuilt here.
//  - Testimonials GET/POST/DELETE all verified 200 -- tab is kept.

const SERVICE_OPTIONS = [
  'Photography', 'Videography', 'Drone Coverage', 'Live Streaming',
  'Album Designing', 'Photo Editing', 'Video Editing', 'Pre-Wedding Shoot', 'Post-Wedding Shoot',
];

const TRAVEL_OPTIONS = ['Local', 'Statewide', 'Nationwide'];

const TIER_RANK = { normal: 0, free: 0, basic: 1, premium: 2 };

const MAX_PAST_WORKS = 5;
const MAX_FAQS = 15;
const MAX_STUDIO_PHOTOS = 12;

function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

function isDarkHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.5;
}

// Miniature true-to-token preview of a design -- its real bg/accent/heading.
function DesignPreview({ design }) {
  if (!design) return null;
  const ink = isDarkHex(design.bg) ? '#fff8dc' : '#1a140c';
  return (
    <div style={{ width: '100%', height: 84, background: design.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: design.heading, color: ink, fontSize: 12, fontWeight: 600 }}>{design.name}</span>
      <span style={{ width: 24, height: 2, background: design.accent, borderRadius: 2 }} />
    </div>
  );
}

function Chip({ on, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="stpf-chip"
      style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
        background: on ? '#6d28d9' : '#f5f3ff', color: on ? '#ffffff' : '#4b5563' }}>
      {label}
    </button>
  );
}

function Field({ label, value, onChange, textarea, placeholder, type = 'text', hint }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#111827', marginBottom: 6 }}>{label}</span>
      {textarea ? (
        <textarea rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          data-mj-field style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 13.5, background: '#f5f3ff', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
      ) : (
        <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          data-mj-field style={{ width: '100%', minHeight: 44, padding: '0 14px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 13.5, background: '#f5f3ff', outline: 'none' }} />
      )}
      {hint && <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#9ca3af' }}>{hint}</span>}
    </label>
  );
}

function NumField({ label, value, onChange, placeholder }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#111827', marginBottom: 6 }}>{label}</span>
      <input type="number" min="0" value={value ?? ''} placeholder={placeholder}
        onChange={(e) => { const t = e.target.value; onChange(t === '' ? null : Math.max(0, parseInt(t, 10) || 0)); }}
        data-mj-field style={{ width: '100%', minHeight: 44, padding: '0 14px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 13.5, background: '#f5f3ff', outline: 'none' }} />
    </label>
  );
}

// Comma-separated list <-> string[]. Keeps its own raw text so the cursor
// never jumps mid-edit -- only splits into an array as the value changes.
function CsvField({ label, value, onChange, placeholder, hint }) {
  const [raw, setRaw] = useState(() => (Array.isArray(value) ? value.join(', ') : ''));
  const lastArr = useRef(Array.isArray(value) ? value.join(', ') : '');
  useEffect(() => {
    const joined = Array.isArray(value) ? value.join(', ') : '';
    if (joined !== lastArr.current) { setRaw(joined); lastArr.current = joined; }
  }, [value]);
  const handle = (t) => {
    setRaw(t);
    const arr = t.split(',').map((s) => s.trim()).filter(Boolean);
    lastArr.current = arr.join(', ');
    onChange(arr);
  };
  return <Field label={label} value={raw} onChange={handle} placeholder={placeholder} hint={hint} />;
}

function FaqEditor({ value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const set = (i, k, v) => onChange(items.map((f, idx) => (idx === i ? { ...f, [k]: v } : f)));
  const add = () => { if (items.length < MAX_FAQS) onChange([...items, { q: '', a: '' }]); };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((f, i) => (
        <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Question {i + 1}</span>
            <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>Remove</button>
          </div>
          <input value={f.q ?? ''} onChange={(e) => set(i, 'q', e.target.value)} placeholder="Question -- e.g. Do you travel outside the city?"
            data-mj-field style={{ minHeight: 40, padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, background: '#f5f3ff', outline: 'none' }} />
          <textarea rows={2} value={f.a ?? ''} onChange={(e) => set(i, 'a', e.target.value)} placeholder="Answer"
            data-mj-field style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, background: '#f5f3ff', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
        </div>
      ))}
      {items.length < MAX_FAQS && (
        <button type="button" onClick={add} className="stpf-btn stpf-btn-outline" style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 16px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          + Add question ({items.length}/{MAX_FAQS})
        </button>
      )}
    </div>
  );
}

function StudioPhotosEditor({ value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const setItem = (i, patch) => onChange(items.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  const add = () => { if (items.length < MAX_STUDIO_PHOTOS) onChange([...items, { image: '', caption: '' }]); };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        {items.map((w, i) => (
          <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>Photo {i + 1}</span>
              <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>Remove</button>
            </div>
            <MediaDrop label="Image" value={w.image} onUploaded={(d) => setItem(i, { image: d.url })} onClear={() => setItem(i, { image: '' })} />
            <input value={w.caption ?? ''} onChange={(e) => setItem(i, { caption: e.target.value })} placeholder="Caption (optional)"
              data-mj-field style={{ minHeight: 38, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12.5, background: '#f5f3ff', outline: 'none' }} />
          </div>
        ))}
      </div>
      {items.length < MAX_STUDIO_PHOTOS && (
        <button type="button" onClick={add} className="stpf-btn stpf-btn-outline" style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 16px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          + Add studio photo ({items.length}/{MAX_STUDIO_PHOTOS})
        </button>
      )}
    </div>
  );
}

function PastWorksEditor({ value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const setItem = (i, patch) => onChange(items.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  const add = () => { if (items.length < MAX_PAST_WORKS) onChange([...items, { image: '', title: '', caption: '' }]); };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#4b5563', margin: 0 }}>
        Pick your {MAX_PAST_WORKS} finest finished works. These sit near the top of your public
        portfolio as a highlight reel -- the first thing a couple sees.
      </p>
      {items.length === 0 && (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13.5 }}>
          No past works yet. Add up to {MAX_PAST_WORKS}.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
        {items.map((w, i) => (
          <div key={i} className="stpf-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Work {i + 1}</span>
              <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>Remove</button>
            </div>
            <MediaDrop label="Photo" value={w.image} onUploaded={(d) => setItem(i, { image: d.url })} onClear={() => setItem(i, { image: '' })} />
            <Field label="Title" value={w.title} onChange={(v) => setItem(i, { title: v })} placeholder="e.g. Anita & Rahul -- Beach Wedding" />
            <Field label="Caption" value={w.caption} onChange={(v) => setItem(i, { caption: v })} placeholder="One line about this work (optional)" />
          </div>
        ))}
      </div>
      {items.length < MAX_PAST_WORKS && (
        <button type="button" onClick={add} className="stpf-btn stpf-btn-outline" style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 18px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Add work ({items.length}/{MAX_PAST_WORKS})
        </button>
      )}
    </div>
  );
}

const SECTION_DEFS = [
  { key: 'profile', label: 'Profile' },
  { key: 'design', label: 'Design' },
  { key: 'pastworks', label: 'Past Works' },
  { key: 'gallery', label: 'Photos & Videos' },
  { key: 'testimonials', label: 'Testimonials' },
  { key: 'plan', label: 'Plan' },
];

export default function StudioPortfolio() {
  const navigate = useNavigate();
  const vw = useViewportWidth();
  const isMobile = vw < 900;

  const [section, setSection] = useState('profile');
  const [meta, setMeta] = useState({ event_categories: [], styles: [] });
  const [profile, setProfile] = useState({});
  const [albums, setAlbums] = useState([]);
  const [works, setWorks] = useState([]);
  const [testimonials, setTestimonials] = useState([]); // null => endpoint missing, tab dropped
  const [tier, setTier] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [pendingDesign, setPendingDesign] = useState(null);
  const [designSaving, setDesignSaving] = useState(false);
  const [designSaved, setDesignSaved] = useState(false);
  const designReqRef = useRef(0);

  const [tForm, setTForm] = useState({ author: '', text: '', rating: 5 });
  const [tSubmitting, setTSubmitting] = useState(false);

  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Album/work mutations only need to refresh those two lists — routing them
  // through the full `load()` below would flip `loading` back to true and
  // flash the whole page's skeleton for a single "toggle featured" click.
  const reloadGallery = useCallback(async () => {
    const [a, w] = await Promise.all([
      portfolioApi.getAlbums().catch(() => ({ data: { albums: [] } })),
      portfolioApi.getWorks().catch(() => ({ data: { works: [] } })),
    ]);
    setAlbums(a.data?.albums || []);
    setWorks(w.data?.works || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, p, a, w, t, tr, pl] = await Promise.all([
      portfolioApi.getMeta().catch(() => ({ data: { event_categories: [], styles: [] } })),
      portfolioApi.getProfile().catch(() => ({ data: { profile: {} } })),
      portfolioApi.getAlbums().catch(() => ({ data: { albums: [] } })),
      portfolioApi.getWorks().catch(() => ({ data: { works: [] } })),
      portfolioApi.getTestimonials().catch(() => ({ data: null })),
      portfolioApi.getTier().catch(() => ({ data: null })),
      portfolioApi.getPortfolioPlans().catch(() => ({ data: { plans: [] } })),
    ]);
    setMeta(m.data || { event_categories: [], styles: [] });
    setProfile(p.data?.profile || {});
    setAlbums(a.data?.albums || []);
    setWorks(w.data?.works || []);
    setTestimonials(t.data ? (t.data.testimonials || []) : null);
    setTier(tr.data || null);
    setPlans(pl.data?.plans || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sections = SECTION_DEFS.filter((s) => s.key !== 'testimonials' || testimonials !== null);
  useEffect(() => { if (section === 'testimonials' && testimonials === null) setSection('profile'); }, [section, testimonials]);

  const isIndividual = (profile.portfolio_type || 'studio') === 'individual';
  const publicKey = profile?.slug || profile?.id;
  // The v2 public portfolio route is /photographer/:slug. This used to emit the
  // legacy /photographer/:slug/portfolio, so every URL a studio copied from
  // here 404'd. The old shape still resolves via a redirect in App.jsx.
  const publicPath = publicKey ? `/photographer/${publicKey}` : '';
  const publicUrl = publicPath ? `${typeof window !== 'undefined' ? window.location.origin : ''}${publicPath}` : '';

  const setP = (k, v) => setProfile((s) => ({ ...s, [k]: v }));
  const setLoc = (k, v) => setProfile((s) => ({ ...s, location: { ...(s.location || {}), [k]: v } }));
  const toggleService = (svc) => setProfile((s) => {
    const cur = new Set(s.services || []);
    cur.has(svc) ? cur.delete(svc) : cur.add(svc);
    return { ...s, services: [...cur] };
  });
  const toggleStyle = (st) => setProfile((s) => {
    const cur = new Set(s.styles || []);
    cur.has(st) ? cur.delete(st) : cur.add(st);
    return { ...s, styles: [...cur] };
  });

  async function putProfile(payload) {
    const { data } = await portfolioApi.saveProfile(payload);
    setProfile((s) => ({ ...s, ...(data.profile || {}) }));
    return data;
  }

  const saveProfileBtn = async () => {
    setSaving(true);
    try { await putProfile(profile); showToast('Profile saved.'); }
    catch (e) { showToast(e?.response?.data?.detail || 'Could not save. Please try again.'); }
    finally { setSaving(false); }
  };

  const publishNow = async () => {
    setPublishing(true);
    try { await putProfile({ ...profile, is_published: true }); showToast('Published.'); }
    catch (e) { showToast(e?.response?.data?.detail || 'Could not publish. Save your profile first, then try again.'); }
    finally { setPublishing(false); }
  };

  const copyUrl = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = publicUrl; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  // One-tap design flow: clicking a design applies AND saves it immediately.
  // Monotonic request token: clicking A then B fast makes only the LAST pick
  // win, even if A's response resolves after B's.
  const persistDesign = async (id) => {
    const token = ++designReqRef.current;
    setDesignSaving(true); setDesignSaved(false);
    try {
      await portfolioApi.saveDesign(id);
      if (token !== designReqRef.current) return;
      setTier((t) => ({ ...t, design_id: id }));
      setPendingDesign(null);
      setDesignSaved(true);
      setTimeout(() => { if (token === designReqRef.current) setDesignSaved(false); }, 2200);
    } catch (e) {
      if (token === designReqRef.current) {
        showToast(e?.response?.data?.detail || 'Could not save the design. Please try again.');
        setPendingDesign(null);
      }
    } finally { if (token === designReqRef.current) setDesignSaving(false); }
  };
  const chooseDesign = (id) => { setPendingDesign(id); persistDesign(id); };
  const activeDesignId = pendingDesign || tier?.design_id;

  const addTestimonialSubmit = async (e) => {
    e.preventDefault();
    if (!tForm.author.trim() || !tForm.text.trim()) return;
    setTSubmitting(true);
    try {
      const { data } = await portfolioApi.addTestimonial({
        author: tForm.author.trim(), text: tForm.text.trim(), rating: Number(tForm.rating) || 5,
      });
      setTestimonials((s) => [data.testimonial, ...(s || [])]);
      setTForm({ author: '', text: '', rating: 5 });
    } catch (e2) { showToast(e2?.response?.data?.detail || 'Could not add review.'); }
    finally { setTSubmitting(false); }
  };
  const delTestimonial = async (id) => {
    if (!window.confirm('Delete this review?')) return;
    try {
      await portfolioApi.deleteTestimonial(id);
      setTestimonials((s) => (s || []).filter((t) => t.id !== id));
    } catch (e) { showToast(e?.response?.data?.detail || 'Could not delete this review.'); }
  };

  const shellCols = isMobile ? 'minmax(0,1fr)' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const mainPadding = vw < 400 ? '20px 16px' : (isMobile ? '26px 20px' : (vw < 1200 ? '30px 28px' : '40px 48px'));

  // Rendered once, reused by both the desktop rail layout and the mobile
  // chip layout below -- same content, only the surrounding chrome differs.
  let sectionContent = null;
  if (section === 'profile') {
    sectionContent = (
      <ProfileSection
        profile={profile} setP={setP} setLoc={setLoc} meta={meta} isIndividual={isIndividual}
        toggleService={toggleService} toggleStyle={toggleStyle}
        saving={saving} onSave={saveProfileBtn}
        albums={albums} works={works} onOpenGallery={() => setSection('gallery')}
      />
    );
  } else if (section === 'design') {
    sectionContent = (
      <DesignSection tier={tier} activeDesignId={activeDesignId} pendingDesign={pendingDesign}
        designSaving={designSaving} designSaved={designSaved} onChoose={chooseDesign} navigate={navigate} />
    );
  } else if (section === 'pastworks') {
    sectionContent = (
      <div>
        <PastWorksEditor value={profile.past_works || []} onChange={(v) => setP('past_works', v)} />
        <SaveBar saving={saving} onSave={saveProfileBtn} label="Save past works" />
      </div>
    );
  } else if (section === 'gallery') {
    sectionContent = (
      <PortfolioGallery
        albums={albums} works={works} eventCategories={meta.event_categories}
        reload={reloadGallery} showToast={showToast}
      />
    );
  } else if (section === 'testimonials') {
    sectionContent = (
      <TestimonialsSection testimonials={testimonials} tForm={tForm} setTForm={setTForm}
        tSubmitting={tSubmitting} onSubmit={addTestimonialSubmit} onDelete={delTestimonial} />
    );
  } else if (section === 'plan') {
    sectionContent = <PlanSection tier={tier} plans={plans} navigate={navigate} />;
  }

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <MobileNav panel="studio" active="Portfolio" />
      <div style={{
        background: 'radial-gradient(70% 45% at 12% -6%,rgba(124,58,237,.13),transparent 62%),radial-gradient(55% 40% at 96% 2%,rgba(167,139,250,.14),transparent 66%),#ffffff',
        color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols,
      }}>
        {!isMobile && <StudioNav active="Portfolio" />}

        <main id="main-content" className="stpf-main" style={{ padding: mainPadding, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 'clamp(24px,4vw,34px)', lineHeight: 1.15, margin: '0 0 6px' }}>
                Your <span style={{ color: '#6d28d9', fontStyle: 'italic' }}>portfolio</span>
              </h1>
              <p style={{ fontSize: 13.5, color: '#6b7280', margin: 0 }}>
                What couples see when they find you.
              </p>
            </div>
            {!loading && publicUrl && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <input readOnly value={publicUrl} onFocus={(e) => e.target.select()}
                  style={{ minHeight: 40, padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12, color: '#4b5563', background: '#ffffff', width: 220 }} />
                <button type="button" onClick={copyUrl} className="stpf-btn stpf-btn-outline"
                  style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <a href={publicPath} target="_blank" rel="noreferrer" className="stpf-btn stpf-btn-outline"
                  style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 10, border: '1px solid #e5e7eb', color: '#4b5563', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
                  View public page
                </a>
                {!profile.is_published && (
                  <button type="button" onClick={publishNow} disabled={publishing} className="stpf-btn"
                    style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: '#6d28d9', color: '#ffffff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    {publishing ? 'Publishing...' : 'Publish now'}
                  </button>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="stpf-skel" style={{ height: 64, borderRadius: 16 }} />)}
            </div>
          ) : (
            <>
              {isMobile ? (
                <div className="stpf-glass" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 12px', borderRadius: 14, marginBottom: 20, position: 'sticky', top: 0, zIndex: 5 }}>
                  {sections.map((s) => {
                    const on = s.key === section;
                    return (
                      <button key={s.key} type="button" onClick={() => setSection(s.key)}
                        style={{ flexShrink: 0, minHeight: 40, padding: '0 16px', borderRadius: 999, border: `1px solid ${on ? '#6d28d9' : '#ddd6fe'}`,
                          background: on ? '#6d28d9' : '#ffffff', color: on ? '#ffffff' : '#4b5563', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
                  <aside className="stpf-glass" style={{ borderRadius: 16, padding: 12, position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {sections.map((s) => {
                      const on = s.key === section;
                      return (
                        <button key={s.key} type="button" onClick={() => setSection(s.key)} className="stpf-rail-item"
                          style={{ textAlign: 'left', minHeight: 42, padding: '0 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                            background: on ? '#6d28d9' : 'transparent', color: on ? '#ffffff' : '#4b5563', fontSize: 13.5, fontWeight: on ? 600 : 500 }}>
                          {s.label}
                        </button>
                      );
                    })}
                  </aside>
                  <div className="stpf-section" key={section}>{sectionContent}</div>
                </div>
              )}

              {isMobile && (
                <div className="stpf-section" key={section}>{sectionContent}</div>
              )}
            </>
          )}
        </main>
      </div>

      <div style={{ display: toast ? 'flex' : 'none', position: 'fixed', left: 0, right: 0, bottom: 26, justifyContent: 'center', pointerEvents: 'none', zIndex: 80 }}>
        <div style={{ background: '#2e1065', color: '#ffffff', fontSize: 13, padding: '12px 20px', borderRadius: 14, boxShadow: '0 18px 40px rgba(109,40,217,.30)' }}>{toast}</div>
      </div>
    </div>
  );
}

function SaveBar({ saving, onSave, label = 'Save profile' }) {
  return (
    <button type="button" onClick={onSave} disabled={saving} className="stpf-btn"
      style={{ marginTop: 20, minHeight: 46, width: '100%', borderRadius: 14, border: 'none', background: '#6d28d9', color: '#ffffff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
      {saving ? 'Saving...' : label}
    </button>
  );
}

function Card({ title, children }) {
  return (
    <div className="stpf-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 18, padding: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {title && <span style={{ fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600 }}>{title}</span>}
      {children}
    </div>
  );
}

function ProfileSection({ profile, setP, setLoc, meta, isIndividual, toggleService, toggleStyle, saving, onSave, albums, works, onOpenGallery }) {
  return (
    <div>
      <Card title="Portfolio type">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          {[
            { key: 'studio', title: 'Studio Portfolio', blurb: 'Studios, wedding teams & multi-person crews.' },
            { key: 'individual', title: 'Individual Photographer', blurb: 'Freelance, candid, pre-wedding & solo photographers.' },
          ].map(({ key, title, blurb }) => {
            const on = (profile.portfolio_type || 'studio') === key;
            return (
              <button key={key} type="button" onClick={() => setP('portfolio_type', key)}
                style={{ textAlign: 'left', padding: 14, borderRadius: 14, cursor: 'pointer',
                  background: on ? '#f5f3ff' : '#ffffff', border: on ? '2px solid #6d28d9' : '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 11.5, color: '#6b7280' }}>{blurb}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title={isIndividual ? 'Your identity' : 'Studio identity'}>
        <Field label={isIndividual ? 'Your name' : 'Studio name'} value={profile.studio_name} onChange={(v) => setP('studio_name', v)}
          placeholder={isIndividual ? 'e.g. Aarav Mehta' : 'e.g. Lens & Lotus Studio'} />
        <Field label="Tagline" value={profile.tagline} onChange={(v) => setP('tagline', v)} placeholder="Capturing emotions, creating timeless memories" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <MediaDrop label={isIndividual ? 'Profile photo' : 'Studio logo'} value={profile.avatar} onUploaded={(d) => setP('avatar', d.url)} onClear={() => setP('avatar', '')} />
          <MediaDrop label="Cover image" value={profile.hero_image} onUploaded={(d) => setP('hero_image', d.url)} onClear={() => setP('hero_image', '')} />
        </div>
        <Field label={isIndividual ? 'About me' : 'About your studio'} textarea value={profile.about} onChange={(v) => setP('about', v)}
          placeholder="Tell couples who you are, your style and what makes your work special." />
        {isIndividual && (
          <Field label="My photography journey" textarea value={profile.journey} onChange={(v) => setP('journey', v)}
            placeholder="How you started, milestones, the moments that shaped your craft." />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <NumField label="Experience (years)" value={profile.experience_years} onChange={(v) => setP('experience_years', v)} placeholder="e.g. 8" />
          <NumField label="Starting price (Rs.)" value={profile.starting_price} onChange={(v) => setP('starting_price', v)} placeholder="e.g. 45000" />
        </div>
        <Field label="City" value={profile.location?.city} onChange={(v) => setLoc('city', v)} placeholder="Hyderabad" />
      </Card>

      <Card title="Services & expertise">
        <div>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Services offered</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SERVICE_OPTIONS.map((svc) => (
              <Chip key={svc} on={(profile.services || []).includes(svc)} label={svc} onClick={() => toggleService(svc)} />
            ))}
          </div>
        </div>
        <div>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Photography type</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(meta.styles || []).map((st) => (
              <Chip key={st} on={(profile.styles || []).includes(st)} label={st} onClick={() => toggleStyle(st)} />
            ))}
          </div>
        </div>
        {!isIndividual && (
          <CsvField label="Equipment" value={profile.equipment} onChange={(v) => setP('equipment', v)}
            placeholder="Sony A7 IV, DJI drone, Godox lighting" hint="Comma-separated." />
        )}
        <CsvField label={isIndividual ? 'Awards & achievements' : 'Awards & features'} value={profile.awards} onChange={(v) => setP('awards', v)}
          placeholder="WeddingSutra Editor's Choice 2024, ..." hint="Comma-separated." />
      </Card>

      {isIndividual && (
        <Card title="Freelancer profile">
          <Field label="Professional title" value={profile.professional_title} onChange={(v) => setP('professional_title', v)}
            placeholder="e.g. Candid Wedding Photographer" hint="Shown under your name on the hero." />
          <CsvField label="Skills & expertise" value={profile.skills} onChange={(v) => setP('skills', v)}
            placeholder="Candid moments, Low-light, Colour grading" hint="Comma-separated tags." />
          <div>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Travel availability</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TRAVEL_OPTIONS.map((t) => (
                <Chip key={t} on={profile.travel_availability === t} label={t} onClick={() => setP('travel_availability', t)} />
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card title="FAQ">
        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
          Answer what couples ask most -- "Do you travel outside the city?", "How many days for delivery?"
        </p>
        <FaqEditor value={profile.faqs || []} onChange={(v) => setP('faqs', v)} />
      </Card>

      <Card title="Studio photos">
        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Your space or team at work -- shown in an "Our Studio" section on your public page.</p>
        <StudioPhotosEditor value={profile.studio_photos || []} onChange={(v) => setP('studio_photos', v)} />
      </Card>

      <Card title="Photos & videos">
        <p style={{ fontSize: 12.5, color: '#6b7280', margin: 0 }}>
          {works.length} item{works.length === 1 ? '' : 's'} across {albums.length} album{albums.length === 1 ? '' : 's'}.
        </p>
        <button type="button" onClick={onOpenGallery} className="stpf-btn stpf-btn-outline"
          style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 16px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          Manage albums & works
        </button>
      </Card>

      <Card>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!profile.is_published} onChange={(e) => setP('is_published', e.target.checked)} />
          <span style={{ fontSize: 13.5, color: '#111827' }}>Publish public portfolio</span>
        </label>
        <p style={{ fontSize: 11.5, color: '#9ca3af', margin: 0 }}>
          When published, your studio appears on your public portfolio page and in the Find Photographers directory.
        </p>
      </Card>

      <SaveBar saving={saving} onSave={onSave} />
    </div>
  );
}

function DesignSection({ tier, activeDesignId, pendingDesign, designSaving, designSaved, onChoose, navigate }) {
  if (!tier) return null;
  const unlockedIds = new Set(designsForTier(tier.tier).map((d) => d.id));
  return (
    <div>
      <Card title="Choose your portfolio design">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {designSaving
            ? <span style={{ fontSize: 12, color: '#6d28d9' }}>Applying...</span>
            : designSaved
              ? <span style={{ fontSize: 12, color: '#059669' }}>Applied to your public page</span>
              : <span style={{ fontSize: 12, color: '#9ca3af' }}>Click any design to apply it instantly</span>}
        </div>

        {activeDesignId && getDesign(activeDesignId) && (
          <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <DesignPreview design={getDesign(activeDesignId)} />
            <div style={{ padding: '8px 12px', background: '#f5f3ff', fontSize: 11.5, color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
              <span>Preview -- {getDesign(activeDesignId).name}</span>
              <span style={{ color: pendingDesign ? '#b45309' : '#059669' }}>{pendingDesign ? 'Applying...' : 'Live on your public page'}</span>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
          {PORTFOLIO_DESIGNS.map((d) => {
            const sel = activeDesignId === d.id;
            const unlocked = unlockedIds.has(d.id);
            return (
              <button key={d.id} type="button" onClick={() => (unlocked ? onChoose(d.id) : navigate('/studio/plans'))}
                className="stpf-design-card" title={unlocked ? 'Use this design' : `Unlock with the ${d.tier} plan`}
                style={{ textAlign: 'left', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0,
                  border: sel ? '2px solid #6d28d9' : '1px solid #e5e7eb', opacity: unlocked ? 1 : 0.75, background: 'none' }}>
                <DesignPreview design={d} />
                <div style={{ padding: 10, background: '#ffffff' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                    <span>{d.name}</span>
                    {!unlocked && <span style={{ color: '#6d28d9' }}>Locked</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 3, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {unlocked ? `${d.tier} design` : `${d.tier} plan -- tap to unlock`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function TestimonialsSection({ testimonials, tForm, setTForm, tSubmitting, onSubmit, onDelete }) {
  const list = testimonials || [];
  return (
    <div>
      <Card title="Add a client review">
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            <Field label="Client name" value={tForm.author} onChange={(v) => setTForm((s) => ({ ...s, author: v }))} placeholder="Anita & Rahul" />
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#111827', marginBottom: 6 }}>Rating</span>
              <select value={tForm.rating} onChange={(e) => setTForm((s) => ({ ...s, rating: e.target.value }))}
                style={{ width: '100%', minHeight: 44, padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 13.5, background: '#f5f3ff' }}>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} star{r === 1 ? '' : 's'}</option>)}
              </select>
            </label>
          </div>
          <Field label="Review text" textarea value={tForm.text} onChange={(v) => setTForm((s) => ({ ...s, text: v }))} placeholder="What the client said about working with you." />
          <button type="submit" disabled={tSubmitting} className="stpf-btn"
            style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#6d28d9', color: '#ffffff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {tSubmitting ? 'Adding...' : 'Add review'}
          </button>
        </form>
      </Card>

      {list.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13.5 }}>
          No reviews yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
          {list.map((t) => (
            <div key={t.id} className="stpf-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#6d28d9', fontSize: 12.5, fontWeight: 600 }}>{'*'.repeat(t.rating || 0)}{'.'.repeat(5 - (t.rating || 0))}</span>
                <button type="button" onClick={() => onDelete(t.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}>Delete</button>
              </div>
              <p style={{ marginTop: 10, fontSize: 13.5, color: '#111827' }}>&quot;{t.text}&quot;</p>
              <p style={{ marginTop: 6, fontSize: 12, color: '#6d28d9' }}>-- {t.author}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanSection({ tier, plans, navigate }) {
  if (!tier) return null;
  const curTier = (tier.tier || 'normal').toLowerCase();
  const curRank = TIER_RANK[curTier] ?? 0;
  const basicPlan = plans.find((p) => p.portfolio_tier === 'basic');
  const premiumPlan = plans.find((p) => p.portfolio_tier === 'premium');

  const cards = [
    { key: 'normal', label: 'Free', price: null, note: '500 MB', feats: FREE_PORTFOLIO_FEATURES.slice(0, 6) },
    { key: 'basic', label: 'Basic', price: basicPlan?.base_monthly, note: `${basicPlan?.storage_gb ?? 5} GB`, feats: basicPlan?.features || [] },
    { key: 'premium', label: 'Premium', price: premiumPlan?.base_monthly, note: `${premiumPlan?.storage_gb ?? 20} GB`, feats: premiumPlan?.features || [] },
  ];

  const storage = tier.storage;
  const small = storage && storage.cap_bytes < 1024 ** 3;
  const fmt = (b) => (small ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);

  return (
    <div>
      {storage && (
        <Card title="Photo storage">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#111827' }}>
            <span>{fmt(storage.used_bytes)} of {fmt(storage.cap_bytes)}</span>
            <span style={{ color: storage.full ? '#dc2626' : '#6b7280' }}>{storage.full ? 'Full' : `${fmt(Math.max(0, storage.cap_bytes - storage.used_bytes))} free`}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: '#f5f3ff', overflow: 'hidden' }}>
            <div style={{ width: `${storage.cap_bytes ? Math.min(100, (storage.used_bytes / storage.cap_bytes) * 100) : 0}%`, height: '100%', background: storage.full ? '#dc2626' : '#6d28d9' }} />
          </div>
        </Card>
      )}

      <Card title="Your portfolio plan">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          {cards.map((c) => {
            const rank = TIER_RANK[c.key] ?? 0;
            const cur = rank === curRank;
            const isUpgrade = rank > curRank;
            return (
              <div key={c.key} style={{ borderRadius: 16, padding: 16, border: cur ? '1px solid #6d28d9' : '1px solid #e5e7eb', background: cur ? '#f5f3ff' : '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Spectral',serif", fontSize: 18 }}>{c.label}</span>
                  {cur ? (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#6d28d9', color: '#ffffff' }}>CURRENT</span>
                  ) : isUpgrade ? (
                    <Link to="/studio/plans" style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600, textDecoration: 'underline' }}>Upgrade &rarr;</Link>
                  ) : (
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>Included</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 10 }}>
                  {c.price != null ? `Rs.${c.price}/mo` : 'Free'} &middot; {c.note}
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.feats.slice(0, 6).map((f, i) => (
                    <li key={i} style={{ fontSize: 11.5, color: '#4b5563', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#6d28d9' }}>-</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => navigate('/studio/plans')} className="stpf-btn stpf-btn-outline"
          style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 20px', borderRadius: 999, border: '1px solid #6d28d9', background: '#ffffff', color: '#6d28d9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          See all plans
        </button>
      </Card>
    </div>
  );
}
